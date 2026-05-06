"""
Dive Profile Export & Sharing
- Generate shareable dive profile card (HTML for image conversion)
- Export as CSV/JSON
- Share metadata for social/community
"""
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth_utils import get_current_user
import csv
import io

router = APIRouter()


@router.get("/dive-log/{log_id}/export/json")
async def export_dive_json(log_id: str, current_user: dict = Depends(get_current_user)):
    """Export a single dive as JSON."""
    log = await db.dive_logs.find_one({"id": log_id, "user_id": current_user["id"]}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Dive not found")
    return {"dive": log, "format": "json"}


@router.get("/dive-log/{log_id}/export/csv")
async def export_dive_csv(log_id: str, current_user: dict = Depends(get_current_user)):
    """Export dive profile as CSV."""
    log = await db.dive_logs.find_one({"id": log_id, "user_id": current_user["id"]}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Dive not found")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["time_seconds", "depth_m", "temperature_c"])
    for point in (log.get("profile") or []):
        writer.writerow([
            point.get("time_seconds", ""),
            point.get("depth", ""),
            point.get("temp", ""),
        ])

    return {
        "csv": output.getvalue(),
        "filename": f"dive_{log.get('site_name', 'export')}_{log.get('date', '')}".replace(" ", "_"),
        "meta": {
            "site": log.get("site_name", ""),
            "date": log.get("date", ""),
            "max_depth": log.get("max_depth", 0),
            "duration": log.get("duration", 0),
            "points": len(log.get("profile") or []),
        },
    }


@router.get("/dive-log/{log_id}/share-card")
async def get_share_card_data(log_id: str, current_user: dict = Depends(get_current_user)):
    """Get dive data formatted for shareable card generation."""
    log = await db.dive_logs.find_one({"id": log_id, "user_id": current_user["id"]}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Dive not found")

    # Downsample profile for card
    profile = log.get("profile") or []
    step = max(1, len(profile) // 50)
    mini_profile = [{"d": p.get("depth", 0), "t": p.get("time_seconds", 0)} for p in profile[::step]]

    return {
        "card": {
            "diver_name": current_user.get("name", "Diver"),
            "site_name": log.get("site_name", "Unknown"),
            "location": log.get("location", ""),
            "date": log.get("date", ""),
            "max_depth": log.get("max_depth", 0),
            "avg_depth": log.get("avg_depth", 0),
            "duration": log.get("duration", 0),
            "water_temp": log.get("water_temp"),
            "visibility": log.get("visibility", ""),
            "dive_type": log.get("dive_type", ""),
            "gas_mix": log.get("gas_mix", "Air"),
            "buddy": log.get("buddy", ""),
            "rating": log.get("rating", 0),
            "tags": log.get("tags", []),
            "computer_model": log.get("computer_model", ""),
            "profile": mini_profile,
        },
        "share_text": f"Just logged a dive at {log.get('site_name', '')}! {log.get('max_depth', 0)}m deep, {log.get('duration', 0)} minutes underwater. {log.get('location', '')} #BottomTime #ScubaDiving",
    }
