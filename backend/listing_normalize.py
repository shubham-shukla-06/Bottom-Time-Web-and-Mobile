"""Normalize rich operator_dive_listings documents into the legacy listings shape
that the public-facing frontend (Discover, ListingDetail, TripDetail) expects.
This keeps the frontend untouched while we move to a single source of truth.
"""
from typing import Optional


# Map rich-form listing_type values → legacy `type` values used by Discover filters.
LISTING_TYPE_MAP = {
    "day_dive": "dives",
    "trip": "day_trips",
    "course": "courses",
    "liveaboard": "liveaboards",
    "package": "day_trips",
    "snorkeling": "snorkeling",
}


def _first_photo_url(photos: list) -> Optional[str]:
    if not photos:
        return None
    p = photos[0]
    if isinstance(p, dict):
        return p.get("url")
    return p


def _flatten_inclusions(inclusions: list) -> list:
    if not inclusions:
        return []
    return [s for s in inclusions if isinstance(s, str) and s.strip()]


def normalize_rich_listing(doc: dict) -> dict:
    """Map a doc from `operator_dive_listings` to the schema the frontend uses."""
    if not doc:
        return doc

    listing_type = doc.get("listing_type") or "day_dive"
    photos = doc.get("photos") or []
    duration_days = doc.get("duration_days") or 1
    if duration_days == 1:
        duration_str = "1 day"
    else:
        duration_str = f"{duration_days} days"

    normalized = {
        "id": doc.get("id"),
        "operator_id": doc.get("operator_id"),
        "operator_name": doc.get("operator_name"),
        "operator_verified": doc.get("operator_verified", False),
        # Legacy field names expected by frontend
        "name": doc.get("title") or doc.get("name") or "Untitled Listing",
        "title": doc.get("title") or doc.get("name"),
        "type": LISTING_TYPE_MAP.get(listing_type, listing_type) if doc.get("listing_type") else (doc.get("type") or "dives"),
        "listing_type": listing_type if doc.get("listing_type") else (
            {v: k for k, v in LISTING_TYPE_MAP.items()}.get(doc.get("type", ""), "day_dive")
        ),
        "description": doc.get("description") or "",
        "location": doc.get("location") or "",
        "country": doc.get("country") or "",
        "price": doc.get("price") or 0,
        "currency": doc.get("currency") or "USD",
        "difficulty": doc.get("difficulty_level") or "beginner",
        "duration": duration_str,
        "image_url": _first_photo_url(photos) or doc.get("image_url") or "",
        "photos": photos,
        "videos": doc.get("videos") or [],
        "rating": doc.get("rating") or 0,
        "review_count": doc.get("review_count") or 0,
        "highlights": _flatten_inclusions(doc.get("inclusions") or []),
        "included": _flatten_inclusions(doc.get("inclusions") or []),
        "excluded": _flatten_inclusions(doc.get("exclusions") or []),
        # Rich-only fields surfaced for ListingDetail
        "dive_sites": doc.get("dive_sites") or [],
        "num_dives": doc.get("num_dives") or 1,
        "max_dive_depth": f"{doc.get('max_depth', 30)}m",
        "nitrox_available": doc.get("nitrox_available", False),
        "nitrox_price": doc.get("nitrox_price", 0),
        "certification_required": doc.get("certification_required") or "Open Water",
        "gear_rental": doc.get("gear_rental") or {},
        "accommodation": doc.get("accommodation") or {},
        "max_slots": doc.get("max_slots") or doc.get("max_participants") or 20,
        "max_per_booking": doc.get("max_per_booking") or 6,
        "schedule_type": doc.get("schedule_type") or "on_demand",
        "arrival_date": doc.get("arrival_date"),
        "departure_date": doc.get("departure_date"),
        "duration_days": duration_days,
        "cancellation_policy": doc.get("cancellation_policy") or "",
        "refund_policy": doc.get("refund_policy") or "",
        "terms_conditions": doc.get("terms_conditions") or "",
        "legal_disclaimer": doc.get("legal_disclaimer") or "",
        "tcs_compliance": doc.get("tcs_compliance") or {},
        "directions": doc.get("directions") or {},
        "medical_waiver_required": doc.get("medical_waiver_required", True),
        "status": doc.get("status") or "draft",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }
    return normalized
