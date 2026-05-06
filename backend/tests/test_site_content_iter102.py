"""Backend tests for Site Content CMS endpoints (iteration 102).

Covers:
    - GET  /api/admin/site-content
    - PUT  /api/admin/site-content/draft (seed-from-published + deep-merge)
    - POST /api/admin/site-content/publish (promote + draft deletion + 400 no draft)
    - POST /api/admin/site-content/discard-draft (idempotent)
    - POST /api/admin/site-content/upload (image / video / format / size validation)
    - GET  /api/site-content/draft-preview (admin gated)
    - GET  /api/site-content/public (published only)
    - Auth gating (401/403)
    - End-to-end draft → publish → public flow
"""
import io
import os
import sys
import uuid
import struct
import zlib
import pytest
import requests
from datetime import timedelta

sys.path.insert(0, "/app/backend")
from auth_utils import create_access_token  # noqa: E402
import pymongo  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bottomtime_db")
sync_db = pymongo.MongoClient(MONGO_URL)[DB_NAME]

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://marine-social-1.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "shubham@bottom-time.com"


def _make_png(width: int, height: int) -> bytes:
    """Build a minimal valid PNG in-memory (no PIL needed) with given dimensions."""
    def _chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    # single IDAT: raw image data; each row has a filter byte + RGB per pixel
    row = b"\x00" + (b"\x00\x00\x00" * width)
    raw = row * height
    idat = zlib.compress(raw)
    return sig + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", idat) + _chunk(b"IEND", b"")


# ---- Fixtures -------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_user_id():
    u = sync_db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "id": 1})
    if not u:
        pytest.skip(f"admin user {ADMIN_EMAIL} not seeded")
    return u["id"]


@pytest.fixture(scope="module")
def admin_token(admin_user_id):
    return create_access_token({"sub": admin_user_id}, expires_delta=timedelta(hours=1))


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def non_admin_token():
    u = sync_db.users.find_one({"role": {"$ne": "admin"}}, {"_id": 0, "id": 1})
    if not u:
        pytest.skip("no non-admin user seeded")
    return create_access_token({"sub": u["id"]}, expires_delta=timedelta(hours=1))


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(autouse=True)
def _clean_draft():
    """Each test gets a known-clean draft state."""
    sync_db.site_content_draft.delete_many({"key": "landing_page"})
    yield
    sync_db.site_content_draft.delete_many({"key": "landing_page"})


EXPECTED_FIELDS = {
    "hero_media_type", "hero_image", "hero_video", "hero_title",
    "hero_subtitle", "hero_description",
    "cta_primary_label", "cta_primary_link",
    "cta_secondary_label", "cta_secondary_link",
    "section_images",
}
EXPECTED_SECTIONS = {"about", "curious", "operator", "community", "group"}


# ---- Auth gating ----------------------------------------------------------
class TestAuthGating:
    def test_get_admin_requires_auth(self, s):
        r = s.get(f"{BASE_URL}/api/admin/site-content")
        assert r.status_code in (401, 403), r.text

    def test_put_draft_requires_auth(self, s):
        r = s.put(f"{BASE_URL}/api/admin/site-content/draft", json={"hero_title": "x"})
        assert r.status_code in (401, 403), r.text

    def test_publish_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/admin/site-content/publish")
        assert r.status_code in (401, 403), r.text

    def test_discard_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/admin/site-content/discard-draft")
        assert r.status_code in (401, 403), r.text

    def test_upload_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/admin/site-content/upload",
                   files={"file": ("x.png", b"abc", "image/png")})
        assert r.status_code in (401, 403), r.text

    def test_draft_preview_requires_auth(self, s):
        r = s.get(f"{BASE_URL}/api/site-content/draft-preview")
        assert r.status_code in (401, 403), r.text

    def test_non_admin_forbidden_on_get(self, s, non_admin_token):
        r = s.get(f"{BASE_URL}/api/admin/site-content",
                  headers={"Authorization": f"Bearer {non_admin_token}"})
        assert r.status_code == 403, r.text

    def test_non_admin_forbidden_on_draft_preview(self, s, non_admin_token):
        r = s.get(f"{BASE_URL}/api/site-content/draft-preview",
                  headers={"Authorization": f"Bearer {non_admin_token}"})
        assert r.status_code == 403, r.text

    def test_public_site_content_no_auth(self, s):
        r = s.get(f"{BASE_URL}/api/site-content/public")
        assert r.status_code == 200, r.text


# ---- GET /admin/site-content shape ---------------------------------------
class TestGetAdminShape:
    def test_returns_full_shape(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("published", "draft", "has_unpublished_changes",
                    "draft_updated_at", "published_updated_at"):
            assert key in data, f"missing {key}"
        assert EXPECTED_FIELDS.issubset(data["published"].keys()), data["published"].keys()
        assert EXPECTED_FIELDS.issubset(data["draft"].keys()), data["draft"].keys()
        assert EXPECTED_SECTIONS.issubset(data["published"]["section_images"].keys())
        assert EXPECTED_SECTIONS.issubset(data["draft"]["section_images"].keys())

    def test_has_unpublished_changes_false_with_no_draft(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["has_unpublished_changes"] is False


# ---- PUT draft behaviour --------------------------------------------------
class TestDraftSeedAndDeepMerge:
    def test_partial_update_preserves_other_fields(self, s, admin_headers):
        # publish baseline (so we have a published to seed from)
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers,
              json={"hero_title": "Baseline T", "hero_subtitle": "Baseline S"}).raise_for_status()
        s.post(f"{BASE_URL}/api/admin/site-content/publish", headers=admin_headers).raise_for_status()

        # Now a fresh draft with only hero_title change — other fields must stay
        new_title = f"TEST_Title_{uuid.uuid4().hex[:6]}"
        r = s.put(f"{BASE_URL}/api/admin/site-content/draft",
                  headers=admin_headers, json={"hero_title": new_title})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["hero_title"] == new_title
        assert body["hero_subtitle"] == "Baseline S", "subtitle wiped by partial update"
        assert EXPECTED_FIELDS.issubset(body.keys())
        # section_images must still have all defaults
        assert EXPECTED_SECTIONS.issubset(body["section_images"].keys())

    def test_section_images_deep_merge(self, s, admin_headers):
        # First draft: set only "about"
        url1 = f"/TEST/custom_about_{uuid.uuid4().hex[:6]}.jpg"
        r1 = s.put(f"{BASE_URL}/api/admin/site-content/draft",
                   headers=admin_headers,
                   json={"section_images": {"about": url1}})
        assert r1.status_code == 200
        assert r1.json()["section_images"]["about"] == url1
        # default for other slots still present
        assert "curious" in r1.json()["section_images"]
        assert r1.json()["section_images"]["curious"]  # non-empty default

        # Second update: only "community" — about MUST still be url1
        url2 = f"/TEST/custom_comm_{uuid.uuid4().hex[:6]}.jpg"
        r2 = s.put(f"{BASE_URL}/api/admin/site-content/draft",
                   headers=admin_headers,
                   json={"section_images": {"community": url2}})
        assert r2.status_code == 200
        si = r2.json()["section_images"]
        assert si["about"] == url1, "about got wiped — deep-merge broken"
        assert si["community"] == url2


class TestHasUnpublishedChanges:
    def test_flag_flips_on_change(self, s, admin_headers):
        new_title = f"TEST_Changes_{uuid.uuid4().hex[:6]}"
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": new_title}).raise_for_status()
        r = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["has_unpublished_changes"] is True
        assert d["draft"]["hero_title"] == new_title


# ---- Publish + Discard ---------------------------------------------------
class TestPublishAndDiscard:
    def test_publish_without_draft_returns_400(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/site-content/publish", headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_publish_promotes_and_clears_draft(self, s, admin_headers):
        title = f"TEST_Pub_{uuid.uuid4().hex[:6]}"
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": title}).raise_for_status()

        r = s.post(f"{BASE_URL}/api/admin/site-content/publish", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "published_at" in body

        # draft is gone
        assert sync_db.site_content_draft.find_one({"key": "landing_page"}) is None

        # published has the new title + published_at + published_by
        pub = sync_db.site_content.find_one({"key": "landing_page"}, {"_id": 0})
        assert pub["hero_title"] == title
        assert pub.get("published_at")
        assert pub.get("published_by")

        # admin GET reports no changes pending
        g = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers).json()
        assert g["has_unpublished_changes"] is False

    def test_discard_is_idempotent(self, s, admin_headers):
        # no draft → should still 200
        r = s.post(f"{BASE_URL}/api/admin/site-content/discard-draft", headers=admin_headers)
        assert r.status_code == 200, r.text

        # create draft then discard — draft must vanish
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": "TEST_ToDiscard"}).raise_for_status()
        r2 = s.post(f"{BASE_URL}/api/admin/site-content/discard-draft", headers=admin_headers)
        assert r2.status_code == 200
        assert sync_db.site_content_draft.find_one({"key": "landing_page"}) is None


# ---- Upload --------------------------------------------------------------
class TestUpload:
    def test_upload_png_returns_dimensions(self, s, admin_headers):
        png = _make_png(40, 30)
        r = s.post(f"{BASE_URL}/api/admin/site-content/upload",
                   headers=admin_headers,
                   files={"file": ("TEST_img.png", png, "image/png")})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "image"
        assert d["format"] == "png"
        assert d["width"] == 40 and d["height"] == 30
        assert d["bytes"] == len(png)
        assert d["url"].startswith("/api/uploads/")

    def test_upload_rejects_unsupported_extension(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/site-content/upload",
                   headers=admin_headers,
                   files={"file": ("evil.bmp", b"BMxxxxxxxx", "image/bmp")})
        assert r.status_code == 400, r.text

    def test_upload_rejects_oversize_image(self, s, admin_headers):
        # 16 MB of zeros with .png ext > 15MB limit
        big = b"\x00" * (16 * 1024 * 1024)
        r = s.post(f"{BASE_URL}/api/admin/site-content/upload",
                   headers=admin_headers,
                   files={"file": ("big.png", big, "image/png")})
        assert r.status_code == 400, r.text
        assert "too large" in r.text.lower()

    def test_upload_accepts_video_extension(self, s, admin_headers):
        tiny = b"\x00" * 1024
        r = s.post(f"{BASE_URL}/api/admin/site-content/upload",
                   headers=admin_headers,
                   files={"file": ("clip.mp4", tiny, "video/mp4")})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "video"
        assert d["format"] == "mp4"
        assert d["width"] is None and d["height"] is None


# ---- Draft preview -------------------------------------------------------
class TestDraftPreview:
    def test_preview_returns_draft_if_present(self, s, admin_headers):
        title = f"TEST_Prev_{uuid.uuid4().hex[:6]}"
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": title}).raise_for_status()
        r = s.get(f"{BASE_URL}/api/site-content/draft-preview", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["hero_title"] == title

    def test_preview_falls_back_to_published_when_no_draft(self, s, admin_headers):
        # ensure no draft
        assert sync_db.site_content_draft.find_one({"key": "landing_page"}) is None
        r = s.get(f"{BASE_URL}/api/site-content/draft-preview", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert EXPECTED_FIELDS.issubset(body.keys())


# ---- Public endpoint: does NOT serve drafts ------------------------------
class TestPublicNeverServesDraft:
    def test_public_ignores_draft(self, s, admin_headers):
        secret = f"TEST_DRAFT_ONLY_{uuid.uuid4().hex[:6]}"
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": secret}).raise_for_status()
        r = s.get(f"{BASE_URL}/api/site-content/public")
        assert r.status_code == 200
        assert r.json().get("hero_title") != secret, "draft leaked via public endpoint!"


# ---- End-to-end flow -----------------------------------------------------
class TestEndToEndFlow:
    def test_full_draft_publish_cycle(self, s, admin_headers):
        # 1. no draft
        g0 = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers).json()
        assert g0["has_unpublished_changes"] is False

        # 2. PUT draft with just hero_title change
        title = f"TEST_E2E_{uuid.uuid4().hex[:6]}"
        s.put(f"{BASE_URL}/api/admin/site-content/draft",
              headers=admin_headers, json={"hero_title": title}).raise_for_status()

        # 3. GET returns has_unpublished_changes=true
        g1 = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers).json()
        assert g1["has_unpublished_changes"] is True

        # 4. publish
        s.post(f"{BASE_URL}/api/admin/site-content/publish",
               headers=admin_headers).raise_for_status()

        # 5. /site-content/public shows new title
        pub = s.get(f"{BASE_URL}/api/site-content/public").json()
        assert pub["hero_title"] == title

        # 6. draft gone + has_unpublished_changes=false
        assert sync_db.site_content_draft.find_one({"key": "landing_page"}) is None
        g2 = s.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers).json()
        assert g2["has_unpublished_changes"] is False
