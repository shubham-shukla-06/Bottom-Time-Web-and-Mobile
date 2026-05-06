"""
Security scanning API routes.
Admin-only endpoints for running and viewing security scan results.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from auth_utils import get_current_user, require_admin
from database import db
from security_scanner import run_full_scan
from datetime import datetime, timezone

router = APIRouter()


@router.post("/admin/security/scan")
async def trigger_security_scan(current_user: dict = Depends(get_current_user)):
    """Run a full security scan of the codebase."""
    await require_admin(current_user)
    report = await run_full_scan(save_to_db=True)
    # Strip _id from findings before returning
    for f in report.get("findings", []):
        f.pop("_id", None)
    return report


@router.get("/admin/security/latest")
async def get_latest_scan(current_user: dict = Depends(get_current_user)):
    """Get the most recent security scan results."""
    await require_admin(current_user)
    scan = await db.security_scans.find_one({}, {"_id": 0}, sort=[("started_at", -1)])
    if not scan:
        return {"message": "No scans have been run yet", "scan": None, "findings": []}

    findings = await db.security_findings.find(
        {"scan_id": scan["scan_id"]}, {"_id": 0}
    ).to_list(500)

    return {"scan": scan, "findings": findings}


@router.get("/admin/security/history")
async def get_scan_history(
    limit: int = Query(10, le=50),
    current_user: dict = Depends(get_current_user)
):
    """Get history of security scans."""
    await require_admin(current_user)
    scans = await db.security_scans.find(
        {}, {"_id": 0}
    ).sort("started_at", -1).to_list(limit)
    return {"scans": scans}


@router.get("/admin/security/findings/{scan_id}")
async def get_scan_findings(
    scan_id: str,
    severity: str = Query(None),
    finding_type: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get findings for a specific scan, with optional filters."""
    await require_admin(current_user)
    query = {"scan_id": scan_id}
    if severity:
        query["severity"] = severity
    if finding_type:
        query["type"] = finding_type

    findings = await db.security_findings.find(query, {"_id": 0}).to_list(500)
    return {"scan_id": scan_id, "findings": findings, "count": len(findings)}
