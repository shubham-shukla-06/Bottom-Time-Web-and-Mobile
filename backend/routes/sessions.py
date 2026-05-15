"""HTTP routes for /api/auth/session/* and /api/auth/sessions.

The actual session lifecycle logic lives in `device_sessions.py`. These
handlers are thin: validate the request, call the helpers, map structured
SessionError → HTTP 401 with the expected error code in `detail`.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth_utils import create_access_token, get_current_user
from config import ACCESS_TOKEN_EXPIRE
from device_sessions import (
    SessionError,
    list_sessions,
    refresh_session,
    revoke_session,
    revoke_sessions_for_user,
)
from rate_limiter import limiter


router = APIRouter()


# ---------- request models ----------------------------------------------

class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=8, max_length=400)
    device_id: str = Field(min_length=4, max_length=120)


class RevokeRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=120)


# ---------- routes -------------------------------------------------------

@router.post("/auth/session/refresh")
@limiter.limit("60/minute")
async def session_refresh(request: Request, body: RefreshRequest) -> dict:
    """Rotate the refresh token + mint a fresh access token. Public — no
    bearer auth required (the refresh token IS the credential)."""
    try:
        result = await refresh_session(refresh_token=body.refresh_token, device_id=body.device_id)
    except SessionError as exc:
        raise HTTPException(status_code=401, detail=exc.code)

    access_token = create_access_token(
        data={"sub": result["user_id"], "session_id": result["session_id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": result["refresh_token"],
        "session_id": result["session_id"],
        "refresh_expires_at": result["refresh_expires_at"],
    }


@router.post("/auth/session/revoke")
async def session_revoke(body: RevokeRequest, current_user: dict = Depends(get_current_user)) -> dict:
    """Revoke a single session belonging to the authenticated user."""
    revoked = await revoke_session(
        session_id=body.session_id,
        user_id=current_user["id"],
        reason="user_logout",
    )
    return {"revoked": bool(revoked)}


@router.post("/auth/session/revoke-all")
async def session_revoke_all(current_user: dict = Depends(get_current_user)) -> dict:
    """Revoke every active session for the current user — including the one
    making this call. The caller's access token will still work until it
    naturally expires (typically <= 60 min); after that, refresh will fail."""
    n = await revoke_sessions_for_user(user_id=current_user["id"], reason="user_request")
    return {"revoked_count": n}


@router.get("/auth/sessions")
async def session_list(current_user: dict = Depends(get_current_user), session_id: Optional[str] = None) -> dict:
    """List the user's non-revoked sessions. The `is_current` flag uses
    (in priority order): explicit `?session_id=` query param, then the
    `X-Session-Id` header (stamped onto `current_user` by `get_current_user`).
    The header path is the canonical one — every authenticated axios call
    from the web client carries it now.
    """
    sid = session_id or current_user.get("session_id")
    sessions = await list_sessions(user_id=current_user["id"], current_session_id=sid)
    return {"sessions": sessions}
