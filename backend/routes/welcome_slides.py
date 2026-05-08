"""Welcome-screen carousel management.

Admin endpoints (role=admin required):
  GET    /api/admin/welcome-slides          — list all (any status)
  POST   /api/admin/welcome-slides/upload   — multipart image upload
  POST   /api/admin/welcome-slides          — create a slide row (server-side crops)
  PATCH  /api/admin/welcome-slides/{id}     — partial update (re-crops on crop_box)
  DELETE /api/admin/welcome-slides/{id}     — hard delete (+ both image files)
  POST   /api/admin/welcome-slides/reorder  — persist a new sort order

Public endpoint (no auth):
  GET    /api/welcome-slides                — active slides, ordered by sort_order

CROP MODEL
----------
Each slide stores TWO image URLs:
  • image_url_original — the unmodified upload, used for re-cropping on edit.
  • image_url          — a JPEG cropped server-side to MOBILE_VISIBLE_ASPECT_RATIO,
                         this is what mobile downloads.
The admin sends a `crop_box` of {x, y, width, height} as fractions in [0..1]
of the original image's pixel dimensions. Server validates that crop_box's
aspect matches MOBILE_VISIBLE_ASPECT_RATIO within a small tolerance, then
uses Pillow to extract that rectangle, resize to CROPPED_TARGET_WIDTH_PX,
and save as JPEG q=85. Mobile renders the cropped JPEG with `contentFit=cover`
inside a `SCREEN_W × (SCREEN_H - SHEET_H)` view — no client-side math.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import io
import logging
import os
import uuid

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pydantic import BaseModel, Field, field_validator
from PIL import Image as PILImage

from auth_utils import get_current_user, require_admin
from config import UPLOAD_DIR
from database import db
from welcome_visible import (
    MOBILE_VISIBLE_ASPECT_RATIO,
    CROPPED_TARGET_WIDTH_PX,
    CROP_ASPECT_TOLERANCE,
)

log = logging.getLogger(__name__)


# -------- Paths / constants -----------------------------------------------

WELCOME_UPLOAD_DIR = UPLOAD_DIR / "welcome"
WELCOME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_LONG_EDGE_PX = 1500
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EXT_FROM_CT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


# -------- Pydantic models -------------------------------------------------

class CropBox(BaseModel):
    """Crop rectangle in source-image fractional coordinates (all 0..1)."""
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(gt=0.0, le=1.0)
    height: float = Field(gt=0.0, le=1.0)

    @field_validator("width")
    @classmethod
    def _check_x_plus_w(cls, v, info):
        return v  # bounds check happens in the model_validator below

    def validate_aspect(self) -> None:
        """Reject crop boxes whose aspect drifts too far from the canonical
        mobile-visible aspect. Even with a locked stencil the admin UI can
        round by a hair; we tolerate up to CROP_ASPECT_TOLERANCE."""
        if self.x + self.width > 1.0 + 1e-6 or self.y + self.height > 1.0 + 1e-6:
            raise ValueError("crop_box extends past image bounds")
        aspect = self.width / self.height if self.height else 0
        # `width` and `height` here are fractions of source dims, so the
        # crop's pixel aspect is (width * sourceW) / (height * sourceH) which
        # we don't know without sourceW/H. The validator below re-checks
        # aspect in pixel space.
        # This sanity check just catches obvious garbage.
        if aspect <= 0:
            raise ValueError("crop_box has non-positive aspect")


class WelcomeSlideCreate(BaseModel):
    image_url_original: str
    original_filename: Optional[str] = None
    attribution_text: Optional[str] = None
    show_attribution: bool = True
    crop_box: CropBox
    sort_order: Optional[int] = None
    active: bool = True

    @field_validator("image_url_original")
    @classmethod
    def _must_be_our_upload(cls, v: str) -> str:
        if not v or not v.startswith("/api/uploads/welcome/"):
            raise ValueError("image_url_original must be a welcome upload path")
        return v


class WelcomeSlidePatch(BaseModel):
    attribution_text: Optional[str] = None
    show_attribution: Optional[bool] = None
    crop_box: Optional[CropBox] = None
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
    """Map `/api/uploads/welcome/<name>` back to a filesystem path."""
    prefix = "/api/uploads/welcome/"
    if not image_url or not image_url.startswith(prefix):
        return None
    name = image_url[len(prefix):]
    if "/" in name or ".." in name:
        return None  # anti-traversal
    return WELCOME_UPLOAD_DIR / name


def _crop_and_save(
    original_url: str,
    crop_box: CropBox,
    slide_id: str,
) -> str:
    """Open the original image, extract `crop_box` (fractions of source
    dims), resize to CROPPED_TARGET_WIDTH_PX, save as JPEG, return the
    public URL of the cropped file. Validates that the resulting pixel
    rectangle's aspect matches MOBILE_VISIBLE_ASPECT_RATIO within tolerance.

    Raises HTTPException(400) on invalid input.
    """
    src_path = _filepath_from_url(original_url)
    if not src_path or not src_path.exists():
        raise HTTPException(status_code=400, detail="Original image not found on disk")
    try:
        im = PILImage.open(src_path)
        # Apply EXIF orientation so the crop coords match what the admin saw.
        try:
            from PIL import ImageOps
            im = ImageOps.exif_transpose(im)
        except Exception:
            pass
        src_w, src_h = im.size
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode original image")

    left = int(round(crop_box.x * src_w))
    top = int(round(crop_box.y * src_h))
    right = int(round((crop_box.x + crop_box.width) * src_w))
    bottom = int(round((crop_box.y + crop_box.height) * src_h))
    # Clamp to image bounds.
    left = max(0, min(src_w - 1, left))
    top = max(0, min(src_h - 1, top))
    right = max(left + 1, min(src_w, right))
    bottom = max(top + 1, min(src_h, bottom))
    crop_w_px = right - left
    crop_h_px = bottom - top
    if crop_w_px < 100 or crop_h_px < 100:
        raise HTTPException(status_code=400, detail="Crop region is too small")

    pixel_aspect = crop_w_px / crop_h_px
    if abs(pixel_aspect - MOBILE_VISIBLE_ASPECT_RATIO) > CROP_ASPECT_TOLERANCE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Crop aspect {pixel_aspect:.4f} is outside the allowed range "
                f"({MOBILE_VISIBLE_ASPECT_RATIO:.4f} ± {CROP_ASPECT_TOLERANCE})."
            ),
        )

    cropped = im.crop((left, top, right, bottom))
    # Resize so width = CROPPED_TARGET_WIDTH_PX while preserving aspect.
    target_w = CROPPED_TARGET_WIDTH_PX
    target_h = int(round(target_w / pixel_aspect))
    cropped = cropped.resize((target_w, target_h), PILImage.LANCZOS)

    # PIL needs RGB for JPEG.
    if cropped.mode != "RGB":
        cropped = cropped.convert("RGB")

    out_name = f"{slide_id}-cropped.jpg"
    out_path = WELCOME_UPLOAD_DIR / out_name
    cropped.save(out_path, format="JPEG", quality=85, optimize=True, progressive=True)
    return f"/api/uploads/welcome/{out_name}"


def _delete_file_if_orphan(image_url: Optional[str], current_id: Optional[str] = None) -> None:
    """Delete the on-disk file if no other slide references it."""
    if not image_url:
        return
    # Synchronous helper used by route handlers — they already use Motor for
    # the Mongo work, so just check existence on disk and unlink.
    p = _filepath_from_url(image_url)
    if p and p.exists():
        try:
            os.remove(p)
        except OSError:
            pass


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

    try:
        im = PILImage.open(io.BytesIO(contents))
        im.verify()
        im = PILImage.open(io.BytesIO(contents))
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
        "image_url_original": f"/api/uploads/welcome/{filename}",
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

    if body.sort_order is None:
        last = await db.welcome_slides.find({}, {"sort_order": 1}) \
            .sort([("sort_order", -1)]).limit(1).to_list(1)
        next_order = (last[0]["sort_order"] + 1) if last else 0
    else:
        next_order = body.sort_order

    slide_id = str(uuid.uuid4())
    body.crop_box.validate_aspect()
    cropped_url = _crop_and_save(body.image_url_original, body.crop_box, slide_id)

    now = datetime.now(timezone.utc)
    doc = {
        "id": slide_id,
        "image_url": cropped_url,
        "image_url_original": body.image_url_original,
        "original_filename": body.original_filename,
        "attribution_text": body.attribution_text,
        "show_attribution": body.show_attribution,
        "crop_box": body.crop_box.model_dump(),
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
    existing = await db.welcome_slides.find_one({"id": slide_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Slide not found")

    update: dict = {}
    for field in ("attribution_text", "show_attribution", "sort_order", "active"):
        v = getattr(body, field)
        if v is not None:
            update[field] = v

    if body.crop_box is not None:
        body.crop_box.validate_aspect()
        original_url = existing.get("image_url_original")
        if not original_url:
            raise HTTPException(
                status_code=400,
                detail="Cannot recrop: this slide has no original image stored.",
            )
        cropped_url = _crop_and_save(original_url, body.crop_box, slide_id)
        update["crop_box"] = body.crop_box.model_dump()
        update["image_url"] = cropped_url

    if not update:
        raise HTTPException(status_code=400, detail="Empty patch")
    update["updated_at"] = datetime.now(timezone.utc)
    res = await db.welcome_slides.find_one_and_update(
        {"id": slide_id},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
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

    # Drop both files (cropped + original) if no other slide references them.
    for url_field in ("image_url", "image_url_original"):
        url = doc.get(url_field)
        if not url:
            continue
        still_used = await db.welcome_slides.count_documents({
            "$or": [{"image_url": url}, {"image_url_original": url}],
        })
        if still_used == 0:
            _delete_file_if_orphan(url)
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
    """Mobile-facing endpoint. Deliberately minimal — only the cropped
    image URL + attribution. No crop_box / focal_point / zoom because
    the renderer no longer does any client-side math."""
    await _ensure_indexes()
    cur = db.welcome_slides.find(
        {"active": True},
        {
            "_id": 0, "id": 1, "image_url": 1, "attribution_text": 1,
            "show_attribution": 1, "sort_order": 1,
        },
    ).sort([("sort_order", 1), ("created_at", 1)])
    docs = await cur.to_list(500)
    return {"slides": docs}


# -------- Lifespan migration ----------------------------------------------

async def migrate_legacy_slides() -> None:
    """One-time conversion of pre-server-side-crop rows.

    Old shape: focal_point + zoom (client-side rendered). New shape:
    crop_box + image_url_original + image_url (server-side cropped).

    For each legacy row we synthesise a sensible crop_box from the stored
    focal_point + zoom, regenerate the cropped JPEG, and overwrite the row
    in place. Failures are logged and skipped so a single bad row never
    blocks startup.
    """
    cur = db.welcome_slides.find(
        {
            "$or": [
                {"crop_box": {"$exists": False}},
                {"image_url_original": {"$exists": False}},
            ]
        },
        {"_id": 0},
    )
    legacy = await cur.to_list(500)
    if not legacy:
        return

    for row in legacy:
        try:
            sid = row["id"]
            # Source image: prefer image_url_original if present, else fall
            # back to whatever `image_url` points at (the legacy upload).
            original_url = row.get("image_url_original") or row.get("image_url")
            if not original_url:
                log.warning("welcome_slides migration: %s has no image_url", sid)
                continue
            src_path = _filepath_from_url(original_url)
            if not src_path or not src_path.exists():
                log.warning("welcome_slides migration: %s source file missing", sid)
                continue

            im = PILImage.open(src_path)
            try:
                from PIL import ImageOps
                im = ImageOps.exif_transpose(im)
            except Exception:
                pass
            iw, ih = im.size

            fp = row.get("focal_point") or {"x": 0.5, "y": 0.5}
            fx = max(0.0, min(1.0, float(fp.get("x", 0.5))))
            fy = max(0.0, min(1.0, float(fp.get("y", 0.5))))

            # Old "zoom" was a multiplier that shrinks the visible window. At
            # zoom=1, the visible window covers the whole image (cover-fit).
            # Synthesise a crop rectangle that has the canonical aspect AND
            # is sized to roughly match the legacy zoom — the tightest
            # rectangle of MOBILE_VISIBLE_ASPECT_RATIO that fits inside the
            # image, scaled by 1/zoom.
            z = max(1.0, min(3.0, float(row.get("zoom", 1.0))))
            # Largest rect of canonical aspect that fits in the image:
            target_aspect = MOBILE_VISIBLE_ASPECT_RATIO
            if iw / ih > target_aspect:
                # Image is wider — height is the limit.
                base_h_px = ih
                base_w_px = ih * target_aspect
            else:
                base_w_px = iw
                base_h_px = iw / target_aspect
            crop_w_px = base_w_px / z
            crop_h_px = base_h_px / z

            cx = fx * iw
            cy = fy * ih
            left_px = max(0.0, min(iw - crop_w_px, cx - crop_w_px / 2))
            top_px = max(0.0, min(ih - crop_h_px, cy - crop_h_px / 2))

            crop_box = CropBox(
                x=left_px / iw,
                y=top_px / ih,
                width=crop_w_px / iw,
                height=crop_h_px / ih,
            )
            cropped_url = _crop_and_save(original_url, crop_box, sid)
            await db.welcome_slides.update_one(
                {"id": sid},
                {
                    "$set": {
                        "image_url": cropped_url,
                        "image_url_original": original_url,
                        "crop_box": crop_box.model_dump(),
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$unset": {"focal_point": "", "zoom": ""},
                },
            )
            log.info("welcome_slides migration: %s converted", sid)
        except Exception as exc:  # noqa: BLE001
            log.warning("welcome_slides migration: %s skipped: %s", row.get("id"), exc)
