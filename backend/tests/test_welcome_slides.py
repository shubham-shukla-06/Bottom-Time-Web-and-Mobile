"""Tests for the welcome-slides admin + public endpoints."""

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

from pymongo import MongoClient
_sync_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _png_bytes(w: int = 1600, h: int = 2400) -> bytes:
    """Generate an in-memory JPEG of arbitrary dimensions for upload tests."""
    img = PILImage.new("RGB", (w, h), color=(20, 70, 140))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


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
    # testuser (diver) exists in every env with the 007320 bypass.
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
        json={"image_url": "/api/uploads/welcome/x.jpg"},
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
    assert body["image_url"].startswith("/api/uploads/welcome/")
    assert body["width"] == 1600 and body["height"] == 2400


# ---- CRUD lifecycle -------------------------------------------------------

def test_create_list_patch_delete_cycle(client, admin_headers):
    up = client.post(
        "/api/admin/welcome-slides/upload",
        headers=admin_headers,
        files={"file": ("a.jpg", _png_bytes(1600, 2400), "image/jpeg")},
    )
    assert up.status_code == 200
    image_url = up.json()["image_url"]

    create = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url": image_url,
            "original_filename": "a.jpg",
            "photographer_name": "Kevin Charit",
            "show_attribution": True,
            "focal_point": {"x": 0.4, "y": 0.3},
            "zoom": 1.2,
            "active": True,
        },
    )
    assert create.status_code == 200, create.text
    sid = create.json()["id"]
    assert create.json()["sort_order"] == 0  # first slide

    # List via admin — should contain exactly this row.
    lst = client.get("/api/admin/welcome-slides", headers=admin_headers)
    assert lst.status_code == 200
    slides = lst.json()["slides"]
    assert len(slides) == 1 and slides[0]["id"] == sid

    # Patch — toggle attribution off + move focal point.
    p = client.patch(
        f"/api/admin/welcome-slides/{sid}",
        headers=admin_headers,
        json={"show_attribution": False, "focal_point": {"x": 0.9, "y": 0.1}},
    )
    assert p.status_code == 200
    assert p.json()["show_attribution"] is False
    assert p.json()["focal_point"]["x"] == 0.9

    # Delete — file should be gone from disk too.
    from routes.welcome_slides import _filepath_from_url
    path = _filepath_from_url(image_url)
    assert path is not None and path.exists()
    d = client.delete(f"/api/admin/welcome-slides/{sid}", headers=admin_headers)
    assert d.status_code == 200
    assert not path.exists()


def test_focal_point_bounds_rejected(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={
            "image_url": "/api/uploads/welcome/anything.jpg",
            "focal_point": {"x": 1.5, "y": 0.5},
        },
    )
    assert r.status_code == 422


def test_create_rejects_non_upload_url(client, admin_headers):
    r = client.post(
        "/api/admin/welcome-slides",
        headers=admin_headers,
        json={"image_url": "https://evil.example.com/x.jpg"},
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
        iu = up.json()["image_url"]
        c = client.post(
            "/api/admin/welcome-slides",
            headers=admin_headers,
            json={"image_url": iu, "photographer_name": f"P{i}"},
        )
        ids.append(c.json()["id"])

    # Reverse order.
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
        iu = up.json()["image_url"]
        c = client.post(
            "/api/admin/welcome-slides",
            headers=admin_headers,
            json={
                "image_url": iu,
                "photographer_name": f"P{i}",
                "active": (i != 1),  # middle one is inactive
            },
        )
        ids.append(c.json()["id"])

    pub = client.get("/api/welcome-slides")
    assert pub.status_code == 200
    slides = pub.json()["slides"]
    assert len(slides) == 2
    # Inactive slide (index 1) is filtered out; order preserved.
    assert [s["id"] for s in slides] == [ids[0], ids[2]]
    # Shape whitelist — no timestamps / created_by leaked.
    for s in slides:
        assert set(s.keys()).issubset(
            {"id", "image_url", "photographer_name", "show_attribution",
             "focal_point", "zoom", "sort_order"}
        )


def test_public_endpoint_empty_list_when_no_slides(client):
    r = client.get("/api/welcome-slides")
    assert r.status_code == 200
    assert r.json() == {"slides": []}
