from database import db
from config import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CLAIMS_EMAIL
from datetime import datetime, timezone
import uuid
import json
import logging

logger = logging.getLogger(__name__)

DEFAULT_NOTIFICATION_PREFS = {
    "new_message": True,
    "booking_new": True,
    "booking_update": True,
    "connection_request": True,
    "connection_accepted": True,
    "listing_approved": True,
    "listing_rejected": True,
    "trip_shared": True,
    "warning": True,
    "suspended": True,
    "operator_application": True,
    "operator_approved": True,
    "operator_declined": True,
}


async def create_notification(user_id: str, notif_type: str, title: str, message: str, data: dict = None) -> dict:
    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notif_type,
        "title": title,
        "message": message,
        "data": data or {},
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notif.copy())

    # Send browser push notification (respects user preferences)
    await _send_push(user_id, title, message, notif_type, data)

    return notif


async def _send_push(user_id: str, title: str, body: str, notif_type: str, data: dict = None) -> None:
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return

    # Check user notification preferences
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "notification_preferences": 1})
    prefs = user.get("notification_preferences", DEFAULT_NOTIFICATION_PREFS) if user else DEFAULT_NOTIFICATION_PREFS
    if not prefs.get(notif_type, True):
        return

    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    if not subs:
        return

    try:
        from pywebpush import webpush
    except ImportError:
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "type": notif_type,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    for sub in subs:
        try:
            webpush(
                subscription_info=sub["subscription"],
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )
        except Exception as e:
            err_str = str(e)
            if "410" in err_str or "404" in err_str:
                await db.push_subscriptions.delete_one({"user_id": user_id, "subscription.endpoint": sub["subscription"]["endpoint"]})
            else:
                logger.debug(f"Push failed for {user_id}: {err_str}")
