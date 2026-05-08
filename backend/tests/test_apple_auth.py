"""Tests for the Apple Sign-in verifier + /api/auth/social/apple-token endpoint.

We can't hit Apple's real JWKS endpoint from CI, so the verifier is exercised
by monkey-patching `apple_auth.verify_apple_identity_token` for the endpoint
tests, and by testing the JWKS cache / key-selection logic in isolation.

The real RS256 signature math is delegated to `python-jose` and doesn't need
re-testing here — the surface we own is: kid lookup, audience rotation,
iat-in-future rejection, and the FastAPI endpoint's lookup-or-create +
signup_temp wiring.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR / "backend"))

from server import app  # noqa: E402
from rate_limiter import limiter as _limiter  # noqa: E402
import apple_auth  # noqa: E402
from apple_auth import AppleTokenError  # noqa: E402

from pymongo import MongoClient
_sync_db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    prev = getattr(_limiter, "enabled", True)
    _limiter.enabled = False
    try:
        with TestClient(app) as c:
            yield c
    finally:
        _limiter.enabled = prev


@pytest.fixture(autouse=True)
def _isolate_apple_state():
    """Wipe apple-related state between tests so they don't bleed into each
    other. Lean: only touch rows our tests create."""
    apple_auth._reset_cache_for_tests()
    _sync_db.signup_temp.delete_many({"provider": "apple"})
    _sync_db.users.delete_many({"provider": "apple"})
    _sync_db.users.delete_many({"apple_sub": {"$exists": True}})
    yield
    _sync_db.signup_temp.delete_many({"provider": "apple"})
    _sync_db.users.delete_many({"provider": "apple"})
    _sync_db.users.delete_many({"apple_sub": {"$exists": True}})


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ──────────────────────────────────────────────────────────────
# Unit-level: verify_apple_identity_token behaviour
# (we stub _fetch_jwks so we never hit appleid.apple.com)
# ──────────────────────────────────────────────────────────────

def test_verifier_rejects_malformed_token(monkeypatch):
    with pytest.raises(AppleTokenError):
        _run(apple_auth.verify_apple_identity_token("not.a.jwt.really", ["aud"]))


def test_verifier_rejects_empty_audiences(monkeypatch):
    # Token is malformed before audience check, so use a shape that'd get past
    # the dot-count guard. We force get_unverified_header to succeed via a
    # fake token and make _fetch_jwks return a matching key.
    token = "aaa.bbb.ccc"
    monkeypatch.setattr(
        apple_auth.jwt, "get_unverified_header", lambda _: {"kid": "K1"}
    )
    monkeypatch.setattr(
        apple_auth, "_fetch_jwks", lambda force=False: asyncio.sleep(0, result={"K1": {"kid": "K1"}})
    )
    with pytest.raises(AppleTokenError):
        _run(apple_auth.verify_apple_identity_token(token, []))


def test_verifier_rejects_unknown_kid(monkeypatch):
    token = "aaa.bbb.ccc"
    monkeypatch.setattr(
        apple_auth.jwt, "get_unverified_header", lambda _: {"kid": "UNKNOWN"}
    )

    async def _empty_jwks(force=False):
        return {"OTHER": {"kid": "OTHER"}}

    monkeypatch.setattr(apple_auth, "_fetch_jwks", _empty_jwks)
    with pytest.raises(AppleTokenError):
        _run(apple_auth.verify_apple_identity_token(token, ["aud"]))


def test_verifier_accepts_valid_claims_on_second_audience(monkeypatch):
    """When the first audience fails but the second succeeds (iOS bundle vs
    web services id), the verifier returns the claims."""
    token = "aaa.bbb.ccc"
    monkeypatch.setattr(
        apple_auth.jwt, "get_unverified_header", lambda _: {"kid": "K1"}
    )

    async def _jwks(force=False):
        return {"K1": {"kid": "K1"}}

    monkeypatch.setattr(apple_auth, "_fetch_jwks", _jwks)

    fake_claims = {
        "sub": "001234.abcdef.56789",
        "email": "john@privaterelay.appleid.com",
        "email_verified": "true",
        "iss": "https://appleid.apple.com",
        "aud": "com.bottomtime.web",
        "iat": int(time.time()) - 10,
        "exp": int(time.time()) + 600,
    }

    def _decode(tok, jwk, algorithms, audience, issuer, options=None):
        if audience != "com.bottomtime.web":
            raise apple_auth.JWTError("audience mismatch")
        return fake_claims

    monkeypatch.setattr(apple_auth.jwt, "decode", _decode)

    claims = _run(apple_auth.verify_apple_identity_token(
        token, ["com.bottomtime.mobile", "com.bottomtime.web"]
    ))
    assert claims["sub"] == "001234.abcdef.56789"
    assert claims["email"] == "john@privaterelay.appleid.com"


def test_verifier_rejects_future_iat(monkeypatch):
    token = "aaa.bbb.ccc"
    monkeypatch.setattr(
        apple_auth.jwt, "get_unverified_header", lambda _: {"kid": "K1"}
    )

    async def _jwks(force=False):
        return {"K1": {"kid": "K1"}}

    monkeypatch.setattr(apple_auth, "_fetch_jwks", _jwks)

    future_iat = int(time.time()) + 3600
    monkeypatch.setattr(
        apple_auth.jwt,
        "decode",
        lambda *a, **kw: {"sub": "S", "iat": future_iat, "aud": "com.bottomtime.web"},
    )

    with pytest.raises(AppleTokenError):
        _run(apple_auth.verify_apple_identity_token(token, ["com.bottomtime.web"]))


# ──────────────────────────────────────────────────────────────
# Endpoint-level: /api/auth/social/apple-token
# We monkey-patch the verifier via `routes.auth.verify_apple_identity_token`
# so the endpoint tests don't need real tokens.
# ──────────────────────────────────────────────────────────────

def _patch_verifier(monkeypatch, claims: dict):
    """Replace the verifier *as imported into routes.auth*."""
    from routes import auth as auth_routes

    async def _fake(identity_token, allowed_audiences):
        # Sanity-check that the env audiences flow through correctly.
        assert "com.bottomtime.mobile" in allowed_audiences
        assert "com.bottomtime.web" in allowed_audiences
        return claims

    monkeypatch.setattr(auth_routes, "verify_apple_identity_token", _fake)


def test_endpoint_returns_401_when_verifier_fails(client, monkeypatch):
    from routes import auth as auth_routes

    async def _raise(identity_token, allowed_audiences):
        raise AppleTokenError("bad signature")

    monkeypatch.setattr(auth_routes, "verify_apple_identity_token", _raise)

    r = client.post(
        "/api/auth/social/apple-token",
        json={"identity_token": "x.y.z"},
    )
    assert r.status_code == 401
    assert "Apple" in r.json()["detail"]


def test_endpoint_needs_setup_for_brand_new_user(client, monkeypatch):
    apple_sub = f"001.{uuid.uuid4().hex}.9"
    email = f"apple-new-{uuid.uuid4().hex[:6]}@example.com"
    _patch_verifier(monkeypatch, {
        "sub": apple_sub,
        "email": email,
        "email_verified": True,
        "aud": "com.bottomtime.mobile",
    })

    r = client.post(
        "/api/auth/social/apple-token",
        json={"identity_token": "fake", "full_name": "Apple User"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "needs_setup"
    assert body["email"].lower() == email.lower()
    assert body["provider"] == "apple"
    assert body["name"] == "Apple User"

    # signup_temp should be populated so the follow-up signup-complete call
    # can persist apple_sub.
    temp = _sync_db.signup_temp.find_one({"email": email.lower()})
    assert temp is not None
    assert temp["apple_sub"] == apple_sub
    assert temp["provider"] == "apple"


def test_endpoint_logs_in_existing_user_by_apple_sub(client, monkeypatch):
    apple_sub = f"001.{uuid.uuid4().hex}.9"
    email = f"apple-exists-{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    _sync_db.users.insert_one({
        "id": user_id,
        "email": email,
        "phone": "+919000000001",
        "name": "Existing Apple",
        "role": "diver",
        "email_verified": True,
        "phone_verified": True,
        "status": "active",
        "apple_sub": apple_sub,
        "apple_linked": True,
        "provider": "apple",
        "created_at": "2025-01-01T00:00:00+00:00",
    })

    # Simulate a later login where Apple only returns the `sub` (and maybe a
    # different relay email). Lookup must still hit by apple_sub.
    _patch_verifier(monkeypatch, {
        "sub": apple_sub,
        "email": f"relay-{uuid.uuid4().hex[:6]}@privaterelay.appleid.com",
        "email_verified": True,
        "aud": "com.bottomtime.mobile",
    })

    r = client.post(
        "/api/auth/social/apple-token",
        json={"identity_token": "fake"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "logged_in"
    assert body["access_token"]
    assert body["user"]["id"] == user_id


def test_endpoint_links_existing_email_user_to_apple_sub(client, monkeypatch):
    """A user who signed up via email and is NOW signing in with Apple for
    the first time — we should update their row with apple_sub + apple_linked
    and log them in, without creating a duplicate account."""
    email = f"apple-link-{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    _sync_db.users.insert_one({
        "id": user_id,
        "email": email,
        "phone": "+919000000002",
        "name": "Email First",
        "role": "diver",
        "email_verified": True,
        "phone_verified": True,
        "status": "active",
        "created_at": "2025-01-01T00:00:00+00:00",
    })

    apple_sub = f"001.{uuid.uuid4().hex}.9"
    _patch_verifier(monkeypatch, {
        "sub": apple_sub,
        "email": email,
        "email_verified": True,
        "aud": "com.bottomtime.web",
    })

    r = client.post(
        "/api/auth/social/apple-token",
        json={"identity_token": "fake"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "logged_in"
    assert body["user"]["id"] == user_id

    # Verify the user doc now carries apple_sub + apple_linked.
    updated = _sync_db.users.find_one({"id": user_id})
    assert updated["apple_sub"] == apple_sub
    assert updated["apple_linked"] is True


def test_endpoint_blocks_when_email_missing(client, monkeypatch):
    """Apple users who hid their email AND have no existing account → we
    can't progress because phone-OTP signup requires an email."""
    apple_sub = f"001.{uuid.uuid4().hex}.9"
    _patch_verifier(monkeypatch, {
        "sub": apple_sub,
        # no email claim
        "email_verified": False,
        "aud": "com.bottomtime.mobile",
    })

    r = client.post(
        "/api/auth/social/apple-token",
        json={"identity_token": "fake"},
    )
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


def test_endpoint_attaches_device_session(client, monkeypatch):
    """Phase A device session: when `device` is supplied on login, the
    response must carry refresh_token + session_id."""
    apple_sub = f"001.{uuid.uuid4().hex}.9"
    email = f"apple-dev-{uuid.uuid4().hex[:6]}@example.com"
    user_id = str(uuid.uuid4())
    _sync_db.users.insert_one({
        "id": user_id,
        "email": email,
        "phone": "+919000000003",
        "name": "Device Apple",
        "role": "diver",
        "email_verified": True,
        "phone_verified": True,
        "status": "active",
        "apple_sub": apple_sub,
        "created_at": "2025-01-01T00:00:00+00:00",
    })

    _patch_verifier(monkeypatch, {
        "sub": apple_sub,
        "email": email,
        "email_verified": True,
        "aud": "com.bottomtime.mobile",
    })

    r = client.post(
        "/api/auth/social/apple-token",
        json={
            "identity_token": "fake",
            "device": {
                "device_id": "iphone-test-device-0001",
                "device_name": "iPhone 15 Pro",
                "platform": "ios",
                "biometric_enabled": True,
            },
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "logged_in"
    assert body.get("refresh_token"), "mobile client should receive refresh_token"
    assert body.get("session_id")
    assert body.get("refresh_expires_at")
