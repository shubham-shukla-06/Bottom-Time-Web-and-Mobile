"""Device session / refresh-token model.

Single source of truth for the mobile biometric-resume flow.

Design (matches Phase A spec, 2026-05-07):
  • Mongo collection `device_sessions`, one doc per device install.
  • Refresh token is 64 random URL-safe bytes returned exactly once at
    session creation. We store sha256(refresh_token) only.
  • Sliding 30-day window — every successful refresh rotates the token,
    sets last_used_at = now, expires_at = now + 30 days.
  • Email or phone change must call `revoke_sessions_for_user(...)`
    immediately so a stolen refresh token cannot outlive the credential
    that minted it.
  • `biometric_enabled` is a client-reported flag, informational only;
    the server never enforces biometrics — it just verifies the bearer
    of the refresh token.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from database import db


# Public constants — the single point at which the refresh window can be tuned.
REFRESH_WINDOW_DAYS = 30
ALLOWED_PLATFORMS = ("ios", "android", "web")
REVOKE_REASONS = (
    "user_logout",
    "user_request",      # revoke-all from settings
    "email_changed",
    "phone_changed",
    "expired",
    "rotated",           # internal: previous-hash invalidated by rotation
)


# ---------------------------------------------------------------------------
# Hashing / token generation
# ---------------------------------------------------------------------------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_refresh_token() -> str:
    # 64 random bytes → ~86-char URL-safe base64 string. Plenty of entropy.
    return secrets.token_urlsafe(64)


# ---------------------------------------------------------------------------
# Lifecycle helpers (no FastAPI imports — keep this layer pure)
# ---------------------------------------------------------------------------

async def ensure_indexes() -> None:
    """Idempotent. Call once on startup from server.py."""
    await db.device_sessions.create_index([("user_id", 1), ("revoked_at", 1)])
    await db.device_sessions.create_index("refresh_token_hash", unique=True)
    await db.device_sessions.create_index("expires_at")
    await db.device_sessions.create_index([("user_id", 1), ("device_id", 1)])


async def create_session(
    *,
    user_id: str,
    device_id: str,
    device_name: str,
    platform: str,
    biometric_enabled: bool = False,
) -> dict:
    """Mint a new refresh token and persist a session row.

    Returns: {session_id, refresh_token, refresh_expires_at} — the raw
    refresh_token is only ever exposed at this moment, never stored.
    """
    if platform not in ALLOWED_PLATFORMS:
        raise ValueError(f"unsupported platform {platform!r}")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=REFRESH_WINDOW_DAYS)
    session_id = secrets.token_urlsafe(16)
    refresh_token = _new_refresh_token()

    # Best-effort: if a session already exists for the same (user_id, device_id),
    # mark it rotated rather than letting two parallel sessions linger.
    await db.device_sessions.update_many(
        {"user_id": user_id, "device_id": device_id, "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_reason": "rotated"}},
    )

    doc = {
        "_id": session_id,
        "user_id": user_id,
        "device_id": device_id,
        "device_name": (device_name or "Unknown device")[:120],
        "platform": platform,
        "refresh_token_hash": _hash_token(refresh_token),
        "created_at": now,
        "last_used_at": now,
        "expires_at": expires_at,
        "revoked_at": None,
        "revoked_reason": None,
        "biometric_enabled": bool(biometric_enabled),
    }
    await db.device_sessions.insert_one(doc)
    return {
        "session_id": session_id,
        "refresh_token": refresh_token,
        "refresh_expires_at": expires_at.isoformat(),
    }


async def refresh_session(*, refresh_token: str, device_id: str) -> dict:
    """Validate + rotate. Returns dict on success or raises a small
    structured exception. Caller (route handler) maps to HTTP 401."""
    if not refresh_token or not device_id:
        raise SessionError("invalid_token")

    token_hash = _hash_token(refresh_token)
    session = await db.device_sessions.find_one({"refresh_token_hash": token_hash})
    if not session:
        raise SessionError("invalid_token")

    if session.get("revoked_at"):
        raise SessionError("session_revoked")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.device_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": "expired"}},
        )
        raise SessionError("session_expired")

    if session["device_id"] != device_id:
        raise SessionError("device_mismatch")

    # Rotate.
    new_refresh = _new_refresh_token()
    new_hash = _hash_token(new_refresh)
    now = datetime.now(timezone.utc)
    new_expires = now + timedelta(days=REFRESH_WINDOW_DAYS)
    await db.device_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {
            "refresh_token_hash": new_hash,
            "last_used_at": now,
            "expires_at": new_expires,
        }},
    )
    return {
        "session_id": session["_id"],
        "user_id": session["user_id"],
        "refresh_token": new_refresh,
        "refresh_expires_at": new_expires.isoformat(),
    }


async def revoke_session(*, session_id: str, user_id: str, reason: str = "user_logout") -> bool:
    """Revoke a single session. Returns True if a live session was revoked."""
    if reason not in REVOKE_REASONS:
        reason = "user_logout"
    res = await db.device_sessions.update_one(
        {"_id": session_id, "user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason}},
    )
    return res.modified_count == 1


async def revoke_sessions_for_user(*, user_id: str, reason: str) -> int:
    """Bulk revoke all live sessions for a user. Used by:
       - 'Sign out everywhere' (reason='user_request')
       - email change      (reason='email_changed')   ← also revokes passkeys
       - phone change      (reason='phone_changed')
    Returns: number of sessions revoked."""
    if reason not in REVOKE_REASONS:
        raise ValueError(f"unsupported reason {reason!r}")
    res = await db.device_sessions.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason}},
    )
    # Email change ⇒ passkeys are bound to the user identity that authored
    # them; revoke them all (the user re-enrolls fresh ones after re-auth).
    # Phone change does NOT cascade — passkeys are not tied to phone.
    if reason == "email_changed":
        try:
            from passkeys import revoke_passkeys_for_user
            await revoke_passkeys_for_user(user_id=user_id, reason="email_changed")
        except Exception:
            # Don't let a passkeys-side failure block the session revoke.
            pass
    return res.modified_count


async def list_sessions(*, user_id: str, current_session_id: Optional[str] = None) -> list[dict]:
    """Active (non-revoked) sessions for the user, newest first.

    Also bumps `last_used_at` for `current_session_id` (when provided) so the
    'Active sessions' card reflects "you're here right now" the instant the
    user opens it — without waiting for the next refresh-token rotation. The
    bump is cheap (one targeted update) and happens before the read so the
    returned row carries the fresh timestamp.
    """
    if current_session_id:
        await touch_session(current_session_id, user_id=user_id)
    cursor = db.device_sessions.find(
        {"user_id": user_id, "revoked_at": None},
        {"refresh_token_hash": 0},  # never leak even the hash
    ).sort("last_used_at", -1)
    out: list[dict] = []
    async for doc in cursor:
        out.append({
            "session_id": doc["_id"],
            "device_name": doc.get("device_name") or "Unknown device",
            "platform": doc.get("platform"),
            "biometric_enabled": bool(doc.get("biometric_enabled")),
            "created_at": _iso(doc.get("created_at")),
            "last_used_at": _iso(doc.get("last_used_at")),
            "expires_at": _iso(doc.get("expires_at")),
            "is_current": doc["_id"] == current_session_id,
        })
    return out


# ---------------------------------------------------------------------------
# Activity-touch helper
# ---------------------------------------------------------------------------
# Per-process in-memory cache of the last `last_used_at` write per session,
# used to throttle Mongo writes from `get_current_user`. We only persist a
# new timestamp if it's been at least TOUCH_THROTTLE_SECONDS since the
# previous write for that session. This is sufficient for "Last active"
# accuracy at minute granularity and bounds the write QPS regardless of
# how many authenticated requests hammer the API.
TOUCH_THROTTLE_SECONDS = 30
_TOUCH_CACHE: dict[str, datetime] = {}


async def touch_session(session_id: str, *, user_id: Optional[str] = None) -> None:
    """Update `last_used_at = now()` for the active session row, throttled.

    No-ops if session_id is empty, the throttle window hasn't elapsed, or
    the row is missing/revoked. Never raises — caller is fire-and-forget
    and must not block on this.
    """
    if not session_id:
        return
    now = datetime.now(timezone.utc)
    last = _TOUCH_CACHE.get(session_id)
    if last is not None and (now - last).total_seconds() < TOUCH_THROTTLE_SECONDS:
        return
    _TOUCH_CACHE[session_id] = now
    try:
        flt: dict = {"_id": session_id, "revoked_at": None}
        if user_id:
            flt["user_id"] = user_id
        await db.device_sessions.update_one(flt, {"$set": {"last_used_at": now}})
    except Exception:
        # Activity bookkeeping must never break the request path.
        pass


def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    return str(v)


class SessionError(Exception):
    """Structured error raised by refresh_session(). The .code attribute is
    one of: invalid_token | session_revoked | session_expired | device_mismatch."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code
