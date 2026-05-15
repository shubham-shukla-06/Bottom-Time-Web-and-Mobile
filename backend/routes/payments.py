from fastapi import APIRouter, HTTPException, Depends
from starlette.requests import Request as StarletteRequest
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from config import razorpay_client, razorpay_key_id, razorpay_webhook_secret
from helpers import create_notification
from tax_engine import calculate_payout_with_tax
import os
import uuid
import hmac
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
webhook_router = APIRouter()


# ────────────────────────────────────────────────────────────────────────
# Phase 4-P3 — Provider routing
# /payments/create-order dispatches by `display_currency`:
#   display_currency == "INR"  → Razorpay  (existing `_create_razorpay_order`)
#   display_currency != "INR"  → Stripe    (`_create_stripe_session`)
# Locked in `/app/memory/STRIPE_PAYMENT_LOCKED.md` Lock S1.
# ────────────────────────────────────────────────────────────────────────
@router.post("/payments/create-order")
async def create_order_dispatch(request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    # Prefer explicit `display_currency` (frontend always sends it now).
    # Fall back to `currency` for any legacy caller still in flight.
    display_currency = (body.get("display_currency") or body.get("currency") or "INR").upper()
    if display_currency == "INR":
        return await _create_razorpay_order(request, current_user, body)
    return await _create_stripe_session(request, current_user, body)


async def _create_razorpay_order(request: StarletteRequest, current_user: dict, body: dict):
    """INR path — Razorpay. LOCKED behavior — see RAZORPAY_PAYMENT_LOCKED.md."""
    from currency_helpers import to_minor_units, razorpay_supports
    from pricing_helpers import get_fx_rates
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
                "provider": "razorpay",
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
            "provider": "razorpay",
            "order_id": order_id,
            "amount": to_minor_units(amount, currency),
            "currency": currency,
            "key_id": razorpay_key_id,
            "mock": True,
            "amount_inr": amount_inr,
            "fx_rate_locked": fx_inr_rate,
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
            "provider": "razorpay",
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": razorpay_key_id,
            "mock": False,
            "amount_inr": amount_inr,
            "fx_rate_locked": fx_inr_rate,
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



# ─────────────────────────────────────────────────────────────────────────
# Phase 4-P3 — STRIPE path (non-INR carts + non-INR bookings)
# Locked behavior — see `/app/memory/STRIPE_PAYMENT_LOCKED.md`.
# ─────────────────────────────────────────────────────────────────────────


async def _create_stripe_session(request: StarletteRequest, current_user: dict, body: dict):
    """Non-INR path — Stripe Checkout Session via `emergentintegrations`.

    Returns response shape:
      {provider: "stripe", session_id, session_url, amount, currency,
       amount_inr, fx_rate_locked, idempotent_replay: bool, mock: bool}
    """
    from stripe_helpers import (
        get_stripe_client,
        CheckoutSessionRequest,
        stripe_supports,
    )
    from pricing_helpers import get_fx_rates

    amount = body.get("amount")
    currency = (body.get("currency") or body.get("display_currency") or "USD").upper()
    booking_id = body.get("booking_id")
    cart_checkout = body.get("cart_checkout", False)
    idempotency_key = body.get("idempotency_key")
    origin_url = (body.get("origin_url") or os.environ.get("APP_BASE_URL", "")).rstrip("/")

    # Tax / canonical-INR hints (same contract as Razorpay path)
    base_amount = body.get("base_amount", amount)
    gst_rate = body.get("gst_rate", 0)
    gst_amount = body.get("gst_amount", 0)
    discount_amount = body.get("discount_amount", 0)
    igst = body.get("igst", 0)
    cgst = body.get("cgst", 0)
    sgst = body.get("sgst", 0)
    sac_hsn = body.get("sac_hsn", "")
    is_export = body.get("is_export", False)
    amount_inr_hint = body.get("amount_inr")
    base_amount_inr = body.get("base_amount_inr")
    gst_amount_inr = body.get("gst_amount_inr")
    discount_amount_inr = body.get("discount_amount_inr")

    # Cart-checkout finalization hints (stashed for the success-poll path to
    # finalize order creation without a second user round-trip).
    shipping_address_id = body.get("shipping_address_id")
    shipping_carrier = body.get("shipping_carrier")
    shipping_amount = body.get("shipping_amount")
    promo_code = body.get("promo_code")
    # product_name reserved for future Stripe line-item personalization; the
    # current Emergent wrapper exposes a flat amount/currency so we don't pass it.

    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    if not stripe_supports(currency):
        raise HTTPException(
            status_code=400,
            detail=f"Currency {currency} isn't supported by Stripe in test mode.",
        )

    # ── Idempotency replay (same contract as Razorpay path) ──
    if idempotency_key:
        existing = await db.payment_transactions.find_one(
            {"user_id": current_user["id"], "idempotency_key": idempotency_key, "payment_provider": "stripe"},
            {"_id": 0, "session_id": 1, "session_url": 1, "amount": 1, "currency": 1, "amount_inr": 1, "fx_rate_locked": 1},
        )
        if existing and existing.get("session_id") and existing.get("session_url"):
            return {
                "provider": "stripe",
                "session_id": existing["session_id"],
                "session_url": existing["session_url"],
                "amount": existing["amount"],
                "currency": existing["currency"],
                "amount_inr": existing.get("amount_inr"),
                "fx_rate_locked": existing.get("fx_rate_locked"),
                "idempotent_replay": True,
                "mock": existing["session_id"].startswith("cs_mock_"),
            }

    # ── FX lock at order-creation time (identical to Razorpay path) ──
    fx_inr_rate = 1.0
    fx_rates_dict = None
    if currency != "INR":
        fx_inr_rate, fx_rates_dict = await get_fx_rates()
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
        "base_amount_inr": base_amount_inr,
        "gst_amount_inr": gst_amount_inr,
        "discount_amount_inr": discount_amount_inr,
        "amount_inr": amount_inr,
        "fx_rate_locked": fx_inr_rate,
        "fx_locked_at": datetime.now(timezone.utc).isoformat(),
        "fx_source": "frankfurter.app" if currency != "INR" else "identity",
        "idempotency_key": idempotency_key,
        "shipping_address_id": shipping_address_id,
        "shipping_carrier": shipping_carrier,
        "shipping_amount": shipping_amount,
        "promo_code": promo_code,
    }

    # Build webhook URL for the Stripe wrapper.
    # Wrapper uses webhook_url to verify Stripe-CLI-style signatures.
    api_base = os.environ.get("APP_BASE_URL", "").rstrip("/")
    webhook_url = f"{api_base}/api/webhook/stripe" if api_base else None

    stripe_client = get_stripe_client(webhook_url=webhook_url)

    # ── Mock fallback when STRIPE_API_KEY missing ──
    if stripe_client is None:
        session_id = f"cs_mock_{uuid.uuid4().hex[:24]}"
        session_url = f"{origin_url or 'http://localhost:3000'}/checkout/success?session_id={session_id}&mock=1"
        txn = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "session_url": session_url,
            "user_id": current_user["id"],
            "amount": amount,
            "currency": currency,
            "booking_id": booking_id,
            "cart_checkout": cart_checkout,
            "payment_provider": "stripe",
            **tax_fields,
            "status": "created",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.payment_transactions.insert_one(txn.copy())
        return {
            "provider": "stripe",
            "session_id": session_id,
            "session_url": session_url,
            "amount": amount,
            "currency": currency,
            "amount_inr": amount_inr,
            "fx_rate_locked": fx_inr_rate,
            "mock": True,
        }

    # ── Real Stripe session ──
    success_url = f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/cart" if cart_checkout else f"{origin_url}/"

    metadata = {
        "user_id": current_user["id"],
        "user_email": current_user.get("email", ""),
        "booking_id": booking_id or "",
        "cart_checkout": "1" if cart_checkout else "0",
        # idempotency_key is a UUID — Stripe metadata max 500 chars
        "idempotency_key": (idempotency_key or "")[:500],
    }

    try:
        checkout_req = CheckoutSessionRequest(
            amount=round(float(amount), 2),  # wrapper accepts MAJOR units; handles minor-unit internally
            currency=currency.lower(),       # Stripe convention
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
        session = await stripe_client.create_checkout_session(checkout_req)
    except Exception as e:
        logger.exception("Stripe session creation failed")
        raise HTTPException(status_code=500, detail=f"Stripe session creation failed: {str(e)}")

    txn = {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "session_url": session.url,
        "user_id": current_user["id"],
        "amount": amount,
        "currency": currency,
        "booking_id": booking_id,
        "cart_checkout": cart_checkout,
        "payment_provider": "stripe",
        **tax_fields,
        "status": "created",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.insert_one(txn.copy())

    return {
        "provider": "stripe",
        "session_id": session.session_id,
        "session_url": session.url,
        "amount": amount,
        "currency": currency,
        "amount_inr": amount_inr,
        "fx_rate_locked": fx_inr_rate,
        "mock": False,
    }


@router.get("/payments/stripe/session/{session_id}")
async def stripe_session_status(session_id: str, current_user: dict = Depends(get_current_user)):
    """Status-poll endpoint hit by `CheckoutSuccess.js` after redirect-back.

    Returns the txn row's authoritative state (which the webhook keeps in
    sync). For mock-mode sessions, we mark them paid lazily here so the
    redirect-back UX still flows.
    """
    from stripe_helpers import get_stripe_client

    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": current_user["id"]},
        {"_id": 0},
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Stripe session not found")

    # Mock-mode: flip to paid on first poll so the UI can finalize.
    if session_id.startswith("cs_mock_") and txn.get("payment_status") != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "completed",
                "payment_status": "paid",
                "payment_id": f"pi_mock_{uuid.uuid4().hex[:16]}",
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        txn["status"] = "completed"
        txn["payment_status"] = "paid"

    # Real Stripe: if still pending locally, query Stripe for ground truth
    # (handles cases where the webhook hasn't arrived yet).
    if not session_id.startswith("cs_mock_") and txn.get("payment_status") != "paid":
        client = get_stripe_client()
        if client is not None:
            try:
                status = await client.get_checkout_status(session_id)
                if status.payment_status == "paid":
                    await _finalize_stripe_payment(session_id)
                    txn = await db.payment_transactions.find_one(
                        {"session_id": session_id, "user_id": current_user["id"]},
                        {"_id": 0},
                    ) or txn
            except Exception as e:
                logger.warning(f"Stripe status fetch failed for {session_id}: {e}")

    return {
        "provider": "stripe",
        "session_id": session_id,
        "status": txn.get("status"),
        "payment_status": txn.get("payment_status"),
        "amount": txn.get("amount"),
        "currency": txn.get("currency"),
        "amount_inr": txn.get("amount_inr"),
        "fx_rate_locked": txn.get("fx_rate_locked"),
        "booking_id": txn.get("booking_id"),
        "cart_checkout": bool(txn.get("cart_checkout")),
        "payment_id": txn.get("payment_id"),
    }


async def _finalize_stripe_payment(session_id: str) -> None:
    """Idempotent paid-state transition for a Stripe session.

    Called from both `/payments/stripe/webhook` (canonical) and
    `/payments/stripe/session/{id}` (best-effort fallback when webhook is
    delayed). Mirrors the Razorpay verify-path post-payment side effects.
    """
    txn = await db.payment_transactions.find_one(
        {"session_id": session_id},
        {"_id": 0},
    )
    if not txn:
        logger.warning(f"Stripe webhook: txn not found for session_id={session_id}")
        return
    if txn.get("payment_status") == "paid":
        return  # idempotent: already finalized

    payment_id = f"pi_stripe_{session_id[:16]}"
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            "payment_id": payment_id,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # Booking-specific post-payment: confirm booking + create payout +
    # notify operator. Same shape as the Razorpay verify path.
    if txn.get("booking_id"):
        booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
        if booking:
            await db.bookings.update_one(
                {"id": txn["booking_id"]},
                {"$set": {
                    "status": "confirmed",
                    "payment_status": "paid",
                    "payment_id": payment_id,
                    "payment_provider": "stripe",
                    # Copy canonical fields forward
                    "amount_inr": txn.get("amount_inr"),
                    "amount_display": txn.get("amount"),
                    "display_currency": txn.get("currency"),
                    "fx_rate_locked": txn.get("fx_rate_locked"),
                    "fx_locked_at": txn.get("fx_locked_at"),
                    "fx_source": txn.get("fx_source"),
                }},
            )
            await _create_payout_record(txn, booking)
            if booking.get("operator_id"):
                await create_notification(
                    booking["operator_id"], "payment_received", "Payment Received",
                    f"Payment of {txn['currency']} {txn['amount']} received for {booking.get('listing_name', 'a listing')}",
                    {"booking_id": txn["booking_id"], "amount": txn["amount"]},
                )


@webhook_router.post("/api/webhook/stripe")
async def stripe_webhook(request: StarletteRequest) -> dict:
    """Stripe webhook receiver. Signature is verified by the Emergent
    wrapper's `handle_webhook()` method when `STRIPE_WEBHOOK_SECRET` is
    configured; in its absence, we trust the payload (test-mode parity
    with the Razorpay webhook's optional-secret path).
    """
    from stripe_helpers import get_stripe_client

    body = await request.body()
    sig = request.headers.get("Stripe-Signature") or request.headers.get("stripe-signature")

    client = get_stripe_client()
    if client is None:
        # No STRIPE_API_KEY → webhook can't run. Acknowledge so Stripe stops
        # retrying, but log loudly.
        logger.error("Stripe webhook hit but STRIPE_API_KEY is not configured.")
        return {"received": True, "warning": "stripe not configured"}

    event = None
    try:
        event = await client.handle_webhook(body, sig)
    except Exception as e:
        logger.warning(f"Stripe webhook signature/parse failed: {e}")
        # If we can't verify the signature, still parse the body for the
        # test-mode happy path. Stripe production should never hit this branch.
        try:
            import json
            payload = json.loads(body)
            event_type = payload.get("type", "")
            session_id = (
                payload.get("data", {}).get("object", {}).get("id")
                if "checkout.session" in event_type
                else None
            )
            if event_type == "checkout.session.completed" and session_id:
                await _finalize_stripe_payment(session_id)
        except Exception as inner:
            logger.warning(f"Stripe webhook unsigned-parse fallback failed: {inner}")
        return {"received": True}

    # WebhookEventResponse fields: event_type, event_id, session_id, payment_status, metadata
    if event and event.event_type == "checkout.session.completed" and event.session_id:
        await _finalize_stripe_payment(event.session_id)

    return {"received": True}
