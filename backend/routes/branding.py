"""
Phase 5-A — Branding & App Store Assets endpoints.

Locked behavior — see `/app/memory/BRANDING_ASSETS_LOCKED.md`.

Endpoints:
  GET  /api/branding/app-icon?size=100        — public; streams matching PNG
                                                falls back to nearest larger.
  GET  /api/branding/app-icon.zip             — public; all sizes as a zip.
  POST /api/admin/branding/app-icon           — super-admin; multipart upload
                                                of a square PNG >= 1024x1024.
                                                Regenerates all derivatives.
  GET  /api/admin/branding/app-icon/info      — admin; lists sizes + meta.

The static files live in /app/backend/static/branding/. The directory is
authoritative — do NOT modify outside of this router (the POST handler
regenerates the full derivative set atomically).
"""
from __future__ import annotations

import io
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image

from auth_utils import get_current_user, require_admin
from config import SUPER_ADMINS
from database import db

router = APIRouter()

# ─── Canonical paths ──────────────────────────────────────────────────────
BRANDING_DIR = Path(__file__).resolve().parent.parent / "static" / "branding"
DERIVATIVE_SIZES = [32, 64, 100, 120, 180, 192, 512, 1024]
PUBLIC_SIZES = [64, 100, 120, 180, 192, 512, 1024]  # advertised in the API/UI


def _icon_path(size: int) -> Path:
    return BRANDING_DIR / f"app_icon_{size}.png"


def _favicon_path() -> Path:
    return BRANDING_DIR / "favicon.ico"


def _nearest_larger(size: int) -> int:
    for s in DERIVATIVE_SIZES:
        if s >= size:
            return s
    return DERIVATIVE_SIZES[-1]


# ─── Super-admin gate (matches /admin/refunds/create pattern) ─────────────
async def _require_super_admin(current_user: dict) -> None:
    await require_admin(current_user)
    if not any(s["email"] == current_user["email"] for s in SUPER_ADMINS):
        raise HTTPException(status_code=403, detail="Super-admin required to modify branding assets")


# ─── Public: serve icon at requested size (with fallback) ─────────────────
@router.get("/branding/app-icon")
async def get_app_icon(size: int = 100):
    target = _nearest_larger(size)
    path = _icon_path(target)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"App icon at size {target} not found on disk")
    return FileResponse(str(path), media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
        "X-Icon-Size": str(target),
    })


# ─── Public: download zip of all sizes (App Store submission bundle) ──────
@router.get("/branding/app-icon.zip")
async def get_app_icon_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for size in DERIVATIVE_SIZES:
            p = _icon_path(size)
            if p.exists():
                zf.write(str(p), arcname=f"app_icon_{size}.png")
        fav = _favicon_path()
        if fav.exists():
            zf.write(str(fav), arcname="favicon.ico")
        # README so the recipient knows the platform mapping
        readme = (
            "Bottom Time — App Store Icon Pack\n"
            "==================================\n"
            "app_icon_1024.png — App Store / Master\n"
            "app_icon_512.png  — Google Play Store\n"
            "app_icon_192.png  — PWA manifest (Android Chrome)\n"
            "app_icon_180.png  — iOS @3x\n"
            "app_icon_120.png  — iOS @2x\n"
            "app_icon_100.png  — Misc / web preview\n"
            "app_icon_64.png   — Favicon high-DPI\n"
            "app_icon_32.png   — Favicon\n"
            "favicon.ico       — Multi-size ICO (16/32/48/64)\n"
        )
        zf.writestr("README.txt", readme)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="bottom-time-app-icons.zip"'},
    )


# ─── Admin: info ──────────────────────────────────────────────────────────
@router.get("/admin/branding/app-icon/info")
async def get_app_icon_info(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    sizes_on_disk = []
    for size in DERIVATIVE_SIZES:
        p = _icon_path(size)
        if p.exists():
            sizes_on_disk.append({
                "size": size,
                "bytes": p.stat().st_size,
                "url": f"/api/branding/app-icon?size={size}",
            })
    settings = await db.site_settings.find_one({"_id": "singleton"}, {"_id": 0}) or {}
    return {
        "sizes": sizes_on_disk,
        "favicon_ico_exists": _favicon_path().exists(),
        "favicon_url": "/api/branding/favicon.ico",
        "zip_url": "/api/branding/app-icon.zip",
        "updated_at": settings.get("app_icon_updated_at"),
        "uploaded_by": settings.get("app_icon_uploaded_by"),
    }


# ─── Public: favicon (for browsers that bypass /public/favicon.ico) ──────
@router.get("/branding/favicon.ico")
async def get_favicon():
    p = _favicon_path()
    if not p.exists():
        raise HTTPException(status_code=404, detail="favicon.ico not found")
    return FileResponse(str(p), media_type="image/x-icon", headers={"Cache-Control": "public, max-age=86400"})


# ─── Admin: upload a new master icon, regenerate all derivatives ─────────
@router.post("/admin/branding/app-icon")
async def upload_app_icon(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    await _require_super_admin(current_user)

    if not file.content_type or "png" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail="Only PNG uploads are accepted")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (10MB max)")

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not decode PNG: {e}")

    if img.size[0] != img.size[1]:
        raise HTTPException(status_code=400, detail=f"Icon must be square. Got {img.size[0]}x{img.size[1]}.")
    if img.size[0] < 1024:
        raise HTTPException(status_code=400, detail=f"Icon must be at least 1024x1024. Got {img.size[0]}x{img.size[0]}.")

    # Normalize to RGBA so transparent corners don't bleed.
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    # If larger than 1024, downsample to 1024 master first.
    if img.size[0] > 1024:
        img = img.resize((1024, 1024), Image.Resampling.LANCZOS)

    BRANDING_DIR.mkdir(parents=True, exist_ok=True)

    # Atomic-ish: write to .tmp then rename, so a partial overwrite doesn't
    # leave the directory in a half-old/half-new state.
    written = []
    try:
        # 1024 master
        master = _icon_path(1024)
        tmp = master.with_suffix(".png.tmp")
        img.save(str(tmp), "PNG", optimize=True)
        os.replace(str(tmp), str(master))
        written.append(1024)

        # Derivative PNGs
        for size in DERIVATIVE_SIZES:
            if size == 1024:
                continue
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            target = _icon_path(size)
            tmp = target.with_suffix(".png.tmp")
            resized.save(str(tmp), "PNG", optimize=True)
            os.replace(str(tmp), str(target))
            written.append(size)

        # Multi-size .ico
        fav_tmp = _favicon_path().with_suffix(".ico.tmp")
        img.save(str(fav_tmp), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        os.replace(str(fav_tmp), str(_favicon_path()))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate derivatives: {e}")

    now = datetime.now(timezone.utc).isoformat()
    await db.site_settings.update_one(
        {"_id": "singleton"},
        {"$set": {"app_icon_updated_at": now, "app_icon_uploaded_by": current_user["email"]}},
        upsert=True,
    )

    return {
        "regenerated_sizes": written,
        "favicon_ico": True,
        "updated_at": now,
        "uploaded_by": current_user["email"],
    }
