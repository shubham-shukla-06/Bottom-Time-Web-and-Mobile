"""
Iteration 98 backend test — Share Tracking & UTM Attribution
Tests share-presets CRUD, /track/share-click public endpoint, booking utm persistence,
and operator + admin share analytics.
"""
import os
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
USER_EMAIL = "testuser@bottom-time.com"
ADMIN_EMAIL = "shubham@bottom-time.com"
OTP = "123456"


def _login(email: str) -> dict:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r1 = s.post(f"{API}/auth/send-otp", json={"identifier": email}, timeout=15)
    assert r1.status_code == 200, f"send-otp {email}: {r1.status_code} {r1.text}"
    r2 = s.post(f"{API}/auth/verify-otp", json={"identifier": email, "code": OTP}, timeout=15)
    assert r2.status_code == 200, f"verify-otp {email}: {r2.status_code} {r2.text}"
    vtoken = r2.json()["verification_token"]
    r3 = s.post(
        f"{API}/auth/login-complete",
        json={"email": email, "email_verified_token": vtoken},
        timeout=15,
    )
    assert r3.status_code == 200, f"login-complete {email}: {r3.status_code} {r3.text}"
    return r3.json()


@pytest.fixture(scope="module")
def operator_auth():
    d = _login(OPERATOR_EMAIL)
    return {"token": d["access_token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


@pytest.fixture(scope="module")
def diver_auth():
    d = _login(USER_EMAIL)
    return {"token": d["access_token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


@pytest.fixture(scope="module")
def admin_auth():
    d = _login(ADMIN_EMAIL)
    return {"token": d["access_token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


@pytest.fixture(scope="module")
def operator_listing(operator_auth):
    """Pick or create a listing owned by test operator."""
    # Try operator listings endpoint
    r = requests.get(f"{API}/operator/listings", headers=operator_auth["headers"], timeout=15)
    if r.status_code == 200:
        items = r.json().get("listings") or r.json().get("items") or []
        if items:
            return items[0]
    # Create a minimal listing
    payload = {
        "title": "TEST_Share Tracking Dive",
        "description": "Test listing for share tracking",
        "listing_type": "day_dive",
        "price": 100,
        "location": "Goa",
        "country": "IN",
    }
    r = requests.post(f"{API}/operator/listings", json=payload,
                      headers=operator_auth["headers"], timeout=15)
    assert r.status_code in (200, 201), f"create listing: {r.status_code} {r.text}"
    return r.json()


# ── Share Presets ────────────────────────────────────────────────────
class TestSharePresets:
    def test_create_preset_as_operator(self, operator_auth, operator_listing):
        lid = operator_listing["id"]
        body = {
            "channel": "whatsapp",
            "label": "TEST WhatsApp Promo",
            "utm_source": "WhatsApp",
            "utm_medium": "Social",
            "utm_campaign": "Summer 2026",
            "utm_content": "promo!",
        }
        r = requests.post(f"{API}/listings/{lid}/share-presets", json=body,
                          headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # normalization: lowercase a-z0-9_-, non-allowed -> _
        assert d["utm_source"] == "whatsapp"
        assert d["utm_medium"] == "social"
        assert d["utm_campaign"] == "summer_2026"
        assert d["utm_content"] == "promo_"
        assert d["channel"] == "whatsapp"
        assert "id" in d
        assert "_id" not in d

    def test_list_presets(self, operator_auth, operator_listing):
        lid = operator_listing["id"]
        r = requests.get(f"{API}/listings/{lid}/share-presets",
                         headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "presets" in d
        assert isinstance(d["presets"], list)
        assert len(d["presets"]) >= 1
        assert any(p.get("utm_source") == "whatsapp" for p in d["presets"])

    def test_create_preset_rejects_diver(self, diver_auth, operator_listing):
        lid = operator_listing["id"]
        body = {"channel": "x", "label": "diver", "utm_source": "x"}
        r = requests.post(f"{API}/listings/{lid}/share-presets", json=body,
                          headers=diver_auth["headers"], timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_create_preset_rejects_unknown_listing(self, operator_auth):
        bad = str(uuid.uuid4())
        body = {"channel": "x", "label": "foo", "utm_source": "x"}
        r = requests.post(f"{API}/listings/{bad}/share-presets", json=body,
                          headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_delete_preset(self, operator_auth, operator_listing):
        lid = operator_listing["id"]
        # create -> delete
        body = {"channel": "email", "label": "TEST delete me", "utm_source": "newsletter"}
        r = requests.post(f"{API}/listings/{lid}/share-presets", json=body,
                          headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        d = requests.delete(f"{API}/share-presets/{pid}",
                            headers=operator_auth["headers"], timeout=15)
        assert d.status_code == 200, d.text
        assert d.json().get("deleted") is True
        # second delete -> 404
        d2 = requests.delete(f"{API}/share-presets/{pid}",
                             headers=operator_auth["headers"], timeout=15)
        assert d2.status_code == 404


# ── Track Click (public, no auth) ───────────────────────────────────
class TestTrackClick:
    def test_unknown_listing_returns_ok_false(self):
        r = requests.post(f"{API}/track/share-click",
                          json={"listing_id": str(uuid.uuid4()), "utm_source": "whatsapp"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": False}

    def test_no_utm_returns_skipped(self, operator_listing):
        r = requests.post(f"{API}/track/share-click",
                          json={"listing_id": operator_listing["id"]}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is False
        assert d.get("skipped") is True

    def test_valid_click_records(self, operator_listing):
        r = requests.post(f"{API}/track/share-click",
                          json={
                              "listing_id": operator_listing["id"],
                              "utm_source": "WhatsApp!",   # tests normalization
                              "utm_medium": "social",
                              "utm_campaign": "summer 2026",
                              "visitor_id": "TEST_visitor_A",
                              "referrer": "https://wa.me/x",
                          }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_repeat_visitor_same_source_does_not_inflate_uniques(
        self, operator_listing, operator_auth
    ):
        # Use a unique source name + unique visitor_id (per run) to avoid cross-run leakage
        unique_src = f"uniqtest_{uuid.uuid4().hex[:8]}"
        unique_visitor = f"TEST_visitor_{uuid.uuid4().hex[:10]}"
        for _ in range(3):
            r = requests.post(f"{API}/track/share-click",
                              json={
                                  "listing_id": operator_listing["id"],
                                  "utm_source": unique_src,
                                  "utm_medium": "email",
                                  "utm_campaign": "uniques_test",
                                  "visitor_id": unique_visitor,
                              }, timeout=15)
            assert r.status_code == 200
        # The normalize fn lowercases/replaces non-allowed chars; "_" is allowed
        normalized_src = unique_src.lower()
        a = requests.get(f"{API}/operator/share-analytics?days=30",
                         headers=operator_auth["headers"], timeout=15)
        assert a.status_code == 200, a.text
        data = a.json()
        row = next((s for s in data["by_source"] if s["source"] == normalized_src), None)
        assert row is not None, f"source {normalized_src} not in {data['by_source']}"
        assert row["clicks"] == 3, f"expected 3 clicks, got {row}"
        assert row["uniques"] == 1, f"uniques inflated: {row}"


# ── Booking attribution ────────────────────────────────────────────
class TestBookingAttribution:
    def test_create_booking_with_utm_persists(self, diver_auth, operator_listing):
        body = {
            "listing_id": operator_listing["id"],
            "date": "2026-06-15",
            "participants": 2,
            "notes": "TEST booking with utm",
            "utm_source": "whatsapp",
            "utm_medium": "social",
            "utm_campaign": "summer_2026",
            "utm_content": "promo_",
        }
        r = requests.post(f"{API}/bookings", json=body,
                          headers=diver_auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["utm_source"] == "whatsapp"
        assert b["utm_medium"] == "social"
        assert b["utm_campaign"] == "summer_2026"
        assert b["utm_content"] == "promo_"
        assert b["listing_id"] == operator_listing["id"]
        assert b["status"] == "pending"

        # GET to verify persistence
        g = requests.get(f"{API}/bookings", headers=diver_auth["headers"], timeout=15)
        assert g.status_code == 200
        bookings = g.json()["bookings"]
        match = next((x for x in bookings if x["id"] == b["id"]), None)
        assert match is not None, "booking not persisted"
        assert match["utm_source"] == "whatsapp"

    def test_create_booking_for_unknown_listing_404(self, diver_auth):
        body = {
            "listing_id": str(uuid.uuid4()),
            "date": "2026-06-15",
            "participants": 1,
            "notes": "x",
        }
        r = requests.post(f"{API}/bookings", json=body,
                          headers=diver_auth["headers"], timeout=15)
        assert r.status_code == 404


# ── Operator analytics ──────────────────────────────────────────────
class TestOperatorAnalytics:
    def test_operator_analytics_shape(self, operator_auth):
        r = requests.get(f"{API}/operator/share-analytics?days=30",
                         headers=operator_auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_clicks", "total_bookings", "total_confirmed",
                  "conv_rate", "by_source", "by_campaign", "top_listings", "trend"):
            assert k in d, f"missing key: {k}"
        assert isinstance(d["by_source"], list)
        # by_source rows must include conv_rate, bookings, confirmed
        for s in d["by_source"]:
            assert "clicks" in s and "uniques" in s
            assert "bookings" in s and "conv_rate" in s

    def test_operator_analytics_listing_filter(self, operator_auth, operator_listing):
        r = requests.get(
            f"{API}/operator/share-analytics?days=30&listing_id={operator_listing['id']}",
            headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        # should also work
        assert "total_clicks" in r.json()

    def test_operator_analytics_unknown_listing_404(self, operator_auth):
        bad = str(uuid.uuid4())
        r = requests.get(f"{API}/operator/share-analytics?listing_id={bad}",
                         headers=operator_auth["headers"], timeout=15)
        assert r.status_code == 404

    def test_operator_analytics_rejects_diver(self, diver_auth):
        r = requests.get(f"{API}/operator/share-analytics?days=30",
                         headers=diver_auth["headers"], timeout=15)
        assert r.status_code == 403


# ── Admin analytics ─────────────────────────────────────────────────
class TestAdminAnalytics:
    def test_admin_analytics_with_top_operators(self, admin_auth):
        r = requests.get(f"{API}/admin/share-analytics?days=30",
                         headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_clicks", "by_source", "by_campaign",
                  "top_listings", "trend", "top_operators"):
            assert k in d, f"missing: {k}"
        assert isinstance(d["top_operators"], list)
        # at least one operator should have a name (from clicks made by test operator)
        if d["top_operators"]:
            for op in d["top_operators"]:
                assert "operator_id" in op
                assert "clicks" in op
                # operator_name resolved (or fallback "Unknown")
                if op.get("operator_id"):
                    assert "operator_name" in op

    def test_admin_analytics_rejects_operator(self, operator_auth):
        r = requests.get(f"{API}/admin/share-analytics?days=30",
                         headers=operator_auth["headers"], timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_analytics_rejects_diver(self, diver_auth):
        r = requests.get(f"{API}/admin/share-analytics?days=30",
                         headers=diver_auth["headers"], timeout=15)
        assert r.status_code in (401, 403)
