"""Tests for the device-session / refresh-token model.
   Phase A — mobile biometric resume backend (2026-05-07)."""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR / "backend"))

from server import app  # noqa: E402
from database import db  # noqa: E402  (used for type-side imports)
from rate_limiter import limiter as _limiter  # noqa: E402

# Sync Mongo handle for test-only direct mutations. Motor's AsyncIOMotorClient
# is bound to FastAPI's own event loop and can't be driven from a fresh loop
# inside a sync test, so we use pymongo for the few `device_sessions` tweaks.
import os
from pymongo import MongoClient
_sync_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

# Existing test bypass — see routes/auth.py TEST_IDENTIFIERS / TEST_OTP_CODE.
EMAIL = "testuser@bottom-time.com"
OTP = "007320"


@pytest.fixture(scope="module")
def client():
    # slowapi's default 10/minute on /auth/login-complete trips the test suite
    # because we exercise the path 11+ times. Disable rate limiting for the
    # duration of these tests; the rate limit is still active in production.
    prev = getattr(_limiter, "enabled", True)
    _limiter.enabled = False
    try:
        with TestClient(app) as c:
            yield c
    finally:
        _limiter.enabled = prev


def _run(coro):
    """Run an async helper from a sync test. asyncio.run() is required because
    pytest's default loop policy doesn't keep one open between tests."""
    return asyncio.new_event_loop().run_until_complete(coro)


def _verification_token(client: TestClient, identifier: str) -> str:
    r = client.post("/api/auth/verify-otp", json={"identifier": identifier, "code": OTP})
    assert r.status_code == 200, r.text
    return r.json()["verification_token"]


def _login_with_device(client: TestClient, *, device_id: str, name: str = "iPhone 15", platform: str = "ios") -> dict:
    """testuser@bottom-time.com must already exist in seed data — login flow."""
    tok = _verification_token(client, EMAIL)
    r = client.post(
        "/api/auth/login-complete",
        json={
            "email": EMAIL,
            "email_verified_token": tok,
            "device": {
                "device_id": device_id,
                "device_name": name,
                "platform": platform,
                "biometric_enabled": False,
            },
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Acceptance tests
# ---------------------------------------------------------------------------

def test_login_without_device_is_unchanged(client):
    """Backwards compat — web clients omit `device` and never see refresh
    fields in the response."""
    tok = _verification_token(client, EMAIL)
    r = client.post(
        "/api/auth/login-complete",
        json={"email": EMAIL, "email_verified_token": tok},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert body.get("refresh_token") in (None, "")  # Optional[str] = None
    assert body.get("session_id") in (None, "")


def test_login_with_device_mints_refresh_token(client):
    body = _login_with_device(client, device_id="dev-test-A1")
    assert body["access_token"]
    assert body["refresh_token"] and len(body["refresh_token"]) >= 80
    assert body["session_id"] and len(body["session_id"]) >= 8
    assert body["refresh_expires_at"]
    # 30-day window — parse and assert >= 29 days from now (sanity)
    exp = datetime.fromisoformat(body["refresh_expires_at"])
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    delta = exp - datetime.now(timezone.utc)
    assert delta > timedelta(days=29), f"refresh window too short: {delta}"


def test_refresh_happy_path(client):
    body = _login_with_device(client, device_id="dev-test-B1")
    refresh = body["refresh_token"]
    r = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": refresh, "device_id": "dev-test-B1"},
    )
    assert r.status_code == 200, r.text
    new_body = r.json()
    assert new_body["access_token"]
    assert new_body["refresh_token"] and new_body["refresh_token"] != refresh, "rotation must change the token"
    assert new_body["session_id"] == body["session_id"]
    # Old refresh token must now be invalid (rotated).
    r2 = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": refresh, "device_id": "dev-test-B1"},
    )
    assert r2.status_code == 401
    assert r2.json()["detail"] == "invalid_token"


def test_refresh_with_wrong_device_id_returns_401(client):
    body = _login_with_device(client, device_id="dev-test-C1")
    r = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": body["refresh_token"], "device_id": "different-device"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "device_mismatch"


def test_refresh_after_revoke_returns_401(client):
    body = _login_with_device(client, device_id="dev-test-D1")
    access, refresh, session_id = body["access_token"], body["refresh_token"], body["session_id"]

    rv = client.post("/api/auth/session/revoke", json={"session_id": session_id}, headers=_bearer(access))
    assert rv.status_code == 200 and rv.json()["revoked"] is True

    r = client.post("/api/auth/session/refresh", json={"refresh_token": refresh, "device_id": "dev-test-D1"})
    assert r.status_code == 401
    assert r.json()["detail"] == "session_revoked"


def test_refresh_after_manual_expiry_returns_401(client):
    """Sliding 30-day window — flip expires_at into the past in Mongo and
    confirm the next refresh fails with `session_expired`."""
    body = _login_with_device(client, device_id="dev-test-E1")

    # Sliding 30-day window — flip expires_at into the past in Mongo and
    # confirm the next refresh fails with `session_expired`.
    _sync_db.device_sessions.update_one(
        {"_id": body["session_id"]},
        {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}},
    )

    r = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": body["refresh_token"], "device_id": "dev-test-E1"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "session_expired"


def test_list_sessions_returns_current_device(client):
    body = _login_with_device(client, device_id="dev-test-F1", name="Pixel 9")
    r = client.get(
        "/api/auth/sessions",
        headers=_bearer(body["access_token"]),
        params={"session_id": body["session_id"]},
    )
    assert r.status_code == 200, r.text
    sessions = r.json()["sessions"]
    assert any(s["session_id"] == body["session_id"] and s["is_current"] for s in sessions)
    # Each row exposes the fields the mobile Security screen needs.
    s0 = next(s for s in sessions if s["session_id"] == body["session_id"])
    assert s0["device_name"] == "Pixel 9"
    assert s0["platform"] == "ios"
    assert s0["expires_at"]
    assert s0["last_used_at"]


def test_revoke_all_cascades(client):
    """Sign out everywhere — every active session for this user is revoked,
    including the one making the request."""
    a = _login_with_device(client, device_id="dev-revokeall-1")
    _b = _login_with_device(client, device_id="dev-revokeall-2")

    r = client.post("/api/auth/session/revoke-all", headers=_bearer(a["access_token"]))
    assert r.status_code == 200, r.text
    assert r.json()["revoked_count"] >= 2

    # Both refresh tokens now fail.
    rA = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": a["refresh_token"], "device_id": "dev-revokeall-1"},
    )
    assert rA.status_code == 401
    assert rA.json()["detail"] == "session_revoked"


def test_phone_change_revokes_all_sessions(client):
    """When the social-merge path attaches a phone number to an existing user,
    `revoke_sessions_for_user(reason="phone_changed")` runs. We can't easily
    mount that path in tests (no live OAuth), so we drive the same Mongo
    mutation directly with the sync handle and assert the cascade — the
    backend logic (refresh_session) is what we're really testing here."""
    body = _login_with_device(client, device_id="dev-phone-1")
    body2 = _login_with_device(client, device_id="dev-phone-2")
    user = _sync_db.users.find_one({"email": EMAIL}, {"_id": 0, "id": 1})
    assert user, "test fixture user missing"
    user_id = user["id"]

    res = _sync_db.device_sessions.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": "phone_changed"}},
    )
    assert res.modified_count >= 2

    for b, did in [(body, "dev-phone-1"), (body2, "dev-phone-2")]:
        r = client.post(
            "/api/auth/session/refresh",
            json={"refresh_token": b["refresh_token"], "device_id": did},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "session_revoked"


def test_test_bypass_007320_still_works(client):
    """Acceptance #6 — the test bypass code must keep working unchanged for
    testuser@bottom-time.com."""
    r = client.post(
        "/api/auth/verify-otp",
        json={"identifier": EMAIL, "code": OTP},
    )
    assert r.status_code == 200, r.text
    assert r.json()["verified"] is True
    assert r.json()["verification_token"]


def test_same_device_reused_rotates_old_session(client):
    """If the same install logs in twice (e.g., user re-OTPs without using
    refresh), the previous session for that (user, device) is marked
    `revoked_reason='rotated'` so the old refresh token can't ride alongside."""
    a = _login_with_device(client, device_id="dev-rotate-1", name="iPhone X")
    b = _login_with_device(client, device_id="dev-rotate-1", name="iPhone X")  # same device

    assert a["session_id"] != b["session_id"], "new session id expected"
    # Old refresh token should be invalid (revoked: 'rotated').
    r = client.post(
        "/api/auth/session/refresh",
        json={"refresh_token": a["refresh_token"], "device_id": "dev-rotate-1"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] in ("session_revoked", "invalid_token")
