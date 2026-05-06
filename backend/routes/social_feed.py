"""
Social Feed + Marine Life Sightings + Bucket List + Dive Photos
The "Instagram for Divers" social layer.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from helpers import create_notification
from config import UPLOAD_DIR
import uuid

router = APIRouter()

# ═══════════════════════════════════════════
# ACTIVITY FEED
# ═══════════════════════════════════════════

@router.get("/feed")
async def get_activity_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Activity feed from connections — new dives, badges, trips, likes."""
    uid = current_user["id"]

    # Get connected user IDs
    conns = await db.connections.find(
        {"$or": [{"from_id": uid}, {"to_id": uid}], "status": "accepted"},
        {"_id": 0, "from_id": 1, "to_id": 1}
    ).to_list(500)
    friend_ids = set()
    for c in conns:
        friend_ids.add(c["from_id"])
        friend_ids.add(c["to_id"])
    friend_ids.discard(uid)
    friend_ids.add(uid)  # Include own activity

    # Fetch recent feed items
    items = await db.feed_items.find(
        {"user_id": {"$in": list(friend_ids)}},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    # Check what viewer has liked
    item_ids = [i["id"] for i in items]
    viewer_reactions = await db.feed_reactions.find(
        {"user_id": uid, "item_id": {"$in": item_ids}},
        {"_id": 0, "item_id": 1, "reaction": 1}
    ).to_list(500)
    reaction_map = {r["item_id"]: r["reaction"] for r in viewer_reactions}

    for item in items:
        item["viewer_reaction"] = reaction_map.get(item["id"])

    return {"items": items, "has_more": len(items) == limit}


@router.post("/feed/{item_id}/react")
async def react_to_feed_item(item_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """React to a feed item (stoke, epic, jealous, heart, fire)."""
    reaction = data.get("reaction", "heart")
    valid = {"heart", "stoke", "epic", "jealous", "fire"}
    if reaction not in valid:
        raise HTTPException(status_code=400, detail=f"Reaction must be one of: {', '.join(valid)}")

    existing = await db.feed_reactions.find_one(
        {"item_id": item_id, "user_id": current_user["id"]}, {"_id": 0}
    )
    if existing:
        if existing["reaction"] == reaction:
            # Remove reaction
            await db.feed_reactions.delete_one({"item_id": item_id, "user_id": current_user["id"]})
            await db.feed_items.update_one({"id": item_id}, {"$inc": {"reaction_count": -1}})
            return {"reacted": False}
        else:
            # Change reaction
            await db.feed_reactions.update_one(
                {"item_id": item_id, "user_id": current_user["id"]},
                {"$set": {"reaction": reaction}}
            )
            return {"reacted": True, "reaction": reaction}

    await db.feed_reactions.insert_one({
        "id": str(uuid.uuid4()),
        "item_id": item_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "reaction": reaction,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.feed_items.update_one({"id": item_id}, {"$inc": {"reaction_count": 1}})

    # Notify the item owner
    item = await db.feed_items.find_one({"id": item_id}, {"_id": 0, "user_id": 1})
    if item and item["user_id"] != current_user["id"]:
        await create_notification(
            item["user_id"], "dive_like",
            f"{current_user['name']} reacted to your dive",
            f"{reaction} on your activity",
            {"item_id": item_id, "from_user": current_user["id"]}
        )

    return {"reacted": True, "reaction": reaction}


async def publish_feed_item(user_id: str, user_name: str, user_photo: str, item_type: str, data: dict) -> dict:
    """Publish a new item to the activity feed."""
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user_name,
        "user_photo": user_photo,
        "type": item_type,
        "data": data,
        "reaction_count": 0,
        "comment_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.feed_items.insert_one(item.copy())
    return item


# ═══════════════════════════════════════════
# MARINE LIFE SIGHTINGS
# ═══════════════════════════════════════════

COMMON_SPECIES = [
    "Manta Ray", "Whale Shark", "Sea Turtle", "Octopus", "Moray Eel",
    "Clownfish", "Barracuda", "Lionfish", "Nudibranch", "Seahorse",
    "Hammerhead Shark", "Reef Shark", "Eagle Ray", "Stingray", "Pufferfish",
    "Grouper", "Parrotfish", "Frogfish", "Cuttlefish", "Jellyfish",
    "Dolphin", "Humpback Whale", "Dugong", "Napoleon Wrasse", "Trigger Fish",
    "Scorpionfish", "Wobbegong", "Lobster", "Crab", "Starfish",
]

@router.get("/species/common")
async def get_common_species() -> dict:
    """Get list of common marine species for tagging."""
    return {"species": COMMON_SPECIES}


@router.post("/dive-log/{dive_id}/sightings")
async def add_sightings(dive_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Add marine life sightings to a dive."""
    species_list = data.get("species", [])
    if not species_list:
        raise HTTPException(status_code=400, detail="At least one species required")

    dive = await db.dive_logs.find_one({"id": dive_id, "user_id": current_user["id"]}, {"_id": 0, "id": 1})
    if not dive:
        raise HTTPException(status_code=404, detail="Dive not found")

    sightings = []
    for sp in species_list[:20]:
        sightings.append({
            "species": sp.get("name") if isinstance(sp, dict) else sp,
            "count": sp.get("count", 1) if isinstance(sp, dict) else 1,
            "notes": sp.get("notes", "") if isinstance(sp, dict) else "",
        })

    await db.dive_logs.update_one({"id": dive_id}, {"$set": {"sightings": sightings}})

    # Publish to feed
    await publish_feed_item(
        current_user["id"], current_user.get("name", ""), current_user.get("profile_photo"),
        "sighting",
        {"dive_id": dive_id, "species": [s["species"] for s in sightings[:5]], "count": len(sightings)}
    )

    return {"sightings": sightings}


@router.get("/species/my-log")
async def get_my_species_log(current_user: dict = Depends(get_current_user)):
    """Get all species the user has ever seen, with counts."""
    logs = await db.dive_logs.find(
        {"user_id": current_user["id"], "sightings": {"$exists": True, "$ne": []}},
        {"_id": 0, "sightings": 1, "site_name": 1, "date": 1}
    ).to_list(500)

    species_map = {}
    for log in logs:
        for s in log.get("sightings", []):
            name = s.get("species", "Unknown")
            if name not in species_map:
                species_map[name] = {"species": name, "total_sightings": 0, "dive_count": 0, "first_seen": log.get("date"), "last_seen": log.get("date")}
            species_map[name]["total_sightings"] += s.get("count", 1)
            species_map[name]["dive_count"] += 1
            if log.get("date") and log["date"] < species_map[name]["first_seen"]:
                species_map[name]["first_seen"] = log["date"]
            if log.get("date") and log["date"] > species_map[name]["last_seen"]:
                species_map[name]["last_seen"] = log["date"]

    result = sorted(species_map.values(), key=lambda x: x["total_sightings"], reverse=True)
    return {"species": result, "unique_count": len(result)}


@router.get("/species/user/{user_id}")
async def get_user_species(user_id: str) -> dict:
    """Get species log for a public user profile."""
    logs = await db.dive_logs.find(
        {"user_id": user_id, "sightings": {"$exists": True, "$ne": []}},
        {"_id": 0, "sightings": 1}
    ).to_list(500)
    species_map = {}
    for log in logs:
        for s in log.get("sightings", []):
            name = s.get("species", "Unknown")
            species_map[name] = species_map.get(name, 0) + s.get("count", 1)
    result = [{"species": k, "count": v} for k, v in sorted(species_map.items(), key=lambda x: x[1], reverse=True)]
    return {"species": result, "unique_count": len(result)}


# ═══════════════════════════════════════════
# BUCKET LIST
# ═══════════════════════════════════════════

@router.get("/bucket-list")
async def get_my_bucket_list(current_user: dict = Depends(get_current_user)):
    """Get the user's dive bucket list."""
    items = await db.bucket_list.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"items": items}


@router.post("/bucket-list")
async def add_bucket_list_item(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a dive site to the bucket list."""
    site_name = data.get("site_name", "").strip()
    if not site_name:
        raise HTTPException(status_code=400, detail="Site name required")

    item = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "site_name": site_name,
        "location": data.get("location", ""),
        "country": data.get("country", ""),
        "why": data.get("why", ""),
        "completed": False,
        "completed_date": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bucket_list.insert_one(item.copy())
    return item


@router.put("/bucket-list/{item_id}")
async def update_bucket_list_item(item_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update or mark a bucket list item as completed."""
    item = await db.bucket_list.find_one({"id": item_id, "user_id": current_user["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    updates = {}
    if "completed" in data:
        updates["completed"] = data["completed"]
        updates["completed_date"] = datetime.now(timezone.utc).isoformat() if data["completed"] else None
    if "why" in data:
        updates["why"] = data["why"]

    if updates:
        await db.bucket_list.update_one({"id": item_id}, {"$set": updates})

        if data.get("completed"):
            await publish_feed_item(
                current_user["id"], current_user.get("name", ""), current_user.get("profile_photo"),
                "bucket_list_complete",
                {"site_name": item["site_name"], "location": item.get("location", "")}
            )

    return {**item, **updates}


@router.delete("/bucket-list/{item_id}")
async def delete_bucket_list_item(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.bucket_list.delete_one({"id": item_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"deleted": True}


@router.get("/bucket-list/user/{user_id}")
async def get_user_bucket_list(user_id: str) -> dict:
    """Get a user's public bucket list."""
    items = await db.bucket_list.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"items": items}


# ═══════════════════════════════════════════
# DIVE PHOTOS
# ═══════════════════════════════════════════

@router.post("/dive-log/{dive_id}/photos")
async def upload_dive_photo(dive_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload a photo to a dive log."""
    dive = await db.dive_logs.find_one({"id": dive_id, "user_id": current_user["id"]}, {"_id": 0, "id": 1, "photos": 1})
    if not dive:
        raise HTTPException(status_code=404, detail="Dive not found")

    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP allowed")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Max 5MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        raise HTTPException(status_code=400, detail="Invalid file extension")
    filename = f"dive_{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)

    photo_url = f"/api/uploads/{filename}"
    existing_photos = dive.get("photos", [])
    existing_photos.append({"url": photo_url, "uploaded_at": datetime.now(timezone.utc).isoformat()})
    await db.dive_logs.update_one({"id": dive_id}, {"$set": {"photos": existing_photos}})

    return {"url": photo_url, "total_photos": len(existing_photos)}


@router.delete("/dive-log/{dive_id}/photos/{photo_index}")
async def delete_dive_photo(dive_id: str, photo_index: int, current_user: dict = Depends(get_current_user)):
    """Remove a photo from a dive log."""
    dive = await db.dive_logs.find_one({"id": dive_id, "user_id": current_user["id"]}, {"_id": 0, "photos": 1})
    if not dive:
        raise HTTPException(status_code=404, detail="Dive not found")
    photos = dive.get("photos", [])
    if photo_index < 0 or photo_index >= len(photos):
        raise HTTPException(status_code=400, detail="Invalid photo index")
    photos.pop(photo_index)
    await db.dive_logs.update_one({"id": dive_id}, {"$set": {"photos": photos}})
    return {"deleted": True, "remaining": len(photos)}


# ═══════════════════════════════════════════
# GROUP CHECKOUT (Trip Planner)
# ═══════════════════════════════════════════

@router.post("/trips/{trip_id}/group-book")
async def group_book_listing(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Book the top-voted listing for the entire confirmed group."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only organizer can book for group")

    listing_id = data.get("listing_id")
    date = data.get("date")
    if not listing_id or not date:
        raise HTTPException(status_code=400, detail="listing_id and date required")

    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    confirmed = [m for m in trip.get("members", []) if m["status"] == "confirmed"]
    if not confirmed:
        raise HTTPException(status_code=400, detail="No confirmed members")

    # Create a group booking
    booking = {
        "id": str(uuid.uuid4()),
        "listing_id": listing_id,
        "listing_name": listing["name"],
        "listing_type": listing.get("type"),
        "operator_id": listing.get("operator_id"),
        "user_id": current_user["id"],
        "user_name": current_user.get("name"),
        "user_email": current_user.get("email"),
        "date": date,
        "participants": len(confirmed),
        "notes": f"Group booking from trip '{trip['name']}' — {len(confirmed)} divers",
        "status": "pending",
        "price": listing.get("price"),
        "is_group_booking": True,
        "trip_id": trip_id,
        "group_members": [{"user_id": m["user_id"], "name": m["name"]} for m in confirmed],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(booking.copy())

    # Update trip status
    await db.trips.update_one({"id": trip_id}, {"$set": {"status": "confirmed", "booked_listing_id": listing_id, "booking_id": booking["id"]}})

    # Notify all members
    for m in confirmed:
        if m["user_id"] != current_user["id"]:
            await create_notification(
                m["user_id"], "booking_new",
                f"Group booking for '{trip['name']}'",
                f"{current_user['name']} booked {listing['name']} for your group on {date}",
                {"booking_id": booking["id"], "trip_id": trip_id}
            )

    # Notify operator
    if listing.get("operator_id"):
        await create_notification(
            listing["operator_id"], "booking_new",
            "New Group Booking",
            f"Group of {len(confirmed)} from '{trip['name']}' wants to book {listing['name']}",
            {"booking_id": booking["id"]}
        )

    # Publish to feed
    await publish_feed_item(
        current_user["id"], current_user.get("name", ""), current_user.get("profile_photo"),
        "group_booking",
        {"trip_name": trip["name"], "listing_name": listing["name"], "members": len(confirmed), "date": date}
    )

    total = (listing.get("price") or 0) * len(confirmed)
    per_person = listing.get("price") or 0

    return {
        "booking": booking,
        "summary": {
            "listing": listing["name"],
            "date": date,
            "members": len(confirmed),
            "per_person": per_person,
            "total": total,
            "currency": listing.get("currency", "USD"),
        }
    }
