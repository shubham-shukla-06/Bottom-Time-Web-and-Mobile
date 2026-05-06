"""
BT-GROWTH Marketing Analytics Engine
Attribution, funnels, journeys, campaigns, operator attribution.
Every metric answers: "Where did they come from, what did they do, was it worth it?"
"""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

ATTRIBUTION_MODELS = ["first_touch", "last_touch", "linear", "time_decay"]


# ── UTM Capture ──────────────────────────────────────────────
async def capture_utm(db: AsyncIOMotorDatabase, data: dict) -> dict:
    """Store a UTM landing event. Called when user lands with UTM params."""
    record = {
        "id": str(uuid.uuid4()),
        "visitor_id": data.get("visitor_id"),  # anon fingerprint or user_id
        "user_id": data.get("user_id"),
        "utm_source": data.get("utm_source", ""),
        "utm_medium": data.get("utm_medium", ""),
        "utm_campaign": data.get("utm_campaign", ""),
        "utm_content": data.get("utm_content", ""),
        "utm_term": data.get("utm_term", ""),
        "landing_page": data.get("landing_page", ""),
        "referrer": data.get("referrer", ""),
        "operator_id": data.get("operator_id", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.utm_events.insert_one(record.copy())
    return record["id"]


async def link_utm_to_user(db: AsyncIOMotorDatabase, visitor_id: str, user_id: str) -> dict:
    """When anon visitor signs up, link their UTM events to user_id."""
    await db.utm_events.update_many(
        {"visitor_id": visitor_id, "user_id": None},
        {"$set": {"user_id": user_id}}
    )


# ── Attribution ──────────────────────────────────────────────
async def get_user_attribution(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """Get first-touch and last-touch UTM for a user."""
    events = await db.utm_events.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    if not events:
        return {"first_touch": None, "last_touch": None, "touches": 0}
    return {
        "first_touch": _utm_summary(events[0]),
        "last_touch": _utm_summary(events[-1]),
        "touches": len(events),
        "events": events,
    }


def _utm_summary(evt) -> dict:
    return {
        "source": evt.get("utm_source", "direct"),
        "medium": evt.get("utm_medium", ""),
        "campaign": evt.get("utm_campaign", ""),
        "content": evt.get("utm_content", ""),
        "operator_id": evt.get("operator_id", ""),
        "date": evt.get("created_at", ""),
    }


# ── Marketing Overview ───────────────────────────────────────
def _get_attributed_source(events: list, model_type: str) -> str:
    """Helper: determine the attribution source for a user's events based on model."""
    if not events:
        return "direct"
    if model_type == "last_touch":
        return events[-1].get("utm_source") or "direct"
    return events[0].get("utm_source") or "direct"


def _build_touch_maps(all_utm: list) -> dict:
    """Helper: group UTM events by user_id, sorted chronologically."""
    user_events: dict = {}
    for e in all_utm:
        uid = e["user_id"]
        user_events.setdefault(uid, []).append(e)
    for uid in user_events:
        user_events[uid].sort(key=lambda x: x.get("created_at", ""))
    return user_events


def _attribute_channels(user_events: dict, model: str) -> tuple:
    """Helper: apply attribution model and return (channel_users, channel_credit)."""
    channel_users: dict = {}
    channel_credit: dict = {}

    if model in ("linear", "time_decay"):
        import math
        for uid, events in user_events.items():
            sources = [e.get("utm_source") or "direct" for e in events]
            unique_sources = list(dict.fromkeys(sources))
            if model == "linear":
                credit = 1.0 / len(unique_sources)
                for src in unique_sources:
                    channel_credit.setdefault(src, 0)
                    channel_credit[src] += credit
                    channel_users.setdefault(src, set()).add(uid)
            else:
                total_weight = sum(math.pow(2, i) for i in range(len(unique_sources)))
                for i, src in enumerate(unique_sources):
                    weight = math.pow(2, i) / total_weight
                    channel_credit.setdefault(src, 0)
                    channel_credit[src] += weight
                    channel_users.setdefault(src, set()).add(uid)
    else:
        for uid, events in user_events.items():
            src = _get_attributed_source(events, model)
            channel_users.setdefault(src, set()).add(uid)

    return channel_users, channel_credit


def _build_channel_data(channel_users: dict, channel_bookings: dict, channel_revenue: dict) -> list:
    """Helper: assemble final channel metrics list."""
    channels = set(list(channel_users.keys()) + list(channel_bookings.keys()))
    data = []
    for ch in channels:
        users = len(channel_users.get(ch, set()))
        bookings = channel_bookings.get(ch, 0)
        revenue = channel_revenue.get(ch, 0)
        data.append({
            "channel": ch, "users": users, "bookings": bookings,
            "revenue": round(revenue, 2),
            "conversion": round(bookings / users * 100, 1) if users > 0 else 0,
        })
    data.sort(key=lambda x: -x["revenue"])
    return data


async def marketing_overview(db: AsyncIOMotorDatabase, model: str = "first_touch") -> dict:
    """Section: Marketing Executive Overview with configurable attribution model."""
    all_utm = await db.utm_events.find({"user_id": {"$ne": None}}, {"_id": 0}).to_list(50000)
    user_events = _build_touch_maps(all_utm)
    channel_users, _credit = _attribute_channels(user_events, model)

    # Bookings by channel
    all_bookings = await db.bookings.find({}, {"_id": 0, "user_id": 1, "price": 1, "status": 1}).to_list(10000)
    channel_bookings: dict = {}
    channel_revenue: dict = {}
    for b in all_bookings:
        uid = b.get("user_id")
        src = _get_attributed_source(user_events.get(uid, []), model)
        channel_bookings[src] = channel_bookings.get(src, 0) + 1
        channel_revenue[src] = channel_revenue.get(src, 0) + (b.get("price") or 0)

    total_tracked = len(user_events)
    total_users = await db.users.count_documents({})

    return {
        "channels": _build_channel_data(channel_users, channel_bookings, channel_revenue),
        "total_tracked_users": total_tracked,
        "total_utm_events": len(all_utm),
        "untracked_users": total_users - total_tracked,
        "total_users": total_users,
        "attribution_model": model,
    }


# ── Funnel Analytics ─────────────────────────────────────────
async def _acquisition_funnel(db: AsyncIOMotorDatabase) -> dict:
    """Helper: build acquisition funnel steps."""
    total_visits = await db.utm_events.count_documents({})
    total_signups = await db.users.count_documents({})
    activated = await db.users.count_documents({"onboarding_complete": True})
    unique_bookers = set(b["user_id"] for b in await db.bookings.find({}, {"_id": 0, "user_id": 1}).to_list(10000))
    return {
        "steps": [
            {"name": "Visit", "count": total_visits or total_signups},
            {"name": "Signup", "count": total_signups},
            {"name": "Activated", "count": activated},
            {"name": "First Booking", "count": len(unique_bookers)},
        ],
        "_unique_bookers": unique_bookers,
        "_activated": activated,
    }


async def _engagement_funnels(db: AsyncIOMotorDatabase, unique_bookers: set) -> dict:
    """Helper: build event, commerce, chat, and pathway funnels."""
    event_views = await db.analytics_events.count_documents({"event_type": "page_view", "data.page": {"$regex": "event"}})
    event_rsvps = sum(len(e.get("attendees", [])) for e in await db.events.find({}, {"_id": 0, "attendees": 1}).to_list(500))
    product_views = await db.analytics_events.count_documents({"event_type": "page_view", "data.page": {"$regex": "product|shop"}})
    products_sold = sum(p.get("sold_count", 0) for p in await db.products.find({}, {"_id": 0, "sold_count": 1}).to_list(100))
    chatters = await db.messages.distinct("sender_id")
    onboarded = await db.users.count_documents({"onboarding_complete": True})

    return {
        "events": {"steps": [{"name": "Event Views", "count": event_views}, {"name": "RSVPs", "count": event_rsvps}]},
        "commerce": {"steps": [{"name": "Product Views", "count": product_views}, {"name": "Purchased", "count": products_sold}]},
        "chat_to_booking": {"steps": [{"name": "Chat Users", "count": len(chatters)}, {"name": "Also Booked", "count": len(set(chatters) & unique_bookers)}]},
        "pathway": {"steps": [{"name": "Onboarded", "count": onboarded}, {"name": "Booked", "count": len(unique_bookers)}]},
    }


async def funnel_analytics(db: AsyncIOMotorDatabase) -> dict:
    """Full-funnel visibility across all features."""
    acq = await _acquisition_funnel(db)
    unique_bookers = acq.pop("_unique_bookers")
    acq.pop("_activated")
    engagement = await _engagement_funnels(db, unique_bookers)
    return {"acquisition": acq, **engagement}


# ── User Journey ─────────────────────────────────────────────
async def user_journey(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """Individual user timeline: first touch → revenue."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1, "onboarding_complete": 1})
    if not user:
        return None

    utm = await db.utm_events.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    events = await db.analytics_events.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    bookings = await db.bookings.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    reviews = await db.reviews.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    messages_count = await db.messages.count_documents({"sender_id": user_id})
    connections = await db.connections.count_documents({"$or": [{"from_id": user_id}, {"to_id": user_id}], "status": "accepted"})

    total_revenue = sum(b.get("price", 0) for b in bookings)

    # Build timeline
    timeline = []
    for u in utm:
        timeline.append({"type": "utm_landing", "date": u["created_at"], "data": f'{u.get("utm_source","direct")} / {u.get("utm_medium","")}'})
    timeline.append({"type": "signup", "date": user.get("created_at", ""), "data": "Account created"})
    if user.get("onboarding_complete"):
        timeline.append({"type": "onboarded", "date": user.get("created_at", ""), "data": "Onboarding completed"})
    for e in events[:20]:
        timeline.append({"type": e["event_type"], "date": e["created_at"], "data": str(e.get("data", {}))[:80]})
    for b in bookings:
        timeline.append({"type": "booking", "date": b["created_at"], "data": f'{b.get("listing_name","Listing")} - ${b.get("price",0)}'})
    for r in reviews:
        timeline.append({"type": "review", "date": r["created_at"], "data": f'Rating: {r.get("rating",0)}'})

    timeline.sort(key=lambda x: x.get("date", ""))

    return {
        "user": user,
        "first_touch": _utm_summary(utm[0]) if utm else {"source": "direct", "medium": "", "campaign": ""},
        "total_revenue": total_revenue,
        "bookings": len(bookings),
        "reviews": len(reviews),
        "messages": messages_count,
        "connections": connections,
        "timeline": timeline,
    }


async def aggregated_journeys(db: AsyncIOMotorDatabase) -> dict:
    """Aggregated path analysis across all users."""
    # First feature used after signup
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(10000)
    first_actions = {}
    for u in users[:200]:  # Sample for performance
        first_event = await db.analytics_events.find_one(
            {"user_id": u["id"]}, {"_id": 0, "event_type": 1},
            sort=[("created_at", 1)]
        )
        if first_event:
            action = first_event["event_type"]
            first_actions[action] = first_actions.get(action, 0) + 1

    return {
        "first_actions": sorted([{"action": k, "count": v} for k, v in first_actions.items()], key=lambda x: -x["count"]),
        "sample_size": min(len(users), 200),
    }


# ── Operator Attribution ─────────────────────────────────────
async def operator_attribution(db: AsyncIOMotorDatabase) -> dict:
    """Traffic, conversions, revenue driven by each operator."""
    # UTM events with operator_id
    op_utm = await db.utm_events.find({"operator_id": {"$ne": ""}}, {"_id": 0}).to_list(10000)
    op_traffic = {}
    for e in op_utm:
        oid = e["operator_id"]
        op_traffic.setdefault(oid, {"visits": 0, "users": set()})
        op_traffic[oid]["visits"] += 1
        if e.get("user_id"):
            op_traffic[oid]["users"].add(e["user_id"])

    # Bookings by operator's listings
    bookings = await db.bookings.find({}, {"_id": 0, "operator_id": 1, "price": 1, "status": 1}).to_list(10000)
    op_bookings = {}
    for b in bookings:
        oid = b.get("operator_id")
        if oid:
            op_bookings.setdefault(oid, {"count": 0, "revenue": 0, "cancelled": 0})
            op_bookings[oid]["count"] += 1
            op_bookings[oid]["revenue"] += b.get("price") or 0
            if b.get("status") == "cancelled":
                op_bookings[oid]["cancelled"] += 1

    # Ratings
    review_pipe = [{"$group": {"_id": "$listing_id", "avg_rating": {"$avg": "$rating"}, "count": {"$sum": 1}}}]
    reviews_by_listing = {r["_id"]: r for r in await db.reviews.aggregate(review_pipe).to_list(500)}

    # Build operator leaderboard
    all_operators = await db.users.find({"role": {"$in": ["operator", "instructor"]}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(500)
    leaderboard = []
    for op in all_operators:
        oid = op["id"]
        traffic = op_traffic.get(oid, {"visits": 0, "users": set()})
        bk = op_bookings.get(oid, {"count": 0, "revenue": 0, "cancelled": 0})
        # Get avg rating across their listings
        op_listings = [item["id"] for item in await db.listings.find({"operator_id": oid}, {"_id": 0, "id": 1}).to_list(100)]
        ratings = [reviews_by_listing[lid]["avg_rating"] for lid in op_listings if lid in reviews_by_listing]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0

        leaderboard.append({
            "id": oid, "name": op["name"], "role": op["role"],
            "referral_visits": traffic["visits"],
            "referred_users": len(traffic["users"]),
            "bookings": bk["count"], "revenue": round(bk["revenue"], 2),
            "cancellations": bk["cancelled"],
            "avg_rating": avg_rating,
        })

    leaderboard.sort(key=lambda x: -x["revenue"])
    return {"leaderboard": leaderboard}


# ── Campaign Management ──────────────────────────────────────
async def campaign_performance(db: AsyncIOMotorDatabase) -> dict:
    """Campaign-level performance from utm_campaigns collection."""
    campaigns = await db.utm_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Enrich with actual data
    for c in campaigns:
        cname = c.get("campaign_name", "")
        # Count UTM events for this campaign
        hits = await db.utm_events.count_documents({"utm_campaign": cname})
        # Users acquired
        users_acquired = len(set([e["user_id"] for e in await db.utm_events.find({"utm_campaign": cname, "user_id": {"$ne": None}}, {"_id": 0, "user_id": 1}).to_list(10000)]))
        # Bookings from these users
        if users_acquired > 0:
            user_ids = [e["user_id"] for e in await db.utm_events.find({"utm_campaign": cname, "user_id": {"$ne": None}}, {"_id": 0, "user_id": 1}).to_list(10000)]
            bk = await db.bookings.find({"user_id": {"$in": list(set(user_ids))}}, {"_id": 0, "price": 1}).to_list(10000)
            bookings = len(bk)
            revenue = sum(b.get("price", 0) for b in bk)
        else:
            bookings = 0
            revenue = 0

        spend = c.get("spend", 0)
        cac = round(spend / users_acquired, 2) if users_acquired > 0 and spend > 0 else 0

        c["hits"] = hits
        c["users_acquired"] = users_acquired
        c["bookings"] = bookings
        c["revenue"] = round(revenue, 2)
        c["cac"] = cac

    return {"campaigns": campaigns}


# ── Retention by Channel ─────────────────────────────────────
async def retention_by_channel(db: AsyncIOMotorDatabase) -> dict:
    """User quality metrics by acquisition channel."""
    all_utm = await db.utm_events.find({"user_id": {"$ne": None}}, {"_id": 0}).to_list(50000)

    # First-touch map
    ft_map = {}
    for e in all_utm:
        uid = e["user_id"]
        if uid not in ft_map or e["created_at"] < ft_map[uid]["created_at"]:
            ft_map[uid] = e

    # Group by channel
    channel_users = {}
    for uid, evt in ft_map.items():
        src = evt.get("utm_source") or "direct"
        channel_users.setdefault(src, []).append(uid)

    # Compute quality per channel
    results = []
    for ch, uids in channel_users.items():
        uid_set = set(uids)
        # Bookings
        bk = await db.bookings.find({"user_id": {"$in": list(uid_set)}}, {"_id": 0, "price": 1, "status": 1}).to_list(10000)
        bookings = len(bk)
        revenue = sum(b.get("price", 0) for b in bk)
        cancelled = len([b for b in bk if b.get("status") == "cancelled"])
        # Reviews
        reviews = await db.reviews.count_documents({"user_id": {"$in": list(uid_set)}})
        # Connections
        connections = await db.connections.count_documents({"from_id": {"$in": list(uid_set)}, "status": "accepted"})

        refund_rate = round(cancelled / bookings * 100, 1) if bookings > 0 else 0

        results.append({
            "channel": ch, "users": len(uids), "bookings": bookings,
            "revenue": round(revenue, 2), "reviews": reviews,
            "connections": connections, "refund_rate": refund_rate,
            "booking_rate": round(bookings / len(uids) * 100, 1) if uids else 0,
        })

    results.sort(key=lambda x: -x["revenue"])
    return {"channels": results}
