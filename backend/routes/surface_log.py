"""
Surface Log — Dive Day Journals
Auto-generated visual recap cards from dive log data.
Permanent, structured, shareable — not disappearing stories.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from helpers import create_notification
import uuid

router = APIRouter(prefix="/surface-log")


@router.get("")
async def get_my_surface_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Get the user's own surface logs."""
    logs = await db.surface_logs.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    return {"logs": logs}


@router.get("/feed")
async def get_surface_log_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Get surface logs from connections for the feed."""
    uid = current_user["id"]
    conns = await db.connections.find(
        {"$or": [{"from_id": uid}, {"to_id": uid}], "status": "accepted"},
        {"_id": 0, "from_id": 1, "to_id": 1}
    ).to_list(500)
    friend_ids = set()
    for c in conns:
        friend_ids.add(c["from_id"])
        friend_ids.add(c["to_id"])
    friend_ids.add(uid)

    logs = await db.surface_logs.find(
        {"user_id": {"$in": list(friend_ids)}}, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    # Add viewer reactions
    log_ids = [item["id"] for item in logs]
    reactions = await db.surface_log_reactions.find(
        {"log_id": {"$in": log_ids}, "user_id": uid}, {"_id": 0, "log_id": 1, "reaction": 1}
    ).to_list(500)
    rx_map = {r["log_id"]: r["reaction"] for r in reactions}
    for item in logs:
        item["viewer_reaction"] = rx_map.get(item["id"])

    return {"logs": logs, "has_more": len(logs) == limit}


@router.post("/generate")
async def generate_surface_log(data: dict, current_user: dict = Depends(get_current_user)):
    """Auto-generate a surface log from dives logged on a specific date.
    User provides: date, mood, highlight, caption, photos."""
    date = data.get("date")
    if not date:
        raise HTTPException(status_code=400, detail="Date required")

    # Fetch all dives for that date
    dives = await db.dive_logs.find(
        {"user_id": current_user["id"], "date": {"$regex": f"^{date}"}},
        {"_id": 0}
    ).to_list(20)

    if not dives:
        raise HTTPException(status_code=404, detail="No dives found for this date")

    # Auto-compute dive stats
    total_dives = len(dives)
    max_depth = max((d.get("max_depth") or 0) for d in dives)
    total_time = sum((d.get("duration") or 0) for d in dives)
    sites = list(set(d.get("site_name", "Unknown") for d in dives))
    location = dives[0].get("location", "")
    water_temp = next((d.get("water_temp") for d in dives if d.get("water_temp")), None)

    # Collect all species from dives
    all_species = []
    for d in dives:
        for s in (d.get("sightings") or []):
            sp = s.get("species", "") if isinstance(s, dict) else s
            if sp and sp not in all_species:
                all_species.append(sp)

    # Collect dive profiles (mini charts)
    profiles = []
    for d in dives:
        if d.get("profile") and len(d["profile"]) > 2:
            profiles.append({
                "dive_id": d["id"],
                "site_name": d.get("site_name"),
                "max_depth": d.get("max_depth"),
                "duration": d.get("duration"),
                "profile": d["profile"][::max(1, len(d["profile"]) // 30)],  # Downsample
            })

    # Collect photos from dives
    dive_photos = []
    for d in dives:
        for p in (d.get("photos") or []):
            dive_photos.append(p.get("url", ""))

    surface_log = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_photo": current_user.get("profile_photo"),
        "date": date,
        # Auto-generated data
        "dive_count": total_dives,
        "max_depth": max_depth,
        "total_time": total_time,
        "sites": sites,
        "location": location,
        "water_temp": water_temp,
        "species": all_species[:10],
        "profiles": profiles[:4],
        "dive_photos": dive_photos[:6],
        # User-provided data
        "mood": data.get("mood", ""),
        "highlight": data.get("highlight", ""),
        "caption": data.get("caption", ""),
        "extra_photos": data.get("photos", []),
        # Engagement
        "reaction_count": 0,
        "comment_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Check for duplicate
    existing = await db.surface_logs.find_one(
        {"user_id": current_user["id"], "date": date}, {"_id": 0, "id": 1}
    )
    if existing:
        await db.surface_logs.update_one({"id": existing["id"]}, {"$set": {
            **{k: v for k, v in surface_log.items() if k not in ("id", "created_at", "reaction_count", "comment_count")},
        }})
        surface_log["id"] = existing["id"]
    else:
        await db.surface_logs.insert_one(surface_log.copy())

    # Publish to activity feed
    try:
        from routes.social_feed import publish_feed_item
        await publish_feed_item(
            current_user["id"], current_user.get("name", ""), current_user.get("profile_photo"),
            "surface_log",
            {
                "log_id": surface_log["id"],
                "date": date,
                "dive_count": total_dives,
                "max_depth": max_depth,
                "sites": sites[:3],
                "species_count": len(all_species),
                "caption": data.get("caption", ""),
                "mood": data.get("mood", ""),
            }
        )
    except Exception:
        pass

    return surface_log


@router.get("/{log_id}")
async def get_surface_log(log_id: str) -> dict:
    """Get a single surface log (public)."""
    log = await db.surface_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Surface log not found")
    return log


@router.post("/{log_id}/react")
async def react_to_surface_log(log_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """React to a surface log."""
    reaction = data.get("reaction", "stoke")
    valid = {"heart", "stoke", "epic", "jealous", "fire"}
    if reaction not in valid:
        raise HTTPException(status_code=400, detail=f"Must be one of: {', '.join(valid)}")

    existing = await db.surface_log_reactions.find_one(
        {"log_id": log_id, "user_id": current_user["id"]}, {"_id": 0}
    )
    if existing:
        if existing["reaction"] == reaction:
            await db.surface_log_reactions.delete_one({"log_id": log_id, "user_id": current_user["id"]})
            await db.surface_logs.update_one({"id": log_id}, {"$inc": {"reaction_count": -1}})
            return {"reacted": False}
        await db.surface_log_reactions.update_one(
            {"log_id": log_id, "user_id": current_user["id"]}, {"$set": {"reaction": reaction}}
        )
        return {"reacted": True, "reaction": reaction}

    await db.surface_log_reactions.insert_one({
        "id": str(uuid.uuid4()), "log_id": log_id, "user_id": current_user["id"],
        "user_name": current_user.get("name", ""), "reaction": reaction,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.surface_logs.update_one({"id": log_id}, {"$inc": {"reaction_count": 1}})

    log = await db.surface_logs.find_one({"id": log_id}, {"_id": 0, "user_id": 1})
    if log and log["user_id"] != current_user["id"]:
        await create_notification(
            log["user_id"], "dive_like",
            f"{current_user['name']} reacted to your Surface Log",
            f"{reaction} on your dive day",
            {"log_id": log_id}
        )

    return {"reacted": True, "reaction": reaction}


@router.get("/{log_id}/comments")
async def get_surface_log_comments(log_id: str) -> dict:
    """Get comments on a surface log."""
    comments = await db.surface_log_comments.find(
        {"log_id": log_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"comments": comments}


@router.post("/{log_id}/comment")
async def comment_on_surface_log(log_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Add a comment to a surface log."""
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text required")

    comment = {
        "id": str(uuid.uuid4()),
        "log_id": log_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_photo": current_user.get("profile_photo"),
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.surface_log_comments.insert_one(comment.copy())
    await db.surface_logs.update_one({"id": log_id}, {"$inc": {"comment_count": 1}})
    return comment


@router.get("/user/{user_id}")
async def get_user_surface_logs(user_id: str, limit: int = Query(10, le=30)):
    """Get a user's public surface logs (for their profile)."""
    logs = await db.surface_logs.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("date", -1).limit(limit).to_list(limit)
    return {"logs": logs}


@router.get("/dates/available")
async def get_available_dates(current_user: dict = Depends(get_current_user)):
    """Get dates that have dives logged but no surface log yet."""
    dives = await db.dive_logs.find(
        {"user_id": current_user["id"]}, {"_id": 0, "date": 1}
    ).to_list(500)

    existing_logs = await db.surface_logs.find(
        {"user_id": current_user["id"]}, {"_id": 0, "date": 1}
    ).to_list(500)
    existing_dates = set(item["date"] for item in existing_logs)

    date_counts = {}
    for d in dives:
        dt = (d.get("date") or "")[:10]
        if dt and dt not in existing_dates:
            date_counts[dt] = date_counts.get(dt, 0) + 1

    dates = [{"date": k, "dive_count": v} for k, v in sorted(date_counts.items(), reverse=True)]
    return {"dates": dates[:30]}
