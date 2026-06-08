from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response
from datetime import timezone, timedelta, datetime
from typing import Optional
from database import db
from models import AvailabilityUpdate
from auth_utils import get_current_user
from listing_normalize import normalize_rich_listing, LISTING_TYPE_MAP
from og_image import generate_og_image

router = APIRouter()


# ─── COLLECTION — single source of truth ───
COLL = "operator_dive_listings"


def _legacy_type_to_rich(legacy_types: list) -> list:
    """Map frontend filter values (legacy) → rich listing_type values for query."""
    reverse = {}
    for rich, legacy in LISTING_TYPE_MAP.items():
        reverse.setdefault(legacy, []).append(rich)
    out = []
    for t in legacy_types:
        out.extend(reverse.get(t, [t]))
    return out


@router.get("/listings/locations/popular")
async def get_popular_locations() -> dict:
    pipeline = [
        {"$match": {"status": "active", "country": {"$ne": ""}}},
        {"$group": {"_id": "$country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    results = await db[COLL].aggregate(pipeline).to_list(20)
    return {"countries": [{"country": r["_id"], "count": r["count"]} for r in results if r["_id"]]}


@router.get("/destinations")
async def get_destinations() -> dict:
    pipeline = [
        {"$match": {"status": "active", "country": {"$ne": ""}}},
        {"$group": {
            "_id": "$country",
            "listing_count": {"$sum": 1},
            "avg_rating": {"$avg": "$rating"},
            "avg_price": {"$avg": "$price"},
            "min_price": {"$min": "$price"},
            "types": {"$addToSet": "$listing_type"},
            "sample_photo": {"$first": {"$arrayElemAt": ["$photos.url", 0]}},
            "locations": {"$addToSet": "$location"},
        }},
        {"$sort": {"listing_count": -1}},
        {"$limit": 20},
    ]
    results = await db[COLL].aggregate(pipeline).to_list(20)
    destinations = []
    for r in results:
        if not r["_id"]:
            continue
        legacy_types = list({LISTING_TYPE_MAP.get(t, t) for t in (r.get("types") or [])})
        destinations.append({
            "country": r["_id"],
            "listing_count": r["listing_count"],
            "avg_rating": round(r["avg_rating"] or 0, 1),
            "avg_price": round(r["avg_price"] or 0),
            "min_price": r["min_price"],
            "types": legacy_types,
            "image_url": r.get("sample_photo"),
            "locations": (r.get("locations") or [])[:5],
        })
    return {"destinations": destinations}


@router.get("/listings")
async def get_listings(
    type: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),  # NO-OP since 2026-06-08 (UI filter removed; schema field preserved for future use)
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    available_date: Optional[str] = Query(None),
    available_from: Optional[str] = Query(None),
    available_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=100),
    include_reviews: bool = Query(False),
):
    query = {"status": "active"}
    if type:
        types = [t.strip() for t in type.split(",") if t.strip()]
        rich_types = _legacy_type_to_rich(types)
        query["listing_type"] = {"$in": rich_types} if len(rich_types) > 1 else rich_types[0]
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if country:
        countries = [c.strip() for c in country.split(",") if c.strip()]
        if len(countries) > 1:
            query["country"] = {"$in": countries}
        else:
            query["country"] = {"$regex": countries[0], "$options": "i"}
    if difficulty:
        # No-op: difficulty filtering removed 2026-06-08. Accepted to avoid breaking
        # bookmarked URLs and the related-listings curation below.
        diffs = [d.strip() for d in difficulty.split(",") if d.strip()]
        query["difficulty_level"] = {"$in": diffs} if len(diffs) > 1 else diffs[0]
    if min_price is not None or max_price is not None:
        price_query = {}
        if min_price is not None:
            price_query["$gte"] = min_price
        if max_price is not None:
            price_query["$lte"] = max_price
        query["price"] = price_query
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}},
            {"country": {"$regex": search, "$options": "i"}},
            {"listing_type": {"$regex": search, "$options": "i"}},
            {"difficulty_level": {"$regex": search, "$options": "i"}},
            {"inclusions": {"$regex": search, "$options": "i"}},
        ]
    sort_map = {
        "price_asc": [("price", 1)],
        "price_desc": [("price", -1)],
        "rating": [("rating", -1)],
        "newest": [("created_at", -1)],
        "reviews": [("review_count", -1)],
    }
    sort_order = sort_map.get(sort_by, [("rating", -1)])
    total = await db[COLL].count_documents(query)
    raw = await db[COLL].find(query, {"_id": 0}).sort(sort_order).skip(skip).limit(limit).to_list(limit)
    listings = [normalize_rich_listing(d) for d in raw]

    if available_date or (available_from and available_to):
        target_dates = set()
        if available_date:
            target_dates.add(available_date)
        if available_from and available_to:
            from datetime import date as dt_date
            start = dt_date.fromisoformat(available_from)
            end = dt_date.fromisoformat(available_to)
            d = start
            while d <= end:
                target_dates.add(d.isoformat())
                d += timedelta(days=1)
        listing_ids = [item["id"] for item in listings]
        avail_records = await db.availability.find({"listing_id": {"$in": listing_ids}}, {"_id": 0}).to_list(500)
        avail_map = {a["listing_id"]: set(a.get("available_dates", [])) for a in avail_records}
        listings = [item for item in listings if target_dates & avail_map.get(item["id"], set())]

    if include_reviews and listings:
        listing_ids = [item["id"] for item in listings]
        pipeline = [
            {"$match": {"listing_id": {"$in": listing_ids}}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$listing_id", "comment": {"$first": "$comment"}, "user_name": {"$first": "$user_name"}, "rating": {"$first": "$rating"}}},
        ]
        reviews = await db.reviews.aggregate(pipeline).to_list(len(listing_ids))
        review_map = {r["_id"]: {"comment": r["comment"][:120], "user_name": r["user_name"], "rating": r["rating"]} for r in reviews}
        for item in listings:
            item["latest_review"] = review_map.get(item["id"])

    return {"count": len(listings), "total": total, "listings": listings, "has_more": skip + len(listings) < total}


@router.api_route("/listings/{listing_id}/og-image", methods=["GET", "HEAD"])
async def get_listing_og_image(listing_id: str):
    """Auto-generated 1200x630 social preview card for the listing.

    Encoded as JPEG and capped at <300 KB so all platforms (especially
    WhatsApp, which drops images >600 KB) render the rich preview card.
    """
    doc = await db[COLL].find_one({"id": listing_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing = normalize_rich_listing(doc)
    img_bytes = await generate_og_image(listing)
    return Response(
        content=img_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "Content-Disposition": "inline",
        },
    )


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str) -> dict:
    doc = await db[COLL].find_one({"id": listing_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Listing not found")
    return normalize_rich_listing(doc)


@router.get("/listings/{listing_id}/related")
async def get_related_listings(listing_id: str, limit: int = Query(6, ge=1, le=12)) -> dict:
    """Curated 'You might also like' for a listing.

    Curation priority: same country → same type → same difficulty → ranked
    by rating desc. The current listing is always excluded. Returns up to
    `limit` listings; callers hide the section when count < 2 (1-item rails
    look stale).
    """
    src = await db[COLL].find_one(
        {"id": listing_id},
        {"_id": 0, "country": 1, "listing_type": 1, "type": 1, "difficulty": 1},
    )
    if not src:
        raise HTTPException(status_code=404, detail="Listing not found")

    country = src.get("country")
    ltype = src.get("listing_type") or src.get("type")
    difficulty = src.get("difficulty")

    base_query = {"id": {"$ne": listing_id}, "status": {"$ne": "draft"}}
    seen: list[dict] = []
    seen_ids: set[str] = set()

    async def _take(extra: dict, k: int) -> None:
        if k <= 0:
            return
        cursor = (
            db[COLL]
            .find({**base_query, **extra}, {"_id": 0})
            .sort([("rating", -1), ("review_count", -1)])
            .limit(k * 3)  # over-fetch to dedupe
        )
        async for d in cursor:
            if d["id"] in seen_ids:
                continue
            seen_ids.add(d["id"])
            seen.append(normalize_rich_listing(d))
            if len(seen) >= limit:
                return

    # Pass 1: same country + same type
    if country and ltype:
        await _take({"country": country, "$or": [{"listing_type": ltype}, {"type": ltype}]}, limit - len(seen))
    # Pass 2: same country
    if country and len(seen) < limit:
        await _take({"country": country}, limit - len(seen))
    # Pass 3: same type anywhere
    if ltype and len(seen) < limit:
        await _take({"$or": [{"listing_type": ltype}, {"type": ltype}]}, limit - len(seen))
    # Pass 4: same difficulty (last resort)
    if difficulty and len(seen) < limit:
        await _take({"difficulty": difficulty}, limit - len(seen))
    # Pass 5: any active listing (final backfill so the rail doesn't look empty
    # on a new operator's freshly-uploaded listing)
    if len(seen) < limit:
        await _take({}, limit - len(seen))

    return {"related": seen[:limit]}


@router.put("/listings/{listing_id}/availability")
async def set_availability(listing_id: str, data: AvailabilityUpdate, current_user: dict = Depends(get_current_user)):
    listing = await db[COLL].find_one({"id": listing_id, "operator_id": current_user["id"]}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found or not yours")
    await db.availability.update_one(
        {"listing_id": listing_id},
        {"$set": {"listing_id": listing_id, "available_dates": data.available_dates, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": "Availability updated", "count": len(data.available_dates)}


@router.get("/listings/{listing_id}/availability")
async def get_availability(listing_id: str) -> dict:
    record = await db.availability.find_one({"listing_id": listing_id}, {"_id": 0})
    return {"available_dates": record.get("available_dates", []) if record else []}


@router.get("/products")
async def get_products(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
):
    query = {"status": "active"}
    if category:
        query["category"] = category
    if search:
        search_pattern = f"\\b{search}"
        query["$or"] = [
            {"name": {"$regex": search_pattern, "$options": "i"}},
            {"description": {"$regex": search_pattern, "$options": "i"}},
        ]
    sort_map = {
        "price_asc": [("price", 1)],
        "price_desc": [("price", -1)],
        "newest": [("created_at", -1)],
        "popular": [("sold_count", -1)],
    }
    sort_order = sort_map.get(sort_by, [("created_at", -1)])
    total = await db.products.count_documents(query)
    products = await db.products.find(query, {"_id": 0}).sort(sort_order).skip(skip).limit(limit).to_list(limit)
    return {"count": len(products), "total": total, "products": products, "has_more": skip + len(products) < total}
