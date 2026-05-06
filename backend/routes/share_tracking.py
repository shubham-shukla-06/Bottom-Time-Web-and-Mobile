"""Share tracking & UTM attribution.

Three concerns:
  1) Operators create custom UTM presets per listing
  2) Public visitors land with utm_* params -> we record a click
  3) Bookings inherit the most-recent attribution for analytics
"""
import hashlib
import html as html_lib
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from database import db
from auth_utils import get_current_user
from rate_limiter import limiter

router = APIRouter()


# ─── Allowed values (defensive validation) ─────────────────────────────
ALLOWED_CHANNELS = {
    "whatsapp", "x", "facebook", "telegram", "linkedin", "email",
    "sms", "instagram", "messenger", "reddit", "direct", "custom"
}
SAFE_TOKEN_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,40}$")


def _normalize(s: Optional[str]) -> str:
    if not s:
        return ""
    s = s.strip().lower()[:40]
    return re.sub(r"[^a-z0-9_\-]", "_", s)


async def _make_unique_slug(source: str) -> str:
    """Generate a short, friendly slug like 'whatsapp_x4f2k'."""
    base = _normalize(source)[:10] or "link"
    for _ in range(8):
        rand = secrets.token_urlsafe(4).replace("-", "").replace("_", "")[:5].lower()
        slug = f"{base}_{rand}"
        existing = await db.share_presets.find_one({"slug": slug}, {"_id": 0, "id": 1})
        if not existing:
            return slug
    # extreme fallback
    return f"{base}_{uuid.uuid4().hex[:6]}"


# ─── Models ────────────────────────────────────────────────────────────
class SharePresetCreate(BaseModel):
    listing_id: Optional[str] = None
    channel: str = Field(default="custom")
    label: str = Field(min_length=1, max_length=80)
    utm_source: str = Field(min_length=1, max_length=40)
    utm_medium: str = Field(default="share", max_length=40)
    utm_campaign: str = Field(default="", max_length=40)
    utm_content: Optional[str] = Field(default=None, max_length=40)


class ClickPayload(BaseModel):
    listing_id: str
    utm_source: str = ""
    utm_medium: str = ""
    utm_campaign: str = ""
    utm_content: Optional[str] = ""
    visitor_id: Optional[str] = ""
    referrer: Optional[str] = ""


# ─── Operator: manage presets ──────────────────────────────────────────
@router.post("/listings/{listing_id}/share-presets")
async def create_share_preset(listing_id: str, body: SharePresetCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(403, "Operator only")
    listing = await db.operator_dive_listings.find_one({"id": listing_id, "operator_id": current_user["id"]}, {"_id": 0, "id": 1})
    if not listing:
        raise HTTPException(404, "Listing not found")

    # cap presets per listing
    count = await db.share_presets.count_documents({"operator_id": current_user["id"], "listing_id": listing_id})
    if count >= 30:
        raise HTTPException(400, "Preset limit reached (30 per listing)")

    channel = body.channel.lower()
    if channel not in ALLOWED_CHANNELS:
        channel = "custom"

    preset = {
        "id": str(uuid.uuid4()),
        "operator_id": current_user["id"],
        "listing_id": listing_id,
        "channel": channel,
        "label": body.label.strip()[:80],
        "utm_source": _normalize(body.utm_source),
        "utm_medium": _normalize(body.utm_medium) or "share",
        "utm_campaign": _normalize(body.utm_campaign),
        "utm_content": _normalize(body.utm_content) if body.utm_content else "",
        "slug": await _make_unique_slug(body.utm_source),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.share_presets.insert_one(preset)
    preset.pop("_id", None)
    return preset


@router.get("/listings/{listing_id}/share-presets")
async def list_share_presets(listing_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(403, "Operator only")
    presets = await db.share_presets.find(
        {"operator_id": current_user["id"], "listing_id": listing_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    # Lazy-fill slug for legacy presets created before this feature
    for p in presets:
        if not p.get("slug"):
            p["slug"] = await _make_unique_slug(p.get("utm_source", "link"))
            await db.share_presets.update_one({"id": p["id"]}, {"$set": {"slug": p["slug"]}})
    return {"presets": presets}


@router.delete("/share-presets/{preset_id}")
async def delete_share_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.share_presets.delete_one({"id": preset_id, "operator_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Preset not found")
    return {"deleted": True}


import os
_APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
_ALLOWED_HOSTS = set()
if _APP_BASE_URL:
    from urllib.parse import urlparse
    _parsed = urlparse(_APP_BASE_URL)
    if _parsed.hostname:
        _ALLOWED_HOSTS.add(_parsed.hostname.lower())
# Also allow any *.preview.emergentagent.com and the prod domain once known
_ALLOWED_HOST_SUFFIXES = (".preview.emergentagent.com", ".bottom-time.com")


def _trusted_public_origin(request: Request) -> str:
    """Derive the public origin from request headers, but only trust known hosts.
    Falls back to APP_BASE_URL when the Host / X-Forwarded-Host header is spoofed
    to prevent host-header injection into OG / canonical URLs.
    """
    fwd_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    fwd_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip().lower()
    raw_host = (fwd_host or request.headers.get("host") or request.url.netloc or "").lower()
    # Strip port for comparison
    host_no_port = raw_host.split(":", 1)[0]
    scheme = fwd_proto or request.url.scheme or "https"
    if scheme not in ("http", "https"):
        scheme = "https"
    allowed = (
        host_no_port in _ALLOWED_HOSTS
        or any(host_no_port.endswith(suffix) for suffix in _ALLOWED_HOST_SUFFIXES)
    )
    if not allowed:
        return _APP_BASE_URL or f"{scheme}://{raw_host}"
    return f"{scheme}://{raw_host}"


def _safe_js_string(value: str) -> str:
    import json
    return json.dumps(value)


def _render_share_html(request: Request, listing: dict, utm: dict) -> str:
    public_origin = _trusted_public_origin(request)
    qs = urlencode({k: v for k, v in utm.items() if v})
    target = f"{public_origin}/listing/{listing['id']}" + (f"?{qs}" if qs else "")
    og_image = f"{public_origin}/api/listings/{listing['id']}/og-image"

    # Self URL = the short-link itself. Crawlers like LinkedIn re-fetch og:url
    # if it differs from the requested URL, so og:url and rel=canonical MUST point
    # to this short-link (rich OG payload), NOT the SPA listing route (generic).
    # request.url.path is server-controlled (routed path), safe to use.
    self_url = f"{public_origin}{request.url.path}"
    if request.url.query:
        self_url = f"{self_url}?{request.url.query}"

    title = listing.get("title") or "Bottom Time Listing"
    loc = (listing.get("location") or "").strip()
    country = (listing.get("country") or "").strip()
    if country and country.lower() in loc.lower():
        location_part = loc
    elif loc and country:
        location_part = f"{loc}, {country}"
    else:
        location_part = loc or country
    # Title: just the listing — brand identity comes from the OG card image, not the text title.
    page_title = f"{title} · {location_part}" if location_part else title

    # Description: fixed brand line (consistent across listings, used by all crawlers).
    description = "Find your next dive, buddy, gear and merch on Bottom Time!"

    e_title = html_lib.escape(page_title, quote=True)
    e_desc = html_lib.escape(description, quote=True)
    e_self = html_lib.escape(self_url, quote=True)
    e_target = html_lib.escape(target, quote=True)
    e_og_image = html_lib.escape(og_image, quote=True)
    e_listing_title = html_lib.escape(title, quote=True)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{e_title}</title>
  <meta name="description" content="{e_desc}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="{e_title}">
  <meta property="og:description" content="{e_desc}">
  <meta property="og:image" content="{e_og_image}">
  <meta property="og:image:secure_url" content="{e_og_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:alt" content="{e_listing_title}">
  <meta property="og:url" content="{e_self}">
  <meta property="og:site_name" content="Bottom Time">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e_title}">
  <meta name="twitter:description" content="{e_desc}">
  <meta name="twitter:image" content="{e_og_image}">
  <link rel="canonical" href="{e_self}">
  <style>
    body {{ font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
    .card {{ text-align: center; padding: 2rem; }}
    .card a {{ color: #22d3ee; text-decoration: none; }}
    .spinner {{ display: inline-block; width: 28px; height: 28px; border: 3px solid #22d3ee33; border-top-color: #22d3ee; border-radius: 50%; animation: spin 0.7s linear infinite; margin-bottom: 1rem; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <p>Taking you to <a href="{e_target}">{e_listing_title}</a>…</p>
  </div>
  <script>setTimeout(function(){{ window.location.replace({_safe_js_string(target)}); }}, 50);</script>
</body>
</html>"""


# ─── Public: short-link redirect with proper OG meta for crawlers ──────
@router.api_route("/r/{slug}", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def share_redirect(slug: str, request: Request):
    """Server-rendered HTML page (OG/Twitter meta + auto PNG card) → redirect."""
    preset = await db.share_presets.find_one({"slug": slug.lower()}, {"_id": 0})
    if not preset:
        return RedirectResponse(url="/", status_code=302)
    listing = await db.operator_dive_listings.find_one(
        {"id": preset["listing_id"]}, {"_id": 0}
    )
    if not listing:
        return RedirectResponse(url="/", status_code=302)
    utm = {
        "utm_source": preset.get("utm_source"),
        "utm_medium": preset.get("utm_medium"),
        "utm_campaign": preset.get("utm_campaign"),
    }
    return HTMLResponse(
        content=_render_share_html(request, listing, utm),
        status_code=200,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.api_route("/d/{listing_id}", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def diver_share_redirect(listing_id: str, request: Request):
    """Static diver-share endpoint: same OG-meta render + redirect, fixed UTMs."""
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        return RedirectResponse(url="/", status_code=302)
    return HTMLResponse(
        content=_render_share_html(request, listing, {
            "utm_source": "diver_share", "utm_medium": "share", "utm_campaign": ""
        }),
        status_code=200,
        headers={"Cache-Control": "public, max-age=300"},
    )


# ─── Public: fire a click ──────────────────────────────────────────────
@router.post("/track/share-click")
@limiter.limit("60/minute")
async def track_click(body: ClickPayload, request: Request):
    listing = await db.operator_dive_listings.find_one(
        {"id": body.listing_id},
        {"_id": 0, "id": 1, "operator_id": 1}
    )
    if not listing:
        return {"ok": False}

    src = _normalize(body.utm_source)
    med = _normalize(body.utm_medium)
    cam = _normalize(body.utm_campaign)
    if not (src or med or cam):
        return {"ok": False, "skipped": True}

    ua = (request.headers.get("user-agent") or "")[:200]
    ua_family = "mobile" if any(t in ua.lower() for t in ("iphone", "android", "mobile")) else "desktop"
    ip = request.client.host if request.client else ""
    raw_visitor = (body.visitor_id or "")[:80] or hashlib.sha256(f"{ip}:{ua}".encode()).hexdigest()[:32]

    click = {
        "id": str(uuid.uuid4()),
        "listing_id": body.listing_id,
        "operator_id": listing.get("operator_id"),
        "utm_source": src[:40],
        "utm_medium": med[:40] or "share",
        "utm_campaign": cam[:40],
        "utm_content": _normalize(body.utm_content)[:40] if body.utm_content else "",
        "visitor_id": raw_visitor,
        "ua_family": ua_family,
        "referrer": (body.referrer or "")[:200],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.share_clicks.insert_one(click)
    return {"ok": True}


# ─── Aggregations ──────────────────────────────────────────────────────
async def _aggregate(match: dict, days: int = 30) -> dict:
    """Return summary stats for a click match filter."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    full_match = {**match, "created_at": {"$gte": since}}

    total = await db.share_clicks.count_documents(full_match)

    by_source = await db.share_clicks.aggregate([
        {"$match": full_match},
        {"$group": {"_id": "$utm_source", "clicks": {"$sum": 1}, "uniques": {"$addToSet": "$visitor_id"}}},
        {"$project": {"source": "$_id", "clicks": 1, "uniques": {"$size": "$uniques"}, "_id": 0}},
        {"$sort": {"clicks": -1}},
        {"$limit": 20},
    ]).to_list(20)

    by_campaign = await db.share_clicks.aggregate([
        {"$match": {**full_match, "utm_campaign": {"$ne": ""}}},
        {"$group": {"_id": "$utm_campaign", "clicks": {"$sum": 1}, "uniques": {"$addToSet": "$visitor_id"}}},
        {"$project": {"campaign": "$_id", "clicks": 1, "uniques": {"$size": "$uniques"}, "_id": 0}},
        {"$sort": {"clicks": -1}},
        {"$limit": 20},
    ]).to_list(20)

    bookings_filter = {"utm_source": {"$exists": True, "$ne": ""}, "created_at": {"$gte": since}}
    if "operator_id" in match:
        bookings_filter["operator_id"] = match["operator_id"]
    if "listing_id" in match:
        bookings_filter["listing_id"] = match["listing_id"]
    by_campaign_bookings = await db.bookings.aggregate([
        {"$match": {**bookings_filter, "utm_campaign": {"$ne": ""}}},
        {"$group": {"_id": "$utm_campaign", "bookings": {"$sum": 1}, "confirmed": {"$sum": {"$cond": [{"$eq": ["$status", "confirmed"]}, 1, 0]}}}},
    ]).to_list(20)
    cm = {b["_id"]: b for b in by_campaign_bookings}
    for c in by_campaign:
        b = cm.get(c["campaign"], {"bookings": 0, "confirmed": 0})
        c["bookings"] = b["bookings"]
        c["confirmed"] = b["confirmed"]
        c["conv_rate"] = round(b["bookings"] / c["clicks"] * 100, 1) if c["clicks"] > 0 else 0

    by_listing = await db.share_clicks.aggregate([
        {"$match": full_match},
        {"$group": {"_id": "$listing_id", "clicks": {"$sum": 1}}},
        {"$sort": {"clicks": -1}},
        {"$limit": 10},
    ]).to_list(10)
    listing_ids = [r["_id"] for r in by_listing]
    listings_map = {}
    if listing_ids:
        docs = await db.operator_dive_listings.find(
            {"id": {"$in": listing_ids}},
            {"_id": 0, "id": 1, "title": 1, "photos": 1}
        ).to_list(len(listing_ids))
        for d in docs:
            photo = ""
            if d.get("photos"):
                photo = d["photos"][0].get("url") if isinstance(d["photos"][0], dict) else d["photos"][0]
            listings_map[d["id"]] = {"title": d.get("title", "Untitled"), "photo": photo}
    top_listings = [
        {"listing_id": r["_id"], "clicks": r["clicks"], **listings_map.get(r["_id"], {})}
        for r in by_listing
    ]

    # bookings attributed
    booked = await db.bookings.count_documents(bookings_filter)
    confirmed = await db.bookings.count_documents({**bookings_filter, "status": "confirmed"})
    by_source_bookings = await db.bookings.aggregate([
        {"$match": bookings_filter},
        {"$group": {"_id": "$utm_source", "bookings": {"$sum": 1}, "confirmed": {"$sum": {"$cond": [{"$eq": ["$status", "confirmed"]}, 1, 0]}}}},
        {"$project": {"source": "$_id", "bookings": 1, "confirmed": 1, "_id": 0}},
    ]).to_list(20)
    bookings_map = {b["source"]: b for b in by_source_bookings}
    for s in by_source:
        b = bookings_map.get(s["source"], {"bookings": 0, "confirmed": 0})
        s["bookings"] = b["bookings"]
        s["confirmed"] = b["confirmed"]
        s["conv_rate"] = round(b["bookings"] / s["clicks"] * 100, 1) if s["clicks"] > 0 else 0

    # daily trend
    trend = await db.share_clicks.aggregate([
        {"$match": full_match},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "clicks": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(60)

    return {
        "total_clicks": total,
        "total_bookings": booked,
        "total_confirmed": confirmed,
        "conv_rate": round(booked / total * 100, 1) if total > 0 else 0,
        "by_source": by_source,
        "by_campaign": by_campaign,
        "top_listings": top_listings,
        "trend": [{"date": r["_id"], "clicks": r["clicks"]} for r in trend],
    }


@router.get("/operator/share-analytics")
async def operator_share_analytics(
    listing_id: Optional[str] = None,
    days: int = 30,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(403, "Operator only")
    days = max(1, min(days, 365))
    match = {"operator_id": current_user["id"]}
    if listing_id:
        listing = await db.operator_dive_listings.find_one({"id": listing_id, "operator_id": current_user["id"]}, {"_id": 0, "id": 1})
        if not listing:
            raise HTTPException(404, "Listing not found")
        match["listing_id"] = listing_id
    return await _aggregate(match, days)


@router.get("/admin/share-analytics")
async def admin_share_analytics(days: int = 30, current_user: dict = Depends(get_current_user)):
    from auth_utils import require_admin
    await require_admin(current_user)
    days = max(1, min(days, 365))
    base = await _aggregate({}, days)

    # Top operators by clicks
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    by_op = await db.share_clicks.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$operator_id", "clicks": {"$sum": 1}, "uniques": {"$addToSet": "$visitor_id"}}},
        {"$project": {"operator_id": "$_id", "clicks": 1, "uniques": {"$size": "$uniques"}, "_id": 0}},
        {"$sort": {"clicks": -1}},
        {"$limit": 15},
    ]).to_list(15)
    op_ids = [r["operator_id"] for r in by_op if r["operator_id"]]
    if op_ids:
        ops = await db.users.find({"id": {"$in": op_ids}}, {"_id": 0, "id": 1, "name": 1, "business_name": 1}).to_list(len(op_ids))
        op_map = {o["id"]: o for o in ops}
        for r in by_op:
            o = op_map.get(r["operator_id"], {})
            r["operator_name"] = o.get("business_name") or o.get("name") or "Unknown"

    base["top_operators"] = by_op
    return base
