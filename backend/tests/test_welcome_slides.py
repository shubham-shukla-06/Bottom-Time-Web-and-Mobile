"""Tests for the welcome-slides admin + public endpoints (server-side crop).

Covers the post-rewrite contract:
  • Admin POST sends `image_url_original` + `crop_box {x,y,width,height}`
    in source-image fractional coords.
  • Server crops with Pillow → JPEG matching MOBILE_VISIBLE_ASPECT_RATIO.
  • Public payload returns ONLY id / image_url / attribution_text /
    show_attribution / sort_order.
  • Crop boxes whose pixel aspect drifts past CROP_ASPECT_TOLERANCE are
    rejected with 400.
  • Editing recrops by re-sending crop_box; image_url_original is preserved.
"""

from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image as PILImage

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR / "backend"))

from server import app  # noqa: E402
from rate_limiter import limiter as _limiter  # noqa: E402
from auth_utils import create_access_token  # noqa: E402
from welcome_visible import MOBILE_VISIBLE_ASPECT_RATIO  # noqa: E402

from pymongo import MongoClient
_sync_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _png_bytes(w: int = 1600, h: int = 2400) -> bytes:
    """Generate an in-memory JPEG of arbitrary dimensions for upload tests."""
    img = PILImage.new("RGB", (w, h), color=(20, 70, 140))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _canonical_centered_crop_box() -> dict:
    """Return a crop_box that fits inside a 1600×2400 source AND has aspect
    exactly MOBILE_VISIBLE_ASPECT_RATIO. The 1600×2400 portrait image is
    taller than the canonical aspect, so the limiting dimension is width:
    crop_w_px = 1600, crop_h_px = 1600 / MOBILE_VISIBLE_ASPECT_RATIO ≈ 2166."""
    src_w, src_h = 1600, 2400
    crop_w_px = float(src_w)
    crop_h_px = crop_w_px / MOBILE_VISIBLE_ASPECT_RATIO
    top_px = (src_h - crop_h_px) / 2.0
    return {
        "x": 0.0,
        "y": top_px / src_h,
        "width": crop_w_px / src_w,
        "height": crop_h_px / src_h,
    }


def _mint_token_for(user_id: str) -> str:
    return create_access_token({"sub": user_id})


@pytest.fixture(scope="module")
def client():
    prev = getattr(_limiter, "enabled", True)
    _limiter.enabled = False
    try:
        with TestClient(app) as c:
            yield c
    finally:
        _limiter.enabled = prev


@pytest.fixture(scope="module")
def admin_headers():
    row = _sync_db.users.find_one({"role": "admin"}, {"_id": 0, "id": 1})
    assert row, "no admin seeded — populate one before running this suite"
    return {"Authorization": f"Bearer {_mint_token_for(row['id'])}"}


@pytest.fixture(scope="module")
def nonadmin_headers():
    row = _sync_db.users.find_one({"email": "testuser@bottom-time.com"}, {"_id": 0, "id": 1})
    assert row, "testuser missing"
    return {"Authorization": f"Bearer {_mint_token_for(row['id'])}"}


@pytest.fixture(autouse=True)
def _clean_slides():
    _sync_db.welcome_slides.delete_many({})
    yield
    _sync_db.welcome_slides.delete_many({})


# ---- Auth / role gating ---------------------------------------------------

def test_nonadmin_cannot_list(client, nonadmin_headers):
    r = client.get("/api/admin/welcome-slides", headers=nonadmin_headers)
    assert r.status_code == 403


def test_anonymous_cannot_upload(client):
    r = client.post(
        "/api/admin/welcome-slides/upload",
        files={"file": ("x.jpg", _png_bytes(100, 100), "image/jpeg")},
    )
    assert r.status_code in (401, 403)


def test_nonadmin_cannot_create(client, nonadmin_headers):
    r = client.post(
        "/api/admin/welcome-slides",
        headers=nonadmin_headers,
        json={
            "image_url_original": "/api/uploads/welcome/x.jpg",
            "crop_box": _canonical_centered_crop_box(),
        },
    )
    assert r.status_code == 403


# ---- Upload validation ----------------------------------------------------

def test_upload_requires_image_content_type(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("evil.txt", b"not an image", "text/plain")},
    )
    assert r.status_code == 400


def test_upload_rejects_small_long_edge(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("tiny.jpg", _png_bytes(800, 600), "image/jpeg")},
    )
    assert r.status_code == 400
    assert "1500" in r.json()["detail"]


def test_upload_accepts_valid_image(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("big.jpg", _png_bytes(1600, 2400), "image/jpeg")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["image_url_original"].startswith("/api/uploads/welcome/")
    assert body["width"] == 1600 and body["height"] == 2400


# ---- CRUD lifecycle -------------------------------------------------------

def test_create_list_patch_delete_cycle(client, admin_headers):
    up = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("a.jpg", _png_bytes(1600, 2400), "image/jpeg")},
    )
    assert up.status_code == 200
    image_url_original = up.json()["image_url_original"]

    create = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url_original": image_url_original,
            "original_filename": "a.jpg",
            "attribution_text": "Kevin Charit",
            "show_attribution": True,
            "crop_box": _canonical_centered_crop_box(),
            "active": True,
        },
    )
    assert create.status_code == 200, create.text
    created = create.json()
    sid = created["id"]
    assert created["sort_order"] == 0
    # Server-cropped JPEG written to disk and exposed via image_url.
    assert created["image_url"].startswith("/api/uploads/welcome/")
    assert created["image_url"].endswith("-cropped.jpg")
    assert created["image_url"] != created["image_url_original"]
    from routes.welcome_slides import _filepath_from_url
    cropped_path = _filepath_from_url(created["image_url"])
    assert cropped_path is not None and cropped_path.exists()

    # List via admin — should contain exactly this row + crop_box echoed.
    lst = client.get("/api/admin/welcome-slides", headers=admin_headers)
    assert lst.status_code == 200
    slides = lst.json()["slides"]
    assert len(slides) == 1 and slides[0]["id"] == sid
    assert "crop_box" in slides[0]
    assert "image_url_original" in slides[0]

    # Patch — toggle attribution + send a new crop_box. Server should
    # regenerate the cropped JPEG (filename stays {sid}-cropped.jpg).
    new_box = _canonical_centered_crop_box()
    new_box["y"] = max(0.0, new_box["y"] - 0.05)
    p = client.patch(
        f"/api/admin/welcome-slides/{sid}",
        headers=admin_headers,
        json={"show_attribution": False, "crop_box": new_box},
    )
    assert p.status_code == 200, p.text
    assert p.json()["show_attribution"] is False
    assert p.json()["crop_box"]["y"] == pytest.approx(new_box["y"])
    # Cropped file still on disk after recrop.
    assert cropped_path.exists()

    # Delete — both files (original + cropped) gone.
    original_path = _filepath_from_url(image_url_original)
    assert original_path is not None and original_path.exists()
    d = client.delete(f"/api/admin/welcome-slides/{sid}", headers=admin_headers)
    assert d.status_code == 200
    assert not cropped_path.exists()
    assert not original_path.exists()


def test_crop_box_aspect_outside_tolerance_rejected(client, admin_headers):
    up = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("a.jpg", _png_bytes(1600, 2400), "image/jpeg")},
    )
    assert up.status_code == 200
    image_url_original = up.json()["image_url_original"]

    # Square crop — clearly off-aspect for the 0.7388 canonical ratio.
    bad_box = {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5 * (1600 / 2400)}
    # ↑ width/height pixel ratio = 1.0 (square) — far from 0.7388.

    r = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url_original": image_url_original,
            "crop_box": bad_box,
        },
    )
    assert r.status_code == 400
    assert "aspect" in r.json()["detail"].lower()


def test_crop_box_bounds_rejected(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url_original": "/api/uploads/welcome/anything.jpg",
            "crop_box": {"x": 1.5, "y": 0.5, "width": 0.4, "height": 0.4},
        },
    )
    # Pydantic catches `x > 1.0` at validation time → 422.
    assert r.status_code == 422


def test_create_rejects_non_upload_url(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url_original": "https://evil.example.com/x.jpg",
            "crop_box": _canonical_centered_crop_box(),
        },
    )
    assert r.status_code == 422


def test_reorder_persists_sort_order(client, admin_headers):
    ids = []
    for i in range(3):
        up = client.post(
            "/api/admin/welcome-slides/upload",
            headers=admin_headers,
            files={"file": (f"{i}.jpg", _png_bytes(1600, 2400), "image/jpeg")},
        )
        iu = up.json()["image_url_original"]
        c = client.post(
            "/api/admin/welcome-slides",
            headers=admin_headers,
            json={
                "image_url_original": iu,
                "attribution_text": f"P{i}",
                "crop_box": _canonical_centered_crop_box(),
            },
        )
        assert c.status_code == 200, c.text
        ids.append(c.json()["id"])

    r = client.post(
        "/api/admin/welcome-slides/reorder",
        headers=admin_headers,
        json={"ids": list(reversed(ids))},
    )
    assert r.status_code == 200 and r.json()["updated"] == 3

    lst = client.get("/api/admin/welcome-slides", headers=admin_headers).json()["slides"]
    assert [s["id"] for s in lst] == list(reversed(ids))


# ---- Public endpoint ------------------------------------------------------

def test_public_endpoint_hides_inactive_and_orders(client, admin_headers):
    ids = []
    for i in range(3):
        up = client.post(
            "/api/admin/welcome-slides/upload",
            headers=admin_headers,
            files={"file": (f"{i}.jpg", _png_bytes(1600, 2400), "image/jpeg")},
        )
        iu = up.json()["image_url_original"]
        c = client.post(
            "/api/admin/welcome-slides",
            headers=admin_headers,
            json={
                "image_url_original": iu,
                "attribution_text": f"P{i}",
                "crop_box": _canonical_centered_crop_box(),
                "active": (i != 1),
            },
        )
        assert c.status_code == 200
        ids.append(c.json()["id"])

    pub = client.get("/api/welcome-slides")
    assert pub.status_code == 200
    slides = pub.json()["slides"]
    assert len(slides) == 2
    assert [s["id"] for s in slides] == [ids[0], ids[2]]
    # Public payload shape — strict whitelist. Mobile renderer reads
    # exactly these keys, no more.
    allowed = {"id", "image_url", "attribution_text", "show_attribution", "sort_order"}
    for s in slides:
        assert set(s.keys()) == allowed
        assert s["image_url"].endswith("-cropped.jpg")


def test_public_endpoint_empty_list_when_no_slides(client):
    r = client.get("/api/welcome-slides")
    assert r.status_code == 200
    assert r.json() == {"slides": []}


def test_cropped_file_aspect_matches_canonical(client, admin_headers):
    """End-to-end pixel check: the file Pillow wrote to disk has aspect
    within tolerance of MOBILE_VISIBLE_ASPECT_RATIO."""
    up = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("a.jpg", _png_bytes(1600, 2400), "image/jpeg")},
    )
    iu = up.json()["image_url_original"]
    c = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url_original": iu,
            "crop_box": _canonical_centered_crop_box(),
        },
    )
    assert c.status_code == 200, c.text
    from routes.welcome_slides import _filepath_from_url
    cropped_path = _filepath_from_url(c.json()["image_url"])
    assert cropped_path is not None and cropped_path.exists()
    img = PILImage.open(cropped_path)
    actual_aspect = img.width / img.height
    # 1% tolerance — well inside the 2% server-side aspect tolerance.
    assert abs(actual_aspect - MOBILE_VISIBLE_ASPECT_RATIO) < 0.01, (
        f"cropped JPEG aspect {actual_aspect:.4f} != canonical {MOBILE_VISIBLE_ASPECT_RATIO:.4f}"
    )
