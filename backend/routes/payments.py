from fastapi import APIRouter, HTTPException, Depends
from starlette.requests import Request as StarletteRequest
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from config import razorpay_client, razorpay_key_id, razorpay_webhook_secret
from helpers import create_notification
from tax_engine import calculate_payout_with_tax
import uuid
import hmac
import hashlib

router = APIRouter()
webhook_router = APIRouter()


@router.post("/payments/create-order")
async def create_razorpay_order(request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    from currency_helpers import to_minor_units, razorpay_supports
    from pricing_helpers import get_fx_rates
    body = await request.json()
    amount = body.get("amount")
    currency = (body.get("currency") or "INR").upper()
    booking_id = body.get("booking_id")
    cart_checkout = body.get("cart_checkout", False)
    idempotency_key = body.get("idempotency_key")  # Phase 4-P2 Issue #7
    # Tax fields passed from checkout (now in DISPLAY currency, with *_inr companions)
    base_amount = body.get("base_amount", amount)
    gst_rate = body.get("gst_rate", 0)
    gst_amount = body.get("gst_amount", 0)
    discount_amount = body.get("discount_amount", 0)
    igst = body.get("igst", 0)
    cgst = body.get("cgst", 0)
    sgst = body.get("sgst", 0)
    sac_hsn = body.get("sac_hsn", "")
    is_export = body.get("is_export", False)
    # Canonical INR companions (Phase 4-P1) — frontend should pass these when known
    amount_inr_hint = body.get("amount_inr")
    base_amount_inr = body.get("base_amount_inr")
    gst_amount_inr = body.get("gst_amount_inr")
    discount_amount_inr = body.get("discount_amount_inr")

    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    # ── Phase 4-P2: per-currency supported check (Razorpay test-mode) ──
    if razorpay_client and not razorpay_supports(currency):
        raise HTTPException(
            status_code=400,
            detail=f"Currency {currency} isn't supported by Razorpay. Switch to USD or INR.",
        )

    # ── Phase 4-P2 Issue #7: server-side idempotency dedupe ──
    if idempotency_key:
        existing = await db.payment_transactions.find_one(
            {"user_id": current_user["id"], "idempotency_key": idempotency_key},
            {"_id": 0, "order_id": 1, "amount": 1, "currency": 1},
        )
        if existing:
            return {
                "order_id": existing["order_id"],
                "amount": to_minor_units(existing["amount"], existing["currency"]),
                "currency": existing["currency"],
                "key_id": razorpay_key_id,
                "mock": existing["order_id"].startswith("order_mock_"),
                "idempotent_replay": True,
            }

    # ── Phase 4-P1: lock FX rate at order-creation time ──
    fx_inr_rate = 1.0
    fx_rates_dict = None
    if currency != "INR":
        fx_inr_rate, fx_rates_dict = await get_fx_rates()  # USD→INR
        # The amount is in `currency`; we want INR equivalent.
        if currency == "USD":
            amount_inr_computed = round(float(amount) * fx_inr_rate, 2)
        else:
            rate = fx_rates_dict.get(currency)
            amount_inr_computed = round((float(amount) / float(rate)) * fx_inr_rate, 2) if rate else round(float(amount) * fx_inr_rate, 2)
    else:
        amount_inr_computed = round(float(amount), 2)
    amount_inr = float(amount_inr_hint) if amount_inr_hint else amount_inr_computed

    tax_fields = {
        "base_amount": base_amount,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "discount_amount": discount_amount,
        "igst": igst, "cgst": cgst, "sgst": sgst,
        "sac_hsn": sac_hsn,
        "is_export": is_export,
        # ── Phase 4-P2 Issue #3: align currencies + add *_inr companions ──
        "base_amount_inr": base_amount_inr,
        "gst_amount_inr": gst_amount_inr,
        "discount_amount_inr": discount_amount_inr,
        # Phase 4-P1: FX lock
        "amount_inr": amount_inr,
        "fx_rate_locked": fx_inr_rate,
        "fx_locked_at": datetime.now(timezone.utc).isoformat(),
        "fx_source": "frankfurter.app" if currency != "INR" else "identity",
        "idempotency_key": idempotency_key,
    }

    if not razorpay_client:
        order_id = f"order_mock_{uuid.uuid4().hex[:16]}"
        txn = {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "user_id": current_user["id"],
            "amount": amount,
            "currency": currency,
            "booking_id": booking_id,
            "cart_checkout": cart_checkout,
            **tax_fields,
            "status": "created",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_transactions.insert_one(txn.copy())
        return {
            "order_id": order_id,
            "amount": to_minor_units(amount, currency),
            "currency": currency,
            "key_id": razorpay_key_id,
            "mock": True
        }

    try:
        order_data = {
            "amount": to_minor_units(amount, currency),
            "currency": currency,
            "payment_capture": 1,
            "notes": {
                "user_id": current_user["id"],
                "booking_id": booking_id or "",
                "cart_checkout": str(cart_checkout)
            }
        }
        order = razorpay_client.order.create(data=order_data)

        txn = {
            "id": str(uuid.uuid4()),
            "order_id": order["id"],
            "user_id": current_user["id"],
            "amount": amount,
            "currency": currency,
            "booking_id": booking_id,
            "cart_checkout": cart_checkout,
            **tax_fields,
            "status": "created",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payment_transactions.insert_one(txn.copy())

        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": razorpay_key_id,
            "mock": False
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment order creation failed: {str(e)}")


@router.post("/payments/verify")
async def verify_payment(request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    order_id = body.get("razorpay_order_id")
    payment_id = body.get("razorpay_payment_id")
    signature = body.get("razorpay_signature")

    if not all([order_id, payment_id, signature]):
        raise HTTPException(status_code=400, detail="Missing payment details")

    txn = await db.payment_transactions.find_one({"order_id": order_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if razorpay_client:
        try:
            razorpay_client.utility.verify_payment_signature({
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature
            })
        except Exception:
            await db.payment_transactions.update_one(
                {"order_id": order_id},
                {"$set": {"status": "failed", "payment_status": "failed"}}
            )
            raise HTTPException(status_code=400, detail="Payment verification failed")

    await db.payment_transactions.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            "payment_id": payment_id,
            "signature": signature,
            "paid_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    if txn.get("booking_id"):
        booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
        if booking:
            await db.bookings.update_one(
                {"id": txn["booking_id"]},
                {"$set": {"status": "confirmed", "payment_status": "paid", "payment_id": payment_id}}
            )
            await _create_payout_record(txn, booking)
            if booking.get("operator_id"):
                await create_notification(
                    booking["operator_id"], "payment_received", "Payment Received",
                    f"Payment of {txn['currency']} {txn['amount']} received for {booking['listing_name']}",
                    {"booking_id": txn["booking_id"], "amount": txn["amount"]}
                )

    # Note: For cart_checkout, cart is cleared by /orders/create endpoint after order is created

    return {"verified": True, "payment_id": payment_id, "status": "paid"}


@router.post("/payments/mock-verify")
async def mock_verify_payment(request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    """Mock verification for test mode when Razorpay keys aren't configured"""
    body = await request.json()
    order_id = body.get("order_id")

    txn = await db.payment_transactions.find_one({"order_id": order_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    mock_payment_id = f"pay_mock_{uuid.uuid4().hex[:16]}"
    await db.payment_transactions.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            "payment_id": mock_payment_id,
            "paid_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    if txn.get("booking_id"):
        booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
        if booking:
            await db.bookings.update_one(
                {"id": txn["booking_id"]},
                {"$set": {"status": "confirmed", "payment_status": "paid", "payment_id": mock_payment_id}}
            )
            await _create_payout_record(txn, booking)

    # Note: For cart_checkout, cart is cleared by /orders/create endpoint after order is created
    # Do NOT clear cart here for cart_checkout - only clear for non-cart payments

    return {"verified": True, "payment_id": mock_payment_id, "status": "paid", "mock": True}


async def _create_payout_record(txn: dict, booking: dict) -> dict:
    """Create a payout record for the operator after payment is confirmed"""
    operator_id = booking.get("operator_id")
    if not operator_id:
        return

    await db.listings.find_one({"id": booking["listing_id"]}, {"_id": 0})
    fee_config = await db.platform_fees.find_one(
        {"entity_type": "listing", "entity_id": booking["listing_id"]}, {"_id": 0}
    )
    if not fee_config:
        fee_config = await db.platform_fees.find_one(
            {"entity_type": "global"}, {"_id": 0}
        )

    platform_fee_percent = fee_config["platform_fee_percent"] if fee_config else 15.0

    operator = await db.users.find_one({"id": operator_id}, {"_id": 0})
    payout_settings = operator.get("payout_settings", {}) if operator else {}
    is_international = payout_settings.get("payout_country", "India") != "India"

    # Use tax data from transaction if available, otherwise calculate
    base_amount = txn.get("base_amount", txn["amount"])
    gst_amount = txn.get("gst_amount", 0)
    is_domestic = not txn.get("is_export", False)

    payout_calc = await calculate_payout_with_tax(
        txn["amount"], base_amount, gst_amount, platform_fee_percent, is_domestic
    )

    payout = {
        "id": str(uuid.uuid4()),
        "booking_id": booking["id"],
        "payment_id": txn.get("payment_id", ""),
        "operator_id": operator_id,
        "operator_name": operator.get("name", "") if operator else "",
        "listing_id": booking["listing_id"],
        "listing_name": booking.get("listing_name", ""),
        "total_amount": txn["amount"],
        "currency": txn["currency"],
        "base_amount": base_amount,
        "gst_collected": gst_amount,
        "platform_fee_percent": platform_fee_percent,
        "commission": payout_calc["commission"],
        "commission_gst": payout_calc["commission_gst"],
        "tcs_amount": payout_calc["tcs_amount"],
        "operator_payout": payout_calc["operator_payout"],
        "payout_currency": payout_settings.get("payout_currency", txn["currency"]),
        "payout_method": "wise" if is_international else "razorpay_route",
        "is_domestic": is_domestic,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payouts.insert_one(payout.copy())


@webhook_router.post("/api/webhook/razorpay")
async def razorpay_webhook(request: StarletteRequest) -> dict:
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if razorpay_webhook_secret and signature:
        expected = hmac.new(
            razorpay_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        import json
        payload = json.loads(body)
        event = payload.get("event", "")
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})

        if event == "payment.captured":
            order_id = payment_entity.get("order_id")
            payment_id = payment_entity.get("id")
            if order_id:
                await db.payment_transactions.update_one(
                    {"order_id": order_id},
                    {"$set": {
                        "status": "completed",
                        "payment_status": "paid",
                        "payment_id": payment_id,
                        "paid_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
        elif event == "payment.failed":
            order_id = payment_entity.get("order_id")
            if order_id:
                await db.payment_transactions.update_one(
                    {"order_id": order_id},
                    {"$set": {"status": "failed", "payment_status": "failed"}}
                )
    except Exception as e:
        print(f"Webhook processing error: {e}")

    return {"received": True}
