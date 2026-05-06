from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth_utils import get_current_user

router = APIRouter()


COLL = "operator_dive_listings"


@router.get("/operator/listings")
async def get_my_listings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    listings = await db[COLL].find({"operator_id": current_user["id"]}, {"_id": 0}).to_list(100)
    return {"listings": listings}


@router.get("/operator/stats")
async def get_operator_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    uid = current_user["id"]
    total_listings = await db[COLL].count_documents({"operator_id": uid})
    active_listings = await db[COLL].count_documents({"operator_id": uid, "status": "active"})
    pending_listings = await db[COLL].count_documents({"operator_id": uid, "status": "pending"})
    total_bookings = await db.bookings.count_documents({"operator_id": uid})
    pending_bookings = await db.bookings.count_documents({"operator_id": uid, "status": "pending"})
    confirmed_bookings = await db.bookings.count_documents({"operator_id": uid, "status": "confirmed"})
    listing_ids = [doc["id"] for doc in await db[COLL].find({"operator_id": uid}, {"_id": 0, "id": 1}).to_list(100)]
    total_reviews = await db.reviews.count_documents({"listing_id": {"$in": listing_ids}}) if listing_ids else 0
    return {
        "total_listings": total_listings, "active_listings": active_listings,
        "pending_listings": pending_listings, "total_bookings": total_bookings,
        "pending_bookings": pending_bookings, "confirmed_bookings": confirmed_bookings,
        "total_reviews": total_reviews
    }


@router.get("/operator/analytics")
async def get_operator_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    uid = current_user["id"]
    bookings = await db.bookings.find({"operator_id": uid}, {"_id": 0, "created_at": 1, "status": 1, "price": 1, "listing_name": 1, "listing_id": 1, "participants": 1}).sort("created_at", -1).to_list(500)
    monthly_bookings = {}
    total_revenue = 0
    status_counts = {"pending": 0, "confirmed": 0, "rejected": 0, "cancelled": 0}
    for b in bookings:
        m = b.get("created_at", "")[:7]
        if m:
            monthly_bookings[m] = monthly_bookings.get(m, 0) + 1
        s = b.get("status", "pending")
        status_counts[s] = status_counts.get(s, 0) + 1
        if s == "confirmed" and b.get("price"):
            total_revenue += b["price"] * b.get("participants", 1)
    booking_trend = [{"month": k, "bookings": v} for k, v in sorted(monthly_bookings.items())][-12:]
    listing_booking_counts = {}
    for b in bookings:
        lid = b.get("listing_id", "")
        listing_booking_counts[lid] = listing_booking_counts.get(lid, {"name": b.get("listing_name", "Unknown"), "count": 0, "revenue": 0})
        listing_booking_counts[lid]["count"] += 1
        if b.get("status") == "confirmed" and b.get("price"):
            listing_booking_counts[lid]["revenue"] += b["price"] * b.get("participants", 1)
    popular = sorted(listing_booking_counts.values(), key=lambda x: x["count"], reverse=True)[:5]
    listing_ids = [doc["id"] for doc in await db[COLL].find({"operator_id": uid}, {"_id": 0, "id": 1}).to_list(100)]
    reviews = await db.reviews.find({"listing_id": {"$in": listing_ids}}, {"_id": 0, "rating": 1}).to_list(500) if listing_ids else []
    avg_rating = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else 0
    confirm_rate = round(status_counts["confirmed"] / len(bookings) * 100) if bookings else 0
    return {
        "total_revenue": round(total_revenue, 2),
        "total_bookings": len(bookings),
        "confirm_rate": confirm_rate,
        "avg_rating": avg_rating,
        "total_reviews": len(reviews),
        "status_counts": status_counts,
        "booking_trend": booking_trend,
        "popular_listings": popular,
    }
