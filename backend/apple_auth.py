"""Apple Sign-in identity-token verification.

Apple issues an RS256-signed `identity_token` (standard OIDC ID token) from
https://appleid.apple.com. Our backend fetches Apple's JWKS once per hour,
caches in memory, and verifies the token's signature + issuer + audience
before trusting the `sub` / `email` claims.

Public API:
    await verify_apple_identity_token(identity_token, allowed_audiences)

Raises `AppleTokenError` on any validation failure (bad sig, wrong aud,
expired, unknown kid). Caller should surface as 401.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Iterable

import httpx
from jose import jwt
from jose.exceptions import JWTError

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
_CACHE_TTL_SECONDS = 3600


class AppleTokenError(Exception):
    """Raised when the identity token fails signature / audience / issuer
    validation, or when JWKS fetch fails."""


# ---- JWKS cache ----------------------------------------------------------

_jwks_cache: dict[str, Any] = {"keys_by_kid": {}, "fetched_at": 0.0}
_jwks_lock = asyncio.Lock()


async def _fetch_jwks(force: bool = False) -> dict[str, dict]:
    """Return {kid: jwk} dict. Honours the 1-hour TTL unless force=True."""
    now = time.time()
    if not force and _jwks_cache["keys_by_kid"] and now - _jwks_cache["fetched_at"] < _CACHE_TTL_SECONDS:
        return _jwks_cache["keys_by_kid"]

    async with _jwks_lock:
        now = time.time()
        if not force and _jwks_cache["keys_by_kid"] and now - _jwks_cache["fetched_at"] < _CACHE_TTL_SECONDS:
            return _jwks_cache["keys_by_kid"]
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(APPLE_JWKS_URL)
            if r.status_code >= 500:
                # Retry once on 5xx — Apple's JWKS endpoint occasionally returns 502.
                r = await client.get(APPLE_JWKS_URL)
            if r.status_code != 200:
                raise AppleTokenError(f"JWKS fetch failed: {r.status_code}")
            data = r.json()
        keys_by_kid = {k["kid"]: k for k in (data.get("keys") or []) if "kid" in k}
        if not keys_by_kid:
            raise AppleTokenError("JWKS response had no keys")
        _jwks_cache["keys_by_kid"] = keys_by_kid
        _jwks_cache["fetched_at"] = time.time()
        return keys_by_kid


def _reset_cache_for_tests() -> None:
    """Test-only helper — clears the in-memory JWKS cache."""
    _jwks_cache["keys_by_kid"] = {}
    _jwks_cache["fetched_at"] = 0.0


# ---- Verification --------------------------------------------------------

async def verify_apple_identity_token(
    identity_token: str,
    allowed_audiences: Iterable[str],
) -> dict:
    """Verify an Apple identity token.

    Returns the decoded claims dict. Raises AppleTokenError on any failure.
    Tries each audience in `allowed_audiences` in order; succeeds on the
    first one that validates (so a single user can come in via the iOS
    bundle ID OR the web Services ID against one backend).
    """
    if not identity_token or identity_token.count(".") != 2:
        raise AppleTokenError("Malformed identity token")

    try:
        header = jwt.get_unverified_header(identity_token)
    except JWTError as e:
        raise AppleTokenError(f"Token header unreadable: {e}") from e
    kid = header.get("kid")
    if not kid:
        raise AppleTokenError("Token missing `kid`")

    # Fetch JWKS; if our cache doesn't have this kid, refresh once (Apple
    # rotates keys and we mustn't refuse tokens signed by a newly-published
    # key).
    keys = await _fetch_jwks()
    if kid not in keys:
        keys = await _fetch_jwks(force=True)
    if kid not in keys:
        raise AppleTokenError(f"Token signed by unknown key `{kid}`")

    jwk_for_key = keys[kid]
    audiences = list(allowed_audiences or [])
    if not audiences:
        raise AppleTokenError("No allowed audiences configured")

    last_err: Exception | None = None
    for aud in audiences:
        try:
            claims = jwt.decode(
                identity_token,
                jwk_for_key,
                algorithms=["RS256"],
                audience=aud,
                issuer=APPLE_ISSUER,
                options={"verify_at_hash": False},
            )
            # Hand-enforce iat sanity (jose validates exp but is lenient on iat).
            iat = claims.get("iat")
            if isinstance(iat, (int, float)) and iat > time.time() + 60:
                raise AppleTokenError("Token iat is in the future")
            sub = claims.get("sub")
            if not sub:
                raise AppleTokenError("Token missing `sub`")
            return claims
        except JWTError as e:
            last_err = e
            continue

    # TEMP-DEBUG (REMOVE AFTER ONE-SHOT CAPTURE): logs the token's actual `aud` so we can
    # confirm whether Expo Go is returning `host.exp.Exponent` instead of our bundle ID.
    print(f"[apple-auth-debug] actual aud={jwt.get_unverified_claims(identity_token).get('aud')!r} iss={jwt.get_unverified_claims(identity_token).get('iss')!r} expected_audiences={audiences}", flush=True)
    raise AppleTokenError(
        f"Identity token did not validate against any audience "
        f"({', '.join(audiences)}): {last_err}"
    )
