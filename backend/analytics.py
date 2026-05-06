"""
BT-COMMAND Analytics Engine
Optimized MongoDB aggregation pipelines for all Command Centre sections.
Every metric maps to: feature → usage → value → money → risk.
"""
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase

TAKE_RATE = 0.15  # 15% platform commission


async def _agg_sum(collection, match: dict, field: str) -> float:
    """Helper: aggregate sum of a field with optional match."""
    pipe = []
    if match:
        pipe.append({"$match": match})
    pipe.append({"$group": {"_id": None, "total": {"$sum": f"${field}"}}})
    res = await collection.aggregate(pipe).to_list(1)
    return res[0]["total"] if res else 0


async def executive_pulse(db: AsyncIOMotorDatabase, days: int = 30) -> dict:
    """Section 1: Platform Pulse — health in 60 seconds"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    mtd_start = now.replace(day=1).isoformat()
    d7 = (now - timedelta(days=7)).isoformat()
    d1 = (now - timedelta(days=1)).isoformat()

    # Core counts (parallel-safe since Motor handles async)
    active_divers = await db.users.count_documents({"role": "diver", "status": "active"})
    active_shops = await db.users.count_documents({"role": "operator", "status": "active"})
    active_instructors = await db.users.count_documents({"role": "instructor", "status": "active"})
    total_users = await db.users.count_documents({})

    # Bookings
    bookings_today = await db.bookings.count_documents({"created_at": {"$regex": f"^{today}"}})
    bookings_mtd = await db.bookings.count_documents({"created_at": {"$gte": mtd_start}})
    bookings_7d = await db.bookings.count_documents({"created_at": {"$gte": d7}})
    total_bookings = await db.bookings.count_documents({})

    # Revenue
    gbv = await _agg_sum(db.bookings, {}, "price")
    gbv_mtd = await _agg_sum(db.bookings, {"created_at": {"$gte": mtd_start}}, "price")
    shop_revenue = await _agg_sum(db.products, {}, "price")  # simplified; full calc uses $multiply

    shop_pipe = [{"$group": {"_id": None, "rev": {"$sum": {"$multiply": ["$price", "$sold_count"]}}}}]
    shop_res = await db.products.aggregate(shop_pipe).to_list(1)
    shop_revenue = shop_res[0]["rev"] if shop_res else 0

    cancelled = await db.bookings.count_documents({"status": "cancelled"})
    refund_rate = (cancelled / total_bookings * 100) if total_bookings > 0 else 0

    # Recent activity
    activity_24h = {
        "users": await db.users.count_documents({"created_at": {"$gte": d1}}),
        "bookings": await db.bookings.count_documents({"created_at": {"$gte": d1}}),
        "messages": await db.messages.count_documents({"created_at": {"$gte": d1}}),
        "reviews": await db.reviews.count_documents({"created_at": {"$gte": d1}}),
    }
    activity_7d = {
        "users": await db.users.count_documents({"created_at": {"$gte": d7}}),
        "listings": await db.listings.count_documents({"created_at": {"$gte": d7}}),
        "bookings": bookings_7d,
    }

    # Pending items
    action_required = {
        "pending_users": await db.users.count_documents({"status": "pending_approval"}),
        "pending_listings": await db.listings.count_documents({"status": "pending"}),
        "pending_reports": await db.reports.count_documents({"status": "pending"}),
    }

    return {
        "active_divers": active_divers, "active_shops": active_shops,
        "active_instructors": active_instructors, "total_users": total_users,
        "bookings_today": bookings_today, "bookings_mtd": bookings_mtd,
        "bookings_7d": bookings_7d, "total_bookings": total_bookings,
        "gbv": gbv, "gbv_mtd": gbv_mtd, "net_revenue": round(gbv * TAKE_RATE, 2),
        "shop_revenue": round(shop_revenue, 2),
        "refund_rate": round(refund_rate, 1), "cancelled_bookings": cancelled,
        "changes_24h": activity_24h, "changes_7d": activity_7d,
        "action_required": action_required,
    }


async def _listing_supply(db: AsyncIOMotorDatabase) -> dict:
    """Helper: group listings by type and status."""
    type_pipe = [{"$group": {"_id": {"type": "$type", "status": "$status"}, "count": {"$sum": 1}}}]
    type_dist = await db.listings.aggregate(type_pipe).to_list(100)
    supply: dict = {}
    for t in type_dist:
        tp = t["_id"]["type"] or "unknown"
        st = t["_id"]["status"] or "unknown"
        if tp not in supply:
            supply[tp] = {"active": 0, "pending": 0, "total": 0}
        supply[tp][st] = supply[tp].get(st, 0) + t["count"]
        supply[tp]["total"] += t["count"]
    return supply


async def _conversion_funnel(db: AsyncIOMotorDatabase) -> dict:
    """Helper: build search → view → book funnel."""
    searches = await db.analytics_events.count_documents({"event_type": "search"})
    listing_views = await db.analytics_events.count_documents({"event_type": {"$in": ["listing_click", "page_view"]}})
    total_bookings = await db.bookings.count_documents({})
    return {
        "searches": searches, "listing_views": listing_views, "bookings": total_bookings,
        "search_to_view": round(listing_views / searches * 100, 1) if searches > 0 else 0,
        "view_to_book": round(total_bookings / listing_views * 100, 1) if listing_views > 0 else 0,
    }


async def discover_marketplace(db: AsyncIOMotorDatabase) -> dict:
    """Section 2: Discover & Booking Marketplace"""
    supply = await _listing_supply(db)
    funnel = await _conversion_funnel(db)

    # Demand: bookings by type
    bk_by_type = await db.bookings.aggregate([{"$group": {"_id": "$listing_type", "bookings": {"$sum": 1}, "revenue": {"$sum": "$price"}}}]).to_list(50)
    demand = {b["_id"]: {"bookings": b["bookings"], "revenue": b["revenue"]} for b in bk_by_type if b["_id"]}

    # Cancellation & reviews
    total_bookings = funnel["bookings"]
    cancelled = await db.bookings.count_documents({"status": "cancelled"})
    cancel_rate = round(cancelled / total_bookings * 100, 1) if total_bookings > 0 else 0

    reviewed_listings = len(set([r["listing_id"] for r in await db.reviews.find({}, {"_id": 0, "listing_id": 1}).to_list(1000)]))
    total_listings = await db.listings.count_documents({"status": "active"})
    review_coverage = round(reviewed_listings / total_listings * 100, 1) if total_listings > 0 else 0

    avg_rating = await _avg_review_rating(db, [])  # all reviews
    top_booked = await db.bookings.aggregate([{"$group": {"_id": "$listing_id", "name": {"$first": "$listing_name"}, "count": {"$sum": 1}, "revenue": {"$sum": "$price"}}}, {"$sort": {"count": -1}}, {"$limit": 10}]).to_list(10)
    price_by_country = await db.listings.aggregate([{"$match": {"status": "active"}}, {"$group": {"_id": "$country", "avg_price": {"$avg": "$price"}, "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]).to_list(10)

    return {
        "supply": supply, "demand": demand, "funnel": funnel,
        "cancel_rate": cancel_rate, "review_coverage": review_coverage,
        "avg_rating": avg_rating, "top_booked": top_booked,
        "price_by_country": [{"country": p["_id"], "avg_price": round(p["avg_price"], 2), "listings": p["count"]} for p in price_by_country],
    }


async def dive_pathway(db: AsyncIOMotorDatabase) -> dict:
    """Section 3: Dive Pathway & Learning"""
    # Certification distribution
    cert_pipe = [{"$match": {"certification_level": {"$ne": None}}}, {"$group": {"_id": "$certification_level", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
    cert_dist = await db.users.aggregate(cert_pipe).to_list(20)

    # Dive log stats
    total_logs = await db.dive_logs.count_documents({})
    users_with_logs = len(set([d["user_id"] for d in await db.dive_logs.find({}, {"_id": 0, "user_id": 1}).to_list(10000)]))
    total_divers = await db.users.count_documents({"role": "diver"})
    log_adoption = round(users_with_logs / total_divers * 100, 1) if total_divers > 0 else 0

    # Avg dives per logger
    avg_dives = round(total_logs / users_with_logs, 1) if users_with_logs > 0 else 0

    # Depth/duration stats
    depth_pipe = [{"$group": {"_id": None, "avg_depth": {"$avg": "$max_depth"}, "max_depth": {"$max": "$max_depth"}, "avg_duration": {"$avg": "$duration"}}}]
    depth_res = await db.dive_logs.aggregate(depth_pipe).to_list(1)
    dive_stats = depth_res[0] if depth_res else {"avg_depth": 0, "max_depth": 0, "avg_duration": 0}

    # Onboarding completion
    onboarded = await db.users.count_documents({"onboarding_complete": True})
    onboard_rate = round(onboarded / total_divers * 100, 1) if total_divers > 0 else 0

    # Pathway → booking (users who completed onboarding AND booked)
    onboarded_users = [u["id"] for u in await db.users.find({"onboarding_complete": True}, {"_id": 0, "id": 1}).to_list(10000)]
    booked_users = set([b["user_id"] for b in await db.bookings.find({}, {"_id": 0, "user_id": 1}).to_list(10000)])
    pathway_to_booking = len([u for u in onboarded_users if u in booked_users])

    return {
        "certification_distribution": [{"level": c["_id"], "count": c["count"]} for c in cert_dist],
        "total_logs": total_logs, "users_with_logs": users_with_logs,
        "log_adoption_pct": log_adoption, "avg_dives_per_logger": avg_dives,
        "dive_stats": {"avg_depth": round(dive_stats.get("avg_depth") or 0, 1), "max_depth": round(dive_stats.get("max_depth") or 0, 1), "avg_duration": round(dive_stats.get("avg_duration") or 0, 1)},
        "onboard_rate": onboard_rate, "onboarded": onboarded,
        "pathway_to_booking": pathway_to_booking, "total_divers": total_divers,
    }


async def commerce_shop(db: AsyncIOMotorDatabase) -> dict:
    """Section 4: Commerce — Shop"""
    # Product performance
    products = await db.products.find({}, {"_id": 0}).to_list(100)
    total_revenue = sum(p["price"] * p.get("sold_count", 0) for p in products)
    total_units = sum(p.get("sold_count", 0) for p in products)
    active_products = len([p for p in products if p.get("status") == "active"])
    out_of_stock = len([p for p in products if not p.get("in_stock", True)])

    # AOV approximation (total revenue / estimated orders based on avg 1.5 items per order)
    est_orders = max(total_units / 1.5, 1)
    aov = round(total_revenue / est_orders, 2)

    # Category breakdown
    cat_map = {}
    for p in products:
        cat = p.get("category", "other")
        if cat not in cat_map:
            cat_map[cat] = {"revenue": 0, "units": 0, "products": 0}
        cat_map[cat]["revenue"] += p["price"] * p.get("sold_count", 0)
        cat_map[cat]["units"] += p.get("sold_count", 0)
        cat_map[cat]["products"] += 1

    # Cart analysis
    carts = await db.carts.find({}, {"_id": 0}).to_list(1000)
    active_carts = len([c for c in carts if c.get("items")])
    total_cart_value = 0
    for c in carts:
        for item in (c.get("items") or []):
            total_cart_value += item.get("price", 0) * item.get("quantity", 1)

    # Top sellers
    top = sorted(products, key=lambda p: p.get("sold_count", 0), reverse=True)[:5]

    return {
        "total_revenue": round(total_revenue, 2), "total_units": total_units,
        "active_products": active_products, "out_of_stock": out_of_stock,
        "aov": aov,
        "categories": [{"category": k, **v} for k, v in cat_map.items()],
        "active_carts": active_carts, "cart_value": round(total_cart_value, 2),
        "top_sellers": [{"name": p["name"], "sold": p.get("sold_count", 0), "revenue": round(p["price"] * p.get("sold_count", 0), 2)} for p in top],
    }


async def community_social(db: AsyncIOMotorDatabase) -> dict:
    """Section 5: Community & Social Graph"""
    total_connections = await db.connections.count_documents({"status": "accepted"})
    pending_requests = await db.connections.count_documents({"status": "pending"})
    total_divers = await db.users.count_documents({"role": "diver"})

    # Avg connections per diver
    conn_pipe = [{"$match": {"status": "accepted"}}, {"$group": {"_id": "$from_id", "count": {"$sum": 1}}}, {"$group": {"_id": None, "avg": {"$avg": "$count"}}}]
    conn_avg_res = await db.connections.aggregate(conn_pipe).to_list(1)
    avg_connections = round(conn_avg_res[0]["avg"], 1) if conn_avg_res else 0

    # Connected users who booked vs solo
    connected_ids = set()
    async for c in db.connections.find({"status": "accepted"}, {"_id": 0, "from_id": 1, "to_id": 1}):
        connected_ids.add(c["from_id"])
        connected_ids.add(c.get("to_id"))

    booked_ids = set([b["user_id"] for b in await db.bookings.find({}, {"_id": 0, "user_id": 1}).to_list(10000)])
    connected_booked = len(connected_ids & booked_ids)
    solo_booked = len(booked_ids - connected_ids)

    # Users with certifications displayed
    with_certs = await db.users.count_documents({"certification_level": {"$ne": None, "$exists": True}})

    # Wishlists
    total_wishlists = await db.wishlists.count_documents({})

    return {
        "total_connections": total_connections, "pending_requests": pending_requests,
        "avg_connections": avg_connections, "total_divers": total_divers,
        "connected_who_booked": connected_booked, "solo_who_booked": solo_booked,
        "with_certifications": with_certs, "total_wishlists": total_wishlists,
    }


async def chat_communication(db: AsyncIOMotorDatabase) -> dict:
    """Section 6: Chat & Communication"""
    total_threads = await db.threads.count_documents({})
    dm_threads = await db.threads.count_documents({"type": "direct"})
    group_threads = await db.threads.count_documents({"type": "group"})
    total_messages = await db.messages.count_documents({})
    unread = await db.messages.count_documents({"read": False})

    # Avg messages per thread
    msg_pipe = [{"$group": {"_id": "$thread_id", "count": {"$sum": 1}}}, {"$group": {"_id": None, "avg": {"$avg": "$count"}}}]
    msg_avg = await db.messages.aggregate(msg_pipe).to_list(1)
    avg_per_thread = round(msg_avg[0]["avg"], 1) if msg_avg else 0

    # Chat → booking correlation
    booking_threads = await db.messages.distinct("thread_id", {"booking_id": {"$ne": None, "$exists": True}})
    chat_to_booking = len(booking_threads)

    return {
        "total_threads": total_threads, "dm_threads": dm_threads,
        "group_threads": group_threads, "total_messages": total_messages,
        "unread_messages": unread, "avg_per_thread": avg_per_thread,
        "chat_to_booking": chat_to_booking,
    }


async def events_meetups(db: AsyncIOMotorDatabase) -> dict:
    """Section 7: Events & Meetups"""
    events = await db.events.find({}, {"_id": 0}).to_list(500)
    total_events = len(events)
    live_events = len([e for e in events if e.get("status") == "active"])

    total_rsvps = sum(len(e.get("attendees", [])) for e in events)
    total_capacity = sum(e.get("max_attendees", 0) for e in events)
    capacity_util = round(total_rsvps / total_capacity * 100, 1) if total_capacity > 0 else 0

    # By type
    type_map = {}
    for e in events:
        t = e.get("event_type", "other")
        if t not in type_map:
            type_map[t] = {"count": 0, "rsvps": 0}
        type_map[t]["count"] += 1
        type_map[t]["rsvps"] += len(e.get("attendees", []))

    # By location
    loc_map = {}
    for e in events:
        loc = e.get("location", "Unknown")
        loc_map[loc] = loc_map.get(loc, 0) + 1

    # Avg RSVPs per event
    avg_rsvps = round(total_rsvps / total_events, 1) if total_events > 0 else 0

    return {
        "total_events": total_events, "live_events": live_events,
        "total_rsvps": total_rsvps, "capacity_utilization": capacity_util,
        "avg_rsvps": avg_rsvps,
        "by_type": [{"type": k, **v} for k, v in type_map.items()],
        "by_location": sorted([{"location": k, "count": v} for k, v in loc_map.items()], key=lambda x: -x["count"])[:10],
    }


async def _daily_revenue_trend(db: AsyncIOMotorDatabase) -> list:
    """Helper: compute daily revenue from all bookings."""
    bookings = await db.bookings.find({}, {"_id": 0, "created_at": 1, "price": 1}).to_list(10000)
    daily: dict = {}
    for b in bookings:
        day = (b.get("created_at", "") or "")[:10]
        if day:
            daily[day] = daily.get(day, 0) + (b.get("price") or 0)
    return sorted([{"date": d, "revenue": round(r, 2)} for d, r in daily.items()], key=lambda x: x["date"])


async def revenue_economics(db: AsyncIOMotorDatabase) -> dict:
    """Section 8: Revenue & Unit Economics"""
    booking_gbv = await _agg_sum(db.bookings, {}, "price")
    booking_commission = booking_gbv * TAKE_RATE

    products = await db.products.find({}, {"_id": 0, "price": 1, "sold_count": 1}).to_list(100)
    shop_revenue = sum(p["price"] * p.get("sold_count", 0) for p in products)
    total_revenue = booking_commission + shop_revenue

    total_divers = await db.users.count_documents({"role": "diver"})
    total_shops = await db.users.count_documents({"role": {"$in": ["operator", "instructor"]}})

    rev_by_type = await db.bookings.aggregate([{"$group": {"_id": "$listing_type", "revenue": {"$sum": "$price"}, "bookings": {"$sum": 1}}}, {"$sort": {"revenue": -1}}]).to_list(50)

    return {
        "total_revenue": round(total_revenue, 2),
        "booking_commission": round(booking_commission, 2),
        "shop_revenue": round(shop_revenue, 2),
        "booking_gbv": round(booking_gbv, 2),
        "take_rate": TAKE_RATE * 100,
        "rev_per_diver": round(total_revenue / total_divers, 2) if total_divers > 0 else 0,
        "rev_per_shop": round(booking_gbv / total_shops, 2) if total_shops > 0 else 0,
        "total_divers": total_divers, "total_shops": total_shops,
        "revenue_by_type": [{"type": r["_id"] or "other", "revenue": round(r["revenue"], 2), "bookings": r["bookings"]} for r in rev_by_type],
        "daily_revenue": await _daily_revenue_trend(db),
    }


async def cashflow_payments(db: AsyncIOMotorDatabase) -> dict:
    """Section 9: Cash Flow & Payments"""
    # Payments
    payments = await db.payment_transactions.find({}, {"_id": 0}).to_list(1000)
    captured = [p for p in payments if p.get("payment_status") == "paid"]
    failed = [p for p in payments if p.get("status") == "failed"]
    pending = [p for p in payments if p.get("status") == "pending"]

    total_captured = sum(p.get("amount", 0) for p in captured)
    total_failed = sum(p.get("amount", 0) for p in failed)
    total_pending = sum(p.get("amount", 0) for p in pending)

    # Refunds (cancelled bookings)
    cancelled_bookings = await db.bookings.find({"status": "cancelled"}, {"_id": 0, "price": 1}).to_list(1000)
    total_refunds = sum(b.get("price", 0) for b in cancelled_bookings)

    # Booking status distribution (for settlement estimation)
    status_pipe = [{"$group": {"_id": "$status", "count": {"$sum": 1}, "value": {"$sum": "$price"}}}]
    status_dist = await db.bookings.aggregate(status_pipe).to_list(10)

    return {
        "captured": round(total_captured, 2), "captured_count": len(captured),
        "failed": round(total_failed, 2), "failed_count": len(failed),
        "pending": round(total_pending, 2), "pending_count": len(pending),
        "refunds": round(total_refunds, 2), "refund_count": len(cancelled_bookings),
        "booking_status": [{"status": s["_id"], "count": s["count"], "value": round(s["value"], 2)} for s in status_dist],
    }


async def trust_safety(db: AsyncIOMotorDatabase) -> dict:
    """Section 10: Trust, Safety & Compliance"""
    # Reports
    total_reports = await db.reports.count_documents({})
    pending_reports = await db.reports.count_documents({"status": "pending"})
    actioned_reports = await db.reports.count_documents({"status": "action_taken"})
    dismissed_reports = await db.reports.count_documents({"status": "dismissed"})

    # By reason
    reason_pipe = [{"$group": {"_id": "$reason", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
    by_reason = await db.reports.aggregate(reason_pipe).to_list(10)

    # Suspended users
    suspended = await db.users.count_documents({"status": "suspended"})

    # High-risk operators: operators with cancelled bookings
    cancel_pipe = [{"$match": {"status": "cancelled", "operator_id": {"$ne": None}}}, {"$group": {"_id": "$operator_id", "cancels": {"$sum": 1}}}, {"$sort": {"cancels": -1}}, {"$limit": 5}]
    high_cancel = await db.bookings.aggregate(cancel_pipe).to_list(5)
    for h in high_cancel:
        user = await db.users.find_one({"id": h["_id"]}, {"_id": 0, "name": 1})
        h["name"] = user["name"] if user else "Unknown"
        h["operator_id"] = h.pop("_id")

    # Low-rated listings
    low_pipe = [{"$group": {"_id": "$listing_id", "avg_rating": {"$avg": "$rating"}, "count": {"$sum": 1}}}, {"$match": {"avg_rating": {"$lt": 3}}}, {"$sort": {"avg_rating": 1}}, {"$limit": 5}]
    low_rated = await db.reviews.aggregate(low_pipe).to_list(5)
    for entry in low_rated:
        listing = await db.listings.find_one({"id": entry["_id"]}, {"_id": 0, "name": 1})
        entry["name"] = listing["name"] if listing else "Unknown"
        entry["listing_id"] = entry.pop("_id")

    # Recent reports
    recent = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)

    return {
        "total_reports": total_reports, "pending": pending_reports,
        "actioned": actioned_reports, "dismissed": dismissed_reports,
        "suspended_users": suspended,
        "by_reason": [{"reason": r["_id"], "count": r["count"]} for r in by_reason],
        "high_cancel_operators": high_cancel,
        "low_rated_listings": [{"name": entry["name"], "listing_id": entry["listing_id"], "avg_rating": round(entry["avg_rating"], 1), "reviews": entry["count"]} for entry in low_rated],
        "recent_reports": recent,
    }


async def platform_performance(db: AsyncIOMotorDatabase) -> dict:
    """Section 11: Platform Performance"""
    # Basic health check
    collections = await db.list_collection_names()
    total_docs = 0
    coll_sizes = {}
    for c in collections:
        count = await db[c].count_documents({})
        total_docs += count
        coll_sizes[c] = count

    # Analytics events by type
    event_pipe = [{"$group": {"_id": "$event_type", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
    event_dist = await db.analytics_events.aggregate(event_pipe).to_list(20)

    # Notifications delivery
    total_notif = await db.notifications.count_documents({})
    read_notif = await db.notifications.count_documents({"read": True})
    read_rate = round(read_notif / total_notif * 100, 1) if total_notif > 0 else 0

    return {
        "database_collections": len(collections),
        "total_documents": total_docs,
        "collection_sizes": sorted([{"name": k, "docs": v} for k, v in coll_sizes.items()], key=lambda x: -x["docs"]),
        "event_distribution": [{"type": e["_id"], "count": e["count"]} for e in event_dist],
        "notifications": {"total": total_notif, "read": read_notif, "read_rate": read_rate},
    }


def _alert(alert_id: str, severity: str, title: str, message: str, metric: float, threshold: float, section: str) -> dict:
    """Helper: build a standardized alert dict."""
    return {"id": alert_id, "severity": severity, "title": title, "message": message, "metric": metric, "threshold": threshold, "section": section}


async def _check_refund_rate(db: AsyncIOMotorDatabase) -> list:
    total = await db.bookings.count_documents({})
    cancelled = await db.bookings.count_documents({"status": "cancelled"})
    if total == 0:
        return []
    rate = cancelled / total * 100
    if rate <= 5:
        return []
    return [_alert("high_refund_rate", "critical" if rate > 15 else "warning",
                    "High Refund Rate", f"Refund rate at {round(rate, 1)}% (threshold: 5%)", round(rate, 1), 5, "cashflow")]


async def _check_revenue_decline(db: AsyncIOMotorDatabase) -> list:
    now = datetime.now(timezone.utc)
    d7 = (now - timedelta(days=7)).isoformat()
    d14 = (now - timedelta(days=14)).isoformat()
    recent_rev = await _agg_sum(db.bookings, {"created_at": {"$gte": d7}}, "price")
    prev_rev = await _agg_sum(db.bookings, {"created_at": {"$gte": d14, "$lt": d7}}, "price")
    if prev_rev <= 0:
        return []
    decline_pct = round((prev_rev - recent_rev) / prev_rev * 100, 1)
    if decline_pct <= 20:
        return []
    return [_alert("revenue_decline", "critical",
                    "Revenue Decline", f"Revenue dropped {decline_pct}% WoW (${round(recent_rev,2)} vs ${round(prev_rev,2)})", decline_pct, 20, "revenue")]


async def _check_payment_failures(db: AsyncIOMotorDatabase) -> list:
    failed = await db.payment_transactions.count_documents({"status": "failed"})
    total = await db.payment_transactions.count_documents({})
    if total == 0:
        return []
    rate = round(failed / total * 100, 1)
    if rate <= 5:
        return []
    return [_alert("payment_failures", "critical" if rate > 15 else "warning",
                    "Payment Failure Rate", f"{rate}% of payments failing ({failed}/{total})", rate, 5, "cashflow")]


async def compute_alerts(db: AsyncIOMotorDatabase) -> dict:
    """Compute active alerts based on metric thresholds."""
    alerts = []

    alerts.extend(await _check_refund_rate(db))
    alerts.extend(await _check_revenue_decline(db))
    alerts.extend(await _check_payment_failures(db))

    # Simple threshold checks
    pending_reports = await db.reports.count_documents({"status": "pending"})
    if pending_reports > 5:
        alerts.append(_alert("pending_reports", "warning", "Unresolved Reports", f"{pending_reports} reports awaiting review", pending_reports, 5, "trust"))

    oos = await db.products.count_documents({"in_stock": False})
    if oos > 0:
        alerts.append(_alert("out_of_stock", "info", "Products Out of Stock", f"{oos} products currently out of stock", oos, 0, "shop"))

    pending_users = await db.users.count_documents({"status": "pending_approval"})
    if pending_users > 3:
        alerts.append(_alert("pending_approvals", "info", "Pending Approvals", f"{pending_users} users awaiting approval", pending_users, 3, "manage"))

    searches = await db.analytics_events.count_documents({"event_type": "search"})
    total_bookings = await db.bookings.count_documents({})
    if searches > 10:
        conv = round(total_bookings / searches * 100, 1)
        if conv < 2:
            alerts.append(_alert("low_conversion", "warning", "Low Search-to-Book Conversion", f"Only {conv}% of searches convert to bookings", conv, 2, "discover"))

    alerts.sort(key=lambda a: {"critical": 0, "warning": 1, "info": 2}.get(a["severity"], 3))
    return {"alerts": alerts, "count": len(alerts)}


def _revenue_by_type(bookings: list) -> list:
    """Helper: group bookings by listing type and sum revenue."""
    type_rev: dict = {}
    for b in bookings:
        t = b.get("listing_type", "other")
        type_rev.setdefault(t, {"bookings": 0, "revenue": 0})
        type_rev[t]["bookings"] += 1
        type_rev[t]["revenue"] += b.get("price", 0)
    return [{"type": k, "bookings": v["bookings"], "revenue": round(v["revenue"], 2)} for k, v in type_rev.items()]


async def _avg_review_rating(db: AsyncIOMotorDatabase, listing_ids: list) -> float:
    """Helper: compute average review rating for a set of listings."""
    match = {"listing_id": {"$in": listing_ids}} if listing_ids else {"listing_id": "__none__"}
    pipe = [{"$match": match}, {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
    res = await db.reviews.aggregate(pipe).to_list(1)
    return round(res[0]["avg"], 2) if res else 0


async def _available_countries(db: AsyncIOMotorDatabase) -> list:
    """Helper: list countries with active listings."""
    countries = await db.listings.aggregate([
        {"$match": {"status": "active"}},
        {"$group": {"_id": "$country", "listings": {"$sum": 1}, "avg_price": {"$avg": "$price"}}},
        {"$sort": {"listings": -1}}
    ]).to_list(50)
    return [{"country": c["_id"], "listings": c["listings"], "avg_price": round(c["avg_price"] or 0, 2)} for c in countries if c["_id"]]


async def drill_down_metrics(db: AsyncIOMotorDatabase, country: str = None) -> dict:
    """Drill-down: Global → Country level metrics."""
    listing_query = {"status": "active"}
    if country:
        listing_query["country"] = country

    listings = await db.listings.find(listing_query, {"_id": 0, "id": 1, "name": 1, "type": 1, "price": 1, "rating": 1, "country": 1, "location": 1, "operator_id": 1}).to_list(500)
    listing_ids = [item["id"] for item in listings]

    bk_query = {"listing_id": {"$in": listing_ids}} if listing_ids else {"listing_id": "__none__"}
    bookings = await db.bookings.find(bk_query, {"_id": 0, "price": 1, "status": 1, "listing_type": 1, "operator_id": 1}).to_list(10000)

    total_bookings = len(bookings)
    total_revenue = sum(b.get("price", 0) for b in bookings)
    cancelled = len([b for b in bookings if b.get("status") == "cancelled"])

    op_query = {"role": {"$in": ["operator", "instructor"]}, "status": "active"}
    if country:
        op_query["location_country"] = country
    operators = await db.users.find(op_query, {"_id": 0, "id": 1, "name": 1}).to_list(200)

    top_listings = sorted(listings, key=lambda item: item.get("rating", 0) or 0, reverse=True)[:10]

    return {
        "country": country, "total_listings": len(listings),
        "total_bookings": total_bookings, "total_revenue": round(total_revenue, 2),
        "cancelled": cancelled, "cancel_rate": round(cancelled / total_bookings * 100, 1) if total_bookings > 0 else 0,
        "avg_rating": await _avg_review_rating(db, listing_ids),
        "revenue_by_type": _revenue_by_type(bookings),
        "operators": [{"id": o["id"], "name": o["name"]} for o in operators],
        "top_listings": [{"id": item["id"], "name": item["name"], "type": item.get("type"), "price": item.get("price"), "rating": item.get("rating"), "location": item.get("location")} for item in top_listings],
        "available_countries": await _available_countries(db),
    }


async def user_growth_trends(db: AsyncIOMotorDatabase) -> dict:
    """Shared: User growth and role distribution"""
    all_users = await db.users.find({}, {"_id": 0, "created_at": 1, "role": 1, "onboarding_complete": 1, "location_country": 1}).to_list(10000)

    daily_signups = {}
    role_dist = {}
    country_dist = {}
    for u in all_users:
        ca = u.get("created_at", "")
        day = ca[:10] if isinstance(ca, str) else ""
        if day:
            daily_signups[day] = daily_signups.get(day, 0) + 1
        r = u.get("role", "unknown")
        role_dist[r] = role_dist.get(r, 0) + 1
        c = u.get("location_country") or "Unknown"
        country_dist[c] = country_dist.get(c, 0) + 1

    return {
        "daily_signups": sorted([{"date": d, "count": c} for d, c in daily_signups.items()], key=lambda x: x["date"]),
        "role_distribution": [{"role": k, "count": v} for k, v in role_dist.items()],
        "country_distribution": sorted([{"country": k, "count": v} for k, v in country_dist.items()], key=lambda x: -x["count"])[:15],
    }
