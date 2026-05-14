"""Passkey storage + WebAuthn helper layer.

Phase B (web passkeys, 2026-05-07). Built on top of Phase A's `device_sessions`
collection. Keys design points:

  • One `passkeys` doc per registered authenticator. credential_id is the
    primary lookup key; soft-revoke via `revoked_at`.
  • Short-lived registration / authentication challenges go in
    `webauthn_challenges` with a 60s TTL — single-use, scrubbed after use.
  • Email-change cascade reuses the existing `revoke_sessions_for_user`
    helper but ALSO marks every passkey for that user as revoked (passkeys
    are bound to email/user identity; if the email changes the credential
    is no longer valid). Phone change does NOT revoke passkeys.
"""

from __future__ import annotations

import base64
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from database import db


CHALLENGE_TTL_SECONDS = 60


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------

async def ensure_indexes() -> None:
    await db.passkeys.create_index("credential_id", unique=True)
    await db.passkeys.create_index([("user_id", 1), ("revoked_at", 1)])
    await db.webauthn_challenges.create_index(
        "expires_at", expireAfterSeconds=0
    )
    await db.webauthn_challenges.create_index("subject")


# ---------------------------------------------------------------------------
# Challenge storage (single-use)
# ---------------------------------------------------------------------------

async def store_challenge(*, subject: str, kind: str, challenge: bytes) -> str:
    """`subject` is either a user_id (registration) or an email/empty
    (authentication). Returns the challenge id."""
    challenge_id = secrets.token_urlsafe(16)
    await db.webauthn_challenges.insert_one({
        "_id": challenge_id,
        "subject": subject,
        "kind": kind,
        "challenge": base64.urlsafe_b64encode(challenge).decode("ascii").rstrip("="),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=CHALLENGE_TTL_SECONDS),
    })
    return challenge_id


async def consume_challenge(*, subject: str, kind: str) -> Optional[bytes]:
    """Pop the most recent challenge matching subject+kind. Single-use:
    deletes all matching docs (so a challenge can't be replayed)."""
    doc = await db.webauthn_challenges.find_one_and_delete(
        {"subject": subject, "kind": kind},
        sort=[("expires_at", -1)],
    )
    if not doc:
        return None
    raw = doc["challenge"]
    pad = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + pad)


# ---------------------------------------------------------------------------
# Passkey CRUD
# ---------------------------------------------------------------------------

def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


async def list_credential_ids(user_id: str) -> list[bytes]:
    """For exclude_credentials at registration / allow_credentials at login."""
    out: list[bytes] = []
    cur = db.passkeys.find({"user_id": user_id, "revoked_at": None}, {"credential_id": 1})
    async for d in cur:
        try: out.append(_b64url_decode(d["credential_id"]))
        except Exception: pass
    return out


async def get_passkey_by_credential_id(credential_id_b64: str) -> Optional[dict]:
    return await db.passkeys.find_one({"credential_id": credential_id_b64})


async def insert_passkey(
    *, user_id: str, credential_id: bytes, public_key: bytes,
    sign_count: int, transports: list[str], aaguid: Optional[str],
    backed_up: bool, device_type: str, label: str,
) -> dict:
    pk_id = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    doc = {
        "_id": pk_id,
        "user_id": user_id,
        "credential_id": _b64url(credential_id),
        "public_key": _b64url(public_key),
        "sign_count": int(sign_count),
        "transports": list(transports or []),
        "aaguid": aaguid,
        "backed_up": bool(backed_up),
        "device_type": device_type or "single_device",
        "label": (label or f"Passkey on {now.strftime('%b %d %Y')}")[:120],
        "created_at": now,
        "last_used_at": None,
        "revoked_at": None,
    }
    await db.passkeys.insert_one(doc)
    return doc


async def update_after_auth(passkey_id: str, *, sign_count: int) -> None:
    await db.passkeys.update_one(
        {"_id": passkey_id},
        {"$set": {"sign_count": int(sign_count), "last_used_at": datetime.now(timezone.utc)}},
    )


async def revoke_passkey(*, passkey_id: str, user_id: str, reason: str = "user_removed") -> bool:
    res = await db.passkeys.update_one(
        {"_id": passkey_id, "user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason}},
    )
    return res.modified_count == 1


async def revoke_passkey_by_credential(*, credential_id_b64: str, reason: str) -> int:
    res = await db.passkeys.update_one(
        {"credential_id": credential_id_b64, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason}},
    )
    return res.modified_count


async def revoke_passkeys_for_user(*, user_id: str, reason: str) -> int:
    res = await db.passkeys.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc), "revoked_reason": reason}},
    )
    return res.modified_count


async def list_passkeys(user_id: str) -> list[dict]:
    out: list[dict] = []
    # `credential_id` (base64url string) is intentionally INCLUDED in the
    # projection — the web Profile→Security filter needs to match against
    # `localStorage.bt_passkey_device_id` to display only this-device rows
    # (server can't tell whether a credential is still resident on the
    # device, e.g. after a macOS Keychain wipe). `public_key` stays excluded
    # — it's only used by the verify path.
    cur = db.passkeys.find(
        {"user_id": user_id, "revoked_at": None},
        {"public_key": 0},
    ).sort("created_at", -1)
    async for d in cur:
        out.append({
            "passkey_id": d["_id"],
            "credential_id": d.get("credential_id"),
            "label": d.get("label") or "Passkey",
            "device_type": d.get("device_type") or "single_device",
            "backed_up": bool(d.get("backed_up")),
            "transports": d.get("transports") or [],
            "created_at": _iso(d.get("created_at")),
            "last_used_at": _iso(d.get("last_used_at")),
        })
    return out


def _iso(v) -> Optional[str]:
    if v is None: return None
    if isinstance(v, datetime):
        if v.tzinfo is None: v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    return str(v)


# ---------------------------------------------------------------------------
# Friendly label heuristic (used by register/finish when client didn't supply
# one). Keep this dumb — not security-relevant.
# ---------------------------------------------------------------------------

def label_from_metadata(*, user_agent: str, backed_up: bool, transports: list[str]) -> str:
    ua = (user_agent or "").lower()
    if "iphone" in ua or "ipad" in ua: device = "iPhone"
    elif "macintosh" in ua or "mac os x" in ua: device = "Mac"
    elif "android" in ua: device = "Android"
    elif "windows" in ua: device = "Windows"
    else: device = "Browser"
    if backed_up:
        return f"{device} (synced)"
    if "usb" in transports or "nfc" in transports: return "Security key"
    return device
