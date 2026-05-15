"""Seed two test orders for refund smoke testing — one Razorpay-paid INR,
one Stripe-paid USD. Idempotent (deletes prior smoke rows first)."""
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from database import db  # noqa: E402


async def main() -> None:
    # Clean up prior smoke artifacts
    await db.orders.delete_many({"order_number": {"$regex": "^SMOKE-RFND-"}})
    await db.payment_transactions.delete_many({"id": {"$in": ["smoke-rzp-1", "smoke-stripe-1"]}})

    now = datetime.now(timezone.utc).isoformat()

    # Razorpay (INR) paid txn + order
    rzp_pay_id = "pay_smoke_inr_001"
    await db.payment_transactions.insert_one({
        "id": "smoke-rzp-1",
        "order_id": "order_smoke_inr_001",
        "payment_id": rzp_pay_id,
        "user_id": "smoke-user-1",
        "amount": 7500.0,
        "currency": "INR",
        "cart_checkout": True,
        "payment_provider": "razorpay",
        "status": "completed",
        "payment_status": "paid",
        "amount_inr": 7500.0,
        "amount_display": 7500.0,
        "display_currency": "INR",
        "fx_rate_locked": 1.0,
        "fx_locked_at": now,
        "fx_source": "identity",
        "paid_at": now,
        "created_at": now,
    })
    rzp_order_id = str(uuid.uuid4())
    await db.orders.insert_one({
        "id": rzp_order_id,
        "order_number": f"SMOKE-RFND-INR-{uuid.uuid4().hex[:6].upper()}",
        "user_id": "smoke-user-1",
        "user_name": "Smoke User",
        "user_email": "smoke@bottom-time.test",
        "items": [{"product_id": "p1", "product_name": "Smoke Mask", "quantity": 1, "line_total": 7500, "unit_price": 7500}],
        "item_count": 1,
        "subtotal": 6356.0,
        "gst_amount": 1144.0,
        "total": 7500.0,
        "currency": "INR",
        "amount_display": 7500.0,
        "display_currency": "INR",
        "amount_inr": 7500.0,
        "fx_rate_locked": 1.0,
        "fx_locked_at": now,
        "fx_source": "identity",
        "payment_id": rzp_pay_id,
        "payment_provider": "razorpay",
        "payment_status": "paid",
        "shipping": {"name": "Test", "address_line1": "1", "city": "Mumbai", "pincode": "400001"},
        "status": "confirmed",
        "fulfillment_status": "delivered",
        "created_at": now,
    })

    # Stripe (USD) paid txn + order
    stripe_pay_id = "pi_smoke_usd_001"
    stripe_sid = "cs_test_smoke_usd_001"
    await db.payment_transactions.insert_one({
        "id": "smoke-stripe-1",
        "session_id": stripe_sid,
        "payment_id": stripe_pay_id,
        "user_id": "smoke-user-1",
        "amount": 99.99,
        "currency": "USD",
        "cart_checkout": True,
        "payment_provider": "stripe",
        "status": "completed",
        "payment_status": "paid",
        "amount_inr": 9576.04,
        "amount_display": 99.99,
        "display_currency": "USD",
        "fx_rate_locked": 95.77,
        "fx_locked_at": now,
        "fx_source": "frankfurter.app",
        "paid_at": now,
        "created_at": now,
    })
    stripe_order_id = str(uuid.uuid4())
    await db.orders.insert_one({
        "id": stripe_order_id,
        "order_number": f"SMOKE-RFND-USD-{uuid.uuid4().hex[:6].upper()}",
        "user_id": "smoke-user-1",
        "user_name": "Smoke User",
        "user_email": "smoke@bottom-time.test",
        "items": [{"product_id": "p2", "product_name": "Smoke Fin", "quantity": 1, "line_total": 99.99}],
        "item_count": 1,
        "subtotal": 84.74,
        "gst_amount": 15.25,
        "total": 99.99,
        "currency": "USD",
        "amount_display": 99.99,
        "display_currency": "USD",
        "amount_inr": 9576.04,
        "fx_rate_locked": 95.77,
        "fx_locked_at": now,
        "fx_source": "frankfurter.app",
        "payment_id": stripe_pay_id,
        "payment_provider": "stripe",
        "payment_status": "paid",
        "shipping": {"name": "Test", "address_line1": "1", "city": "Tokyo", "pincode": "100-0001"},
        "status": "confirmed",
        "fulfillment_status": "delivered",
        "created_at": now,
    })

    print(f"INR_ORDER_ID={rzp_order_id}")
    print(f"USD_ORDER_ID={stripe_order_id}")


asyncio.run(main())
