"""
Phase 4-P4 — Refunds + Stripe orphan-payment replay
====================================================

Locked behavior — see `/app/memory/REFUNDS_LOCKED.md`.

Refund surface (admin-only, super-admin required):
  POST /api/admin/refunds/create
        body: {kind: "order"|"booking", id, amount_to_refund_display, reason}
        → routes through provider (razorpay | stripe) using the
          payment_provider field stamped on payment_transactions / order /
          booking rows.

Webhook reconciliation:
  Razorpay webhook handler (in payments.py) now also processes refund.* events.
  Stripe webhook handler (in payments.py) processes charge.refunded events.
  Both call `_reconcile_refund_from_webhook()` here.

Orphan-Stripe-payment replay (S6 known issue #1):
  GET  /api/admin/orphan-stripe-payments   → list paid stripe txns w/o orders
  POST /api/admin/orphan-stripe-payments/{session_id}/replay
        body: {shipping: {...full address...}}
        → creates the missing orders row using the captured txn's
          amount_inr / fx_rate_locked.

FX audit trail:
  Refund.amount_inr is ALWAYS computed using the ORIGINAL order's
  fx_rate_locked, NOT current FX. This keeps refund books matching what
  was originally received in INR.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import Optional
import logging
import uuid

from database import db
from auth_utils import get_current_user, require_admin
from config import SUPER_ADMINS, razorpay_client
from helpers import create_notification

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────
# Authorization helpers
# ─────────────────────────────────────────────────────────────────────────


async def _require_super_admin(current_user: dict) -> None:
    await require_admin(current_user)
    if not any(s["email"] == current_user["email"] for s in SUPER_ADMINS):
        raise HTTPException(status_code=403, detail="Super-admin required for refund operations")


# ─────────────────────────────────────────────────────────────────────────
# Refund creation
# ─────────────────────────────────────────────────────────────────────────


@router.post("/admin/refunds/create")
async def create_refund(payload: dict, current_user: dict = Depends(get_current_user)):
    """Initiate a refund against an order or booking.

    Body: {kind, id, amount_to_refund_display, reason}

    Provider branching is automatic via `payment_provider` field on the
    underlying record. FX audit trail uses the ORIGINAL order's
    `fx_rate_locked`.
    """
    await _require_super_admin(current_user)
    kind = (payload.get("kind") or "").strip().lower()
    target_id = (payload.get("id") or "").strip()
    amount_to_refund_display = payload.get("amount_to_refund_display")
    reason = (payload.get("reason") or "").strip()

    if kind not in ("order", "booking"):
        raise HTTPException(status_code=400, detail="kind must be 'order' or 'booking'")
    if not target_id:
        raise HTTPException(status_code=400, detail="id is required")
    if amount_to_refund_display is None or float(amount_to_refund_display) <= 0:
        raise HTTPException(status_code=400, detail="amount_to_refund_display must be > 0")
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")

    collection = db.orders if kind == "order" else db.bookings
    record = await collection.find_one({"id": target_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail=f"{kind} not found")

    # Pull canonical values from the record. These were locked at order
    # creation time and we MUST use them for the refund audit trail.
    payment_id = record.get("payment_id")
    payment_provider = (record.get("payment_provider") or "").lower()
    display_currency = (record.get("display_currency") or record.get("currency") or "INR").upper()
    fx_rate_locked = record.get("fx_rate_locked") or 1.0
    original_amount_display = record.get("amount_display") or record.get("total") or record.get("total_price")

    # Backfill payment_provider from txn if record doesn't have it (older rows)
    if not payment_provider and payment_id:
        txn = await db.payment_transactions.find_one({"payment_id": payment_id}, {"_id": 0, "payment_provider": 1, "session_id": 1, "order_id": 1})
        if txn:
            payment_provider = (txn.get("payment_provider") or "").lower()
            if not payment_provider:
                # Heuristic: order_id starting "order_" → razorpay; session "cs_" → stripe
                if (txn.get("order_id") or "").startswith("order_"):
                    payment_provider = "razorpay"
                elif (txn.get("session_id") or "").startswith("cs_"):
                    payment_provider = "stripe"

    if payment_provider not in ("razorpay", "stripe"):
        raise HTTPException(status_code=400, detail=f"Cannot refund: unknown or missing payment_provider on {kind} row")

    if not payment_id:
        raise HTTPException(status_code=400, detail=f"Cannot refund: {kind} has no payment_id")

    # Partial refund cap — sum prior refunds + this one ≤ original.
    prior_refunded = float(record.get("refunded_amount_display") or 0)
    if float(amount_to_refund_display) + prior_refunded > float(original_amount_display) + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount exceeds remaining refundable: {float(original_amount_display) - prior_refunded:.2f} {display_currency}",
        )

    # Compute refund INR using the ORIGINAL order's locked FX, NOT current FX.
    # This keeps the refund book matching what was originally received.
    refund_amount_inr = round(float(amount_to_refund_display) * float(fx_rate_locked), 2) if display_currency != "INR" else round(float(amount_to_refund_display), 2)

    refund_doc = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "target_id": target_id,
        "order_id": target_id if kind == "order" else None,
        "booking_id": target_id if kind == "booking" else None,
        "payment_id": payment_id,
        "payment_provider": payment_provider,
        "amount_display": round(float(amount_to_refund_display), 2),
        "display_currency": display_currency,
        "amount_inr": refund_amount_inr,
        "fx_rate_locked": fx_rate_locked,  # snapshotted from original order
        "fx_locked_at": record.get("fx_locked_at"),
        "fx_source": "original_order_locked_fx",
        "reason": reason,
        "source": "admin_initiated",
        "admin_id": current_user["id"],
        "admin_email": current_user["email"],
        "status": "initiated",
        "provider_refund_id": None,
        "provider_error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # ── Razorpay path ──
    if payment_provider == "razorpay":
        if razorpay_client is None:
            refund_doc["status"] = "mock_processed"
            refund_doc["provider_refund_id"] = f"rfnd_mock_{uuid.uuid4().hex[:14]}"
            refund_doc["mock"] = True
        else:
            try:
                from currency_helpers import to_minor_units
                rzp_refund = razorpay_client.payment.refund(
                    payment_id,
                    {
                        "amount": to_minor_units(float(amount_to_refund_display), display_currency),
                        "speed": "normal",
                        "notes": {"reason": reason[:255], "admin_id": current_user["id"]},
                    },
                )
                refund_doc["provider_refund_id"] = rzp_refund.get("id")
                refund_doc["status"] = "processed" if rzp_refund.get("status") == "processed" else "initiated"
                refund_doc["provider_payload"] = {"speed_processed": rzp_refund.get("speed_processed"), "created_at": rzp_refund.get("created_at")}
            except Exception as e:
                logger.exception("Razorpay refund failed")
                refund_doc["status"] = "failed"
                refund_doc["provider_error"] = str(e)[:500]

    # ── Stripe path ──
    elif payment_provider == "stripe":
        try:
            # Need to retrieve session → payment_intent → create refund.
            from stripe_helpers import get_stripe_client
            client = get_stripe_client()
            session_id = None
            # payment_id may be pi_stripe_<sid prefix>; we stored session_id on txn
            txn = await db.payment_transactions.find_one({"payment_id": payment_id}, {"_id": 0, "session_id": 1})
            if txn:
                session_id = txn.get("session_id")
            if not session_id:
                raise RuntimeError("Cannot find Stripe session_id for this payment")

            if client is None or session_id.startswith("cs_mock_"):
                # Mock fallback (no real Stripe key OR mock session)
                refund_doc["status"] = "mock_processed"
                refund_doc["provider_refund_id"] = f"re_mock_{uuid.uuid4().hex[:14]}"
                refund_doc["mock"] = True
            else:
                import stripe
                from currency_helpers import to_minor_units
                # Initializing StripeCheckout sets stripe.api_base to the Emergent proxy
                _ = client  # ensures proxy is active
                # Retrieve session to get payment_intent
                session = stripe.checkout.Session.retrieve(session_id)
                pi = session.get("payment_intent")
                if not pi:
                    raise RuntimeError(f"Stripe session {session_id} has no payment_intent (still pending?)")
                stripe_refund = stripe.Refund.create(
                    payment_intent=pi,
                    amount=to_minor_units(float(amount_to_refund_display), display_currency),
                    reason="requested_by_customer",
                    metadata={"order_id": target_id, "reason": reason[:200], "admin_id": current_user["id"]},
                )
                refund_doc["provider_refund_id"] = stripe_refund.get("id")
                refund_doc["status"] = "processed" if stripe_refund.get("status") == "succeeded" else "initiated"
                refund_doc["provider_payload"] = {"status": stripe_refund.get("status"), "charge": stripe_refund.get("charge")}
        except Exception as e:
            logger.exception("Stripe refund failed")
            refund_doc["status"] = "failed"
            refund_doc["provider_error"] = str(e)[:500]

    await db.refunds.insert_one(refund_doc.copy())

    # On any non-failed outcome, update the underlying record's running totals.
    if refund_doc["status"] != "failed":
        new_refunded_display = round(prior_refunded + float(amount_to_refund_display), 2)
        new_refunded_inr = round(float(record.get("refunded_amount_inr") or 0) + refund_amount_inr, 2)
        update = {
            "refunded_amount_display": new_refunded_display,
            "refunded_amount_inr": new_refunded_inr,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        # If fully refunded, set the record status
        if abs(new_refunded_display - float(original_amount_display)) < 0.01:
            update["payment_status"] = "refunded"
            update["status"] = "refunded" if kind == "order" else "cancelled"
        else:
            update["payment_status"] = "partially_refunded"

        await collection.update_one({"id": target_id}, {"$set": update, "$push": {"refunds": refund_doc["id"]}})

        # Notify the customer
        user_id = record.get("user_id")
        if user_id:
            await create_notification(
                user_id, "refund_initiated", "Refund Initiated",
                f"A refund of {display_currency} {float(amount_to_refund_display):.2f} for {kind} {record.get('order_number') or target_id} has been initiated. Reason: {reason}",
                {"kind": kind, "id": target_id, "amount_display": float(amount_to_refund_display), "currency": display_currency, "refund_id": refund_doc["id"]},
            )

    return refund_doc


# ─────────────────────────────────────────────────────────────────────────
# Refund listing
# ─────────────────────────────────────────────────────────────────────────


@router.get("/admin/refunds")
async def list_refunds(
    current_user: dict = Depends(get_current_user),
    kind: Optional[str] = None,
    provider: Optional[str] = None,
    status: Optional[str] = None,
):
    await require_admin(current_user)
    query: dict = {}
    if kind:
        query["kind"] = kind
    if provider:
        query["payment_provider"] = provider
    if status:
        query["status"] = status
    refunds = await db.refunds.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    summary = {
        "total_count": len(refunds),
        "total_refunded_inr": round(sum(r.get("amount_inr") or 0 for r in refunds), 2),
        "by_provider": {},
        "by_status": {},
    }
    for r in refunds:
        prov = r.get("payment_provider") or "unknown"
        st = r.get("status") or "unknown"
        summary["by_provider"][prov] = summary["by_provider"].get(prov, 0) + 1
        summary["by_status"][st] = summary["by_status"].get(st, 0) + 1
    return {"refunds": refunds, "summary": summary}


@router.get("/admin/refunds/for/{kind}/{target_id}")
async def list_refunds_for_target(kind: str, target_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if kind not in ("order", "booking"):
        raise HTTPException(status_code=400, detail="kind must be 'order' or 'booking'")
    refunds = await db.refunds.find({"kind": kind, "target_id": target_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"refunds": refunds}


@router.get("/refunds/mine")
async def my_refunds(current_user: dict = Depends(get_current_user)):
    """Customer-facing endpoint — refunds for the current user's orders/bookings."""
    # Pull all order_ids and booking_ids owned by the user
    orders = await db.orders.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(500)
    bookings = await db.bookings.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(500)
    order_ids = [o["id"] for o in orders]
    booking_ids = [b["id"] for b in bookings]
    refunds = await db.refunds.find(
        {"$or": [{"order_id": {"$in": order_ids}}, {"booking_id": {"$in": booking_ids}}]},
        {"_id": 0, "admin_email": 0, "admin_id": 0, "provider_payload": 0},
    ).sort("created_at", -1).to_list(500)
    return {"refunds": refunds}


# ─────────────────────────────────────────────────────────────────────────
# Webhook reconciliation entry point — called from payments.py webhooks
# ─────────────────────────────────────────────────────────────────────────


async def _reconcile_refund_from_webhook(
    provider: str,
    provider_refund_id: str,
    payment_id: Optional[str],
    amount_minor: Optional[int],
    currency: Optional[str],
    new_status: str,
    raw_payload: Optional[dict] = None,
) -> None:
    """Reconcile a refund event from a provider webhook.

    Idempotent: looks up by `provider_refund_id`. If missing, creates a new
    refund row marked `source: "dashboard"` (initiated outside the app).
    """
    existing = await db.refunds.find_one({"provider_refund_id": provider_refund_id}, {"_id": 0})

    if existing:
        # Just update the status if it changed
        if existing.get("status") != new_status:
            await db.refunds.update_one(
                {"id": existing["id"]},
                {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat(), "provider_payload": raw_payload}},
            )
            logger.info(f"Refund {provider_refund_id} status: {existing.get('status')} → {new_status}")
        return

    # Dashboard-initiated refund — create a new row mirroring app-initiated ones.
    if not payment_id:
        logger.warning(f"Webhook refund {provider_refund_id} missing payment_id; cannot link.")
        return

    # Find the order or booking via payment_transactions.payment_id
    txn = await db.payment_transactions.find_one({"payment_id": payment_id}, {"_id": 0})
    if not txn:
        logger.warning(f"Webhook refund {provider_refund_id}: no txn found for payment_id={payment_id}")
        return

    # Determine kind (order vs booking) by txn flags
    kind = "booking" if txn.get("booking_id") else "order"
    target_id = txn.get("booking_id")
    if kind == "order":
        order = await db.orders.find_one({"payment_id": payment_id}, {"_id": 0, "id": 1})
        target_id = order["id"] if order else None

    if not target_id:
        logger.warning(f"Webhook refund {provider_refund_id}: cannot resolve target {kind}")
        return

    # Compute amount_display + amount_inr from the webhook minor-unit value.
    from currency_helpers import from_minor_units
    display_currency = (currency or txn.get("currency") or "INR").upper()
    amount_display = round(from_minor_units(amount_minor, display_currency), 2) if amount_minor else 0
    fx_rate_locked = txn.get("fx_rate_locked") or 1.0
    refund_amount_inr = round(amount_display * float(fx_rate_locked), 2) if display_currency != "INR" else round(amount_display, 2)

    refund_doc = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "target_id": target_id,
        "order_id": target_id if kind == "order" else None,
        "booking_id": target_id if kind == "booking" else None,
        "payment_id": payment_id,
        "payment_provider": provider,
        "amount_display": amount_display,
        "display_currency": display_currency,
        "amount_inr": refund_amount_inr,
        "fx_rate_locked": fx_rate_locked,
        "fx_locked_at": txn.get("fx_locked_at"),
        "fx_source": "original_order_locked_fx",
        "reason": "Refund initiated from provider dashboard",
        "source": "dashboard",
        "admin_id": None,
        "admin_email": None,
        "status": new_status,
        "provider_refund_id": provider_refund_id,
        "provider_error": None,
        "provider_payload": raw_payload,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.refunds.insert_one(refund_doc.copy())

    # Update running totals on the target record
    collection = db.orders if kind == "order" else db.bookings
    rec = await collection.find_one({"id": target_id}, {"_id": 0})
    if rec:
        prior_display = float(rec.get("refunded_amount_display") or 0)
        prior_inr = float(rec.get("refunded_amount_inr") or 0)
        await collection.update_one(
            {"id": target_id},
            {
                "$set": {
                    "refunded_amount_display": round(prior_display + amount_display, 2),
                    "refunded_amount_inr": round(prior_inr + refund_amount_inr, 2),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "$push": {"refunds": refund_doc["id"]},
            },
        )

    logger.info(f"Dashboard refund {provider_refund_id} reconciled for {kind} {target_id}")


# ─────────────────────────────────────────────────────────────────────────
# Orphan-Stripe-payment replay tool (Lock S6 known issue #1)
# ─────────────────────────────────────────────────────────────────────────


@router.get("/admin/orphan-stripe-payments")
async def list_orphan_stripe_payments(current_user: dict = Depends(get_current_user)):
    """List paid Stripe txns that have no matching order row.

    Surfaces the known gap from STRIPE_PAYMENT_LOCKED.md S6 #1: user closed
    the tab post-payment-pre-redirect, so CheckoutSuccess.js never ran.
    """
    await require_admin(current_user)
    # Find paid Stripe cart_checkout txns
    paid_txns = await db.payment_transactions.find(
        {"payment_provider": "stripe", "payment_status": "paid", "cart_checkout": True},
        {"_id": 0},
    ).to_list(500)

    orphans = []
    for txn in paid_txns:
        # Order is linked via payment_id (NOT session_id)
        order = await db.orders.find_one({"payment_id": txn.get("payment_id")}, {"_id": 0, "id": 1})
        if order:
            continue
        # Also check by session_id stamped on payment_id (we use pi_stripe_<sid prefix>)
        sid = txn.get("session_id")
        if sid:
            order = await db.orders.find_one({"payment_id": {"$regex": f"^pi_stripe_{sid[:16]}"}}, {"_id": 0, "id": 1})
            if order:
                continue
        # Surface the user's name + email for the admin form
        user = await db.users.find_one({"id": txn.get("user_id")}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        orphans.append({
            "session_id": sid,
            "payment_id": txn.get("payment_id"),
            "user_id": txn.get("user_id"),
            "user_name": user.get("name") if user else "",
            "user_email": user.get("email") if user else "",
            "user_phone": user.get("phone") if user else "",
            "amount": txn.get("amount"),
            "currency": txn.get("currency"),
            "amount_inr": txn.get("amount_inr"),
            "fx_rate_locked": txn.get("fx_rate_locked"),
            "paid_at": txn.get("paid_at"),
            "created_at": txn.get("created_at"),
        })

    return {"orphans": orphans, "count": len(orphans)}


@router.post("/admin/orphan-stripe-payments/{session_id}/replay")
async def replay_orphan_stripe_payment(session_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """Create the missing order row for an orphan Stripe payment.

    Body: {shipping: {name, phone, address_line1, address_line2?, city, state, pincode, country}}

    Pulls amount_inr / fx_rate_locked / cart context from payment_transactions.
    """
    await _require_super_admin(current_user)

    shipping = payload.get("shipping") or {}
    for f in ("name", "address_line1", "city", "pincode"):
        if not shipping.get(f):
            raise HTTPException(status_code=400, detail=f"shipping.{f} is required")

    txn = await db.payment_transactions.find_one(
        {"session_id": session_id, "payment_provider": "stripe", "payment_status": "paid"},
        {"_id": 0},
    )
    if not txn:
        raise HTTPException(status_code=404, detail="No paid Stripe txn found for this session_id")

    # Idempotency — if an order already exists for this txn, return it.
    existing = await db.orders.find_one({"payment_id": txn.get("payment_id")}, {"_id": 0})
    if existing:
        return {"order": existing, "already_existed": True}

    # The cart may have been cleared (likely). We rebuild a minimal order using
    # the txn's amount + the shipping the admin just supplied. Line items are
    # NOT recoverable from the txn alone — surface that gap in the order row.
    user = await db.users.find_one({"id": txn.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User for this txn no longer exists")

    order = {
        "id": str(uuid.uuid4()),
        "order_number": f"BT-{datetime.now(timezone.utc).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "items": [],  # NOT RECOVERABLE — manual reconciliation needed
        "item_count": 0,
        "subtotal": float(txn.get("amount") or 0),
        "gst_amount": 0,
        "total": float(txn.get("amount") or 0),
        "currency": (txn.get("currency") or "USD").upper(),
        "amount_display": float(txn.get("amount") or 0),
        "display_currency": (txn.get("currency") or "USD").upper(),
        "amount_inr": txn.get("amount_inr"),
        "fx_rate_locked": txn.get("fx_rate_locked"),
        "fx_locked_at": txn.get("fx_locked_at"),
        "fx_source": txn.get("fx_source"),
        "payment_id": txn.get("payment_id"),
        "payment_provider": "stripe",
        "payment_status": "paid",
        "shipping": shipping,
        "status": "confirmed",
        "fulfillment_status": "needs_review",  # flag for admin
        "replay_source": "orphan_stripe_payment",
        "replay_admin_id": current_user["id"],
        "replay_note": payload.get("note", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order.copy())

    await create_notification(
        user["id"], "order_created", "Order Confirmation",
        f"Your order {order['order_number']} has been created. Our team is verifying line items and will reach out shortly.",
        {"order_id": order["id"]},
    )

    return {"order": order, "already_existed": False}


# ─────────────────────────────────────────────────────────────────────────
# Dispatch E — Admin CSV exports with Phase-4 INR canonical columns
# ─────────────────────────────────────────────────────────────────────────


def _csv_response(rows: list, columns: list, filename: str):
    """Build a streamed CSV with the given column ordering."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    for row in rows:
        w.writerow([row.get(c, "") for c in columns])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/exports/orders.csv")
async def export_orders_csv(current_user: dict = Depends(get_current_user)):
    """CSV export with INR canonical columns: amount_display, display_currency,
    amount_inr, fx_rate_locked, fx_source, plus refund summary columns."""
    await require_admin(current_user)
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    cols = [
        "id", "order_number", "user_email", "created_at", "status", "fulfillment_status",
        "item_count", "subtotal", "gst_amount", "total", "currency",
        "amount_display", "display_currency", "amount_inr", "fx_rate_locked", "fx_locked_at", "fx_source",
        "payment_id", "payment_provider", "payment_status",
        "refunded_amount_display", "refunded_amount_inr",
    ]
    return _csv_response(orders, cols, "orders_export.csv")


@router.get("/admin/exports/bookings.csv")
async def export_bookings_csv(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    cols = [
        "id", "user_email", "listing_id", "listing_name", "operator_id",
        "created_at", "status", "payment_status",
        "total_price", "currency",
        "amount_display", "display_currency", "amount_inr", "fx_rate_locked", "fx_locked_at", "fx_source",
        "payment_id", "payment_provider",
        "refunded_amount_display", "refunded_amount_inr",
    ]
    return _csv_response(bookings, cols, "bookings_export.csv")


@router.get("/admin/exports/refunds.csv")
async def export_refunds_csv(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    refunds = await db.refunds.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    cols = [
        "id", "kind", "target_id", "order_id", "booking_id",
        "payment_id", "payment_provider", "provider_refund_id",
        "amount_display", "display_currency", "amount_inr", "fx_rate_locked", "fx_locked_at", "fx_source",
        "reason", "source", "admin_email",
        "status", "provider_error", "created_at",
    ]
    return _csv_response(refunds, cols, "refunds_export.csv")

