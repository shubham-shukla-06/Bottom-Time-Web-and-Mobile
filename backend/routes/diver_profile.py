"""
Diver Profile - "Instagram for Divers"
Rich public profiles with dive galleries, stats, likes, comments, badges, and follow.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/diver-profile")


@router.get("/{user_id}")
async def get_diver_profile(user_id: str, viewer_id: str = Query(None)):
    """Full public diver profile with stats, recent dives, badges, map data."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Dive logs (public data only)
    logs = await db.dive_logs.find(
        {"user_id": user_id},
        {"_id": 0, "id": 1, "site_name": 1, "location": 1, "date": 1, "max_depth": 1,
         "duration": 1, "water_temp": 1, "dive_type": 1, "visibility": 1, "rating": 1,
         "buddy": 1, "gas_mix": 1, "profile": 1, "tags": 1, "notes": 1,
         "gps_lat": 1, "gps_lng": 1, "like_count": 1, "comment_count": 1}
    ).sort("date", -1).to_list(200)

    # Stats
    total = len(logs)
    depths = [item["max_depth"] for item in logs if item.get("max_depth")]
    durations = [item["duration"] for item in logs if item.get("duration")]
    locations = set()
    countries = set()
    dive_types = {}
    for item in logs:
        loc = item.get("location", "")
        if loc:
            locations.add(loc)
            parts = loc.split(",")
            if len(parts) > 1:
                countries.add(parts[-1].strip())
        dt = item.get("dive_type", "other")
        dive_types[dt] = dive_types.get(dt, 0) + 1

    stats = {
        "total_dives": total,
        "max_depth": max(depths) if depths else 0,
        "avg_depth": round(sum(depths) / len(depths), 1) if depths else 0,
        "total_time": sum(durations) if durations else 0,
        "countries": len(countries - {""}),
        "unique_sites": len(locations),
        "dive_types": dive_types,
    }

    # Badges
    badges = []
    if total >= 1:
        badges.append({"key": "first_dive", "label": "First Splash", "desc": "Logged first dive"})
    if total >= 50:
        badges.append({"key": "50_dives", "label": "50 Club", "desc": "50 dives logged"})
    if total >= 100:
        badges.append({"key": "century", "label": "Century Diver", "desc": "100 dives logged"})
    if stats["max_depth"] >= 30:
        badges.append({"key": "deep_diver", "label": "Deep Diver", "desc": "Dived below 30m"})
    if stats["max_depth"] >= 40:
        badges.append({"key": "abyss", "label": "Into the Abyss", "desc": "Dived below 40m"})
    if stats["countries"] >= 3:
        badges.append({"key": "globe_trotter", "label": "Globe Trotter", "desc": "Dived in 3+ countries"})
    if stats["countries"] >= 10:
        badges.append({"key": "world_diver", "label": "World Diver", "desc": "Dived in 10+ countries"})
    if any(item.get("dive_type") == "night" for item in logs):
        badges.append({"key": "night_owl", "label": "Night Owl", "desc": "Completed a night dive"})
    if any(item.get("dive_type") == "wreck" for item in logs):
        badges.append({"key": "wreck_explorer", "label": "Wreck Explorer", "desc": "Explored a wreck"})
    if stats["total_time"] >= 3000:
        badges.append({"key": "bottom_timer", "label": "Bottom Timer", "desc": "3000+ minutes underwater"})

    # Map data (unique sites with coords)
    site_map = {}
    for item in logs:
        key = item.get("site_name", "Unknown")
        if key not in site_map:
            site_map[key] = {
                "site_name": key,
                "location": item.get("location", ""),
                "gps_lat": item.get("gps_lat"),
                "gps_lng": item.get("gps_lng"),
                "dive_count": 0,
                "max_depth": 0,
            }
        site_map[key]["dive_count"] += 1
        site_map[key]["max_depth"] = max(site_map[key]["max_depth"], item.get("max_depth") or 0)

    # Check if viewer follows this user
    is_following = False
    if viewer_id and viewer_id != user_id:
        conn = await db.connections.find_one({
            "$or": [
                {"from_id": viewer_id, "to_id": user_id, "status": "accepted"},
                {"from_id": user_id, "to_id": viewer_id, "status": "accepted"},
            ]
        })
        is_following = bool(conn)

    # Follower/following counts
    followers = await db.connections.count_documents({
        "$or": [{"to_id": user_id}, {"from_id": user_id}],
        "status": "accepted"
    })

    # Dive IDs liked by viewer
    viewer_likes = []
    if viewer_id:
        likes = await db.dive_likes.find(
            {"user_id": viewer_id, "dive_id": {"$in": [item["id"] for item in logs]}},
            {"_id": 0, "dive_id": 1}
        ).to_list(500)
        viewer_likes = [lk["dive_id"] for lk in likes]

    # Gear wall
    gear = user.get("gear_wall", [])

    # Fav dive sites
    fav_sites = user.get("favorite_sites", [])

    # Certifications
    certs = []
    if user.get("certification_level"):
        certs.append({
            "level": user["certification_level"],
            "agency": user.get("certification_agency", ""),
        })

    return {
        "profile": {
            "id": user["id"],
            "name": user.get("name", ""),
            "profile_photo": user.get("profile_photo"),
            "location_country": user.get("location_country"),
            "location_city": user.get("location_city"),
            "role": user.get("role"),
            "experience_level": user.get("experience_level"),
            "certification_level": user.get("certification_level"),
            "certification_agency": user.get("certification_agency"),
            "bio": user.get("bio", ""),
            "languages": user.get("languages", []),
            "preferred_dive_types": user.get("preferred_dive_types", []),
            "member_since": user.get("created_at", ""),
        },
        "stats": stats,
        "badges": badges,
        "certifications": certs,
        "recent_dives": logs[:20],
        "dive_sites": list(site_map.values()),
        "gear_wall": gear,
        "favorite_sites": fav_sites,
        "connections": followers,
        "is_following": is_following,
        "viewer_likes": viewer_likes,
    }


@router.post("/dive/{dive_id}/like")
async def toggle_dive_like(dive_id: str, current_user: dict = Depends(get_current_user)):
    """Like or unlike a dive."""
    dive = await db.dive_logs.find_one({"id": dive_id}, {"_id": 0, "id": 1, "user_id": 1})
    if not dive:
        raise HTTPException(status_code=404, detail="Dive not found")

    existing = await db.dive_likes.find_one({"dive_id": dive_id, "user_id": current_user["id"]})
    if existing:
        await db.dive_likes.delete_one({"dive_id": dive_id, "user_id": current_user["id"]})
        await db.dive_logs.update_one({"id": dive_id}, {"$inc": {"like_count": -1}})
        return {"liked": False}

    await db.dive_likes.insert_one({
        "id": str(uuid.uuid4()),
        "dive_id": dive_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.dive_logs.update_one({"id": dive_id}, {"$inc": {"like_count": 1}})
    return {"liked": True}


@router.get("/dive/{dive_id}/comments")
async def get_dive_comments(dive_id: str) -> dict:
    """Get comments for a dive."""
    comments = await db.dive_comments.find(
        {"dive_id": dive_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"comments": comments}


@router.post("/dive/{dive_id}/comment")
async def add_dive_comment(dive_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Add a comment to a dive."""
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text required")

    comment = {
        "id": str(uuid.uuid4()),
        "dive_id": dive_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_photo": current_user.get("profile_photo"),
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.dive_comments.insert_one(comment.copy())
    await db.dive_logs.update_one({"id": dive_id}, {"$inc": {"comment_count": 1}})
    return comment


@router.delete("/dive/comment/{comment_id}")
async def delete_dive_comment(comment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a comment (only by author)."""
    comment = await db.dive_comments.find_one({"id": comment_id}, {"_id": 0})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your comment")
    await db.dive_comments.delete_one({"id": comment_id})
    await db.dive_logs.update_one({"id": comment["dive_id"]}, {"$inc": {"comment_count": -1}})
    return {"deleted": True}


@router.put("/bio")
async def update_bio(data: dict, current_user: dict = Depends(get_current_user)):
    """Update profile bio, gear wall, favorite sites."""
    updates = {}
    if "bio" in data:
        updates["bio"] = data["bio"][:500]
    if "gear_wall" in data:
        updates["gear_wall"] = data["gear_wall"][:20]
    if "favorite_sites" in data:
        updates["favorite_sites"] = data["favorite_sites"][:10]
    if updates:
        await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
    return {"ok": True}
