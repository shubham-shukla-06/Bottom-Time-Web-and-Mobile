"""
Iteration 97 backend test — Listings consolidation
Validates the migration from db.listings -> db.operator_dive_listings (Option B).
Tests: public listings, single listing, destinations, popular locations, search/filter,
operator auth flow, operator stats, operator listings CRUD (create, publish, update, delete),
admin listing endpoints, db.listings drop status.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env (test execution)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
OPERATOR_EMAIL = "testoperator@bottom-time.com"
USER_EMAIL = "testuser@bottom-time.com"
OTP = "123456"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


def _login(email: str) -> dict:
    """Run send-otp -> verify-otp -> login-complete. Returns {access_token, user}."""
    r1 = session.post(f"{API}/auth/send-otp", json={"identifier": email}, timeout=15)
    assert r1.status_code == 200, f"send-otp failed: {r1.status_code} {r1.text}"
    r2 = session.post(f"{API}/auth/verify-otp", json={"identifier": email, "code": OTP}, timeout=15)
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    vtoken = r2.json()["verification_token"]
    r3 = session.post(
        f"{API}/auth/login-complete",
        json={"email": email, "email_verified_token": vtoken},
        timeout=15,
    )
    assert r3.status_code == 200, f"login-complete failed: {r3.status_code} {r3.text}"
    return r3.json()


@pytest.fixture(scope="module")
def operator_auth():
    data = _login(OPERATOR_EMAIL)
    token = data["access_token"]
    return {"token": token, "user": data["user"], "headers": {"Authorization": f"Bearer {token}"}}


# ── Public listings endpoints ──────────────────────────────────────
class TestPublicListings:
    def test_get_listings_returns_active_only(self):
        r = requests.get(f"{API}/listings", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "listings" in data and "total" in data and "count" in data
        assert isinstance(data["listings"], list)
        assert data["total"] >= 1, "Expected at least 1 active listing seeded"
        # All should be active
        for item in data["listings"]:
            assert item.get("status") == "active", f"Non-active item leaked: {item.get('status')}"

    def test_get_listings_has_normalized_fields(self):
        r = requests.get(f"{API}/listings?limit=5", timeout=15)
        data = r.json()
        assert data["listings"], "Expected listings"
        item = data["listings"][0]
        # Legacy schema expected by frontend
        required_fields = [
            "id", "name", "type", "image_url", "location", "country",
            "price", "currency", "difficulty", "duration",
            "photos", "highlights", "included", "excluded",
        ]
        missing = [f for f in required_fields if f not in item]
        assert not missing, f"Missing normalized fields: {missing}"
        # type should be a legacy value
        legacy_types = {"dives", "courses", "liveaboards", "day_trips", "snorkeling"}
        assert item["type"] in legacy_types, f"Unexpected type: {item['type']}"

    def test_get_listings_filter_by_type_courses(self):
        r = requests.get(f"{API}/listings?type=courses", timeout=15)
        assert r.status_code == 200
        for it in r.json()["listings"]:
            assert it["type"] == "courses"

    def test_get_listings_filter_by_country_indonesia(self):
        r = requests.get(f"{API}/listings?country=Indonesia", timeout=15)
        assert r.status_code == 200
        # Could be empty if no Indonesia listings; just ensure no error
        for it in r.json()["listings"]:
            assert "indonesia" in (it.get("country") or "").lower()

    def test_get_listings_search(self):
        r = requests.get(f"{API}/listings?search=Reef", timeout=15)
        assert r.status_code == 200
        # Just verify endpoint works; matches may be 0
        assert "listings" in r.json()

    def test_get_listings_filter_by_type_liveaboards(self):
        r = requests.get(f"{API}/listings?type=liveaboards", timeout=15)
        assert r.status_code == 200
        for it in r.json()["listings"]:
            assert it["type"] == "liveaboards"

    def test_single_listing_normalized(self):
        r = requests.get(f"{API}/listings", timeout=15)
        listings = r.json()["listings"]
        assert listings, "Need at least one listing for detail test"
        lid = listings[0]["id"]
        rd = requests.get(f"{API}/listings/{lid}", timeout=15)
        assert rd.status_code == 200, rd.text
        item = rd.json()
        for f in ["id", "name", "type", "image_url", "location", "country",
                  "price", "currency", "difficulty", "duration",
                  "photos", "highlights", "included", "excluded"]:
            assert f in item, f"Missing field {f} in single listing"

    def test_single_listing_404(self):
        r = requests.get(f"{API}/listings/NONEXISTENT_ID", timeout=15)
        assert r.status_code == 404

    def test_destinations_aggregates_from_operator_listings(self):
        r = requests.get(f"{API}/destinations", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "destinations" in data
        assert isinstance(data["destinations"], list)
        if data["destinations"]:
            d = data["destinations"][0]
            for f in ["country", "listing_count", "avg_rating", "min_price", "types"]:
                assert f in d

    def test_popular_locations_from_operator_listings(self):
        r = requests.get(f"{API}/listings/locations/popular", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "countries" in data
        assert isinstance(data["countries"], list)


# ── Auth flow with new email format ────────────────────────────────
class TestAuthFlow:
    def test_operator_otp_login(self):
        data = _login(OPERATOR_EMAIL)
        assert data["access_token"]
        assert data["user"]["email"] == OPERATOR_EMAIL
        assert data["user"]["role"] == "operator"

    def test_user_otp_login(self):
        data = _login(USER_EMAIL)
        assert data["access_token"]
        assert data["user"]["email"] == USER_EMAIL


# ── Operator stats from operator_dive_listings ────────────────────
class TestOperatorStats:
    def test_operator_stats(self, operator_auth):
        r = requests.get(f"{API}/operator/stats", headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Stats should report numeric counts
        assert isinstance(data, dict)
        # Common expected keys
        for k in ("total_listings", "active_listings"):
            if k in data:
                assert isinstance(data[k], int)


# ── Operator listings CRUD ────────────────────────────────────────
class TestOperatorListingsCRUD:
    created_id = None

    def test_create_listing(self, operator_auth):
        payload = {
            "title": "TEST_iter97 Sample Reef Dive",
            "description": "Test listing created by iteration 97 backend tests",
            "listing_type": "day_dive",
            "location": "Seraya Bay",
            "country": "Indonesia",
            "photos": [{"url": "https://example.com/img1.jpg"}],
            "videos": [],
            "dive_sites": [{"name": "Seraya Reef"}],
            "num_dives": 2,
            "max_depth": 18,
            "difficulty_level": "beginner",
            "certification_required": "Open Water",
            "duration_days": 1,
            "max_participants": 8,
            "inclusions": ["2 dives", "Lunch", "Tanks"],
            "exclusions": ["Gear rental"],
            "price": 95.0,
            "currency": "USD",
            "schedule_type": "on_demand",
        }
        r = requests.post(
            f"{API}/operator-listings/listings",
            json=payload,
            headers=operator_auth["headers"],
            timeout=15,
        )
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        data = r.json()
        # accept either flat or nested
        lid = data.get("id") or (data.get("listing") or {}).get("id")
        assert lid, f"No id in create response: {data}"
        TestOperatorListingsCRUD.created_id = lid

    def test_publish_listing(self, operator_auth):
        lid = TestOperatorListingsCRUD.created_id
        assert lid, "create_listing must run first"
        r = requests.put(
            f"{API}/operator-listings/listings/{lid}/publish",
            headers=operator_auth["headers"],
            timeout=15,
        )
        assert r.status_code == 200, f"publish failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("status") in ("active", "pending")

    def test_published_listing_visible_publicly_if_active(self, operator_auth):
        lid = TestOperatorListingsCRUD.created_id
        # quick sleep to allow status propagation (no caches but safe)
        time.sleep(0.3)
        r_detail = requests.get(f"{API}/listings/{lid}", timeout=15)
        # Endpoint serves any status by id; verify presence
        if r_detail.status_code == 200:
            item = r_detail.json()
            assert item["id"] == lid
            assert item["location"] == "Seraya Bay"
            assert item["country"] == "Indonesia"
        # If verified operator -> active, must be in /listings
        r_list = requests.get(f"{API}/listings?limit=100", timeout=15)
        ids = {x["id"] for x in r_list.json()["listings"]}
        if operator_auth["user"].get("operator_verified"):
            assert lid in ids, "Active listing not in public /listings"

    def test_update_listing(self, operator_auth):
        lid = TestOperatorListingsCRUD.created_id
        r = requests.put(
            f"{API}/operator-listings/listings/{lid}",
            json={"title": "TEST_iter97 Sample Reef Dive (Updated)", "price": 110.0},
            headers=operator_auth["headers"],
            timeout=15,
        )
        assert r.status_code == 200, f"update failed: {r.status_code} {r.text}"
        # Verify persistence via GET
        rd = requests.get(f"{API}/listings/{lid}", timeout=15)
        if rd.status_code == 200:
            d = rd.json()
            assert "Updated" in d["name"], f"Update did not persist: {d['name']}"
            assert d["price"] == 110.0

    def test_delete_listing(self, operator_auth):
        lid = TestOperatorListingsCRUD.created_id
        r = requests.delete(
            f"{API}/operator-listings/listings/{lid}",
            headers=operator_auth["headers"],
            timeout=15,
        )
        assert r.status_code in (200, 204), f"delete failed: {r.status_code} {r.text}"
        # Verify deleted
        rd = requests.get(f"{API}/listings/{lid}", timeout=15)
        assert rd.status_code == 404


# ── Admin listings (require admin user) ────────────────────────────
class TestAdminListings:
    def test_admin_listings_unauthenticated(self):
        r = requests.get(f"{API}/admin/listings", timeout=15)
        # Should require auth -> 401/403
        assert r.status_code in (401, 403), f"Expected auth required, got {r.status_code}"

    def test_admin_listings_non_admin_forbidden(self, operator_auth):
        r = requests.get(
            f"{API}/admin/listings", headers=operator_auth["headers"], timeout=15
        )
        # operator should NOT be admin
        assert r.status_code in (401, 403), f"Operator was not blocked: {r.status_code}"


# ── DB invariants ─────────────────────────────────────────────────
class TestDbInvariants:
    def test_db_listings_collection_empty_or_missing(self):
        """db.listings should be dropped or empty per Option B migration."""
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from database import db

        async def _check():
            names = await db.list_collection_names()
            if "listings" in names:
                count = await db.listings.count_documents({})
                return count
            return 0

        count = asyncio.run(_check())
        assert count == 0, f"db.listings should be empty/dropped, found {count} documents"
