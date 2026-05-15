from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional
from database import db
from auth_utils import get_current_user
from helpers import create_notification
import uuid

router = APIRouter()


@router.post("/orders/create")
async def create_order(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Create order from cart after payment is verified"""
    payment_id = request_data.get("payment_id")
    shipping = request_data.get("shipping", {})

    if not shipping.get("name") or not shipping.get("address_line1") or not shipping.get("city") or not shipping.get("pincode"):
        raise HTTPException(status_code=400, detail="Shipping address is incomplete")

    cart = await db.carts.find_one({"user_id": current_user["id"]})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")

    order_items = []
    total = 0
    for item in cart["items"]:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not product:
            continue
        # ── Phase 4-P1: prefer canonical price_inr; fall back to legacy price ──
        # The user-facing display values arrive via request_data (already in
        # display currency). The line_total persisted here is the AUTHORITATIVE
        # transaction value tied to the locked FX. We re-derive in display
        # currency too for invoice rendering.
        unit_display = product.get("price")
        line_total = float(unit_display) * item["quantity"]
        order_items.append({
            "product_id": item["product_id"],
            "product_name": product["name"],
            "product_image": product.get("image_url", ""),
            "quantity": item["quantity"],
            "size": item.get("size"),
            "unit_price": product["price"],
            "unit_price_inr": product.get("price_inr"),
            "line_total": round(line_total, 2),
            "category": product.get("category", ""),
        })
        total += line_total
        # Deduct stock
        await db.products.update_one(
            {"id": item["product_id"]},
            {
                "$inc": {"sold_count": item["quantity"], "stock": -item["quantity"]},
            }
        )
        # Mark out of stock if needed
        updated = await db.products.find_one({"id": item["product_id"]}, {"_id": 0, "stock": 1})
        if updated and updated.get("stock") is not None and updated["stock"] <= 0:
            await db.products.update_one({"id": item["product_id"]}, {"$set": {"in_stock": False}})

    # ── Phase 4-P1: pull canonical INR + locked-FX from the verified payment ──
    # `payment_transactions` row was written by /payments/create-order with
    # amount_inr + fx_rate_locked + fx_locked_at + fx_source. Copy across so
    # the order is the single audit-traceable record going forward.
    txn = None
    if payment_id:
        txn = await db.payment_transactions.find_one({"payment_id": payment_id}, {"_id": 0})
        if not txn:
            # Some upstream paths set order_id not payment_id; try that
            txn = await db.payment_transactions.find_one({"order_id": payment_id}, {"_id": 0})
    txn = txn or {}
    display_currency = (request_data.get("currency") or txn.get("currency") or "INR").upper()
    amount_display = request_data.get("amount_display")
    if amount_display is None:
        amount_display = txn.get("amount") if txn.get("amount") is not None else round(total + (request_data.get("gst_amount") or 0), 2)
    fx_rate_locked = txn.get("fx_rate_locked") or (1.0 if display_currency == "INR" else None)
    amount_inr = txn.get("amount_inr") or (round(float(amount_display), 2) if display_currency == "INR" else None)
    fx_locked_at = txn.get("fx_locked_at") or datetime.now(timezone.utc).isoformat()
    fx_source = txn.get("fx_source") or ("identity" if display_currency == "INR" else "backfill_at_order_create")

    order = {
        "id": str(uuid.uuid4()),
        "order_number": f"BT-{datetime.now(timezone.utc).strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_email": current_user["email"],
        "items": order_items,
        "item_count": sum(i["quantity"] for i in order_items),
        "subtotal": round(total, 2),
        "gst_amount": request_data.get("gst_amount", 0),
        "total": round(total + request_data.get("gst_amount", 0), 2),
        "currency": display_currency,
        # ── Phase 4-P1: canonical INR + display-currency duality + locked FX ──
        "amount_display": round(float(amount_display), 2),
        "display_currency": display_currency,
        "amount_inr": amount_inr,
        "fx_rate_locked": fx_rate_locked,
        "fx_locked_at": fx_locked_at,
        "fx_source": fx_source,
        "payment_id": payment_id,
        "payment_status": "paid",
        "shipping": {
            "name": shipping["name"],
            "phone": shipping.get("phone", ""),
            "address_line1": shipping["address_line1"],
            "address_line2": shipping.get("address_line2", ""),
            "city": shipping["city"],
            "state": shipping.get("state", ""),
            "pincode": shipping["pincode"],
            "country": shipping.get("country", "India"),
        },
        "status": "confirmed",
        "fulfillment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order.copy())
    await db.carts.delete_one({"user_id": current_user["id"]})

    # Save shipping as user's default
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"shipping_address": order["shipping"]}}
    )

    return order


@router.get("/orders")
async def get_my_orders(current_user: dict = Depends(get_current_user)):
    orders = await db.orders.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"orders": orders}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return order


@router.get("/orders/admin/all")
async def get_all_orders(
    status: Optional[str] = Query(None),
    fulfillment: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    query = {}
    if status:
        query["status"] = status
    if fulfillment:
        query["fulfillment_status"] = fulfillment
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    summary = {
        "total": len(orders),
        "pending_fulfillment": len([o for o in orders if o.get("fulfillment_status") == "pending"]),
        "shipped": len([o for o in orders if o.get("fulfillment_status") == "shipped"]),
        "delivered": len([o for o in orders if o.get("fulfillment_status") == "delivered"]),
        "total_revenue": round(sum(o.get("total", 0) for o in orders), 2),
    }
    return {"orders": orders, "summary": summary}


@router.put("/orders/{order_id}/fulfillment")
async def update_order_fulfillment(order_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = request_data.get("fulfillment_status")
    if new_status not in ("processing", "shipped", "delivered", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid fulfillment status")

    update = {
        "fulfillment_status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if request_data.get("tracking_number"):
        update["tracking_number"] = request_data["tracking_number"]
    if request_data.get("tracking_url"):
        update["tracking_url"] = request_data["tracking_url"]

    await db.orders.update_one({"id": order_id}, {"$set": update})

    status_labels = {"processing": "being prepared", "shipped": "shipped", "delivered": "delivered", "cancelled": "cancelled"}
    await create_notification(
        order["user_id"], "order_update", f"Order {status_labels.get(new_status, new_status).title()}",
        f"Your order {order['order_number']} is {status_labels.get(new_status, new_status)}",
        {"order_id": order_id, "status": new_status}
    )

    return {"message": f"Order updated to {new_status}"}


@router.get("/products/{product_id}")
async def get_product_detail(product_id: str) -> dict:
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/user/shipping-address")
async def get_shipping_address(current_user: dict = Depends(get_current_user)):
    return {"shipping_address": current_user.get("shipping_address", {})}


# --- Address Book ---

@router.get("/user/addresses")
async def get_addresses(current_user: dict = Depends(get_current_user)):
    addresses = await db.addresses.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    default_id = current_user.get("default_address_id")
    return {"addresses": addresses, "default_id": default_id}


@router.post("/user/addresses")
async def create_address(data: dict, current_user: dict = Depends(get_current_user)):
    required = ["name", "phone", "address_line1", "city", "pincode", "country"]
    for f in required:
        if not data.get(f):
            raise HTTPException(status_code=400, detail=f"Missing {f}")
    addr = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": data["name"],
        "phone": data["phone"],
        "country_code": data.get("country_code", "+91"),
        "address_line1": data["address_line1"],
        "address_line2": data.get("address_line2", ""),
        "landmark": data.get("landmark", ""),
        "city": data["city"],
        "state": data.get("state", ""),
        "pincode": data["pincode"],
        "country": data["country"],
        "label": data.get("label", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.addresses.insert_one(addr.copy())
    # If first address, set as default
    count = await db.addresses.count_documents({"user_id": current_user["id"]})
    if count == 1 or data.get("is_default"):
        await db.users.update_one({"id": current_user["id"]}, {"$set": {"default_address_id": addr["id"]}})
    return addr


@router.put("/user/addresses/{address_id}")
async def update_address(address_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    existing = await db.addresses.find_one({"id": address_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")
    allowed = ["name", "phone", "country_code", "address_line1", "address_line2", "landmark", "city", "state", "pincode", "country", "label"]
    update = {k: data[k] for k in allowed if k in data}
    await db.addresses.update_one({"id": address_id}, {"$set": update})
    if data.get("is_default"):
        await db.users.update_one({"id": current_user["id"]}, {"$set": {"default_address_id": address_id}})
    return await db.addresses.find_one({"id": address_id}, {"_id": 0})


@router.delete("/user/addresses/{address_id}")
async def delete_address(address_id: str, current_user: dict = Depends(get_current_user)):
    await db.addresses.delete_one({"id": address_id, "user_id": current_user["id"]})
    user = await db.users.find_one({"id": current_user["id"]})
    if user.get("default_address_id") == address_id:
        await db.users.update_one({"id": current_user["id"]}, {"$unset": {"default_address_id": ""}})
    return {"message": "Deleted"}


@router.put("/user/addresses/{address_id}/default")
async def set_default_address(address_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.addresses.find_one({"id": address_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"default_address_id": address_id}})
    return {"message": "Default set"}


@router.get("/delivery-estimate")
async def get_delivery_estimate(pincode: str = Query(...), country: str = Query("India")):
    """Smart delivery estimate based on destination."""
    country_lower = country.lower()
    if country_lower == "india":
        # Metro cities by first 1-2 digits of pincode
        metro_prefixes = ["11", "40", "50", "56", "60", "70", "38"]  # Delhi, Mumbai, Hyderabad, Bangalore, Chennai, Kolkata, Ahmedabad
        prefix = pincode[:2] if len(pincode) >= 2 else ""
        if prefix in metro_prefixes:
            return {"estimate": "2-4 business days", "type": "domestic_metro"}
        return {"estimate": "4-7 business days", "type": "domestic"}
    # Nearby countries
    nearby = ["nepal", "sri lanka", "bangladesh", "bhutan", "maldives", "myanmar"]
    if country_lower in nearby:
        return {"estimate": "7-10 business days", "type": "regional"}
    # Asia-Pacific
    apac = ["singapore", "thailand", "malaysia", "indonesia", "philippines", "japan", "australia", "new zealand"]
    if country_lower in apac:
        return {"estimate": "7-12 business days", "type": "apac"}
    # Europe/Americas
    return {"estimate": "10-18 business days", "type": "international"}
