"""
Admin Fulfillment Panel - Shiprocket Order Management
Handles: order view, Shiprocket order creation, label printing, pickup scheduling, tracking
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional
from database import db
from auth_utils import get_current_user
from shipping_helpers import get_shiprocket_token, SHIPROCKET_BASE_URL, SHIPROCKET_MOCK
import httpx
import uuid

router = APIRouter(prefix="/fulfillment")


def _admin_only(user) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/orders")
async def get_fulfillment_orders(
    status: Optional[str] = Query(None),
    fulfillment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    _admin_only(current_user)
    query = {}
    if status:
        query["status"] = status
    if fulfillment:
        query["fulfillment_status"] = fulfillment

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    if search:
        s = search.lower()
        orders = [o for o in orders if s in o.get("order_number", "").lower()
                  or s in o.get("user_name", "").lower()
                  or s in o.get("user_email", "").lower()]

    summary = {
        "total": len(orders),
        "pending": len([o for o in orders if o.get("fulfillment_status") == "pending"]),
        "processing": len([o for o in orders if o.get("fulfillment_status") == "processing"]),
        "shipped": len([o for o in orders if o.get("fulfillment_status") == "shipped"]),
        "delivered": len([o for o in orders if o.get("fulfillment_status") == "delivered"]),
        "cancelled": len([o for o in orders if o.get("fulfillment_status") == "cancelled"]),
        "total_revenue": round(sum(o.get("total", 0) for o in orders), 2),
    }
    return {"orders": orders, "summary": summary}


@router.post("/orders/{order_id}/create-shipment")
async def create_shiprocket_shipment(order_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """Create a Shiprocket shipment for an order."""
    _admin_only(current_user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if SHIPROCKET_MOCK:
        shipment_id = f"MOCK-{uuid.uuid4().hex[:8].upper()}"
        sr_order_id = f"MOCK-SR-{uuid.uuid4().hex[:6].upper()}"
        await db.orders.update_one({"id": order_id}, {"$set": {
            "shiprocket_order_id": sr_order_id,
            "shiprocket_shipment_id": shipment_id,
            "fulfillment_status": "processing",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {"shipment_id": shipment_id, "order_id": sr_order_id, "mock": True}

    token = await get_shiprocket_token()
    shipping = order.get("shipping", {})
    items = order.get("items", [])

    sr_items = []
    for item in items:
        sr_items.append({
            "name": item["product_name"],
            "sku": item["product_id"][:12],
            "units": item["quantity"],
            "selling_price": str(item["unit_price"]),
            "discount": "0",
            "tax": "0",
            "hsn": "",
        })

    payload = {
        "order_id": order["order_number"],
        "order_date": order.get("created_at", datetime.now(timezone.utc).isoformat()),
        "pickup_location": "Primary",
        "billing_customer_name": shipping.get("name", "Customer"),
        "billing_last_name": "",
        "billing_address": shipping.get("address_line1", ""),
        "billing_address_2": shipping.get("address_line2", ""),
        "billing_city": shipping.get("city", ""),
        "billing_pincode": shipping.get("pincode", ""),
        "billing_state": shipping.get("state", ""),
        "billing_country": shipping.get("country", "India"),
        "billing_email": order.get("user_email", ""),
        "billing_phone": shipping.get("phone", "9999999999"),
        "shipping_is_billing": True,
        "order_items": sr_items,
        "payment_method": "Prepaid",
        "sub_total": order.get("subtotal", 0),
        "length": request_data.get("length", 20),
        "breadth": request_data.get("breadth", 15),
        "height": request_data.get("height", 10),
        "weight": request_data.get("weight", 0.5),
    }

    if request_data.get("courier_id"):
        payload["courier_id"] = request_data["courier_id"]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SHIPROCKET_BASE_URL}/orders/create/adhoc",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Shiprocket error: {resp.text}")

    data = resp.json()
    await db.orders.update_one({"id": order_id}, {"$set": {
        "shiprocket_order_id": str(data.get("order_id", "")),
        "shiprocket_shipment_id": str(data.get("shipment_id", "")),
        "fulfillment_status": "processing",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})

    return {
        "order_id": data.get("order_id"),
        "shipment_id": data.get("shipment_id"),
        "status": data.get("status"),
    }


@router.post("/orders/{order_id}/generate-label")
async def generate_label(order_id: str, current_user: dict = Depends(get_current_user)):
    """Generate shipping label for a Shiprocket shipment."""
    _admin_only(current_user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        raise HTTPException(status_code=400, detail="No shipment created yet")

    if SHIPROCKET_MOCK or shipment_id.startswith("MOCK"):
        label_url = f"https://mock-label.shiprocket.in/{shipment_id}.pdf"
        await db.orders.update_one({"id": order_id}, {"$set": {"label_url": label_url}})
        return {"label_url": label_url, "mock": True}

    token = await get_shiprocket_token()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SHIPROCKET_BASE_URL}/courier/generate/label",
            json={"shipment_id": [int(shipment_id)]},
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Label error: {resp.text}")

    data = resp.json()
    label_url = data.get("label_url", "")
    await db.orders.update_one({"id": order_id}, {"$set": {"label_url": label_url}})
    return {"label_url": label_url}


@router.post("/orders/{order_id}/schedule-pickup")
async def schedule_pickup(order_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """Schedule a pickup with Shiprocket."""
    _admin_only(current_user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        raise HTTPException(status_code=400, detail="No shipment created yet")

    if SHIPROCKET_MOCK or shipment_id.startswith("MOCK"):
        pickup_token = f"MOCK-PICKUP-{uuid.uuid4().hex[:6].upper()}"
        await db.orders.update_one({"id": order_id}, {"$set": {
            "pickup_scheduled": True,
            "pickup_token": pickup_token,
            "pickup_date": request_data.get("pickup_date", datetime.now(timezone.utc).isoformat()),
            "fulfillment_status": "processing",
        }})
        return {"pickup_token": pickup_token, "mock": True}

    token = await get_shiprocket_token()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SHIPROCKET_BASE_URL}/courier/generate/pickup",
            json={
                "shipment_id": [int(shipment_id)],
                "pickup_date": request_data.get("pickup_date", []),
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Pickup error: {resp.text}")

    data = resp.json()
    await db.orders.update_one({"id": order_id}, {"$set": {
        "pickup_scheduled": True,
        "pickup_token": data.get("pickup_token_number", ""),
        "fulfillment_status": "processing",
    }})
    return {"pickup_token": data.get("pickup_token_number"), "response": data}


@router.get("/orders/{order_id}/tracking")
async def get_shipment_tracking(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get tracking info for a shipment."""
    _admin_only(current_user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        return {"tracking": None, "message": "No shipment created"}

    if SHIPROCKET_MOCK or shipment_id.startswith("MOCK"):
        return {
            "tracking": {
                "shipment_id": shipment_id,
                "current_status": order.get("fulfillment_status", "processing"),
                "activities": [
                    {"date": order.get("created_at"), "activity": "Order placed", "location": "Origin"},
                    {"date": order.get("updated_at"), "activity": "Shipment created", "location": "Warehouse"},
                ],
            },
            "mock": True,
        }

    token = await get_shiprocket_token()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{SHIPROCKET_BASE_URL}/courier/track/shipment/{shipment_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        return {"tracking": None, "message": "Tracking not available"}

    return {"tracking": resp.json()}


@router.put("/orders/{order_id}/status")
async def update_fulfillment_status(order_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """Manually update fulfillment status."""
    _admin_only(current_user)
    new_status = request_data.get("fulfillment_status")
    valid = ("pending", "processing", "shipped", "delivered", "cancelled", "returned")
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    update = {
        "fulfillment_status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if request_data.get("tracking_number"):
        update["tracking_number"] = request_data["tracking_number"]
    if request_data.get("tracking_url"):
        update["tracking_url"] = request_data["tracking_url"]
    if request_data.get("notes"):
        update["fulfillment_notes"] = request_data["notes"]

    result = await db.orders.update_one({"id": order_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": f"Status updated to {new_status}"}
