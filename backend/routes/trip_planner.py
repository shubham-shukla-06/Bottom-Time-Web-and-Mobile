"""
Group Trip Planner
- Create trips with destination, dates, group size
- Invite buddies, RSVP
- Add listings, vote on favorites
- Group booking
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from helpers import create_notification
import uuid

router = APIRouter(prefix="/trips")


@router.get("")
async def get_my_trips(current_user: dict = Depends(get_current_user)):
    """Get all trips the user is part of (created or invited)."""
    uid = current_user["id"]
    trips = await db.trips.find(
        {"$or": [{"creator_id": uid}, {"members.user_id": uid}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"trips": trips}


@router.post("")
async def create_trip(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new group trip."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Trip name is required")

    trip = {
        "id": str(uuid.uuid4()),
        "name": name,
        "destination": data.get("destination", ""),
        "country": data.get("country", ""),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "max_members": int(data.get("max_members", 8)),
        "description": data.get("description", ""),
        "status": "planning",
        "creator_id": current_user["id"],
        "creator_name": current_user.get("name", ""),
        "members": [{
            "user_id": current_user["id"],
            "name": current_user.get("name", ""),
            "profile_photo": current_user.get("profile_photo"),
            "role": "organizer",
            "status": "confirmed",
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }],
        "listings": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trips.insert_one(trip.copy())
    return trip


@router.get("/{trip_id}")
async def get_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    """Get trip details."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    member_ids = [m["user_id"] for m in trip.get("members", [])]
    if current_user["id"] not in member_ids and current_user["id"] != trip["creator_id"]:
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip


@router.put("/{trip_id}")
async def update_trip(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update trip details (organizer only)."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the organizer can edit")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["name", "destination", "country", "start_date", "end_date", "max_members", "description", "status"]:
        if field in data:
            updates[field] = data[field]

    await db.trips.update_one({"id": trip_id}, {"$set": updates})
    return {**trip, **updates}


@router.post("/{trip_id}/invite")
async def invite_to_trip(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Invite a buddy to the trip."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    member_ids = [m["user_id"] for m in trip.get("members", [])]
    if current_user["id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member")

    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    if user_id in member_ids:
        raise HTTPException(status_code=400, detail="Already a member")
    if len(member_ids) >= trip.get("max_members", 8):
        raise HTTPException(status_code=400, detail="Trip is full")

    invitee = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "profile_photo": 1})
    if not invitee:
        raise HTTPException(status_code=404, detail="User not found")

    new_member = {
        "user_id": user_id,
        "name": invitee.get("name", ""),
        "profile_photo": invitee.get("profile_photo"),
        "role": "member",
        "status": "invited",
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trips.update_one({"id": trip_id}, {"$push": {"members": new_member}})
    await create_notification(user_id, "trip_shared", "Trip Invitation",
        f"{current_user['name']} invited you to '{trip['name']}'",
        {"trip_id": trip_id, "trip_name": trip["name"]})
    return {"invited": True, "member": new_member}


@router.put("/{trip_id}/rsvp")
async def rsvp_trip(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Accept or decline a trip invitation."""
    action = data.get("action")
    if action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action must be 'accept' or 'decline'")

    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    members = trip.get("members", [])
    found = False
    for m in members:
        if m["user_id"] == current_user["id"]:
            m["status"] = "confirmed" if action == "accept" else "declined"
            found = True
            break

    if not found:
        raise HTTPException(status_code=403, detail="Not invited to this trip")

    await db.trips.update_one({"id": trip_id}, {"$set": {"members": members}})
    return {"status": "confirmed" if action == "accept" else "declined"}


@router.post("/{trip_id}/listings")
async def add_listing_to_trip(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Add a listing suggestion to the trip."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    member_ids = [m["user_id"] for m in trip.get("members", [])]
    if current_user["id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member")

    listing_id = data.get("listing_id")
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    existing_ids = [item["listing_id"] for item in trip.get("listings", [])]
    if listing_id in existing_ids:
        raise HTTPException(status_code=400, detail="Listing already added")

    photos = listing.get("photos") or []
    image_url = listing.get("image_url") or (photos[0].get("url") if photos and isinstance(photos[0], dict) else None)
    trip_listing = {
        "listing_id": listing_id,
        "name": listing.get("name") or listing.get("title"),
        "image_url": image_url,
        "location": listing.get("location"),
        "price": listing.get("price"),
        "currency": listing.get("currency", "USD"),
        "type": listing.get("type") or listing.get("listing_type"),
        "added_by": current_user["id"],
        "added_by_name": current_user.get("name", ""),
        "votes": [current_user["id"]],
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trips.update_one({"id": trip_id}, {"$push": {"listings": trip_listing}})
    return {"added": True, "listing": trip_listing}


@router.post("/{trip_id}/listings/{listing_id}/vote")
async def vote_listing(trip_id: str, listing_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle vote on a listing suggestion."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    member_ids = [m["user_id"] for m in trip.get("members", [])]
    if current_user["id"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member")

    listings = trip.get("listings", [])
    for item in listings:
        if item["listing_id"] == listing_id:
            if current_user["id"] in item["votes"]:
                item["votes"].remove(current_user["id"])
                voted = False
            else:
                item["votes"].append(current_user["id"])
                voted = True
            await db.trips.update_one({"id": trip_id}, {"$set": {"listings": listings}})
            return {"voted": voted, "vote_count": len(item["votes"])}

    raise HTTPException(status_code=404, detail="Listing not in trip")


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a trip (organizer only)."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the organizer can delete")
    await db.trips.delete_one({"id": trip_id})
    return {"deleted": True}
