from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
from database import db
from config import SUPER_ADMINS, REPORT_REASONS
from models import (
    AdminAddRequest, UTMCaptureRequest, CampaignCreateRequest,
    ListingCreate, ReportCreateRequest,
)
from auth_utils import get_current_user, require_admin
from helpers import create_notification
import marketing as marketing_engine
import uuid

router = APIRouter()


@router.get("/admin/settings/admins")
async def get_admin_list(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "created_at": 1, "profile_photo": 1}).to_list(100)
    is_super = any(s["email"] == current_user["email"] for s in SUPER_ADMINS)
    return {"admins": admins, "super_admins": [s["email"] for s in SUPER_ADMINS], "is_super_admin": is_super}


@router.post("/admin/settings/admins")
async def add_admin(req: AdminAddRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    is_super = any(s["email"] == current_user["email"] for s in SUPER_ADMINS)
    if not is_super:
        raise HTTPException(status_code=403, detail="Only super admins can add new admins")
    user = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found with this email. They must sign up first.")
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="User is already an admin")
    await db.users.update_one({"email": req.email}, {"$set": {"role": "admin", "status": "active"}})
    return {"message": f"{user['name']} is now an admin"}


@router.delete("/admin/settings/admins/{user_id}")
async def remove_admin(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    is_super = any(s["email"] == current_user["email"] for s in SUPER_ADMINS)
    if not is_super:
        raise HTTPException(status_code=403, detail="Only super admins can remove admins")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if any(s["email"] == target["email"] for s in SUPER_ADMINS):
        raise HTTPException(status_code=400, detail="Cannot remove a super admin")
    await db.users.update_one({"id": user_id}, {"$set": {"role": "diver"}})
    return {"message": f"{target['name']} is no longer an admin"}


@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    user_stats = {
        "total_users": await db.users.count_documents({}),
        "total_divers": await db.users.count_documents({"role": "diver"}),
        "active_operators": await db.users.count_documents({"role": {"$in": ["operator", "instructor"]}, "status": "active"}),
        "suspended_users": await db.users.count_documents({"status": "suspended"}),
        "pending_users": await db.users.count_documents({"status": "pending_approval"}),
        "new_users_7d": await db.users.count_documents({"created_at": {"$gte": week_ago}}),
        "new_users_30d": await db.users.count_documents({"created_at": {"$gte": month_ago}}),
        "onboarded_users": await db.users.count_documents({"onboarding_complete": True}),
    }

    listing_stats = {
        "total_listings": await db.operator_dive_listings.count_documents({}),
        "active_listings": await db.operator_dive_listings.count_documents({"status": "active"}),
        "pending_listings": await db.operator_dive_listings.count_documents({"status": "pending"}),
    }

    booking_stats = {
        "total_bookings": await db.bookings.count_documents({}),
        "bookings_7d": await db.bookings.count_documents({"created_at": {"$gte": week_ago}}),
        "confirmed_bookings": await db.bookings.count_documents({"status": "confirmed"}),
    }

    engagement_stats = {
        "total_connections": await db.connections.count_documents({"status": "accepted"}),
        "total_messages": await db.messages.count_documents({}),
        "total_reviews": await db.reviews.count_documents({}),
        "total_wishlists": await db.wishlists.count_documents({}),
        "total_dive_logs": await db.dive_logs.count_documents({}),
        "total_events_rsvp": sum(len(e.get("attendees", [])) for e in await db.events.find({}, {"_id": 0, "attendees": 1}).to_list(500)),
    }

    analytics_stats = {
        "total_page_views": await db.analytics_events.count_documents({"event_type": "page_view"}),
        "total_searches": await db.analytics_events.count_documents({"event_type": "search"}),
        "total_listing_clicks": await db.analytics_events.count_documents({"event_type": "listing_click"}),
        "total_shares": await db.analytics_events.count_documents({"event_type": "share"}),
    }

    rev = await db.bookings.aggregate([{"$group": {"_id": None, "total": {"$sum": "$total_price"}}}]).to_list(1)

    return {**user_stats, **listing_stats, **booking_stats, **engagement_stats, **analytics_stats, "total_revenue": rev[0]["total"] if rev else 0}


@router.get("/admin/recent-activity")
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    recent_users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "status": 1, "created_at": 1, "onboarding_complete": 1}).sort("created_at", -1).to_list(15)
    recent_bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    recent_reviews = await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    recent_events = await db.analytics_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {"recent_users": recent_users, "recent_bookings": recent_bookings, "recent_reviews": recent_reviews, "recent_events": recent_events}


@router.get("/admin/analytics/growth")
async def get_growth_analytics(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    all_users = await db.users.find({}, {"_id": 0, "created_at": 1, "role": 1, "onboarding_complete": 1, "status": 1}).to_list(10000)
    daily_signups = {}
    role_dist = {}
    onboarding_funnel = {"signed_up": 0, "onboarded": 0, "has_booking": 0}
    for u in all_users:
        day = u.get("created_at", "")[:10]
        daily_signups[day] = daily_signups.get(day, 0) + 1
        r = u.get("role", "unknown")
        role_dist[r] = role_dist.get(r, 0) + 1
        onboarding_funnel["signed_up"] += 1
        if u.get("onboarding_complete"):
            onboarding_funnel["onboarded"] += 1
    users_with_bookings = len(set([b["user_id"] for b in await db.bookings.find({}, {"_id": 0, "user_id": 1}).to_list(10000)]))
    onboarding_funnel["has_booking"] = users_with_bookings
    all_bookings = await db.bookings.find({}, {"_id": 0, "created_at": 1, "total_price": 1, "status": 1}).to_list(10000)
    daily_bookings = {}
    daily_revenue = {}
    for b in all_bookings:
        day = b.get("created_at", "")[:10]
        daily_bookings[day] = daily_bookings.get(day, 0) + 1
        daily_revenue[day] = daily_revenue.get(day, 0) + (b.get("total_price") or 0)
    all_listings = await db.operator_dive_listings.find({}, {"_id": 0, "created_at": 1, "type": 1, "country": 1}).to_list(10000)
    type_dist = {}
    country_dist = {}
    for listing in all_listings:
        t = listing.get("type", "unknown")
        type_dist[t] = type_dist.get(t, 0) + 1
        c = listing.get("country", "Unknown")
        country_dist[c] = country_dist.get(c, 0) + 1
    sorted_signups = sorted(daily_signups.items())
    sorted_bookings = sorted(daily_bookings.items())
    sorted_revenue = sorted(daily_revenue.items())
    return {
        "daily_signups": [{"date": d, "count": c} for d, c in sorted_signups],
        "daily_bookings": [{"date": d, "count": c} for d, c in sorted_bookings],
        "daily_revenue": [{"date": d, "revenue": r} for d, r in sorted_revenue],
        "role_distribution": [{"role": k, "count": v} for k, v in role_dist.items()],
        "onboarding_funnel": onboarding_funnel,
        "listing_type_distribution": [{"type": k, "count": v} for k, v in type_dist.items()],
        "country_distribution": sorted([{"country": k, "count": v} for k, v in country_dist.items()], key=lambda x: -x["count"])[:15],
    }


@router.get("/admin/analytics/engagement")
async def get_engagement_analytics(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    wl_pipeline = [{"$group": {"_id": "$listing_id", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]
    top_wishlisted = await db.wishlists.aggregate(wl_pipeline).to_list(10)
    for item in top_wishlisted:
        listing = await db.operator_dive_listings.find_one({"id": item["_id"]}, {"_id": 0, "title": 1, "name": 1})
        item["name"] = (listing.get("title") or listing.get("name")) if listing else "Unknown"
        item["listing_id"] = item.pop("_id")
    rv_pipeline = [{"$group": {"_id": "$listing_id", "count": {"$sum": 1}, "avg_rating": {"$avg": "$rating"}}}, {"$sort": {"count": -1}}, {"$limit": 10}]
    top_reviewed = await db.reviews.aggregate(rv_pipeline).to_list(10)
    for item in top_reviewed:
        listing = await db.operator_dive_listings.find_one({"id": item["_id"]}, {"_id": 0, "title": 1, "name": 1})
        item["name"] = (listing.get("title") or listing.get("name")) if listing else "Unknown"
        item["listing_id"] = item.pop("_id")
        item["avg_rating"] = round(item.get("avg_rating", 0), 1)
    bk_pipeline = [{"$group": {"_id": "$listing_id", "count": {"$sum": 1}, "revenue": {"$sum": "$total_price"}}}, {"$sort": {"count": -1}}, {"$limit": 10}]
    top_booked = await db.bookings.aggregate(bk_pipeline).to_list(10)
    for item in top_booked:
        listing = await db.operator_dive_listings.find_one({"id": item["_id"]}, {"_id": 0, "title": 1, "name": 1})
        item["name"] = (listing.get("title") or listing.get("name")) if listing else "Unknown"
        item["listing_id"] = item.pop("_id")
    click_pipeline = [{"$match": {"event_type": "listing_click"}}, {"$group": {"_id": "$data.listing_id", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]
    top_clicked = await db.analytics_events.aggregate(click_pipeline).to_list(10)
    for item in top_clicked:
        if item["_id"]:
            listing = await db.operator_dive_listings.find_one({"id": item["_id"]}, {"_id": 0, "title": 1, "name": 1})
            item["name"] = (listing.get("title") or listing.get("name")) if listing else "Unknown"
        else:
            item["name"] = "Unknown"
        item["listing_id"] = item.pop("_id")
    search_pipeline = [{"$match": {"event_type": "search"}}, {"$group": {"_id": "$data.query", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 15}]
    top_searches = await db.analytics_events.aggregate(search_pipeline).to_list(15)
    top_searches = [{"term": s["_id"], "count": s["count"]} for s in top_searches if s["_id"]]
    pv_pipeline = [{"$match": {"event_type": "page_view"}}, {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}}, {"$sort": {"_id": 1}}]
    daily_views = await db.analytics_events.aggregate(pv_pipeline).to_list(60)
    daily_views = [{"date": d["_id"], "count": d["count"]} for d in daily_views]
    return {
        "top_wishlisted": top_wishlisted, "top_reviewed": top_reviewed,
        "top_booked": top_booked, "top_clicked": top_clicked,
        "top_searches": top_searches, "daily_page_views": daily_views,
    }


@router.get("/admin/analytics/bookings")
async def get_booking_analytics(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    all_bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for b in all_bookings:
        user = await db.users.find_one({"id": b.get("user_id")}, {"_id": 0, "name": 1, "email": 1})
        b["user_name"] = user["name"] if user else "Unknown"
        b["user_email"] = user["email"] if user else ""
        listing = await db.operator_dive_listings.find_one({"id": b.get("listing_id")}, {"_id": 0, "title": 1, "name": 1})
        b["listing_name"] = (listing.get("title") or listing.get("name")) if listing else b.get("listing_name", "Unknown")
    status_dist = {}
    for b in all_bookings:
        s = b.get("status", "unknown")
        status_dist[s] = status_dist.get(s, 0) + 1
    return {"bookings": all_bookings, "status_distribution": [{"status": k, "count": v} for k, v in status_dist.items()]}


@router.get("/admin/pending-users")
async def get_pending_users(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    users = await db.users.find({"status": "pending_approval"}, {"_id": 0}).to_list(100)
    return {"users": users}


@router.put("/admin/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    result = await db.users.update_one({"id": user_id}, {"$set": {"status": "active"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User approved"}


@router.put("/admin/users/{user_id}/reject")
async def reject_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    await db.users.update_one({"id": user_id}, {"$set": {"status": "rejected"}})
    return {"message": "User rejected"}


@router.get("/admin/pending-listings")
async def get_pending_listings(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    listings = await db.operator_dive_listings.find({"status": "pending"}, {"_id": 0}).to_list(100)
    return {"listings": listings}


@router.put("/admin/listings/{listing_id}/approve")
async def approve_listing(listing_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    await db.operator_dive_listings.update_one({"id": listing_id}, {"$set": {"status": "active"}})
    if listing and listing.get("operator_id"):
        title = listing.get("title") or listing.get("name") or ""
        await create_notification(listing["operator_id"], "listing_approved", "Listing Approved", f'Your listing "{title}" has been approved and is now live!', {"listing_id": listing_id})
    return {"message": "Listing approved"}


@router.put("/admin/listings/{listing_id}/reject")
async def reject_listing(listing_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    await db.operator_dive_listings.update_one({"id": listing_id}, {"$set": {"status": "rejected"}})
    if listing and listing.get("operator_id"):
        title = listing.get("title") or listing.get("name") or ""
        await create_notification(listing["operator_id"], "listing_rejected", "Listing Rejected", f'Your listing "{title}" was not approved', {"listing_id": listing_id})
    return {"message": "Listing rejected"}


@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user), role: Optional[str] = Query(None), status: Optional[str] = Query(None), search: Optional[str] = Query(None)):
    await require_admin(current_user)
    query = {}
    if role:
        query["role"] = role
    if status:
        query["status"] = status
    if search:
        query["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"email": {"$regex": search, "$options": "i"}}]
    users = await db.users.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"users": users}


@router.put("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    await db.users.update_one({"id": user_id}, {"$set": {"status": "suspended"}})
    return {"message": "User suspended"}


@router.put("/admin/users/{user_id}/activate")
async def activate_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    await db.users.update_one({"id": user_id}, {"$set": {"status": "active"}})
    return {"message": "User activated"}


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.connections.delete_many({"$or": [{"from_id": user_id}, {"to_id": user_id}]})
    return {"message": "User deleted"}


@router.get("/admin/listings")
async def get_all_listings(current_user: dict = Depends(get_current_user), status: Optional[str] = Query(None), search: Optional[str] = Query(None)):
    await require_admin(current_user)
    query = {}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [{"title": {"$regex": search, "$options": "i"}}, {"location": {"$regex": search, "$options": "i"}}]
    raw = await db.operator_dive_listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    from listing_normalize import normalize_rich_listing
    listings = [normalize_rich_listing(d) for d in raw]
    return {"listings": listings}


@router.delete("/admin/listings/{listing_id}")
async def delete_listing_admin(listing_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    result = await db.operator_dive_listings.delete_one({"id": listing_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"message": "Listing deleted"}


@router.post("/admin/campaigns")
async def create_campaign(req: CampaignCreateRequest, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    campaign = {
        "id": str(uuid.uuid4()),
        "campaign_name": req.campaign_name,
        "source": req.source, "medium": req.medium,
        "content": req.content, "term": req.term,
        "destination": req.destination,
        "operator_id": req.operator_id,
        "spend": req.spend, "notes": req.notes,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.utm_campaigns.insert_one(campaign.copy())
    return campaign


@router.get("/admin/campaigns")
async def list_campaigns(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    campaigns = await db.utm_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"campaigns": campaigns}


@router.delete("/admin/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    await db.utm_campaigns.delete_one({"id": campaign_id})
    return {"ok": True}


@router.post("/reports")
async def create_report(req: ReportCreateRequest, current_user: dict = Depends(get_current_user)):
    reported = await db.users.find_one({"id": req.reported_id}, {"_id": 0, "id": 1, "name": 1, "role": 1})
    if not reported:
        raise HTTPException(status_code=404, detail="User not found")
    report = {
        "id": str(uuid.uuid4()),
        "reporter_id": current_user["id"],
        "reporter_name": current_user["name"],
        "reported_id": req.reported_id,
        "reported_name": reported["name"],
        "reported_role": reported.get("role", ""),
        "reason": req.reason,
        "details": req.details or "",
        "context_type": req.context_type,
        "context_id": req.context_id,
        "status": "pending",
        "admin_notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reports.insert_one(report.copy())
    return {"message": "Report submitted", "id": report["id"]}


@router.get("/admin/reports")
async def get_reports(current_user: dict = Depends(get_current_user), status: Optional[str] = Query(None)):
    await require_admin(current_user)
    query = {}
    if status:
        query["status"] = status
    reports = await db.reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"reports": reports, "reasons": REPORT_REASONS}


@router.put("/admin/reports/{report_id}")
async def update_report(report_id: str, action: str = Query(...), notes: str = Query(""), current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    if action not in ("dismiss", "warn", "suspend"):
        raise HTTPException(status_code=400, detail="Invalid action")
    report = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    new_status = "dismissed" if action == "dismiss" else "action_taken"
    await db.reports.update_one({"id": report_id}, {"$set": {"status": new_status, "admin_notes": notes, "resolved_by": current_user["id"], "resolved_at": datetime.now(timezone.utc).isoformat()}})
    if action == "warn":
        await create_notification(report["reported_id"], "warning", "Account Warning", f"Your account has been flagged for: {report['reason']}. Please review our community guidelines.", {})
    elif action == "suspend":
        await db.users.update_one({"id": report["reported_id"]}, {"$set": {"status": "suspended"}})
        await create_notification(report["reported_id"], "suspended", "Account Suspended", f"Your account has been suspended for: {report['reason']}.", {})
    return {"message": f"Report {action}ed"}


@router.post("/admin/listings")
async def admin_create_listing(data: ListingCreate, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    now = datetime.now(timezone.utc).isoformat()
    listing = {
        "id": str(uuid.uuid4()),
        "operator_id": current_user["id"],
        **data.model_dump(),
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    await db.operator_dive_listings.insert_one(listing.copy())
    return listing


@router.put("/admin/listings/{listing_id}/edit")
async def admin_edit_listing(listing_id: str, current_user: dict = Depends(get_current_user), data: dict = None):
    await require_admin(current_user)
    data = data or {}
    existing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Listing not found")
    data.pop("id", None)
    data.pop("_id", None)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.operator_dive_listings.update_one({"id": listing_id}, {"$set": data})
    updated = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    return updated


@router.post("/utm/capture")
async def utm_capture(req: UTMCaptureRequest) -> dict:
    rid = await marketing_engine.capture_utm(db, req.model_dump())
    return {"ok": True, "id": rid}


@router.post("/utm/link-user")
async def utm_link_user(visitor_id: str = "", user_id: str = "") -> dict:
    if visitor_id and user_id:
        await marketing_engine.link_utm_to_user(db, visitor_id, user_id)
    return {"ok": True}
