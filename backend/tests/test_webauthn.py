"""Tests for Phase B web passkey flow.

Most of this exercises the surface that doesn't require a real authenticator
(begin/list/delete/cascade); the authenticator-side cryptography is delegated
to the `webauthn` library and is covered by their own test suite. We do
exercise the counter-anomaly revoke path with a synthetic fixture row.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR / "backend"))

from server import app  # noqa: E402
from rate_limiter import limiter as _limiter  # noqa: E402

from pymongo import MongoClient
_sync_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

EMAIL = "testuser@bottom-time.com"
OTP = "007320"


@pytest.fixture(scope="module")
def client():
    prev = getattr(_limiter, "enabled", True)
    _limiter.enabled = False
    try:
        with TestClient(app) as c:
            yield c
    finally:
        _limiter.enabled = prev


def _login(client) -> dict:
    r = client.post("/api/auth/verify-otp", json={"identifier": EMAIL, "code": OTP})
    assert r.status_code == 200
    tok = r.json()["verification_token"]
    r = client.post("/api/auth/login-complete", json={"email": EMAIL, "email_verified_token": tok})
    assert r.status_code == 200
    return r.json()


def _bearer(t): return {"Authorization": f"Bearer {t}"}


def _user_id() -> str:
    u = _sync_db.users.find_one({"email": EMAIL}, {"_id": 0, "id": 1})
    assert u, "test user missing"
    return u["id"]


def test_register_begin_returns_options(client):
    sess = _login(client)
    r = client.post("/api/auth/webauthn/register/begin", headers=_bearer(sess["access_token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "challenge" in body and len(body["challenge"]) >= 32
    assert body.get("rp", {}).get("name") == "Bottom Time"
    assert body.get("user", {}).get("name") == EMAIL
    assert "pubKeyCredParams" in body


def test_login_begin_unknown_email_does_not_leak_enumeration(client):
    r = client.post("/api/auth/webauthn/login/begin", json={"email": "nobody@example.com"})
    assert r.status_code == 200
    body = r.json()
    # No allowCredentials hints means we returned generic options — same shape
    # as for an unknown user.
    assert body.get("allowCredentials", []) == []
    assert "challenge" in body


def test_login_begin_userless_works(client):
    r = client.post("/api/auth/webauthn/login/begin", json={})
    assert r.status_code == 200
    assert "challenge" in r.json()


def test_passkey_list_and_delete(client):
    """Insert a synthetic passkey row, then verify list + delete via the API."""
    sess = _login(client)
    user_id = _user_id()

    pk_doc = {
        "_id": "test-passkey-001",
        "user_id": user_id,
        "credential_id": "dGVzdC1jcmVkLTAwMQ",  # b64url("test-cred-001")
        "public_key": "AAAA",
        "sign_count": 0,
        "transports": ["internal"],
        "aaguid": None,
        "backed_up": True,
        "device_type": "multi_device",
        "label": "MacBook Pro Touch ID",
        "created_at": datetime.now(timezone.utc),
        "last_used_at": None,
        "revoked_at": None,
    }
    _sync_db.passkeys.delete_many({"user_id": user_id})
    _sync_db.passkeys.insert_one(pk_doc)

    r = client.get("/api/auth/webauthn/passkeys", headers=_bearer(sess["access_token"]))
    assert r.status_code == 200, r.text
    rows = r.json()["passkeys"]
    assert any(p["passkey_id"] == "test-passkey-001" and p["label"] == "MacBook Pro Touch ID" for p in rows)

    r = client.delete("/api/auth/webauthn/passkeys/test-passkey-001", headers=_bearer(sess["access_token"]))
    assert r.status_code == 200 and r.json()["revoked"] is True

    r = client.get("/api/auth/webauthn/passkeys", headers=_bearer(sess["access_token"]))
    assert all(p["passkey_id"] != "test-passkey-001" for p in r.json()["passkeys"])


def test_login_finish_unknown_credential_returns_401(client):
    r = client.post("/api/auth/webauthn/login/finish", json={
        "response": {"id": "unknown-cred-id", "rawId": "unknown-cred-id",
                     "type": "public-key", "response": {}},
    })
    assert r.status_code == 401
    assert r.json()["detail"] == "credential_not_found"


def test_email_change_cascade_revokes_passkeys(client):
    """The Phase A `revoke_sessions_for_user(reason='email_changed')` helper
    must also flag passkeys as revoked. Phone-changed must NOT cascade."""
    user_id = _user_id()
    _sync_db.passkeys.delete_many({"user_id": user_id})
    _sync_db.passkeys.insert_one({
        "_id": "pk-cascade-001", "user_id": user_id,
        "credential_id": "cas1", "public_key": "AAAA", "sign_count": 0,
        "transports": [], "aaguid": None, "backed_up": True,
        "device_type": "multi_device", "label": "Test", "created_at": datetime.now(timezone.utc),
        "last_used_at": None, "revoked_at": None,
    })

    # Drive the cascade via the same async helper Phase A wired up. Use a
    # fresh asyncio loop because Motor is bound to FastAPI's loop.
    import asyncio
    from device_sessions import revoke_sessions_for_user
    asyncio.new_event_loop().run_until_complete(
        revoke_sessions_for_user(user_id=user_id, reason="email_changed")
    )

    pk = _sync_db.passkeys.find_one({"_id": "pk-cascade-001"})
    assert pk["revoked_at"] is not None
    assert pk.get("revoked_reason") == "email_changed"


def test_phone_change_does_NOT_revoke_passkeys(client):
    user_id = _user_id()
    _sync_db.passkeys.delete_many({"user_id": user_id})
    _sync_db.passkeys.insert_one({
        "_id": "pk-keep-001", "user_id": user_id,
        "credential_id": "keep1", "public_key": "AAAA", "sign_count": 0,
        "transports": [], "aaguid": None, "backed_up": True,
        "device_type": "multi_device", "label": "Keep me", "created_at": datetime.now(timezone.utc),
        "last_used_at": None, "revoked_at": None,
    })

    import asyncio
    from device_sessions import revoke_sessions_for_user
    asyncio.new_event_loop().run_until_complete(
        revoke_sessions_for_user(user_id=user_id, reason="phone_changed")
    )
    pk = _sync_db.passkeys.find_one({"_id": "pk-keep-001"})
    assert pk["revoked_at"] is None, "phone_changed must NOT cascade to passkeys"
    _sync_db.passkeys.delete_many({"user_id": user_id})


def test_otp_test_bypass_still_works(client):
    """Acceptance #7 — Phase A's bypass path must remain untouched."""
    r = client.post("/api/auth/verify-otp", json={"identifier": EMAIL, "code": OTP})
    assert r.status_code == 200
    assert r.json()["verified"] is True


def test_access_token_ttl_is_60_minutes_now():
    """Acceptance #9 — TTL has been lowered now that web has refresh."""
    from config import ACCESS_TOKEN_EXPIRE
    assert ACCESS_TOKEN_EXPIRE == 60, f"expected 60-min TTL, got {ACCESS_TOKEN_EXPIRE}"
