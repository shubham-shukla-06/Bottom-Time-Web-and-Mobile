from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional, List
from database import db
from models import ReviewCreate, TripCreate, TripItemAdd, DiveLogEntry
from auth_utils import get_current_user
from helpers import create_notification
from dive_profile_synth import generate_synthetic_profile
import uuid

router = APIRouter()


@router.post("/reviews")
async def create_review(data: ReviewCreate, current_user: dict = Depends(get_current_user)):
    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    existing = await db.reviews.find_one({"listing_id": data.listing_id, "user_id": current_user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="You already reviewed this listing")

    # Check for verified purchase (booking or order)
    has_booking = await db.bookings.find_one({"listing_id": data.listing_id, "user_id": current_user["id"], "status": "confirmed"})
    has_order = await db.orders.find_one({"user_id": current_user["id"], "items.product_id": data.listing_id, "status": "confirmed"}) if not has_booking else None

    if not has_booking and not has_order:
        raise HTTPException(status_code=403, detail="You can only review listings or products you've purchased")
    review = {
        "id": str(uuid.uuid4()),
        "listing_id": data.listing_id,
        "user_id": current_user["id"],
        "user_name": current_user["name"],
        "user_photo": current_user.get("profile_photo"),
        "user_cert": current_user.get("certification_level"),
        "verified_booking": bool(has_booking),
        "rating": data.rating,
        "comment": data.comment,
        "helpful_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.reviews.insert_one(review.copy())
    all_reviews = await db.reviews.find({"listing_id": data.listing_id}, {"_id": 0, "rating": 1}).to_list(1000)
    avg = sum(r["rating"] for r in all_reviews) / len(all_reviews)
    await db.listings.update_one({"id": data.listing_id}, {"$set": {"rating": round(avg, 1), "review_count": len(all_reviews)}})
    return review


@router.get("/reviews/{listing_id}")
async def get_reviews(listing_id: str) -> dict:
    reviews = await db.reviews.find({"listing_id": listing_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in reviews:
        dist[r["rating"]] = dist.get(r["rating"], 0) + 1
    total = len(reviews)
    avg = round(sum(r["rating"] for r in reviews) / total, 1) if total else 0
    return {"reviews": reviews, "stats": {"total": total, "average": avg, "distribution": dist}}


@router.post("/reviews/{review_id}/helpful")
async def mark_review_helpful(review_id: str, current_user: dict = Depends(get_current_user)):
    review = await db.reviews.find_one({"id": review_id})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    already = await db.review_helpful.find_one({"review_id": review_id, "user_id": current_user["id"]})
    if already:
        await db.review_helpful.delete_one({"review_id": review_id, "user_id": current_user["id"]})
        await db.reviews.update_one({"id": review_id}, {"$inc": {"helpful_count": -1}})
        return {"helpful": False}
    await db.review_helpful.insert_one({"review_id": review_id, "user_id": current_user["id"], "created_at": datetime.now(timezone.utc).isoformat()})
    await db.reviews.update_one({"id": review_id}, {"$inc": {"helpful_count": 1}})
    return {"helpful": True}


@router.post("/wishlist/{listing_id}")
async def toggle_wishlist(listing_id: str, current_user: dict = Depends(get_current_user)):
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0, "id": 1})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    existing = await db.wishlists.find_one({"user_id": current_user["id"], "listing_id": listing_id})
    if existing:
        await db.wishlists.delete_one({"user_id": current_user["id"], "listing_id": listing_id})
        return {"wishlisted": False}
    await db.wishlists.insert_one({"user_id": current_user["id"], "listing_id": listing_id, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"wishlisted": True}


@router.post("/wishlist/{listing_id}/add")
async def add_to_wishlist_idempotent(listing_id: str, current_user: dict = Depends(get_current_user)):
    """Idempotent ADD — always leaves the listing in the wishlist regardless of prior state.
    Use this for any flow that needs guaranteed-added semantics (e.g. wishlist-from-cart).
    Spam-click-safe; eliminates the toggle race in the legacy POST /wishlist/{id} endpoint."""
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0, "id": 1})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.wishlists.update_one(
        {"user_id": current_user["id"], "listing_id": listing_id},
        {"$setOnInsert": {"user_id": current_user["id"], "listing_id": listing_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"wishlisted": True}


@router.get("/wishlist")
async def get_wishlist(current_user: dict = Depends(get_current_user)):
    items = await db.wishlists.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    listing_ids = [i["listing_id"] for i in items]
    listings = []
    if listing_ids:
        listings = await db.listings.find({"id": {"$in": listing_ids}, "status": "active"}, {"_id": 0}).to_list(200)
    return {"listings": listings, "listing_ids": listing_ids}


@router.get("/wishlist/ids")
async def get_wishlist_ids(current_user: dict = Depends(get_current_user)):
    items = await db.wishlists.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(500)
    return {"listing_ids": [i.get("listing_id") for i in items if i.get("listing_id")], "product_ids": [i.get("product_id") for i in items if i.get("product_id")]}


@router.post("/wishlist/product/{product_id}")
async def toggle_product_wishlist(product_id: str, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = await db.wishlists.find_one({"user_id": current_user["id"], "product_id": product_id})
    if existing:
        await db.wishlists.delete_one({"user_id": current_user["id"], "product_id": product_id})
        return {"wishlisted": False}
    await db.wishlists.insert_one({"user_id": current_user["id"], "product_id": product_id, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"wishlisted": True}


@router.post("/wishlist/product/{product_id}/add")
async def add_product_to_wishlist_idempotent(product_id: str, current_user: dict = Depends(get_current_user)):
    """Idempotent ADD — always leaves the product in the wishlist regardless of prior state.
    Use this for any flow that needs guaranteed-added semantics (e.g. cart → wishlist).
    Spam-click-safe; eliminates the toggle race in the legacy POST /wishlist/product/{id} endpoint."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0, "id": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.wishlists.update_one(
        {"user_id": current_user["id"], "product_id": product_id},
        {"$setOnInsert": {"user_id": current_user["id"], "product_id": product_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"wishlisted": True}


@router.get("/wishlist/products")
async def get_product_wishlist(current_user: dict = Depends(get_current_user)):
    items = await db.wishlists.find({"user_id": current_user["id"], "product_id": {"$exists": True}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    product_ids = [i["product_id"] for i in items]
    products = []
    if product_ids:
        products = await db.products.find({"id": {"$in": product_ids}, "status": "active"}, {"_id": 0}).to_list(200)
    return {"products": products, "product_ids": product_ids}


@router.post("/dive-log")
async def create_dive_log(data: DiveLogEntry, current_user: dict = Depends(get_current_user)):
    entry = {"id": str(uuid.uuid4()), "user_id": current_user["id"], **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}

    # Auto-stamp a synthetic depth profile when the caller did not supply one
    # (manual web/mobile entries don't capture a profile). Dive-computer
    # imports go through `routes/dive_import.py` and arrive with `profile`
    # already populated — we never overwrite an existing profile here.
    if (not entry.get("profile")) and entry.get("max_depth") is not None and entry.get("duration") is not None:
        synth = generate_synthetic_profile(float(entry["max_depth"]), float(entry["duration"]))
        if synth:
            entry["profile"] = synth
            entry["profile_source"] = "synthetic"

    await db.dive_logs.insert_one(entry.copy())
    count = await db.dive_logs.count_documents({"user_id": current_user["id"]})
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"total_dives": count}})

    # Publish to activity feed
    try:
        from routes.social_feed import publish_feed_item
        await publish_feed_item(
            current_user["id"], current_user.get("name", ""), current_user.get("profile_photo"),
            "new_dive",
            {"dive_id": entry["id"], "site_name": data.site_name, "location": data.location,
             "max_depth": data.max_depth, "duration": data.duration, "dive_number": count}
        )
    except Exception:
        pass

    return entry


@router.get("/dive-log")
async def get_dive_logs(current_user: dict = Depends(get_current_user), search: Optional[str] = Query(None)):
    query = {"user_id": current_user["id"]}
    if search:
        query["$or"] = [{"site_name": {"$regex": search, "$options": "i"}}, {"location": {"$regex": search, "$options": "i"}}]
    logs = await db.dive_logs.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    all_logs = logs if not search else await db.dive_logs.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(500)
    total_time = sum(log.get("duration") or 0 for log in all_logs)
    depths = [log.get("max_depth") or 0 for log in all_logs if log.get("max_depth")]
    avg_depth = round(sum(depths) / len(depths), 1) if depths else 0
    max_depth = max(depths, default=0)
    temps = [log.get("water_temp") for log in all_logs if log.get("water_temp") is not None]
    durations = [log.get("duration") or 0 for log in all_logs if log.get("duration")]
    countries_set = set()
    locations_set = set()
    for lg in all_logs:
        loc = lg.get("location", "")
        if loc:
            locations_set.add(loc)
            parts = loc.split(",")
            if len(parts) > 1:
                countries_set.add(parts[-1].strip())
    # Dive type breakdown
    type_counts = {}
    for lg in all_logs:
        dt = lg.get("dive_type", "other")
        type_counts[dt] = type_counts.get(dt, 0) + 1
    # Monthly aggregation
    monthly = {}
    for lg in all_logs:
        if lg.get("date"):
            month_key = lg["date"][:7]
            if month_key not in monthly:
                monthly[month_key] = {"dives": 0, "total_depth": 0, "total_duration": 0, "temps": []}
            monthly[month_key]["dives"] += 1
            monthly[month_key]["total_depth"] += lg.get("max_depth") or 0
            monthly[month_key]["total_duration"] += lg.get("duration") or 0
            if lg.get("water_temp") is not None:
                monthly[month_key]["temps"].append(lg["water_temp"])
    monthly_stats = []
    for k in sorted(monthly.keys()):
        m = monthly[k]
        entry = {"month": k, "dives": m["dives"], "avg_depth": round(m["total_depth"] / m["dives"], 1) if m["dives"] else 0, "total_time": m["total_duration"]}
        if m["temps"]:
            entry["avg_temp"] = round(sum(m["temps"]) / len(m["temps"]), 1)
        monthly_stats.append(entry)
    # Depth distribution (buckets: 0-10, 10-20, 20-30, 30-40, 40+)
    depth_buckets = {"0-10m": 0, "10-20m": 0, "20-30m": 0, "30-40m": 0, "40m+": 0}
    for d in depths:
        if d <= 10:
            depth_buckets["0-10m"] += 1
        elif d <= 20:
            depth_buckets["10-20m"] += 1
        elif d <= 30:
            depth_buckets["20-30m"] += 1
        elif d <= 40:
            depth_buckets["30-40m"] += 1
        else:
            depth_buckets["40m+"] += 1
    # Personal records
    records = {}
    if all_logs:
        deepest = max(all_logs, key=lambda x: x.get("max_depth") or 0, default=None)
        longest = max(all_logs, key=lambda x: x.get("duration") or 0, default=None)
        temp_logs = [entry for entry in all_logs if entry.get("water_temp") is not None]
        coldest = min(temp_logs, key=lambda x: x["water_temp"], default=None) if temp_logs else None
        if deepest and deepest.get("max_depth"):
            records["deepest"] = {"value": deepest["max_depth"], "unit": "m", "site": deepest.get("site_name", ""), "date": deepest.get("date", "")}
        if longest and longest.get("duration"):
            records["longest"] = {"value": longest["duration"], "unit": "min", "site": longest.get("site_name", ""), "date": longest.get("date", "")}
        if coldest:
            records["coldest"] = {"value": coldest["water_temp"], "unit": "°C", "site": coldest.get("site_name", ""), "date": coldest.get("date", "")}
    # Buddy stats
    buddy_counts = {}
    for lg in all_logs:
        b = (lg.get("buddy") or "").strip()
        if b:
            buddy_counts[b] = buddy_counts.get(b, 0) + 1
    top_buddies = sorted(buddy_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    # Streak (calendar heatmap data: last 365 days)
    from datetime import datetime as dt_cls, timedelta
    today = dt_cls.now().date()
    dive_dates = {}
    for lg in all_logs:
        d = lg.get("date", "")[:10]
        if d:
            dive_dates[d] = dive_dates.get(d, 0) + 1
    streak_data = []
    for i in range(365):
        day = (today - timedelta(days=364 - i)).isoformat()
        streak_data.append({"date": day, "count": dive_dates.get(day, 0)})
    stats = {
        "total": len(all_logs), "max_depth": max_depth, "avg_depth": avg_depth,
        "total_time": total_time, "countries": len(countries_set),
        "unique_sites": len(locations_set),
        "avg_temp": round(sum(temps) / len(temps), 1) if temps else None,
        "min_temp": min(temps) if temps else None,
        "max_temp": max(temps) if temps else None,
        "avg_duration": round(sum(durations) / len(durations), 1) if durations else 0,
        "longest_dive": max(durations, default=0),
        "type_counts": type_counts,
        "monthly": monthly_stats,
        "depth_distribution": [{"range": k, "count": v} for k, v in depth_buckets.items()],
        "records": records,
        "top_buddies": [{"name": b, "dives": c} for b, c in top_buddies],
        "streak": streak_data,
    }
    return {"logs": logs, "stats": stats}


@router.put("/dive-log/{log_id}")
async def update_dive_log(log_id: str, data: DiveLogEntry, current_user: dict = Depends(get_current_user)):
    existing = await db.dive_logs.find_one({"id": log_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Log not found")
    await db.dive_logs.update_one({"id": log_id}, {"$set": {**data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    updated = await db.dive_logs.find_one({"id": log_id}, {"_id": 0})
    return updated


@router.delete("/dive-log/{log_id}")
async def delete_dive_log(log_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.dive_logs.delete_one({"id": log_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    count = await db.dive_logs.count_documents({"user_id": current_user["id"]})
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"total_dives": count}})
    return {"message": "Log deleted"}


@router.post("/trips")
async def create_trip(data: TripCreate, current_user: dict = Depends(get_current_user)):
    trip = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": data.name,
        "date_from": data.date_from,
        "date_to": data.date_to,
        "items": [],
        "shared_with": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trips.insert_one(trip.copy())
    return trip


@router.get("/trips")
async def get_my_trips(current_user: dict = Depends(get_current_user)):
    trips = await db.trips.find(
        {"$or": [{"user_id": current_user["id"]}, {"shared_with": current_user["id"]}]},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return {"trips": trips}


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["user_id"] != current_user["id"] and current_user["id"] not in trip.get("shared_with", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    listing_ids = [item["listing_id"] for item in trip.get("items", [])]
    listings = {}
    if listing_ids:
        for doc in await db.listings.find({"id": {"$in": listing_ids}}, {"_id": 0}).to_list(50):
            listings[doc["id"]] = doc
    enriched_items = []
    for item in trip.get("items", []):
        enriched_items.append({**item, "listing": listings.get(item["listing_id"])})
    trip["items"] = enriched_items
    return trip


@router.post("/trips/{trip_id}/items")
async def add_trip_item(trip_id: str, data: TripItemAdd, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    listing = await db.listings.find_one({"id": data.listing_id}, {"_id": 0, "id": 1, "name": 1})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    item = {"listing_id": data.listing_id, "listing_name": listing["name"], "note": data.note, "day": data.day, "added_at": datetime.now(timezone.utc).isoformat()}
    await db.trips.update_one({"id": trip_id}, {"$push": {"items": item}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Added to trip", "item": item}


@router.delete("/trips/{trip_id}/items/{listing_id}")
async def remove_trip_item(trip_id: str, listing_id: str, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.trips.update_one({"id": trip_id}, {"$pull": {"items": {"listing_id": listing_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Removed from trip"}


@router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, data: TripCreate, current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.trips.update_one({"id": trip_id}, {"$set": {"name": data.name, "date_from": data.date_from, "date_to": data.date_to, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Trip updated"}


@router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.trips.delete_one({"id": trip_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {"message": "Trip deleted"}


@router.post("/trips/{trip_id}/share")
async def share_trip(trip_id: str, buddy_ids: List[str] = Query(...), current_user: dict = Depends(get_current_user)):
    trip = await db.trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.trips.update_one({"id": trip_id}, {"$addToSet": {"shared_with": {"$each": buddy_ids}}})
    for bid in buddy_ids:
        await create_notification(bid, "trip_shared", "Trip Shared With You", f"{current_user['name']} shared a trip plan: {trip['name']}", {"trip_id": trip_id})
    return {"message": f"Shared with {len(buddy_ids)} buddy(ies)"}


@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user), limit: int = Query(30, le=100)):
    notifs = await db.notifications.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": current_user["id"], "read": False})
    return {"notifications": notifs, "unread_count": unread}


@router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": current_user["id"]}, {"$set": {"read": True}})
    return {"message": "Marked as read"}


@router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": current_user["id"], "read": False}, {"$set": {"read": True}})
    return {"message": "All marked as read"}


@router.delete("/notifications/{notif_id}")
async def delete_notification(notif_id: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.delete_one({"id": notif_id, "user_id": current_user["id"]})
    return {"message": "Deleted"}
