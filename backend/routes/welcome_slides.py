"""Welcome-screen carousel management.

Admin endpoints (role=admin required):
  GET    /api/admin/welcome-slides          — list all (any status)
  POST   /api/admin/welcome-slides/upload   — multipart image upload
  POST   /api/admin/welcome-slides          — create a slide row
  PATCH  /api/admin/welcome-slides/{id}     — partial update
  DELETE /api/admin/welcome-slides/{id}     — hard delete (+ orphaned file)
  POST   /api/admin/welcome-slides/reorder  — persist a new sort order

Public endpoint (no auth):
  GET    /api/welcome-slides                — active slides, ordered by sort_order

Slides are stored in the `welcome_slides` collection and referenced image
files live under `backend/uploads/welcome/` (served from `/api/uploads/`).
The mobile app consumes the public endpoint on welcome-screen mount and
falls back to a baked-in 4-slide default when the list is empty.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import io
import os
import uuid

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pydantic import BaseModel, Field, field_validator
from PIL import Image as PILImage

from auth_utils import get_current_user, require_admin
from config import UPLOAD_DIR
from database import db


# -------- Paths / constants -----------------------------------------------

WELCOME_UPLOAD_DIR = UPLOAD_DIR / "welcome"
WELCOME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_LONG_EDGE_PX = 1500
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EXT_FROM_CT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


# -------- Pydantic models -------------------------------------------------

class FocalPoint(BaseModel):
    x: float = Field(0.5, ge=0.0, le=1.0)
    y: float = Field(0.5, ge=0.0, le=1.0)


class WelcomeSlideCreate(BaseModel):
    image_url: str
    original_filename: Optional[str] = None
    attribution_text: Optional[str] = None
    show_attribution: bool = True
    focal_point: FocalPoint = Field(default_factory=FocalPoint)
    zoom: float = Field(1.0, ge=1.0, le=3.0)
    sort_order: Optional[int] = None
    active: bool = True

    @field_validator("image_url")
    @classmethod
    def _must_be_our_upload(cls, v: str) -> str:
        if not v or not v.startswith("/api/uploads/welcome/"):
            raise ValueError("image_url must be a welcome upload path")
        return v


class WelcomeSlidePatch(BaseModel):
    attribution_text: Optional[str] = None
    show_attribution: Optional[bool] = None
    focal_point: Optional[FocalPoint] = None
    zoom: Optional[float] = Field(None, ge=1.0, le=3.0)
    sort_order: Optional[int] = None
    active: Optional[bool] = None


class WelcomeSlideReorder(BaseModel):
    ids: List[str]


# -------- Helpers ---------------------------------------------------------

async def _ensure_indexes() -> None:
    await db.welcome_slides.create_index([("active", 1), ("sort_order", 1)])
    await db.welcome_slides.create_index([("id", 1)], unique=True)


def _strip(doc: dict) -> dict:
    """Drop Mongo's `_id` before returning. We already have our own `id`."""
    d = dict(doc)
    d.pop("_id", None)
    return d


def _filepath_from_url(image_url: str) -> Optional[Path]:
    """Map `/api/uploads/welcome/<name>` back to a filesystem path. Returns
    None if the URL doesn't look like one of our welcome uploads."""
    prefix = "/api/uploads/welcome/"
    if not image_url or not image_url.startswith(prefix):
        return None
    name = image_url[len(prefix):]
    if "/" in name or ".." in name:
        return None  # anti-traversal
    return WELCOME_UPLOAD_DIR / name


# -------- Routers ---------------------------------------------------------

admin_router = APIRouter()
public_router = APIRouter()


@admin_router.get("/admin/welcome-slides")
async def list_all_slides(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    await _ensure_indexes()
    cur = db.welcome_slides.find({}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)])
    docs = await cur.to_list(500)
    return {"slides": docs}


@admin_router.post("/admin/welcome-slides/upload")
async def upload_slide_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    await require_admin(current_user)
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP are allowed")
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    # Decode to read dimensions + sanity-check it's really an image.
    try:
        im = PILImage.open(io.BytesIO(contents))
        im.verify()  # ensures the bytes parse as an image
        im = PILImage.open(io.BytesIO(contents))  # re-open after verify()
        width, height = im.size
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")

    long_edge = max(width, height)
    if long_edge < MIN_LONG_EDGE_PX:
        raise HTTPException(
            status_code=400,
            detail=f"Image long edge {long_edge}px is below the 1500px minimum",
        )

    ext = _EXT_FROM_CT[file.content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    target = WELCOME_UPLOAD_DIR / filename
    target.write_bytes(contents)

    return {
        "image_url": f"/api/uploads/welcome/{filename}",
        "original_filename": file.filename or filename,
        "width": width,
        "height": height,
        "bytes": len(contents),
    }


@admin_router.post("/admin/welcome-slides")
async def create_slide(
    body: WelcomeSlideCreate,
    current_user: dict = Depends(get_current_user),
):
    await require_admin(current_user)
    await _ensure_indexes()

    # Auto-append at the end if no sort_order supplied.
    if body.sort_order is None:
        last = await db.welcome_slides.find({}, {"sort_order": 1}) \
            .sort([("sort_order", -1)]).limit(1).to_list(1)
        next_order = (last[0]["sort_order"] + 1) if last else 0
    else:
        next_order = body.sort_order

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "image_url": body.image_url,
        "original_filename": body.original_filename,
        "attribution_text": body.attribution_text,
        "show_attribution": body.show_attribution,
        "focal_point": body.focal_point.model_dump(),
        "zoom": body.zoom,
        "sort_order": next_order,
        "active": body.active,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user["id"],
    }
    await db.welcome_slides.insert_one(doc)
    return _strip(doc)


@admin_router.patch("/admin/welcome-slides/{slide_id}")
async def patch_slide(
    slide_id: str,
    body: WelcomeSlidePatch,
    current_user: dict = Depends(get_current_user),
):
    await require_admin(current_user)
    update: dict = {}
    for field in ("attribution_text", "show_attribution", "zoom", "sort_order", "active"):
        v = getattr(body, field)
        if v is not None:
            update[field] = v
    if body.focal_point is not None:
        update["focal_point"] = body.focal_point.model_dump()
    if not update:
        raise HTTPException(status_code=400, detail="Empty patch")
    update["updated_at"] = datetime.now(timezone.utc)
    res = await db.welcome_slides.find_one_and_update(
        {"id": slide_id},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Slide not found")
    return res


@admin_router.delete("/admin/welcome-slides/{slide_id}")
async def delete_slide(
    slide_id: str,
    current_user: dict = Depends(get_current_user),
):
    await require_admin(current_user)
    doc = await db.welcome_slides.find_one({"id": slide_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Slide not found")
    await db.welcome_slides.delete_one({"id": slide_id})

    # If no other row still references this file, delete the file too.
    url = doc.get("image_url")
    still_used = await db.welcome_slides.count_documents({"image_url": url})
    if url and still_used == 0:
        path = _filepath_from_url(url)
        if path and path.exists():
            try:
                os.remove(path)
            except OSError:
                pass
    return {"ok": True, "id": slide_id}


@admin_router.post("/admin/welcome-slides/reorder")
async def reorder_slides(
    body: WelcomeSlideReorder,
    current_user: dict = Depends(get_current_user),
):
    await require_admin(current_user)
    if not body.ids:
        return {"ok": True, "updated": 0}
    now = datetime.now(timezone.utc)
    count = 0
    for idx, sid in enumerate(body.ids):
        res = await db.welcome_slides.update_one(
            {"id": sid}, {"$set": {"sort_order": idx, "updated_at": now}},
        )
        count += res.modified_count
    return {"ok": True, "updated": count}


@public_router.get("/welcome-slides")
async def list_active_slides():
    await _ensure_indexes()
    cur = db.welcome_slides.find(
        {"active": True},
        {
            "_id": 0, "id": 1, "image_url": 1, "attribution_text": 1,
            "show_attribution": 1, "focal_point": 1, "zoom": 1, "sort_order": 1,
        },
    ).sort([("sort_order", 1), ("created_at", 1)])
    docs = await cur.to_list(500)
    return {"slides": docs}
