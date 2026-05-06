from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, EmailStr
from database import db
from datetime import datetime, timezone
from rate_limiter import limiter
from auth_utils import get_current_user

router = APIRouter()

WAITLIST_BASE_COUNT = 382

class WaitlistRequest(BaseModel):
    email: EmailStr

@router.post("/waitlist")
@limiter.limit("5/minute")
async def join_waitlist(request: Request, body: WaitlistRequest) -> dict:
    email = body.email.strip().lower()
    existing = await db.waitlist.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Already on the waitlist")
    await db.waitlist.insert_one({
        "email": email,
        "joined_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"message": "Added to waitlist", "email": email}

@router.get("/waitlist/count")
async def waitlist_count() -> dict:
    count = await db.waitlist.count_documents({})
    return {"count": count + WAITLIST_BASE_COUNT}

@router.get("/waitlist/admin")
async def admin_waitlist(page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    skip = (page - 1) * limit
    total = await db.waitlist.count_documents({})
    items = await db.waitlist.find({}, {"_id": 0}).sort("joined_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": items, "total": total, "base_count": WAITLIST_BASE_COUNT, "display_total": total + WAITLIST_BASE_COUNT, "page": page, "pages": max(1, (total + limit - 1) // limit)}

@router.delete("/waitlist/admin/{email}")
async def admin_remove_waitlist(email: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.waitlist.delete_one({"email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"message": "Removed from waitlist"}
