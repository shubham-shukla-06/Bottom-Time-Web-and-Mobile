from fastapi import APIRouter, Depends
from database import db
from config import VAPID_PUBLIC_KEY
from auth_utils import get_current_user
from helpers import DEFAULT_NOTIFICATION_PREFS
from datetime import datetime, timezone

router = APIRouter()


@router.get("/push/vapid-key")
async def get_vapid_key() -> dict:
    return {"public_key": VAPID_PUBLIC_KEY}


@router.post("/push/subscribe")
async def subscribe_push(subscription: dict, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    endpoint = subscription.get("endpoint", "")
    await db.push_subscriptions.update_one(
        {"user_id": user_id, "subscription.endpoint": endpoint},
        {"$set": {
            "user_id": user_id,
            "subscription": subscription,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/push/unsubscribe")
async def unsubscribe_push(current_user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_many({"user_id": current_user["id"]})
    return {"ok": True}


@router.get("/notifications/preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    prefs = current_user.get("notification_preferences", DEFAULT_NOTIFICATION_PREFS)
    return {"preferences": prefs}


@router.put("/notifications/preferences")
async def update_notification_preferences(preferences: dict, current_user: dict = Depends(get_current_user)):
    # Merge with defaults to ensure all keys exist
    merged = {**DEFAULT_NOTIFICATION_PREFS, **preferences}
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"notification_preferences": merged}}
    )
    return {"preferences": merged}
