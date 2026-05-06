"""
Admin bulk-action routes.

All endpoints require admin role and accept a payload of the form:
  { "ids": ["<id1>", "<id2>", ...], "action": "<action_name>", ...optional context }

Each returns:
  { "processed": <int>, "failed": <int>, "errors": [{"id": "...", "error": "..."}] }

Conventions:
- Idempotent — re-running a bulk call on already-processed IDs does not error.
- Per-ID failures are caught and reported; never aborts the whole batch.
- Uses `update_many` / `delete_many` where possible for performance; falls back to
  per-ID loops when side-effects (notifications, user-record updates, etc.) are needed.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone

from database import db
from auth_utils import get_current_user, require_admin
from helpers import create_notification

router = APIRouter()


class BulkActionRequest(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=500)
    action: str
    notes: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=500)


class BulkEmailRequest(BaseModel):
    emails: List[str] = Field(..., min_length=1, max_length=500)


def _result(processed: int, failed: int = 0, errors: Optional[list] = None) -> dict:
    return {"processed": processed, "failed": failed, "errors": errors or []}


# -----------------------------------------------------------------------------
# Waitlist
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/waitlist/delete")
async def bulk_delete_waitlist(req: BulkEmailRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    emails = [e.strip().lower() for e in req.emails if e and e.strip()]
    if not emails:
        raise HTTPException(status_code=400, detail="No emails provided")
    res = await db.waitlist.delete_many({"email": {"$in": emails}})
    return _result(processed=res.deleted_count, failed=len(emails) - res.deleted_count)


# -----------------------------------------------------------------------------
# Operator applications
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/applications/action")
async def bulk_applications_action(req: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    from routes.operator_listings import _process_review  # avoid circular import at module load
    if req.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be approve or reject")

    errors, processed = [], 0
    apps = await db.operator_applications.find({"id": {"$in": req.ids}}, {"_id": 0}).to_list(len(req.ids))
    found_ids = {a["id"] for a in apps}
    for missing in [i for i in req.ids if i not in found_ids]:
        errors.append({"id": missing, "error": "Not found"})

    for app in apps:
        try:
            if app.get("status") in ("approved", "rejected"):
                processed += 1  # treat as no-op success
                continue
            await _process_review(app, req.action, current_user["id"], req.notes or "", False)
            processed += 1
        except Exception as e:
            errors.append({"id": app["id"], "error": str(e)})

    return _result(processed=processed, failed=len(errors), errors=errors)


# -----------------------------------------------------------------------------
# Users
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/users/action")
async def bulk_users_action(req: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if req.action not in ("suspend", "activate", "approve", "delete"):
        raise HTTPException(status_code=400, detail="Action must be suspend, activate, approve, or delete")

    ids = [i for i in req.ids if i != current_user["id"]]  # never operate on self
    targets = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "role": 1}).to_list(len(ids))
    # Exclude admins from destructive actions
    safe_ids = [t["id"] for t in targets if t.get("role") != "admin"]

    if req.action == "delete":
        res = await db.users.delete_many({"id": {"$in": safe_ids}})
        await db.connections.delete_many({"$or": [{"from_id": {"$in": safe_ids}}, {"to_id": {"$in": safe_ids}}]})
        return _result(processed=res.deleted_count, failed=len(req.ids) - res.deleted_count)

    status = {"suspend": "suspended", "activate": "active", "approve": "active"}[req.action]
    res = await db.users.update_many({"id": {"$in": safe_ids}}, {"$set": {"status": status}})
    return _result(processed=res.modified_count, failed=len(req.ids) - res.modified_count)


# -----------------------------------------------------------------------------
# Listings
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/listings/action")
async def bulk_listings_action(req: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if req.action not in ("approve", "reject", "delete"):
        raise HTTPException(status_code=400, detail="Action must be approve, reject, or delete")

    if req.action == "delete":
        res = await db.operator_dive_listings.delete_many({"id": {"$in": req.ids}})
        return _result(processed=res.deleted_count, failed=len(req.ids) - res.deleted_count)

    status = "active" if req.action == "approve" else "rejected"
    listings = await db.operator_dive_listings.find(
        {"id": {"$in": req.ids}}, {"_id": 0, "id": 1, "operator_id": 1, "title": 1, "name": 1}
    ).to_list(len(req.ids))
    res = await db.operator_dive_listings.update_many({"id": {"$in": req.ids}}, {"$set": {"status": status}})

    # Notifications (best-effort; failures don't block)
    for listing in listings:
        if not listing.get("operator_id"):
            continue
        try:
            title = listing.get("title") or listing.get("name") or ""
            if req.action == "approve":
                await create_notification(
                    listing["operator_id"], "listing_approved", "Listing Approved",
                    f'Your listing "{title}" has been approved and is now live!',
                    {"listing_id": listing["id"]},
                )
            else:
                await create_notification(
                    listing["operator_id"], "listing_rejected", "Listing Rejected",
                    f'Your listing "{title}" was not approved',
                    {"listing_id": listing["id"]},
                )
        except Exception:
            pass

    return _result(processed=res.modified_count, failed=len(req.ids) - res.modified_count)


# -----------------------------------------------------------------------------
# Promo codes
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/promo-codes/action")
async def bulk_promo_codes_action(req: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if req.action not in ("activate", "deactivate", "delete"):
        raise HTTPException(status_code=400, detail="Action must be activate, deactivate, or delete")

    if req.action == "delete":
        res = await db.promo_codes.delete_many({"id": {"$in": req.ids}})
        return _result(processed=res.deleted_count, failed=len(req.ids) - res.deleted_count)

    active = req.action == "activate"
    res = await db.promo_codes.update_many(
        {"id": {"$in": req.ids}},
        {"$set": {"active": active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return _result(processed=res.modified_count, failed=len(req.ids) - res.modified_count)


# -----------------------------------------------------------------------------
# Campaigns
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/campaigns/delete")
async def bulk_delete_campaigns(req: BulkDeleteRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    res = await db.utm_campaigns.delete_many({"id": {"$in": req.ids}})
    return _result(processed=res.deleted_count, failed=len(req.ids) - res.deleted_count)


# -----------------------------------------------------------------------------
# Products (shop inventory)
# -----------------------------------------------------------------------------
@router.post("/admin/bulk/products/action")
async def bulk_products_action(req: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if req.action not in ("in_stock", "out_of_stock", "delete"):
        raise HTTPException(status_code=400, detail="Action must be in_stock, out_of_stock, or delete")

    if req.action == "delete":
        res = await db.products.delete_many({"id": {"$in": req.ids}})
        return _result(processed=res.deleted_count, failed=len(req.ids) - res.deleted_count)

    in_stock = req.action == "in_stock"
    res = await db.products.update_many(
        {"id": {"$in": req.ids}},
        {"$set": {"in_stock": in_stock, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return _result(processed=res.modified_count, failed=len(req.ids) - res.modified_count)
