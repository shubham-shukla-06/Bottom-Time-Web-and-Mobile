"""
Iteration 99 backend test — Listing builder autosave (partial PUT) + OG share.
Covers:
  - POST /api/operator-listings/listings (minimal payload draft)
  - PUT  /api/operator-listings/listings/{id} (partial body — photos/videos only)
  - PUT  /api/operator-listings/listings/{id} (full payload snapshot)
  - GET  /api/listings/{id}/og-image (image/jpeg, < 300KB)
  - GET  /api/d/{listing_id} (OG meta, no meta-refresh, og:url=self_url, GET+HEAD)
  - GET  /api/r/{slug} (operator short link, same OG behavior)
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
OPERATOR_EMAIL = "testoperator@bottom-time.com"
OTP = "123456"

# Listings provided in the review request
LID_MALDIVES = "f357fa66-c4ae-4131-ad6e-528b69b8a0dc"
LID_E2E = "f993c798-40cd-4777-b026-2270943ce7df"


def _login(email: str) -> dict:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r1 = s.post(f"{API}/auth/send-otp", json={"identifier": email}, timeout=15)
    assert r1.status_code == 200, f"send-otp: {r1.status_code} {r1.text}"
    r2 = s.post(f"{API}/auth/verify-otp",
                json={"identifier": email, "code": OTP}, timeout=15)
    assert r2.status_code == 200, f"verify-otp: {r2.status_code} {r2.text}"
    vtok = r2.json()["verification_token"]
    r3 = s.post(f"{API}/auth/login-complete",
                json={"email": email, "email_verified_token": vtok}, timeout=15)
    assert r3.status_code == 200, r3.text
    return r3.json()


@pytest.fixture(scope="module")
def operator_auth():
    d = _login(OPERATOR_EMAIL)
    return {"headers": {"Authorization": f"Bearer {d['access_token']}"},
            "user": d["user"], "token": d["access_token"]}


@pytest.fixture(scope="module")
def draft_listing(operator_auth):
    """Create a minimal draft (just title) — exercise the auto-create path."""
    title = f"TEST_AutoSaveDraft_{uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{API}/operator-listings/listings",
        json={"title": title},
        headers=operator_auth["headers"], timeout=15,
    )
    assert r.status_code in (200, 201), f"create draft: {r.status_code} {r.text}"
    body = r.json()
    assert "id" in body, body
    assert body["title"] == title
    assert body.get("status") in ("draft", "DRAFT", None) or body.get("published") is False
    yield body
    # Best-effort cleanup
    try:
        requests.delete(f"{API}/operator-listings/listings/{body['id']}",
                        headers=operator_auth["headers"], timeout=10)
    except Exception:
        pass


# ── Listing builder autosave: partial + full PUT ─────────────────────
class TestListingBuilderAutosave:
    def test_create_minimal_draft_returns_id(self, draft_listing):
        # Fixture itself asserts create succeeds
        assert isinstance(draft_listing["id"], str)
        assert len(draft_listing["id"]) > 0

    def test_partial_put_photos_only_updates_only_those_fields(
        self, operator_auth, draft_listing
    ):
        lid = draft_listing["id"]
        # Capture pre-state
        before = requests.get(
            f"{API}/operator-listings/listings/{lid}",
            headers=operator_auth["headers"], timeout=10,
        )
        assert before.status_code == 200, before.text
        prev_title = before.json().get("title")
        prev_updated = before.json().get("updated_at")

        photos = [
            {"url": "/api/uploads/test1.jpg", "caption": "Hero"},
            {"url": "/api/uploads/test2.jpg", "caption": "Reef"},
        ]
        videos = [{"url": "/api/uploads/clip.mp4"}]
        r = requests.put(
            f"{API}/operator-listings/listings/{lid}",
            json={"photos": photos, "videos": videos},
            headers=operator_auth["headers"], timeout=15,
        )
        assert r.status_code == 200, f"partial PUT: {r.status_code} {r.text}"
        upd = r.json()
        # Only photos/videos changed; title preserved
        assert upd.get("title") == prev_title, "partial PUT must not clobber title"
        assert len(upd.get("photos") or []) == 2
        assert len(upd.get("videos") or []) == 1
        assert (upd["photos"][0]["url"]).endswith("test1.jpg")
        # updated_at must move forward
        if prev_updated and upd.get("updated_at"):
            assert upd["updated_at"] != prev_updated, "updated_at should change after PUT"

        # GET to confirm persistence
        g = requests.get(
            f"{API}/operator-listings/listings/{lid}",
            headers=operator_auth["headers"], timeout=10,
        )
        assert g.status_code == 200
        gd = g.json()
        assert len(gd.get("photos") or []) == 2
        assert gd.get("title") == prev_title

    def test_full_put_snapshot_works(self, operator_auth, draft_listing):
        lid = draft_listing["id"]
        new_title = f"TEST_FullSnapshot_{uuid.uuid4().hex[:6]}"
        snapshot = {
            "title": new_title,
            "description": "Full snapshot autosave test",
            "listing_type": "day_dive",
            "price": 250,
            "location": "Goa",
            "country": "IN",
            "photos": [{"url": "/api/uploads/snap.jpg"}],
            "videos": [],
        }
        r = requests.put(
            f"{API}/operator-listings/listings/{lid}",
            json=snapshot,
            headers=operator_auth["headers"], timeout=15,
        )
        assert r.status_code == 200, f"full PUT: {r.status_code} {r.text}"
        d = r.json()
        assert d["title"] == new_title
        assert d.get("description") == "Full snapshot autosave test"
        assert d.get("price") == 250
        assert len(d.get("photos") or []) == 1
        # MongoDB _id must be excluded
        assert "_id" not in d

    def test_partial_put_unknown_id_returns_404(self, operator_auth):
        bad = str(uuid.uuid4())
        r = requests.put(
            f"{API}/operator-listings/listings/{bad}",
            json={"title": "x"},
            headers=operator_auth["headers"], timeout=10,
        )
        assert r.status_code in (404, 403), f"unknown listing: {r.status_code}"


# ── OG image endpoint ────────────────────────────────────────────────
class TestOgImage:
    @pytest.mark.parametrize("lid", [LID_MALDIVES, LID_E2E])
    def test_og_image_returns_jpeg_under_300kb(self, lid):
        r = requests.get(f"{API}/listings/{lid}/og-image", timeout=30)
        if r.status_code == 404:
            pytest.skip(f"listing {lid} not seeded — skipping OG image test")
        assert r.status_code == 200, f"og-image: {r.status_code} {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "image/jpeg" in ctype.lower(), f"expected image/jpeg, got {ctype}"
        size = len(r.content)
        assert size > 0, "empty image body"
        assert size < 300_000, f"image too big: {size} bytes (>300KB)"
        # JPEG SOI magic bytes
        assert r.content[:3] == b"\xff\xd8\xff", "not a valid JPEG (bad magic)"


# ── /api/d/{listing_id}: HTML OG meta render ─────────────────────────
class TestDiverShareHTML:
    def _check_meta(self, html: str, listing_id: str, self_path: str):
        assert "<!DOCTYPE html>" in html or "<!doctype html>" in html.lower()
        # No meta-refresh (we use JS replace instead)
        assert not re.search(
            r'<meta[^>]+http-equiv\s*=\s*["\']?refresh', html, re.I
        ), "meta-refresh found — should not be present"
        # og:image:type = image/jpeg
        m = re.search(
            r'<meta[^>]+property=["\']og:image:type["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m and m.group(1).lower() == "image/jpeg", f"og:image:type = {m and m.group(1)}"
        # og:description fixed brand line
        m = re.search(
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m, "og:description missing"
        assert m.group(1) == "Find your next dive, buddy, gear and merch on Bottom Time!"
        # og:title MUST NOT contain "· Bottom Time" suffix
        m = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m, "og:title missing"
        assert "· Bottom Time" not in m.group(1), \
            f"og:title still has '· Bottom Time' suffix: {m.group(1)}"
        # og:url AND canonical = self URL (path is the short-link path)
        m = re.search(
            r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m, "og:url missing"
        og_url = m.group(1)
        assert self_path in og_url, f"og:url should reference self ({self_path}), got {og_url}"
        # MUST NOT be the SPA listing destination
        assert f"/listing/{listing_id}" not in og_url, \
            f"og:url points to destination, not short-link: {og_url}"
        c = re.search(
            r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',
            html, re.I,
        )
        assert c, "canonical missing"
        assert self_path in c.group(1)
        assert f"/listing/{listing_id}" not in c.group(1)

    def test_get_returns_og_html(self):
        path = f"/api/d/{LID_MALDIVES}"
        r = requests.get(f"{BASE_URL}{path}", timeout=15, allow_redirects=False)
        if r.status_code == 302:
            pytest.skip("listing not found in DB — skip")
        assert r.status_code == 200, f"GET /api/d/: {r.status_code} {r.text[:200]}"
        assert "text/html" in r.headers.get("content-type", "")
        self._check_meta(r.text, LID_MALDIVES, path)

    def test_head_works(self):
        r = requests.head(f"{BASE_URL}/api/d/{LID_MALDIVES}",
                          timeout=10, allow_redirects=False)
        # Either 200 (HEAD supported by route) or 302 (listing missing)
        assert r.status_code in (200, 302), f"HEAD /api/d/: {r.status_code}"

    def test_unknown_listing_redirects(self):
        bad = str(uuid.uuid4())
        r = requests.get(f"{BASE_URL}/api/d/{bad}",
                         timeout=10, allow_redirects=False)
        assert r.status_code in (302, 307), f"unknown -> {r.status_code}"


# ── /api/r/{slug}: operator short link share ──────────────────────────
class TestOperatorShortLinkHTML:
    @pytest.fixture(scope="class")
    def share_slug(self, operator_auth):
        """Find or create a share preset with a known slug for the test operator."""
        # Find an operator-owned listing
        r = requests.get(f"{API}/operator-listings/listings",
                         headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        items = r.json().get("listings") or r.json().get("items") or []
        if not items:
            pytest.skip("no operator listings to attach a share preset to")
        lid = items[0]["id"]
        body = {
            "channel": "linkedin",
            "label": "TEST iter99 share",
            "utm_source": "linkedin",
            "utm_medium": "social",
            "utm_campaign": "iter99",
        }
        r = requests.post(f"{API}/listings/{lid}/share-presets", json=body,
                          headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        preset = r.json()
        assert "slug" in preset, preset
        return {"slug": preset["slug"], "listing_id": lid, "preset_id": preset["id"]}

    def test_short_link_renders_og_html(self, share_slug):
        slug = share_slug["slug"]
        path = f"/api/r/{slug}"
        r = requests.get(f"{BASE_URL}{path}", timeout=15, allow_redirects=False)
        assert r.status_code == 200, f"GET /api/r/: {r.status_code} {r.text[:200]}"
        html = r.text
        # Same checks as /api/d/
        assert "<!DOCTYPE html>" in html or "<!doctype html>" in html.lower()
        assert not re.search(
            r'<meta[^>]+http-equiv\s*=\s*["\']?refresh', html, re.I
        ), "meta-refresh found"
        m = re.search(
            r'<meta[^>]+property=["\']og:image:type["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m and m.group(1).lower() == "image/jpeg"
        # og:url must point to /api/r/<slug>, not destination listing
        m = re.search(
            r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)',
            html, re.I,
        )
        assert m and path in m.group(1)
        assert f"/listing/{share_slug['listing_id']}" not in m.group(1)

    def test_head_short_link(self, share_slug):
        r = requests.head(f"{BASE_URL}/api/r/{share_slug['slug']}",
                          timeout=10, allow_redirects=False)
        assert r.status_code in (200, 302), f"HEAD /api/r/: {r.status_code}"

    def test_unknown_slug_redirects(self):
        r = requests.get(f"{BASE_URL}/api/r/does-not-exist-xyz",
                         timeout=10, allow_redirects=False)
        assert r.status_code in (302, 307), r.status_code
