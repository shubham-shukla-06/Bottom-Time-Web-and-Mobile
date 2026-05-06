"""
Site Content management (CMS for landing page + gating "coming soon" page).

Two CMS documents are managed here, each with its own draft + publish flow:
  - landing_page  → /api/admin/site-content/...        (existing — unchanged URLs)
  - gating_page   → /api/admin/gate-content/...        (new)

Collections:
  - site_content        : currently published landing-page document
  - site_content_draft  : admin's in-progress landing-page edits
  - gate_content        : currently published gating-page document
  - gate_content_draft  : admin's in-progress gating-page edits

Public reads (no auth):
  - GET /api/site-content/public  (defined in routes/public.py)
  - GET /api/gate-content/public  (here, in public_router)

Upload validation (shared by both CMS pages):
  - Max 15 MB for images, 50 MB for videos.
  - Images: JPG/PNG/WEBP. Hard block on unknown formats.
  - Videos: MP4/WEBM/MOV. Hard block on unknown formats.
  - Returns dimensions + format so the frontend can surface dimension warnings.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from datetime import datetime, timezone
from pathlib import Path
import uuid
import io
import json

from database import db
from auth_utils import get_current_user, require_admin
from config import UPLOAD_DIR

router = APIRouter()
public_router = APIRouter()

# -----------------------------------------------------------------------------
# Defaults
# -----------------------------------------------------------------------------

# Landing-page defaults match the previous hardcoded landing page values. Blank-string
# fields are intentionally empty so nothing new appears until an admin sets it.
LANDING_DEFAULTS = {
    "hero_media_type": "",      # empty = no background media
    "hero_image": "",
    "hero_video": "",
    "hero_title": "The ocean is calling.",
    "hero_subtitle": "Find your next dive, gear, merch and buddy.",
    "hero_description": "",
    "cta_primary_label": "Dive in",
    "cta_primary_link": "/discover",
    "cta_secondary_label": "",
    "cta_secondary_link": "",
    "section_images": {
        "about": "https://images.unsplash.com/photo-1600342709088-bb70d3371bcd?w=800&q=80",
        "curious": "https://images.unsplash.com/photo-1762005814284-45fdc51acd76?w=800&q=80",
        "operator": "https://images.unsplash.com/photo-1760643995643-5e6e3506a964?w=800&q=80",
        # NOTE: `community` slot is the image rendered in the Community section on the
        # landing page (was previously called `group`). When loading content we read
        # `community` first and fall back to legacy `group` for any pre-rename drafts.
        "community": "https://images.unsplash.com/photo-1759860954693-e8e7c39d5ea7?w=800&q=80",
    },
}

# Gating page (ComingSoon) defaults — TEXT ONLY. The hero image is a fixed
# bundled frontend asset (`/gate-hero.jpg`), never CMS-controlled, to guarantee
# zero flash and instant render even during maintenance windows.
GATING_DEFAULTS = {
    "gate_enabled": True,
    "badge_text": "Under Development",
    "accent_title": "The ocean is calling.",
    "slate_title": "We're getting ready.",
    "description": (
        "Bottom Time is building the ultimate platform for divers — discover experiences, "
        "log your dives, find gear, and connect with a global community. "
        "Be the first to know when we launch."
    ),
    "email_placeholder": "Enter your email",
    "submit_label": "Notify Me",
    "footer_text": "© Bottom Time. All rights reserved.",
}

PAGE_CONFIG = {
    "landing": {
        "key": "landing_page",
        "published_collection": "site_content",
        "draft_collection": "site_content_draft",
        "defaults": LANDING_DEFAULTS,
    },
    "gating": {
        "key": "gating_page",
        "published_collection": "gate_content",
        "draft_collection": "gate_content_draft",
        "defaults": GATING_DEFAULTS,
    },
}


IMAGE_EXTS = {"jpg", "jpeg", "png", "webp"}
VIDEO_EXTS = {"mp4", "webm", "mov"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _strip_mongo(d: dict | None) -> dict | None:
    if not d:
        return None
    return {k: v for k, v in d.items() if k != "_id"}


def _normalize(content: dict | None, page: str) -> dict:
    """Ensure returned document always carries the full expected shape for `page`."""
    cfg = PAGE_CONFIG[page]
    defaults = cfg["defaults"]
    merged = dict(defaults)
    if content:
        merged.update({k: v for k, v in content.items() if k != "_id"})
        # Deep-merge nested dicts (e.g. landing's section_images) so editing one
        # key doesn't wipe sibling keys.
        for k, default_val in defaults.items():
            if isinstance(default_val, dict):
                merged[k] = {**default_val, **(content.get(k) or {})}

    # Backward-compat: legacy landing drafts stored the community-section image
    # under the key `group`. If the renamed `community` key is missing or empty
    # but `group` exists, promote it so the front-end always reads `community`.
    if page == "landing":
        sec = merged.get("section_images") or {}
        legacy_group = sec.get("group")
        if legacy_group and not sec.get("community"):
            sec["community"] = legacy_group
        # Drop the orphan field from the response so the editor never re-renders it.
        sec.pop("group", None)
        merged["section_images"] = sec

    merged["key"] = cfg["key"]
    return merged


async def _load_pair(page: str) -> tuple[dict | None, dict | None]:
    cfg = PAGE_CONFIG[page]
    pub = _strip_mongo(await db[cfg["published_collection"]].find_one({"key": cfg["key"]}))
    drf = _strip_mongo(await db[cfg["draft_collection"]].find_one({"key": cfg["key"]}))
    return pub, drf


def _diff(pub_norm: dict, drf_norm: dict) -> bool:
    ignore = {"updated_at", "updated_by", "key", "_id", "published_at", "published_by"}
    a = {k: v for k, v in pub_norm.items() if k not in ignore}
    b = {k: v for k, v in drf_norm.items() if k not in ignore}
    return a != b


# -----------------------------------------------------------------------------
# Generic admin endpoints (parameterised by `page`)
# -----------------------------------------------------------------------------

async def _admin_get(page: str, current_user: dict):
    await require_admin(current_user)
    pub, drf = await _load_pair(page)
    pub_norm = _normalize(pub, page)
    drf_norm = _normalize(drf, page) if drf else dict(pub_norm)
    has_changes = _diff(pub_norm, drf_norm) if drf else False
    return {
        "published": pub_norm,
        "draft": drf_norm,
        "has_unpublished_changes": has_changes,
        "draft_updated_at": (drf or {}).get("updated_at"),
        "published_updated_at": (pub or {}).get("updated_at"),
        "scheduled_publish_at": (drf or {}).get("scheduled_publish_at"),
        "scheduled_by": (drf or {}).get("scheduled_by"),
    }


async def _admin_save_draft(page: str, content: dict, current_user: dict):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    existing = _strip_mongo(await db[cfg["draft_collection"]].find_one({"key": cfg["key"]}))
    if not existing:
        existing = _strip_mongo(await db[cfg["published_collection"]].find_one({"key": cfg["key"]})) or {}
        existing = _normalize(existing, page)

    merged = {**existing, **(content or {})}
    # Deep-merge nested dicts (e.g. section_images) so per-slot updates are additive
    for k, default_val in cfg["defaults"].items():
        if isinstance(default_val, dict) and k in (content or {}):
            merged[k] = {**(existing.get(k) or {}), **(content.get(k) or {})}

    merged["key"] = cfg["key"]
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged["updated_by"] = current_user["id"]

    await db[cfg["draft_collection"]].update_one(
        {"key": cfg["key"]}, {"$set": merged}, upsert=True
    )
    return _normalize(merged, page)


async def _next_version(page: str) -> int:
    cfg = PAGE_CONFIG[page]
    last = await db.cms_history.find_one(
        {"page": cfg["key"]}, sort=[("version", -1)], projection={"version": 1, "_id": 0}
    )
    return ((last or {}).get("version") or 0) + 1


async def _record_history(page: str, content: dict, published_by_id: str | None):
    """Insert a snapshot of `content` into `cms_history` after a successful publish."""
    cfg = PAGE_CONFIG[page]
    name = None
    if published_by_id:
        try:
            user = await db.users.find_one({"id": published_by_id}, {"_id": 0, "name": 1})
            if user:
                name = user.get("name")
        except Exception:
            name = None
    snapshot = {k: v for k, v in (content or {}).items() if k != "_id"}
    snapshot.pop("scheduled_publish_at", None)
    snapshot.pop("scheduled_by", None)
    snapshot.pop("scheduled_set_at", None)
    entry = {
        "id": str(uuid.uuid4()),
        "page": cfg["key"],
        "version": await _next_version(page),
        "content": snapshot,
        "published_at": content.get("published_at") or datetime.now(timezone.utc).isoformat(),
        "published_by": published_by_id,
        "published_by_name": name,
    }
    await db.cms_history.insert_one(entry)


async def _admin_publish(page: str, current_user: dict):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    draft = _strip_mongo(await db[cfg["draft_collection"]].find_one({"key": cfg["key"]}))
    if not draft:
        raise HTTPException(status_code=400, detail="No draft to publish")
    draft["key"] = cfg["key"]
    draft.pop("scheduled_publish_at", None)
    draft.pop("scheduled_by", None)
    draft.pop("scheduled_set_at", None)
    draft["published_at"] = datetime.now(timezone.utc).isoformat()
    draft["published_by"] = current_user["id"]
    await db[cfg["published_collection"]].update_one(
        {"key": cfg["key"]}, {"$set": draft}, upsert=True
    )
    await db[cfg["draft_collection"]].delete_one({"key": cfg["key"]})
    await _record_history(page, draft, current_user["id"])
    # Reap files no longer referenced by any CMS doc / history entry.
    try:
        await cleanup_orphan_uploads()
    except Exception:
        pass
    return {"message": "Published", "published_at": draft["published_at"]}


async def _admin_discard(page: str, current_user: dict):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    # Deleting the draft naturally cancels any pending schedule attached to it.
    await db[cfg["draft_collection"]].delete_one({"key": cfg["key"]})
    return {"message": "Draft discarded"}


async def _admin_schedule(page: str, body: dict, current_user: dict):
    """Schedule the current draft to auto-publish at `publish_at` (UTC ISO)."""
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    raw = (body or {}).get("publish_at")
    if not raw:
        raise HTTPException(status_code=400, detail="publish_at is required")
    try:
        # Accept both naive ("…+00:00" or "Z") and aware ISO strings.
        when = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="publish_at must be ISO-8601")
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when_utc = when.astimezone(timezone.utc)
    if when_utc <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="publish_at must be in the future")

    draft_exists = await db[cfg["draft_collection"]].find_one({"key": cfg["key"]}, {"_id": 1})
    if not draft_exists:
        raise HTTPException(status_code=400, detail="No draft to schedule. Edit something first.")

    await db[cfg["draft_collection"]].update_one(
        {"key": cfg["key"]},
        {"$set": {
            "scheduled_publish_at": when_utc.isoformat(),
            "scheduled_by": current_user["id"],
            "scheduled_set_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"message": "Scheduled", "scheduled_publish_at": when_utc.isoformat()}


async def _admin_cancel_schedule(page: str, current_user: dict):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    await db[cfg["draft_collection"]].update_one(
        {"key": cfg["key"]},
        {"$unset": {"scheduled_publish_at": "", "scheduled_by": "", "scheduled_set_at": ""}},
    )
    return {"message": "Schedule cancelled"}


# -----------------------------------------------------------------------------
# Orphan-file garbage collector
# -----------------------------------------------------------------------------

import re

_UPLOAD_URL_RE = re.compile(r"/api/uploads/([\w\-.]+)")


def _collect_uploads(*docs) -> set[str]:
    """Pull every '/api/uploads/<filename>' reference out of arbitrarily nested CMS docs."""
    found: set[str] = set()
    def walk(node):
        if node is None:
            return
        if isinstance(node, str):
            for m in _UPLOAD_URL_RE.findall(node):
                found.add(m)
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, (list, tuple)):
            for v in node:
                walk(v)
    for d in docs:
        walk(d)
    return found


async def cleanup_orphan_uploads() -> int:
    """Delete any file in UPLOAD_DIR that isn't referenced by ANY CMS document
    (current published, current draft, OR any version-history entry).

    Defensive guards:
      - Only files starting with our 'content_' prefix are candidates (preserves
        seed assets like brand-logo-full.png).
      - Files modified within the last 5 minutes are skipped to avoid racing with
        an in-flight upload that hasn't been linked yet.
    """
    referenced: set[str] = set()
    # Current docs
    for col in ("site_content", "site_content_draft", "gate_content", "gate_content_draft"):
        async for doc in db[col].find({}, {"_id": 0}):
            referenced |= _collect_uploads(doc)
    # History (every prior published version)
    async for entry in db.cms_history.find({}, {"_id": 0, "content": 1}):
        referenced |= _collect_uploads(entry.get("content"))

    now_ts = datetime.now(timezone.utc).timestamp()
    deleted = 0
    for f in UPLOAD_DIR.iterdir():
        if not f.is_file():
            continue
        if not f.name.startswith("content_"):
            continue
        if f.name in referenced:
            continue
        # 5-minute grace period for in-flight uploads
        if (now_ts - f.stat().st_mtime) < 300:
            continue
        try:
            f.unlink()
            deleted += 1
        except OSError:
            pass
    return deleted


# -----------------------------------------------------------------------------
# Background worker — promotes scheduled drafts whose moment has arrived.
# -----------------------------------------------------------------------------

async def run_scheduled_publisher_once():
    """Single sweep across both CMS docs. Returns count promoted."""
    promoted = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for page, cfg in PAGE_CONFIG.items():
        candidates = await db[cfg["draft_collection"]].find(
            {"scheduled_publish_at": {"$lte": now_iso, "$exists": True}}
        ).to_list(50)
        for draft in candidates:
            draft = _strip_mongo(draft) or {}
            scheduled_by = draft.get("scheduled_by") or "scheduler"
            draft.pop("scheduled_publish_at", None)
            draft.pop("scheduled_by", None)
            draft.pop("scheduled_set_at", None)
            draft["key"] = cfg["key"]
            draft["published_at"] = datetime.now(timezone.utc).isoformat()
            draft["published_by"] = scheduled_by
            await db[cfg["published_collection"]].update_one(
                {"key": cfg["key"]}, {"$set": draft}, upsert=True
            )
            await db[cfg["draft_collection"]].delete_one({"key": cfg["key"]})
            await _record_history(page, draft, scheduled_by if scheduled_by != "scheduler" else None)
            promoted += 1
    if promoted:
        try:
            await cleanup_orphan_uploads()
        except Exception:
            pass
    return promoted


# -----------------------------------------------------------------------------
# Version history + revert
# -----------------------------------------------------------------------------

async def _admin_history(page: str, current_user: dict, limit: int = 50):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    cur = db.cms_history.find(
        {"page": cfg["key"]},
        # Strip the heavy `content` payload from the list view — it's loaded on demand for preview.
        projection={"_id": 0, "content": 0},
    ).sort("published_at", -1).limit(max(1, min(limit, 200)))
    items = await cur.to_list(200)
    return {"items": items}


async def _admin_history_one(page: str, version_id: str, current_user: dict):
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    entry = await db.cms_history.find_one(
        {"page": cfg["key"], "id": version_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Version not found")
    entry["content"] = _normalize(entry.get("content") or {}, page)
    return entry


async def _admin_revert(page: str, body: dict, current_user: dict):
    """Copy a past published version into the current draft so the admin can review & publish."""
    await require_admin(current_user)
    cfg = PAGE_CONFIG[page]
    version_id = (body or {}).get("version_id")
    if not version_id:
        raise HTTPException(status_code=400, detail="version_id is required")
    entry = await db.cms_history.find_one({"page": cfg["key"], "id": version_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Version not found")

    src = {k: v for k, v in (entry.get("content") or {}).items()
           if k not in ("_id", "published_at", "published_by", "scheduled_publish_at",
                        "scheduled_by", "scheduled_set_at")}
    src["key"] = cfg["key"]
    src["updated_at"] = datetime.now(timezone.utc).isoformat()
    src["updated_by"] = current_user["id"]
    src["reverted_from_version"] = entry.get("version")

    await db[cfg["draft_collection"]].update_one(
        {"key": cfg["key"]}, {"$set": src}, upsert=True
    )
    return {
        "message": "Reverted to draft",
        "reverted_from_version": entry.get("version"),
        "draft": _normalize(src, page),
    }


# -----------------------------------------------------------------------------
# Landing-page admin endpoints (existing URLs — unchanged for backward compat)
# -----------------------------------------------------------------------------

@router.get("/admin/site-content")
async def admin_get_site_content(current_user: dict = Depends(get_current_user)):
    return await _admin_get("landing", current_user)


@router.put("/admin/site-content/draft")
async def admin_save_landing_draft(content: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_save_draft("landing", content, current_user)


@router.post("/admin/site-content/publish")
async def admin_publish_landing(current_user: dict = Depends(get_current_user)):
    return await _admin_publish("landing", current_user)


@router.post("/admin/site-content/discard-draft")
async def admin_discard_landing(current_user: dict = Depends(get_current_user)):
    return await _admin_discard("landing", current_user)


@router.post("/admin/site-content/schedule")
async def admin_schedule_landing(body: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_schedule("landing", body, current_user)


@router.post("/admin/site-content/cancel-schedule")
async def admin_cancel_schedule_landing(current_user: dict = Depends(get_current_user)):
    return await _admin_cancel_schedule("landing", current_user)


@router.get("/admin/site-content/history")
async def admin_history_landing(current_user: dict = Depends(get_current_user)):
    return await _admin_history("landing", current_user)


@router.get("/admin/site-content/history/{version_id}")
async def admin_history_one_landing(version_id: str, current_user: dict = Depends(get_current_user)):
    return await _admin_history_one("landing", version_id, current_user)


@router.post("/admin/site-content/revert")
async def admin_revert_landing(body: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_revert("landing", body, current_user)


# -----------------------------------------------------------------------------
# Gating-page admin endpoints (new)
# -----------------------------------------------------------------------------

@router.get("/admin/gate-content")
async def admin_get_gate_content(current_user: dict = Depends(get_current_user)):
    return await _admin_get("gating", current_user)


@router.put("/admin/gate-content/draft")
async def admin_save_gate_draft(content: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_save_draft("gating", content, current_user)


@router.post("/admin/gate-content/publish")
async def admin_publish_gate(current_user: dict = Depends(get_current_user)):
    return await _admin_publish("gating", current_user)


@router.post("/admin/gate-content/discard-draft")
async def admin_discard_gate(current_user: dict = Depends(get_current_user)):
    return await _admin_discard("gating", current_user)


@router.post("/admin/gate-content/schedule")
async def admin_schedule_gate(body: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_schedule("gating", body, current_user)


@router.post("/admin/gate-content/cancel-schedule")
async def admin_cancel_schedule_gate(current_user: dict = Depends(get_current_user)):
    return await _admin_cancel_schedule("gating", current_user)


@router.post("/admin/cms/cleanup-orphans")
async def admin_cleanup_orphan_uploads(current_user: dict = Depends(get_current_user)):
    """Manual trigger for the orphan-upload sweep. Returns count of files deleted."""
    await require_admin(current_user)
    deleted = await cleanup_orphan_uploads()
    return {"deleted": deleted}


@router.get("/admin/gate-content/history")
async def admin_history_gate(current_user: dict = Depends(get_current_user)):
    return await _admin_history("gating", current_user)


@router.get("/admin/gate-content/history/{version_id}")
async def admin_history_one_gate(version_id: str, current_user: dict = Depends(get_current_user)):
    return await _admin_history_one("gating", version_id, current_user)


@router.post("/admin/gate-content/revert")
async def admin_revert_gate(body: dict, current_user: dict = Depends(get_current_user)):
    return await _admin_revert("gating", body, current_user)


# -----------------------------------------------------------------------------
# Shared media upload (used by both editors)
# -----------------------------------------------------------------------------

@router.post("/admin/site-content/upload")
async def admin_upload_media(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an image or video for any CMS slot.

    Returns: { url, width, height, format, bytes, kind }
    kind: "image" | "video"
    """
    await require_admin(current_user)

    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in (IMAGE_EXTS | VIDEO_EXTS):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension .{ext}. Allowed: images ({', '.join(sorted(IMAGE_EXTS))}), videos ({', '.join(sorted(VIDEO_EXTS))}).",
        )

    is_image = ext in IMAGE_EXTS
    max_bytes = MAX_IMAGE_BYTES if is_image else MAX_VIDEO_BYTES
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file received — the image could not be encoded.")
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large — max {max_bytes // (1024*1024)} MB",
        )

    filename = f"content_{uuid.uuid4().hex[:12]}.{ext}"
    filepath: Path = UPLOAD_DIR / filename
    filepath.write_bytes(data)

    width = height = None
    if is_image:
        try:
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                width, height = im.size
        except Exception:
            width = height = None

    return {
        "url": f"/api/uploads/{filename}",
        "width": width,
        "height": height,
        "format": ext,
        "bytes": len(data),
        "kind": "image" if is_image else "video",
    }


# -----------------------------------------------------------------------------
# Public reads
# -----------------------------------------------------------------------------

@public_router.get("/site-content/draft-preview")
async def get_landing_draft_preview(current_user: dict = Depends(get_current_user)):
    """Admin-only: returns the landing-page draft for the iframe preview."""
    await require_admin(current_user)
    pub, drf = await _load_pair("landing")
    return _normalize(drf or pub, "landing")


@public_router.get("/gate-content/draft-preview")
async def get_gate_draft_preview(current_user: dict = Depends(get_current_user)):
    """Admin-only: returns the gating-page draft for the iframe preview."""
    await require_admin(current_user)
    pub, drf = await _load_pair("gating")
    return _normalize(drf or pub, "gating")


@public_router.get("/gate-content/public")
async def get_public_gate_content():
    """Public: live gating-page content used by ComingSoon and the gate decision."""
    pub = _strip_mongo(await db.gate_content.find_one({"key": "gating_page"}))
    return _normalize(pub, "gating")


@public_router.get("/cms-bootstrap.js", include_in_schema=False)
async def cms_bootstrap_js():
    """Inline the latest published Landing + Gating CMS state into a tiny JS file
    that the SPA's index.html loads SYNCHRONOUSLY before the React bundle. This
    eliminates the "fallback flashes before fetch lands" problem for first-time
    visitors (where localStorage caching can't help). Cache-Control allows CDNs /
    browsers to keep the bootstrap for 30s with stale-while-revalidate, so repeat
    paints are instant and the database isn't hammered."""
    landing = _strip_mongo(await db.site_content.find_one({"key": "landing_page"}))
    gating = _strip_mongo(await db.gate_content.find_one({"key": "gating_page"}))
    landing_n = _normalize(landing, "landing")
    gating_n = _normalize(gating, "gating")
    body = (
        "window.__BT_CMS_LANDING__=" + json.dumps(landing_n, separators=(",", ":")) + ";"
        "window.__BT_CMS_GATE__=" + json.dumps(gating_n, separators=(",", ":")) + ";"
    )
    return Response(
        content=body,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=300"},
    )
