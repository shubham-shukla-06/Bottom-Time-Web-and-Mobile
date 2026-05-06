from fastapi import APIRouter, HTTPException, Depends, Query
from starlette.requests import Request as StarletteRequest
from datetime import datetime, timezone
from typing import Optional
from database import db
from models import BookingRequest
from auth_utils import get_current_user
from helpers import create_notification
import os
import uuid

router = APIRouter()
webhook_router = APIRouter()


@router.post("/bookings")
async def create_booking(data: BookingRequest, current_user: dict = Depends(get_current_user)):
    listing = await db.operator_dive_listings.find_one({"id": data.listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing_name = listing.get("title") or listing.get("name") or "Untitled"
    listing_type = listing.get("listing_type") or listing.get("type") or "day_dive"
    booking = {
        "id": str(uuid.uuid4()),
        "listing_id": data.listing_id,
        "listing_name": listing_name,
        "listing_type": listing_type,
        "operator_id": listing.get("operator_id"),
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_email": current_user["email"],
        "date": data.date,
        "participants": data.participants,
        "notes": data.notes,
        "status": "pending",
        "price": listing.get("price"),
        "utm_source": (data.utm_source or "")[:40],
        "utm_medium": (data.utm_medium or "")[:40],
        "utm_campaign": (data.utm_campaign or "")[:40],
        "utm_content": (data.utm_content or "")[:40],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bookings.insert_one(booking.copy())
    if listing.get("operator_id"):
        await create_notification(listing["operator_id"], "booking_new", "New Booking Request", f"{current_user['name']} wants to book {listing_name}", {"booking_id": booking["id"], "listing_name": listing_name})
    return booking


@router.get("/bookings")
async def get_my_bookings(current_user: dict = Depends(get_current_user)):
    bookings = await db.bookings.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": bookings}


@router.get("/bookings/operator")
async def get_operator_bookings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    bookings = await db.bookings.find({"operator_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": bookings}


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, status: str = Query(...), current_user: dict = Depends(get_current_user)):
    if status not in ("confirmed", "rejected", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["operator_id"] != current_user["id"] and booking["user_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": status}})

    # Auto-block date if confirmed (check capacity)
    if status == "confirmed" and booking.get("date") and booking.get("listing_id"):
        confirmed_on_date = await db.bookings.count_documents({
            "listing_id": booking["listing_id"], "date": booking["date"], "status": "confirmed"
        })
        listing = await db.listings.find_one({"id": booking["listing_id"]}, {"_id": 0, "max_group_size": 1})
        max_cap = listing.get("max_group_size", 10) if listing else 10
        if confirmed_on_date >= max_cap:
            await db.listing_availability.update_one(
                {"listing_id": booking["listing_id"]},
                {"$pull": {"available_dates": booking["date"]}},
            )

    status_label = "confirmed" if status == "confirmed" else "declined"
    await create_notification(booking["user_id"], "booking_update", f"Booking {status_label.title()}", f"Your booking for {booking['listing_name']} was {status_label}", {"booking_id": booking_id, "status": status})
    return {"message": f"Booking {status}"}


@router.get("/cart")
async def get_cart(current_user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not cart:
        return {"items": [], "total": 0}
    enriched = []
    total = 0
    product_ids = [item["product_id"] for item in cart.get("items", [])]
    products_cursor = db.products.find({"id": {"$in": product_ids}}, {"_id": 0})
    products_map = {p["id"]: p async for p in products_cursor}
    for item in cart.get("items", []):
        product = products_map.get(item["product_id"])
        if product:
            enriched.append({**item, "product": product})
            total += product["price"] * item["quantity"]
    return {"items": enriched, "total": round(total, 2)}


@router.post("/cart/add")
async def add_to_cart(product_id: str = Query(...), quantity: int = Query(1), size: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    cart = await db.carts.find_one({"user_id": current_user["id"]})
    already_in_cart = cart and any(i["product_id"] == product_id and i.get("size") == size for i in cart.get("items", []))
    if not product.get("in_stock", True) and not already_in_cart:
        raise HTTPException(status_code=400, detail="Product is out of stock")
    if not cart:
        await db.carts.insert_one({"user_id": current_user["id"], "items": [{"product_id": product_id, "quantity": quantity, "size": size}]})
    else:
        existing = next((i for i in cart["items"] if i["product_id"] == product_id and i.get("size") == size), None)
        if existing:
            await db.carts.update_one({"user_id": current_user["id"], "items": {"$elemMatch": {"product_id": product_id, "size": size}}}, {"$inc": {"items.$.quantity": quantity}})
        else:
            await db.carts.update_one({"user_id": current_user["id"]}, {"$push": {"items": {"product_id": product_id, "quantity": quantity, "size": size}}})
    return {"message": "Added to cart"}


@router.put("/cart/update")
async def update_cart_item(product_id: str = Query(...), quantity: int = Query(...), size: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    if quantity <= 0:
        await db.carts.update_one({"user_id": current_user["id"]}, {"$pull": {"items": {"product_id": product_id, "size": size}}})
        return {"message": "Removed from cart"}
    cart = await db.carts.find_one({"user_id": current_user["id"]})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    existing = next((i for i in cart["items"] if i["product_id"] == product_id and i.get("size") == size), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Item not in cart")
    await db.carts.update_one(
        {"user_id": current_user["id"], "items": {"$elemMatch": {"product_id": product_id, "size": size}}},
        {"$set": {"items.$.quantity": quantity}}
    )
    return {"message": "Cart updated"}


@router.delete("/cart/{product_id}")
async def remove_from_cart(product_id: str, current_user: dict = Depends(get_current_user)):
    await db.carts.update_one({"user_id": current_user["id"]}, {"$pull": {"items": {"product_id": product_id}}})
    return {"message": "Removed from cart"}


@router.post("/cart/save-for-later")
async def save_for_later(product_id: str = Query(...), size: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    # Remove from cart
    await db.carts.update_one({"user_id": current_user["id"]}, {"$pull": {"items": {"product_id": product_id}}})
    # Add to saved_for_later (upsert)
    existing = await db.saved_for_later.find_one({"user_id": current_user["id"], "product_id": product_id})
    if not existing:
        await db.saved_for_later.insert_one({"user_id": current_user["id"], "product_id": product_id, "size": size, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"message": "Saved for later"}


@router.post("/cart/move-to-cart")
async def move_to_cart(product_id: str = Query(...), current_user: dict = Depends(get_current_user)):
    saved = await db.saved_for_later.find_one({"user_id": current_user["id"], "product_id": product_id})
    if not saved:
        raise HTTPException(status_code=404, detail="Item not in saved list")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if product and not product.get("in_stock", True):
        raise HTTPException(status_code=400, detail="Product is out of stock")
    # Add to cart
    cart = await db.carts.find_one({"user_id": current_user["id"]})
    size = saved.get("size")
    if not cart:
        await db.carts.insert_one({"user_id": current_user["id"], "items": [{"product_id": product_id, "quantity": 1, "size": size}]})
    else:
        existing = next((i for i in cart["items"] if i["product_id"] == product_id and i.get("size") == size), None)
        if existing:
            await db.carts.update_one({"user_id": current_user["id"], "items.product_id": product_id, "items.size": size}, {"$inc": {"items.$.quantity": 1}})
        else:
            await db.carts.update_one({"user_id": current_user["id"]}, {"$push": {"items": {"product_id": product_id, "quantity": 1, "size": size}}})
    # Remove from saved
    await db.saved_for_later.delete_one({"user_id": current_user["id"], "product_id": product_id})
    return {"message": "Moved to cart"}


@router.get("/cart/saved-for-later")
async def get_saved_for_later(current_user: dict = Depends(get_current_user)):
    items = await db.saved_for_later.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    enriched = []
    for item in items:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if product:
            enriched.append({**item, "product": product})
    return {"items": enriched}


@router.delete("/cart/saved-for-later/{product_id}")
async def remove_saved_for_later(product_id: str, current_user: dict = Depends(get_current_user)):
    await db.saved_for_later.delete_one({"user_id": current_user["id"], "product_id": product_id})
    return {"message": "Removed"}


@router.post("/checkout/create-session")
async def create_checkout_session(request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    body = await request.json()
    origin_url = body.get("origin_url", "")
    cart = await db.carts.find_one({"user_id": current_user["id"]})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")
    total = 0.0
    product_ids = [item["product_id"] for item in cart["items"]]
    products_cursor = db.products.find({"id": {"$in": product_ids}}, {"_id": 0})
    products_map = {p["id"]: p async for p in products_cursor}
    for item in cart["items"]:
        product = products_map.get(item["product_id"])
        if product:
            total += product["price"] * item["quantity"]
    if total <= 0:
        raise HTTPException(status_code=400, detail="Invalid cart total")
    stripe_key = os.environ.get("STRIPE_API_KEY")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    success_url = f"{origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/shop"
    checkout_req = CheckoutSessionRequest(amount=round(total, 2), currency="usd", success_url=success_url, cancel_url=cancel_url, metadata={"user_id": current_user["id"], "user_email": current_user["email"]})
    session = await stripe_checkout.create_checkout_session(checkout_req)
    await db.payment_transactions.insert_one({"session_id": session.session_id, "user_id": current_user["id"], "amount": round(total, 2), "currency": "usd", "status": "initiated", "payment_status": "pending", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"url": session.url, "session_id": session.session_id}


@router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, request: StarletteRequest, current_user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    stripe_key = os.environ.get("STRIPE_API_KEY")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    status = await stripe_checkout.get_checkout_status(session_id)
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if txn and txn.get("payment_status") != status.payment_status:
        await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"status": status.status, "payment_status": status.payment_status}})
        if status.payment_status == "paid" and txn.get("payment_status") != "paid":
            await db.carts.delete_one({"user_id": current_user["id"]})
    return {"status": status.status, "payment_status": status.payment_status, "amount_total": status.amount_total, "currency": status.currency}


@webhook_router.post("/api/webhook/stripe")
async def stripe_webhook(request: StarletteRequest) -> dict:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    stripe_key = os.environ.get("STRIPE_API_KEY")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        webhook_resp = await stripe_checkout.handle_webhook(body, sig)
        if webhook_resp.payment_status == "paid":
            await db.payment_transactions.update_one({"session_id": webhook_resp.session_id}, {"$set": {"status": "complete", "payment_status": "paid"}})
        return {"received": True}
    except Exception as e:
        return {"received": True, "error": str(e)}
