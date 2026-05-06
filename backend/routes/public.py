from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from datetime import datetime, timezone, timedelta
from database import db
from config import UPLOAD_DIR, SUPPORTED_CURRENCIES
from models import TrackEventRequest
from auth_utils import get_current_user
import uuid
import httpx

router = APIRouter()


@router.get("/users/{user_id}/public")
async def get_public_profile(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "phone": 0, "email": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    dive_stats = {}
    logs = await db.dive_logs.find({"user_id": user_id}, {"_id": 0, "max_depth": 1, "duration": 1, "location": 1}).to_list(500)
    if logs:
        dive_stats["total_dives"] = len(logs)
        depths = [log["max_depth"] for log in logs if log.get("max_depth")]
        dive_stats["max_depth"] = max(depths) if depths else 0
        durations = [log["duration"] for log in logs if log.get("duration")]
        dive_stats["total_time"] = sum(durations) if durations else 0
        countries = set(log.get("location", "").split(",")[-1].strip() for log in logs if log.get("location"))
        dive_stats["countries"] = len(countries - {""})
    reviews = await db.reviews.find({"user_id": user_id}, {"_id": 0, "rating": 1, "comment": 1, "listing_id": 1, "created_at": 1}).sort("created_at", -1).to_list(5)
    return {"profile": user, "dive_stats": dive_stats, "recent_reviews": reviews}


@router.post("/track")
async def track_event(req: TrackEventRequest, current_user: dict = Depends(get_current_user)):
    event = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "event_type": req.event_type,
        "data": req.data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analytics_events.insert_one(event.copy())
    return {"ok": True}


@router.post("/track/anon")
async def track_anon_event(req: TrackEventRequest) -> dict:
    event = {
        "id": str(uuid.uuid4()),
        "user_id": None,
        "event_type": req.event_type,
        "data": req.data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analytics_events.insert_one(event.copy())
    return {"ok": True}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images allowed")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    return {"url": f"/api/uploads/{filename}", "filename": filename}


@router.get("/exchange-rates")
async def get_exchange_rates() -> dict:
    cached = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    if cached:
        fetched = datetime.fromisoformat(cached["fetched_at"])
        if datetime.now(timezone.utc) - fetched < timedelta(hours=24):
            return cached
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://api.frankfurter.app/latest?from=USD&to={SUPPORTED_CURRENCIES}")
            resp.raise_for_status()
            data = resp.json()
        rates = {"USD": 1.0, **data.get("rates", {})}
        doc = {"base": "USD", "rates": rates, "date": data.get("date"), "fetched_at": datetime.now(timezone.utc).isoformat()}
        await db.exchange_rates.update_one({"base": "USD"}, {"$set": doc}, upsert=True)
        return doc
    except Exception:
        if cached:
            return cached
        return {"base": "USD", "rates": {"USD": 1, "EUR": 0.92, "GBP": 0.79, "INR": 83.5, "AUD": 1.53, "CAD": 1.36, "JPY": 149, "THB": 35.5, "IDR": 15700, "MYR": 4.7, "PHP": 56, "SGD": 1.34, "NZD": 1.64, "BRL": 4.97, "MXN": 17.1}, "date": "fallback", "fetched_at": datetime.now(timezone.utc).isoformat()}


@router.get("/stats/public")
async def get_public_stats() -> dict:
    total_divers = await db.users.count_documents({"role": "diver", "status": "active"})
    total_bookings = await db.bookings.count_documents({})
    total_reviews = await db.reviews.count_documents({})
    countries = await db.listings.distinct("country", {"status": "active"})
    listings = await db.listings.find({"status": "active"}, {"_id": 0, "rating": 1}).to_list(1000)
    avg_rating = round(sum(item.get("rating", 0) for item in listings) / len(listings), 1) if listings else 0
    return {
        "divers": total_divers,
        "bookings": total_bookings,
        "reviews": total_reviews,
        "countries": len(countries),
        "avg_rating": avg_rating
    }


@router.get("/site-content/public")
async def get_public_site_content() -> dict:
    content = await db.site_content.find_one({"key": "landing_page"}, {"_id": 0})
    from routes.site_content import _normalize
    return _normalize(content, "landing")
