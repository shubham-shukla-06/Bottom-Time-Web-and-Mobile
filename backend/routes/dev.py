"""
Internal / developer-only endpoints. Super-admin gated.

Currently exposes:
  POST /api/dev/dive-log/{log_id}/synth-profile
      Stamp a synthetic depth profile onto an existing dive log without
      doing a real dive-computer import. Intended for QA only.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import db
from config import SUPER_ADMINS
from auth_utils import get_current_user
from dive_profile_synth import generate_synthetic_profile

router = APIRouter()


def _require_super_admin(current_user: dict) -> None:
    is_super = any(s["email"] == current_user["email"] for s in SUPER_ADMINS)
    if not is_super:
        raise HTTPException(status_code=403, detail="Super admin only")


class SynthProfileRequest(BaseModel):
    max_depth_override: Optional[float] = None
    duration_override: Optional[float] = None


@router.post("/dev/dive-log/{log_id}/synth-profile")
async def stamp_synthetic_profile(
    log_id: str,
    body: Optional[SynthProfileRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate a realistic descent/bottom/safety-stop/ascent profile and
    persist it on the dive log. Marks `profile_source = "synthetic"`.
    """
    _require_super_admin(current_user)

    log = await db.dive_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Dive log not found")

    max_depth = (body.max_depth_override if body and body.max_depth_override is not None
                 else log.get("max_depth"))
    duration = (body.duration_override if body and body.duration_override is not None
                else log.get("duration"))
    if max_depth is None or duration is None:
        raise HTTPException(status_code=400, detail="Dive must have max_depth and duration to synthesise a profile")

    profile = generate_synthetic_profile(float(max_depth), float(duration))
    if not profile:
        raise HTTPException(status_code=400, detail="Dive is too short or too shallow to synthesise a profile")

    await db.dive_logs.update_one(
        {"id": log_id},
        {"$set": {"profile": profile, "profile_source": "synthetic"}},
    )
    return {
        "log_id": log_id,
        "profile_points": len(profile),
        "profile_source": "synthetic",
    }
