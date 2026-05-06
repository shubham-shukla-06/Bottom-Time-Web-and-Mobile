"""
Dive Buddy Finder
- Smart matching based on certification, dive types, location, travel plans
- Show co-attendees on same listing/booking
- Compatibility scoring
"""
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user

router = APIRouter(prefix="/buddy-finder")

CERT_RANK = {"open_water": 1, "advanced_open_water": 2, "rescue": 3, "divemaster": 4, "instructor": 5}


def _compatibility_score(me: dict, other: dict) -> int:
    """Calculate 0-100 compatibility score between two divers."""
    score = 0
    max_score = 0

    # Certification proximity (0-25 pts)
    max_score += 25
    my_rank = CERT_RANK.get(me.get("certification_level"), 0)
    their_rank = CERT_RANK.get(other.get("certification_level"), 0)
    if my_rank and their_rank:
        diff = abs(my_rank - their_rank)
        score += max(0, 25 - diff * 8)
    elif my_rank == 0 and their_rank == 0:
        score += 15

    # Shared dive type preferences (0-30 pts)
    max_score += 30
    my_types = set(me.get("preferred_dive_types") or [])
    their_types = set(other.get("preferred_dive_types") or [])
    if my_types and their_types:
        overlap = len(my_types & their_types)
        total = len(my_types | their_types)
        score += round(30 * overlap / total) if total > 0 else 0
    elif not my_types and not their_types:
        score += 10

    # Location proximity (0-20 pts)
    max_score += 20
    my_country = (me.get("location_country") or "").lower().strip()
    their_country = (other.get("location_country") or "").lower().strip()
    my_city = (me.get("location_city") or "").lower().strip()
    their_city = (other.get("location_city") or "").lower().strip()
    if my_country and their_country:
        if my_city and their_city and my_city == their_city:
            score += 20
        elif my_country == their_country:
            score += 14
        else:
            score += 5

    # Experience level match (0-15 pts)
    max_score += 15
    my_exp = me.get("experience_level")
    their_exp = other.get("experience_level")
    if my_exp == their_exp:
        score += 15
    elif my_exp and their_exp:
        score += 7

    # Language overlap (0-10 pts)
    max_score += 10
    my_langs = set(item.lower() for item in (me.get("languages") or []))
    their_langs = set(item.lower() for item in (other.get("languages") or []))
    if my_langs and their_langs:
        if my_langs & their_langs:
            score += 10
        else:
            score += 2

    return min(100, round(score / max_score * 100)) if max_score > 0 else 50


@router.get("/matches")
async def get_buddy_matches(
    limit: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Get smart buddy matches sorted by compatibility score."""
    uid = current_user["id"]

    # Get already-connected user IDs
    conns = await db.connections.find(
        {"$or": [{"from_id": uid}, {"to_id": uid}]},
        {"_id": 0, "from_id": 1, "to_id": 1}
    ).to_list(500)
    connected = set()
    for c in conns:
        connected.add(c["from_id"])
        connected.add(c["to_id"])
    connected.discard(uid)

    # Fetch candidate divers
    candidates = await db.users.find(
        {"role": "diver", "onboarding_complete": True, "id": {"$ne": uid, "$nin": list(connected)}},
        {"_id": 0, "id": 1, "name": 1, "profile_photo": 1, "location_country": 1, "location_city": 1,
         "certification_level": 1, "experience_level": 1, "preferred_dive_types": 1,
         "languages": 1, "total_dives": 1}
    ).to_list(200)

    # Score each candidate
    scored = []
    for c in candidates:
        score = _compatibility_score(current_user, c)
        scored.append({**c, "compatibility": score})

    scored.sort(key=lambda x: x["compatibility"], reverse=True)
    return {"matches": scored[:limit]}


@router.get("/listing-buddies/{listing_id}")
async def get_listing_co_attendees(listing_id: str, current_user: dict = Depends(get_current_user)):
    """Get other divers who booked the same listing."""
    bookings = await db.bookings.find(
        {"listing_id": listing_id, "status": {"$in": ["pending", "confirmed"]}, "user_id": {"$ne": current_user["id"]}},
        {"_id": 0, "user_id": 1, "user_name": 1, "date": 1, "participants": 1}
    ).to_list(100)

    user_ids = list(set(b["user_id"] for b in bookings))
    if not user_ids:
        return {"attendees": [], "total": 0}

    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "profile_photo": 1, "location_country": 1,
         "certification_level": 1, "total_dives": 1}
    ).to_list(100)
    user_map = {u["id"]: u for u in users}

    attendees = []
    for b in bookings:
        u = user_map.get(b["user_id"])
        if u:
            attendees.append({
                **u,
                "booking_date": b.get("date"),
                "compatibility": _compatibility_score(current_user, u),
            })

    attendees.sort(key=lambda x: x["compatibility"], reverse=True)
    return {"attendees": attendees, "total": len(attendees)}


@router.get("/upcoming-buddies")
async def get_upcoming_dive_buddies(current_user: dict = Depends(get_current_user)):
    """Get divers attending the same upcoming bookings as you."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    my_bookings = await db.bookings.find(
        {"user_id": current_user["id"], "status": {"$in": ["pending", "confirmed"]}, "date": {"$gte": today}},
        {"_id": 0, "listing_id": 1, "listing_name": 1, "date": 1}
    ).to_list(50)

    if not my_bookings:
        return {"upcoming": []}

    results = []
    for booking in my_bookings:
        co_bookings = await db.bookings.find(
            {"listing_id": booking["listing_id"], "date": booking["date"],
             "status": {"$in": ["pending", "confirmed"]}, "user_id": {"$ne": current_user["id"]}},
            {"_id": 0, "user_id": 1, "user_name": 1}
        ).to_list(50)

        if co_bookings:
            uids = [b["user_id"] for b in co_bookings]
            users = await db.users.find(
                {"id": {"$in": uids}},
                {"_id": 0, "id": 1, "name": 1, "profile_photo": 1, "certification_level": 1}
            ).to_list(50)
            results.append({
                "listing_name": booking["listing_name"],
                "listing_id": booking["listing_id"],
                "date": booking["date"],
                "co_divers": users,
            })

    return {"upcoming": results}
