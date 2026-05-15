"""
Tax routes for Bottom Time.
Route handlers only — all computation logic lives in tax_engine.py.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone, timedelta
from database import db
from auth_utils import get_current_user
from tax_engine import (
    DEFAULT_TAX_RATES, TCS_RATE, TCS_OVERSEAS_TOUR_RATE, TCS_OVERSEAS_TOUR_NO_PAN_RATE,
    FASTGST_API_KEY, _fetch_live_rate, _rate_cache, _cache_expiry,
    get_listing_tax_category, get_product_tax_category, get_tax_rate,
    calculate_tax, calculate_payout_with_tax,
    _determine_booking_gst, _is_overseas_experience,
    verify_pan_with_sandbox,
)
import io
import re
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Tax Rate Management (Admin) ---

@router.get("/admin/tax-rates")
async def get_all_tax_rates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    all_rates = []
    for cat, defaults in DEFAULT_TAX_RATES.items():
        rate = await get_tax_rate(cat)
        rate["category"] = cat
        all_rates.append(rate)
    return {"tax_rates": all_rates, "tcs_rate": TCS_RATE, "live_api_connected": bool(FASTGST_API_KEY)}


@router.put("/admin/tax-rates/{category}")
async def update_tax_rate(category: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    gst_rate = request_data.get("gst_rate")
    if gst_rate is None or gst_rate < 0 or gst_rate > 100:
        raise HTTPException(status_code=400, detail="GST rate must be between 0 and 100")
    defaults = DEFAULT_TAX_RATES.get(category)
    if not defaults:
        raise HTTPException(status_code=404, detail="Unknown tax category")
    await db.tax_rates.update_one(
        {"category": category},
        {"$set": {
            "category": category,
            "sac_hsn": request_data.get("sac_hsn", defaults["sac_hsn"]),
            "description": request_data.get("description", defaults["description"]),
            "gst_rate": gst_rate,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }},
        upsert=True
    )
    return {"message": f"Tax rate for {category} updated to {gst_rate}%"}


@router.post("/admin/tax-rates/refresh")
async def refresh_tax_rates(current_user: dict = Depends(get_current_user)):
    """Force-refresh all rates from FastGST live API"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not FASTGST_API_KEY:
        raise HTTPException(status_code=400, detail="FastGST API key not configured")

    _rate_cache.clear()
    _cache_expiry.clear()
    results = []
    for cat, defaults in DEFAULT_TAX_RATES.items():
        live = await _fetch_live_rate(defaults["sac_hsn"], defaults.get("code_type", "sac"))
        results.append({
            "category": cat,
            "code": defaults["sac_hsn"],
            "live_rate": live.get("gst_rate") if live else None,
            "default_rate": defaults["gst_rate"],
            "source": "fastgst_live" if live else "fallback_default",
        })
    return {"refreshed": len(results), "rates": results}


@router.get("/tax/lookup/{code_type}/{code}")
async def lookup_tax_rate(code_type: str, code: str, current_user: dict = Depends(get_current_user)):
    """Look up any HSN/SAC code against FastGST API"""
    if code_type not in ("hsn", "sac"):
        raise HTTPException(status_code=400, detail="code_type must be 'hsn' or 'sac'")
    live = await _fetch_live_rate(code, code_type)
    if not live:
        raise HTTPException(status_code=404, detail=f"No rate found for {code_type}/{code}")
    return {"code_type": code_type, "code": code, **live}


# --- Tax Preview (for listing creation) ---

@router.post("/tax/preview")
async def tax_preview(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Preview tax breakdown for a listing."""
    base_price = request_data.get("base_price", 0)
    listing_type = request_data.get("listing_type", "dive")
    participants = request_data.get("participants", 1)
    operator_country = request_data.get("operator_country") or current_user.get("location_country", "India")

    is_domestic = (operator_country or "").strip().lower() in ("india", "in")
    category = get_listing_tax_category(listing_type)
    total_base = round(base_price * participants * 100) / 100
    tax = await calculate_tax(total_base, category, is_domestic)

    platform_fee = await db.platform_fees.find_one({"entity_type": "global"}, {"_id": 0})
    fee_percent = platform_fee["platform_fee_percent"] if platform_fee else 15.0

    payout = await calculate_payout_with_tax(
        tax["total_amount"], tax["base_amount"], tax["gst_amount"], fee_percent, is_domestic
    )

    return {
        "diver_pays": tax,
        "operator_receives": payout,
        "platform_fee_percent": fee_percent,
        "gst_acknowledgment_required": is_domestic,
        "acknowledgment_text": (
            f"I understand that GST at {tax['gst_rate']}% (\u20b9{tax['gst_amount']}) will be added to my base price of \u20b9{tax['base_amount']}. "
            f"The diver will pay \u20b9{tax['total_amount']}. Platform commission of {fee_percent}% (\u20b9{payout['commission']}) "
            f"applies on the base amount only. I am responsible for GST remittance to the government."
        ) if is_domestic else None
    }


# --- Checkout Tax Calculation ---

@router.post("/tax/calculate-checkout")
async def calculate_checkout_tax(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Calculate tax at checkout time for experience bookings."""
    listing_id = request_data.get("listing_id")
    participants = request_data.get("participants", 1)

    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    operator = await db.users.find_one({"id": listing.get("operator_id")}, {"_id": 0})
    buyer_country = current_user.get("location_country", "")

    gst_check = _determine_booking_gst(operator, buyer_country, listing)
    category = get_listing_tax_category(listing.get("type", "dive"))
    rate_info = await get_tax_rate(category)

    list_price = listing.get("price", 0)
    list_currency = listing.get("currency", "USD")
    base_total = round(list_price * participants, 2)

    rates_doc = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    rates = rates_doc.get("rates", {}) if rates_doc else {}

    if gst_check["applies"]:
        inr_rate = rates.get("INR", 83.5)
        list_rate = rates.get(list_currency, 1) if list_currency != "USD" else 1
        unit_inr = round(list_price / list_rate * inr_rate * 100) / 100
        base_inr = round(unit_inr * participants * 100) / 100
        shipping_state = current_user.get("location_state", "")
        tax_inr = await calculate_tax(base_inr, category, True, shipping_state)
        gst_in_list_cur = round(tax_inr["gst_amount"] / inr_rate * list_rate, 2)
        total_in_list_cur = round(base_total + gst_in_list_cur, 2)
        tax = {
            "base_amount": base_total,
            "gst_rate": tax_inr["gst_rate"],
            "gst_amount": gst_in_list_cur,
            "total_amount": total_in_list_cur,
            "is_export": False,
            "is_domestic": True,
            "sac_hsn": tax_inr.get("sac_hsn", ""),
            "igst": round(tax_inr.get("igst", 0) / inr_rate * list_rate, 2),
            "cgst": round(tax_inr.get("cgst", 0) / inr_rate * list_rate, 2),
            "sgst": round(tax_inr.get("sgst", 0) / inr_rate * list_rate, 2),
        }
    else:
        tax = {
            "base_amount": base_total,
            "gst_rate": 0,
            "gst_amount": 0,
            "total_amount": base_total,
            "is_export": gst_check["is_export"],
            "is_domestic": False,
            "sac_hsn": "",
            "igst": 0, "cgst": 0, "sgst": 0,
        }

    return {
        "listing_id": listing_id,
        "listing_name": listing.get("name"),
        "listing_currency": list_currency,
        "base_price_per_person": list_price,
        "participants": participants,
        "base_total": base_total,
        "tax_category": category,
        "tax_category_description": rate_info.get("description", ""),
        "sac_hsn_code": rate_info.get("sac_hsn", ""),
        "gst_reason": gst_check["reason"],
        "operator_gstin": gst_check.get("operator_gstin", ""),
        **tax
    }


@router.post("/tax/booking-compliance")
async def booking_compliance_check(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Pre-payment compliance check for bookings."""
    listing_id = request_data.get("listing_id")
    participants = request_data.get("participants", 1)
    residence_country = request_data.get("residence_country") or current_user.get("location_country", "")

    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    operator = await db.users.find_one({"id": listing.get("operator_id")}, {"_id": 0})
    gst_check = _determine_booking_gst(operator, residence_country, listing)

    is_indian_resident = (residence_country or "").strip().lower() in ("india", "in")
    is_overseas = _is_overseas_experience(listing)
    list_price = listing.get("price", 0)
    list_currency = listing.get("currency", "USD")

    rates_doc = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    rates = rates_doc.get("rates", {}) if rates_doc else {}
    inr_rate = rates.get("INR", 83.5)
    list_rate = rates.get(list_currency, 1) if list_currency != "USD" else 1

    unit_inr = round(list_price / list_rate * inr_rate * 100) / 100
    base_inr = round(unit_inr * participants * 100) / 100

    category = get_listing_tax_category(listing.get("type", "dive"))
    rate_info = await get_tax_rate(category)
    if gst_check["applies"]:
        gst_tax = await calculate_tax(base_inr, category, True)
        gst_rate = gst_tax["gst_rate"]
        gst_amount = gst_tax["gst_amount"]
    else:
        gst_rate = 0
        gst_amount = 0

    tcs_applies = is_indian_resident and is_overseas
    has_pan = bool(current_user.get("pan_number"))
    tcs_rate = 0.0
    tcs_amount = 0.0
    if tcs_applies:
        tcs_rate = TCS_OVERSEAS_TOUR_RATE if has_pan else TCS_OVERSEAS_TOUR_NO_PAN_RATE
        tcs_amount = round(base_inr * tcs_rate / 100, 2)

    total_inr = round(base_inr + gst_amount + tcs_amount, 2)

    inr_to_list = list_rate / inr_rate if inr_rate else 1
    base_list = round(list_price * participants, 2)
    gst_list = round(gst_amount * inr_to_list, 2)
    tcs_list = round(tcs_amount * inr_to_list, 2)
    total_list = round(base_list + gst_list + tcs_list, 2)

    operator_name = operator.get("name", "Unknown") if operator else "Unknown"
    operator_country_display = operator.get("location_country", "Unknown") if operator else "Unknown"

    return {
        "listing_id": listing_id,
        "listing_name": listing.get("name"),
        "listing_country": listing.get("country"),
        "residence_country": residence_country,
        "is_indian_resident": is_indian_resident,
        "is_overseas": is_overseas,
        "participants": participants,
        "base_inr": base_inr,
        "unit_inr": unit_inr,
        "operator_name": operator_name,
        "operator_country": operator_country_display,
        "operator_gstin": gst_check.get("operator_gstin", ""),
        "gst_applies": gst_check["applies"],
        "gst_reason": gst_check["reason"],
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "gst_category": rate_info.get("description", ""),
        "gst_sac_code": rate_info.get("sac_hsn", ""),
        "is_export": gst_check.get("is_export", False),
        "tcs_applies": tcs_applies,
        "tcs_rate": tcs_rate,
        "tcs_amount": tcs_amount,
        "pan_required": tcs_applies,
        "pan_on_file": has_pan,
        "tcs_explanation": (
            f"As per Section 206C(1G) of the Income Tax Act, a TCS of {tcs_rate}% "
            f"({'with PAN' if has_pan else 'without PAN'}) "
            f"is applicable on overseas tour packages purchased by Indian residents. "
            + ("" if has_pan else "Furnish PAN to reduce rate to 2%. ") +
            f"This TCS of \u20b9{tcs_amount:,.2f} will be reflected in your Form 26AS and "
            f"can be claimed as credit while filing your income tax return."
        ) if tcs_applies else None,
        "total_inr": total_inr,
        "list_currency": list_currency,
        "base_list": base_list,
        "gst_list": gst_list,
        "tcs_list": tcs_list,
        "total_list": total_list,
        "breakdown": {
            "base": base_inr,
            "gst": gst_amount,
            "tcs": tcs_amount,
            "total": total_inr,
        }
    }


@router.post("/tax/store-pan")
async def store_pan(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Verify PAN against govt records via Sandbox.co.in, then store if valid."""
    pan = (request_data.get("pan_number") or "").strip().upper()
    name_on_pan = (request_data.get("name_on_pan") or "").strip()

    if not pan or len(pan) != 10:
        raise HTTPException(status_code=400, detail="Invalid PAN format. Must be 10 characters (e.g., ABCDE1234F)")
    if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan):
        raise HTTPException(status_code=400, detail="Invalid PAN format. Expected: ABCDE1234F")
    if not name_on_pan:
        raise HTTPException(status_code=400, detail="Name as on PAN card is required")

    govt_result = await verify_pan_with_sandbox(pan, name_on_pan)
    govt_verified = govt_result.get("pan_valid", False) and govt_result.get("name_match", False)

    await db.pan_verifications.insert_one({
        "user_id": current_user["id"],
        "user_email": current_user.get("email"),
        "profile_name": current_user.get("name"),
        "pan_number": pan[:2] + "****" + pan[-2:],
        "name_on_pan": name_on_pan,
        "govt_verified": govt_verified,
        "govt_pan_valid": govt_result.get("pan_valid", False),
        "govt_name_match": govt_result.get("name_match", False),
        "govt_name_on_record": govt_result.get("name_on_record", ""),
        "govt_reason": govt_result.get("reason", ""),
        "govt_transaction_id": govt_result.get("transaction_id", ""),
        "verification_method": "sandbox_gov" if govt_result.get("verified") else "sandbox_fallback",
        "verified_at": datetime.now(timezone.utc).isoformat(),
    })

    if govt_verified:
        await db.users.update_one({"id": current_user["id"]}, {"$set": {
            "pan_number": pan,
            "pan_name": name_on_pan,
            "pan_govt_verified": True,
            "pan_updated_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {
            "success": True,
            "govt_verified": True,
            "message": "PAN verified against government records and saved",
            "pan_masked": pan[:2] + "****" + pan[-2:],
        }
    else:
        reason = ""
        if not govt_result.get("verified"):
            reason = "Unable to verify PAN with government records at this time. "
        elif not govt_result.get("pan_valid"):
            reason = "PAN number is invalid as per government records. "
        elif not govt_result.get("name_match"):
            reason = "Name entered does not match the name on PAN as per government records. "
        return {
            "success": False,
            "govt_verified": False,
            "message": f"{reason}TCS of 4% will be charged.",
            "pan_masked": pan[:2] + "****" + pan[-2:],
        }


@router.post("/tax/booking-acknowledgment")
async def store_booking_acknowledgment(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Store tax compliance acknowledgment for audit trail."""
    ack_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_email": current_user.get("email"),
        "listing_id": request_data.get("listing_id"),
        "listing_name": request_data.get("listing_name"),
        "residence_country": request_data.get("residence_country"),
        "is_overseas": request_data.get("is_overseas", False),
        "gst_acknowledged": request_data.get("gst_acknowledged", False),
        "tcs_acknowledged": request_data.get("tcs_acknowledged", False),
        "tcs_rate": request_data.get("tcs_rate", 0),
        "tcs_amount": request_data.get("tcs_amount", 0),
        "pan_on_file": bool(current_user.get("pan_number")),
        "base_amount_inr": request_data.get("base_amount_inr", 0),
        "total_amount_inr": request_data.get("total_amount_inr", 0),
        "participants": request_data.get("participants", 1),
        "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        "ip_address": request_data.get("ip_address", ""),
    }
    await db.tax_acknowledgments.insert_one(ack_doc.copy())
    return {"acknowledgment_id": ack_doc["id"], "stored": True}


@router.post("/tax/calculate-cart")
async def calculate_cart_tax(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Calculate tax for all items in cart."""
    shipping_country = request_data.get("shipping_country")
    shipping_state = request_data.get("shipping_state", "")
    if shipping_country:
        _country = (shipping_country or "").strip().lower()
        is_domestic = _country in ("india", "in")
    else:
        diver_country = (current_user.get("location_country") or "").strip().lower()
        is_domestic = diver_country in ("india", "in")

    cart = await db.carts.find_one({"user_id": current_user["id"]})
    if not cart or not cart.get("items"):
        return {"items": [], "totals": {"base": 0, "gst": 0, "total": 0}}

    inr_rate = 83.5
    rates_doc = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    if rates_doc and rates_doc.get("rates", {}).get("INR"):
        inr_rate = rates_doc["rates"]["INR"]

    items = []
    total_base = 0
    total_gst = 0
    total_igst = 0
    total_cgst = 0
    total_sgst = 0
    # Native-INR accumulators (no FX conversion). These are the authoritative
    # numbers when domestic — they avoid the USD round-trip drift that otherwise
    # adds ≤ ₹0.50 per cart between display and the actual GST filing amount.
    total_base_inr = 0.0
    total_gst_inr = 0.0
    total_igst_inr = 0.0
    total_cgst_inr = 0.0
    total_sgst_inr = 0.0
    for item in cart.get("items", []):
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not product:
            continue
        category = get_product_tax_category(product)
        unit_inr = round(product["price"] * inr_rate * 100) / 100
        line_base_inr = round(unit_inr * item["quantity"] * 100) / 100
        tax = await calculate_tax(line_base_inr, category, is_domestic, shipping_state)
        line_base_usd = round(line_base_inr / inr_rate, 4)
        items.append({
            "product_id": item["product_id"],
            "product_name": product.get("name"),
            "quantity": item["quantity"],
            "unit_price": product["price"],
            "unit_price_inr": unit_inr,
            "line_base_inr": line_base_inr,
            "tax_category": category,
            **tax
        })
        total_base += line_base_usd
        total_gst += round(tax["gst_amount"] / inr_rate, 4)
        total_igst += round(tax.get("igst", 0) / inr_rate, 4)
        total_cgst += round(tax.get("cgst", 0) / inr_rate, 4)
        total_sgst += round(tax.get("sgst", 0) / inr_rate, 4)
        # Native-INR sums (per-line-item rounded by calculate_tax, then summed —
        # this matches the GSTR-3B per-invoice rounding convention).
        total_base_inr += line_base_inr
        total_gst_inr += tax.get("gst_amount", 0)
        total_igst_inr += tax.get("igst", 0)
        total_cgst_inr += tax.get("cgst", 0)
        total_sgst_inr += tax.get("sgst", 0)

    response = {
        "items": items,
        "totals": {
            "base": round(total_base, 2),
            "gst": round(total_gst, 2),
            "igst": round(total_igst, 2),
            "cgst": round(total_cgst, 2),
            "sgst": round(total_sgst, 2),
            "total": round(total_base + total_gst, 2)
        },
        "is_domestic": is_domestic
    }
    if is_domestic:
        # Authoritative INR totals — frontend MUST prefer these when displayCurrency=INR
        # to eliminate the USD→INR round-trip rounding drift on domestic carts.
        response["totals_inr"] = {
            "base": round(total_base_inr, 2),
            "gst": round(total_gst_inr, 2),
            "igst": round(total_igst_inr, 2),
            "cgst": round(total_cgst_inr, 2),
            "sgst": round(total_sgst_inr, 2),
            "total": round(total_base_inr + total_gst_inr, 2),
        }
    return response


# --- Compliance Dashboard ---

@router.get("/compliance/summary")
async def compliance_summary(
    period: str = Query("current_month"),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc)
    if period == "current_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif period == "last_month":
        first_of_month = now.replace(day=1)
        last_month = (first_of_month - timedelta(days=1)).replace(day=1)
        start = last_month.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    elif period == "current_fy":
        fy_start_year = now.year if now.month >= 4 else now.year - 1
        start = datetime(fy_start_year, 4, 1, tzinfo=timezone.utc).isoformat()
    else:
        start = "2020-01-01T00:00:00+00:00"

    paid_txns = await db.payment_transactions.find(
        {"payment_status": "paid", "paid_at": {"$gte": start}}, {"_id": 0}
    ).to_list(10000)

    payouts = await db.payouts.find(
        {"created_at": {"$gte": start}}, {"_id": 0}
    ).to_list(10000)

    total_collected = sum(t.get("amount", 0) for t in paid_txns)
    total_gst_collected = sum(t.get("gst_amount", 0) for t in paid_txns)
    total_commission = sum(p.get("commission", 0) for p in payouts)
    total_commission_gst = sum(p.get("commission_gst", 0) for p in payouts)
    total_tcs = sum(p.get("tcs_amount", 0) for p in payouts)
    total_operator_payouts = sum(p.get("operator_payout", 0) for p in payouts)
    domestic_txns = [t for t in paid_txns if not t.get("is_export")]
    export_txns = [t for t in paid_txns if t.get("is_export")]

    return {
        "period": period,
        "period_start": start,
        "transactions": {
            "total_count": len(paid_txns),
            "domestic_count": len(domestic_txns),
            "export_count": len(export_txns),
            "total_collected": round(total_collected, 2),
        },
        "gst": {
            "gst_collected_from_divers": round(total_gst_collected, 2),
            "gst_on_commission": round(total_commission_gst, 2),
            "net_gst_liability": round(total_gst_collected - total_commission_gst, 2),
        },
        "tcs": {
            "total_tcs_collected": round(total_tcs, 2),
        },
        "revenue": {
            "total_commission_earned": round(total_commission, 2),
            "total_operator_payouts": round(total_operator_payouts, 2),
        },
        "export_value": round(sum(t.get("amount", 0) for t in export_txns), 2),
    }


@router.get("/compliance/transactions")
async def compliance_transactions(
    period: str = Query("current_month"),
    tx_type: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc)
    if period == "current_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    else:
        start = "2020-01-01T00:00:00+00:00"

    query = {"payment_status": "paid", "paid_at": {"$gte": start}}
    if tx_type == "domestic":
        query["is_export"] = {"$ne": True}
    elif tx_type == "export":
        query["is_export"] = True

    txns = await db.payment_transactions.find(query, {"_id": 0}).sort("paid_at", -1).to_list(1000)
    return {"transactions": txns, "count": len(txns)}


@router.get("/compliance/export-excel")
async def export_compliance_excel(
    period: str = Query("current_month"),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc)
    if period == "current_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        period_label = now.strftime("%B_%Y")
    elif period == "last_month":
        first_of_month = now.replace(day=1)
        last_month = (first_of_month - timedelta(days=1)).replace(day=1)
        start = last_month.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        period_label = last_month.strftime("%B_%Y")
    elif period == "current_fy":
        fy_start_year = now.year if now.month >= 4 else now.year - 1
        start = datetime(fy_start_year, 4, 1, tzinfo=timezone.utc).isoformat()
        period_label = f"FY_{fy_start_year}_{fy_start_year + 1}"
    else:
        start = "2020-01-01T00:00:00+00:00"
        period_label = "All_Time"

    txns = await db.payment_transactions.find(
        {"payment_status": "paid", "paid_at": {"$gte": start}}, {"_id": 0}
    ).sort("paid_at", 1).to_list(10000)

    payouts = await db.payouts.find(
        {"created_at": {"$gte": start}}, {"_id": 0}
    ).to_list(10000)
    payout_map = {p.get("booking_id", ""): p for p in payouts}

    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = openpyxl.Workbook()

    # Sheet 1: Transaction Register
    ws1 = wb.active
    ws1.title = "Transaction Register"
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="0E7490", end_color="0E7490", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    headers1 = [
        "Date", "Transaction ID", "Payment ID", "Booking ID",
        "Base Amount", "GST Rate %", "IGST", "CGST", "SGST", "Total Amount",
        "SAC/HSN", "Domestic/Export", "Operator ID", "Operator Name"
    ]
    for col, h in enumerate(headers1, 1):
        cell = ws1.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border

    for i, t in enumerate(txns, 2):
        payout = payout_map.get(t.get("booking_id", ""), {})
        ws1.cell(row=i, column=1, value=t.get("paid_at", "")[:10]).border = thin_border
        ws1.cell(row=i, column=2, value=t.get("id", "")).border = thin_border
        ws1.cell(row=i, column=3, value=t.get("payment_id", "")).border = thin_border
        ws1.cell(row=i, column=4, value=t.get("booking_id", "")).border = thin_border
        ws1.cell(row=i, column=5, value=t.get("base_amount", t.get("amount", 0))).border = thin_border
        ws1.cell(row=i, column=6, value=t.get("gst_rate", 0)).border = thin_border
        ws1.cell(row=i, column=7, value=t.get("igst", 0)).border = thin_border
        ws1.cell(row=i, column=8, value=t.get("cgst", 0)).border = thin_border
        ws1.cell(row=i, column=9, value=t.get("sgst", 0)).border = thin_border
        ws1.cell(row=i, column=10, value=t.get("amount", 0)).border = thin_border
        ws1.cell(row=i, column=11, value=t.get("sac_hsn", "")).border = thin_border
        ws1.cell(row=i, column=12, value="Export" if t.get("is_export") else "Domestic").border = thin_border
        ws1.cell(row=i, column=13, value=payout.get("operator_id", "")).border = thin_border
        ws1.cell(row=i, column=14, value=payout.get("operator_name", "")).border = thin_border

    for col in range(1, len(headers1) + 1):
        ws1.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 18

    # Sheet 2: Payout Register
    ws2 = wb.create_sheet("Payout Register")
    headers2 = [
        "Date", "Payout ID", "Booking ID", "Operator Name",
        "Total Collected", "Base Amount", "GST Collected",
        "Commission", "Commission GST", "TCS", "Operator Payout",
        "Payout Method", "Payout Currency", "Status"
    ]
    for col, h in enumerate(headers2, 1):
        cell = ws2.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border

    for i, p in enumerate(payouts, 2):
        ws2.cell(row=i, column=1, value=p.get("created_at", "")[:10]).border = thin_border
        ws2.cell(row=i, column=2, value=p.get("id", "")).border = thin_border
        ws2.cell(row=i, column=3, value=p.get("booking_id", "")).border = thin_border
        ws2.cell(row=i, column=4, value=p.get("operator_name", "")).border = thin_border
        ws2.cell(row=i, column=5, value=p.get("total_amount", 0)).border = thin_border
        ws2.cell(row=i, column=6, value=p.get("base_amount", 0)).border = thin_border
        ws2.cell(row=i, column=7, value=p.get("gst_collected", 0)).border = thin_border
        ws2.cell(row=i, column=8, value=p.get("commission", 0)).border = thin_border
        ws2.cell(row=i, column=9, value=p.get("commission_gst", 0)).border = thin_border
        ws2.cell(row=i, column=10, value=p.get("tcs_amount", 0)).border = thin_border
        ws2.cell(row=i, column=11, value=p.get("operator_payout", 0)).border = thin_border
        ws2.cell(row=i, column=12, value=p.get("payout_method", "")).border = thin_border
        ws2.cell(row=i, column=13, value=p.get("payout_currency", "")).border = thin_border
        ws2.cell(row=i, column=14, value=p.get("status", "")).border = thin_border

    for col in range(1, len(headers2) + 1):
        ws2.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 18

    # Sheet 3: GST Summary
    ws3 = wb.create_sheet("GST Summary")
    summary_headers = ["Metric", "Amount (INR)"]
    for col, h in enumerate(summary_headers, 1):
        cell = ws3.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border

    total_gst = sum(t.get("gst_amount", 0) for t in txns)
    total_comm_gst = sum(p.get("commission_gst", 0) for p in payouts)
    total_tcs = sum(p.get("tcs_amount", 0) for p in payouts)
    total_commission = sum(p.get("commission", 0) for p in payouts)
    domestic_revenue = sum(t.get("amount", 0) for t in txns if not t.get("is_export"))
    export_revenue = sum(t.get("amount", 0) for t in txns if t.get("is_export"))

    summary_rows = [
        ("Total Transactions", len(txns)),
        ("Domestic Transactions", len([t for t in txns if not t.get("is_export")])),
        ("Export Transactions (Zero-rated)", len([t for t in txns if t.get("is_export")])),
        ("", ""),
        ("Domestic Revenue", round(domestic_revenue, 2)),
        ("Export Revenue", round(export_revenue, 2)),
        ("", ""),
        ("GST Collected from Divers", round(total_gst, 2)),
        ("GST on Platform Commission (ITC)", round(total_comm_gst, 2)),
        ("Net GST Liability", round(total_gst - total_comm_gst, 2)),
        ("", ""),
        ("TCS Collected (1%)", round(total_tcs, 2)),
        ("", ""),
        ("Total Commission Earned", round(total_commission, 2)),
        ("Total Operator Payouts", round(sum(p.get("operator_payout", 0) for p in payouts), 2)),
    ]
    for i, (metric, value) in enumerate(summary_rows, 2):
        ws3.cell(row=i, column=1, value=metric).border = thin_border
        ws3.cell(row=i, column=2, value=value).border = thin_border

    ws3.column_dimensions['A'].width = 35
    ws3.column_dimensions['B'].width = 20

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"BottomTime_Compliance_{period_label}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
