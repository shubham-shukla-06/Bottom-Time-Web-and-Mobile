"""WebAuthn / passkey routes — Phase B (web passkey login, 2026-05-07).

The challenge / verification heavy lifting is delegated to the `webauthn`
library (py_webauthn). This module just plumbs the HTTP I/O.
"""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from urllib.parse import urlparse

from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
import json as _json
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
)
from webauthn.helpers.exceptions import (
    InvalidRegistrationResponse, InvalidAuthenticationResponse,
)

from auth_utils import create_access_token, get_current_user
from config import ACCESS_TOKEN_EXPIRE
from database import db
from device_sessions import create_session
import passkeys


router = APIRouter()


# ---------- request-derived RP config --------------------------------------
#
# WebAuthn requires RP ID = the effective domain the browser is on. Because
# this same backend image is deployed to multiple environments (preview pod
# AND production at bottom-time.com) WITHOUT per-env .env edits, we derive
# RP ID + origin from the incoming request's Host / X-Forwarded-Host header
# on every WebAuthn call.
#
# Optional escape hatches via env:
#   • WEBAUTHN_RP_ID       — if set, used verbatim (overrides derivation).
#   • WEBAUTHN_ORIGINS     — if set, comma-separated list passed to the
#                            verifier as the full allowed-origin set.
# Both are intentionally unset in normal deploys so the same image works
# anywhere. RP_NAME is just a display string and stays env-driven.
RP_NAME = os.environ.get("WEBAUTHN_RP_NAME", "Bottom Time")
_RP_ID_ENV = os.environ.get("WEBAUTHN_RP_ID")
_ORIGINS_ENV = os.environ.get("WEBAUTHN_ORIGINS")


def _derive_rp(request: Request) -> tuple[str, list[str]]:
    """Compute (rp_id, allowed_origins) for this exact request.

    Honours `X-Forwarded-Host` / `X-Forwarded-Proto` so requests that
    transit through the Emergent ingress (which terminates TLS and
    forwards plain HTTP to uvicorn) still see the public host the user
    is actually on. Falls back to `request.url.hostname`/`.scheme` for
    direct curls on localhost.
    """
    host = (
        request.headers.get("x-forwarded-host")
        or request.url.hostname
        or "localhost"
    )
    host = host.split(":")[0]
    proto = (
        request.headers.get("x-forwarded-proto")
        or request.url.scheme
        or "https"
    )
    rp_id = _RP_ID_ENV or host
    if _ORIGINS_ENV:
        origins = [o.strip().rstrip("/") for o in _ORIGINS_ENV.split(",") if o.strip()]
    else:
        origins = [f"{proto}://{host}"]
    return rp_id, origins


# ---------- pydantic --------------------------------------------------------

class WebAuthnDevicePayload(BaseModel):
    device_id: str = Field(min_length=4, max_length=120)
    device_name: str = Field(min_length=1, max_length=120)
    platform: str = Field(default="web", pattern="^(ios|android|web)$")


class RegisterFinishBody(BaseModel):
    response: dict
    label: Optional[str] = Field(default=None, max_length=120)


class LoginBeginBody(BaseModel):
    email: Optional[str] = Field(default=None, max_length=254)


class LoginFinishBody(BaseModel):
    response: dict
    device: Optional[WebAuthnDevicePayload] = None


# ---------- helpers ---------------------------------------------------------

def _verify_origin(client_origin: str) -> bool:
    if not client_origin: return False
    return client_origin.rstrip("/") in ORIGINS


def _parse_response_for_credential_id(resp: dict) -> Optional[str]:
    """Browser sends credential id under `id` (b64url) — that's what we
    keyed our row on. Returns the b64url string or None."""
    cid = resp.get("id") or resp.get("rawId")
    return cid if isinstance(cid, str) else None


# ---------- routes ----------------------------------------------------------

@router.post("/auth/webauthn/register/begin")
async def register_begin(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Logged-in user starts passkey enrollment."""
    user_id: str = current_user["id"]
    rp_id, _origins = _derive_rp(request)
    excluded_ids = await passkeys.list_credential_ids(user_id)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=user_id.encode("utf-8"),
        user_name=current_user.get("email") or user_id,
        user_display_name=current_user.get("name") or current_user.get("email") or "Bottom Time user",
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cid) for cid in excluded_ids
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    await passkeys.store_challenge(
        subject=user_id, kind="registration", challenge=options.challenge
    )
    return _json.loads(options_to_json(options))


@router.post("/auth/webauthn/register/finish")
async def register_finish(
    request: Request,
    body: RegisterFinishBody,
    current_user: dict = Depends(get_current_user),
):
    user_id: str = current_user["id"]
    rp_id, origins = _derive_rp(request)
    challenge = await passkeys.consume_challenge(subject=user_id, kind="registration")
    if not challenge:
        raise HTTPException(status_code=400, detail="challenge_invalid_or_expired")
    try:
        verification = verify_registration_response(
            credential=body.response,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origins,
            require_user_verification=True,
        )
    except InvalidRegistrationResponse as e:
        raise HTTPException(status_code=400, detail=f"invalid_response: {e}")

    transports = list((body.response.get("response") or {}).get("transports") or [])
    backed_up = bool(getattr(verification, "credential_backed_up", False))
    device_type = (
        getattr(verification, "credential_device_type", None)
        or "single_device"
    )
    if hasattr(device_type, "value"):
        device_type = device_type.value

    label = (body.label or "").strip() or passkeys.label_from_metadata(
        user_agent=request.headers.get("user-agent", ""),
        backed_up=backed_up,
        transports=transports,
    )

    aaguid_raw = getattr(verification, "aaguid", None)
    aaguid = str(aaguid_raw) if aaguid_raw else None

    pk = await passkeys.insert_passkey(
        user_id=user_id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=int(verification.sign_count or 0),
        transports=transports,
        aaguid=aaguid,
        backed_up=backed_up,
        device_type=str(device_type),
        label=label,
    )
    return {
        "passkey_id": pk["_id"],
        "label": pk["label"],
        "created_at": pk["created_at"].isoformat(),
        "device_type": pk["device_type"],
        "backed_up": pk["backed_up"],
    }


@router.post("/auth/webauthn/login/begin")
async def login_begin(request: Request, body: LoginBeginBody):
    """Public — starts a WebAuthn authentication ceremony.
       Email is optional (usernameless / discoverable-credential flow)."""
    email = (body.email or "").strip().lower() or None
    rp_id, _origins = _derive_rp(request)
    allow: list[PublicKeyCredentialDescriptor] = []
    subject = email or "*"   # `*` keys the challenge for usernameless flows
    if email:
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
        if user:
            cred_ids = await passkeys.list_credential_ids(user["id"])
            allow = [
                PublicKeyCredentialDescriptor(
                    id=cid,
                    transports=[
                        AuthenticatorTransport.INTERNAL,
                        AuthenticatorTransport.HYBRID,
                        AuthenticatorTransport.USB,
                        AuthenticatorTransport.BLE,
                        AuthenticatorTransport.NFC,
                    ],
                ) for cid in cred_ids
            ]
        # If user not found we still return an empty allow list so we don't
        # leak account existence (avoid email enumeration).
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    await passkeys.store_challenge(subject=subject, kind="authentication", challenge=options.challenge)
    return _json.loads(options_to_json(options))


@router.post("/auth/webauthn/login/finish")
async def login_finish(request: Request, body: LoginFinishBody):
    rp_id, origins = _derive_rp(request)
    cid_b64 = _parse_response_for_credential_id(body.response)
    if not cid_b64:
        raise HTTPException(status_code=400, detail="invalid_response")

    pk = await passkeys.get_passkey_by_credential_id(cid_b64)
    if not pk or pk.get("revoked_at"):
        raise HTTPException(status_code=401, detail="credential_not_found")

    user = await db.users.find_one({"id": pk["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="credential_not_found")

    # Find the matching challenge (try email then usernameless).
    challenge = (
        await passkeys.consume_challenge(subject=user["email"].lower(), kind="authentication")
        or await passkeys.consume_challenge(subject="*", kind="authentication")
    )
    if not challenge:
        raise HTTPException(status_code=400, detail="challenge_invalid_or_expired")

    try:
        verification = verify_authentication_response(
            credential=body.response,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origins,
            credential_public_key=passkeys._b64url_decode(pk["public_key"]),
            credential_current_sign_count=int(pk.get("sign_count") or 0),
            require_user_verification=True,
        )
    except InvalidAuthenticationResponse as e:
        msg = str(e).lower()
        # Counter rollback ⇒ possible cloned authenticator. Revoke it.
        if "sign count" in msg or "counter" in msg:
            await passkeys.revoke_passkey_by_credential(
                credential_id_b64=cid_b64, reason="counter_anomaly"
            )
            raise HTTPException(status_code=401, detail="counter_anomaly")
        raise HTTPException(status_code=401, detail="invalid_signature")

    await passkeys.update_after_auth(pk["_id"], sign_count=int(verification.new_sign_count))

    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE),
    )
    payload: dict = {"access_token": access_token, "token_type": "bearer", "user": user}

    if body.device:
        sess = await create_session(
            user_id=user["id"],
            device_id=body.device.device_id,
            device_name=body.device.device_name,
            platform=body.device.platform,
            biometric_enabled=False,
        )
        payload["refresh_token"] = sess["refresh_token"]
        payload["session_id"] = sess["session_id"]
        payload["refresh_expires_at"] = sess["refresh_expires_at"]

    return payload


@router.get("/auth/webauthn/passkeys")
async def passkeys_list(current_user: dict = Depends(get_current_user)):
    return {"passkeys": await passkeys.list_passkeys(current_user["id"])}


@router.delete("/auth/webauthn/passkeys/{passkey_id}")
async def passkeys_delete(passkey_id: str, current_user: dict = Depends(get_current_user)):
    ok = await passkeys.revoke_passkey(
        passkey_id=passkey_id, user_id=current_user["id"], reason="user_removed"
    )
    if not ok:
        raise HTTPException(status_code=404, detail="passkey_not_found")
    return {"revoked": True, "passkey_id": passkey_id}


@router.get("/auth/me/has-passkey")
async def has_passkey(current_user: dict = Depends(get_current_user)):
    """Lightweight probe — does the current user have at least one
    non-revoked passkey on file? Used by the web client to decide whether
    to surface the 'Sign in with passkey' affordance on the login screen
    without leaking credential IDs.
    """
    count = await db.passkeys.count_documents(
        {"user_id": current_user["id"], "revoked_at": None},
        limit=1,
    )
    return {"has_passkey": count > 0}

