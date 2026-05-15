"""
Operator Listings - Dive trips, packages, courses, and experiences
Full CRUD for operators to manage their dive offerings
"""
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from fastapi.responses import HTMLResponse
from datetime import datetime, timezone
from typing import Optional
from database import db
from auth_utils import get_current_user
from config import UPLOAD_DIR, SUPER_ADMINS, JWT_SECRET, ALGORITHM
from helpers import create_notification
from operator_emails import (
    send_operator_pending_email, send_admin_review_email,
    send_operator_approved_email, send_operator_declined_email,
    build_review_confirmation_html, _create_review_token,
)
import uuid
import re
import os
import asyncio
import httpx
import logging
from jose import jwt as jose_jwt, JWTError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/operator-listings")
review_router = APIRouter()

SANDBOX_API_KEY = os.environ.get('SANDBOX_API_KEY', '')
SANDBOX_API_SECRET = os.environ.get('SANDBOX_API_SECRET', '')
SANDBOX_BASE_URL = "https://api.sandbox.co.in"

async def _get_sandbox_token_for_gst():
    """Reuse Sandbox auth from tax_engine module."""
    try:
        from tax_engine import _get_sandbox_token
        return await _get_sandbox_token()
    except Exception:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{SANDBOX_BASE_URL}/authenticate", headers={
                "x-api-key": SANDBOX_API_KEY, "x-api-secret": SANDBOX_API_SECRET, "Content-Type": "application/json",
            })
            resp.raise_for_status()
            return resp.json().get("data", {}).get("access_token")

async def verify_gstin_with_sandbox(gstin: str) -> dict:
    """Verify GSTIN against govt records via Sandbox.co.in GST Search API."""
    try:
        token = await _get_sandbox_token_for_gst()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{SANDBOX_BASE_URL}/gst/compliance/public/gstin/search", headers={
                "Authorization": token,
                "x-api-key": SANDBOX_API_KEY,
                "Content-Type": "application/json",
            }, json={"gstin": gstin.upper()})
            data = resp.json()
            logger.info(f"Sandbox GSTIN verify: status={resp.status_code} code={data.get('code')}")
            if resp.status_code == 200 and data.get("code") == 200:
                gdata = data.get("data", {}).get("data", {})
                return {
                    "govt_verified": True,
                    "active": gdata.get("sts", "").lower() == "active",
                    "legal_name": gdata.get("lgnm", ""),
                    "trade_name": gdata.get("tradeNam", ""),
                    "taxpayer_type": gdata.get("dty", ""),
                    "registration_date": gdata.get("rgdt", ""),
                    "state": gdata.get("stj", ""),
                    "principal_address": gdata.get("pradr", {}).get("addr", {}).get("st", ""),
                    "status": gdata.get("sts", ""),
                    "transaction_id": data.get("transaction_id", ""),
                }
            error_msg = data.get("data", {}).get("message", "") or data.get("message", "") or f"HTTP {resp.status_code}"
            return {"govt_verified": False, "active": False, "reason": error_msg}
    except Exception as e:
        logger.error(f"Sandbox GSTIN verification failed: {e}")
        return {"govt_verified": False, "active": False, "reason": str(e)}

# ─── GSTIN VALIDATION ───

# Valid Indian state codes (01-37 + 97 for other territory)
VALID_STATE_CODES = {
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
    "31", "32", "33", "34", "35", "36", "37", "97",
}

STATE_CODE_NAMES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
    "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
    "34": "Puducherry", "35": "Andaman & Nicobar Islands",
    "36": "Telangana", "37": "Andhra Pradesh (New)", "97": "Other Territory",
}

GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def _compute_gstin_checksum(gstin_14: str) -> str:
    """Compute the check digit (15th char) of a GSTIN using the Luhn mod-36 algorithm."""
    total = 0
    for i, ch in enumerate(gstin_14):
        val = GSTIN_CHARSET.index(ch)
        if i % 2 != 0:
            val *= 2
        quotient, remainder = divmod(val, 36)
        total += quotient + remainder
    check_val = (36 - (total % 36)) % 36
    return GSTIN_CHARSET[check_val]

def validate_gstin(gstin: str) -> dict:
    """Validate GSTIN format, structure, and checksum.
    Returns: { valid, gstin, state_code, state_name, pan, entity_number, errors }
    """
    gstin = gstin.strip().upper()
    errors = []

    if len(gstin) != 15:
        return {"valid": False, "gstin": gstin, "errors": ["GSTIN must be exactly 15 characters"]}

    pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    if not re.match(pattern, gstin):
        errors.append("Invalid GSTIN format. Expected: 2-digit state code + 10-char PAN + entity number + Z + check digit")

    state_code = gstin[:2]
    if state_code not in VALID_STATE_CODES:
        errors.append(f"Invalid state code '{state_code}'. Must be a valid Indian state code (01-37)")

    if gstin[13] != 'Z':
        errors.append("14th character must be 'Z'")

    if errors:
        return {"valid": False, "gstin": gstin, "errors": errors}

    # Checksum verification
    expected_check = _compute_gstin_checksum(gstin[:14])
    if gstin[14] != expected_check:
        errors.append("Checksum verification failed. The GSTIN number appears to be invalid")
        return {"valid": False, "gstin": gstin, "errors": errors}

    pan = gstin[2:12]
    state_name = STATE_CODE_NAMES.get(state_code, "Unknown")

    return {
        "valid": True,
        "gstin": gstin,
        "state_code": state_code,
        "state_name": state_name,
        "pan": pan,
        "entity_number": gstin[12],
        "errors": [],
    }


@router.post("/verify-gstin")
async def verify_gstin_endpoint(data: dict, current_user: dict = Depends(get_current_user)):
    """Validate GSTIN: format + checksum offline, then verify against govt records via Sandbox."""
    gstin = (data.get("gstin") or "").strip()
    if not gstin:
        raise HTTPException(status_code=400, detail="GSTIN is required")

    # Step 1: Offline format + checksum validation
    result = validate_gstin(gstin)
    if not result["valid"]:
        return result

    # Step 2: Live verification against govt records
    govt = await verify_gstin_with_sandbox(gstin)
    result["govt_verified"] = govt.get("govt_verified", False)
    result["govt_active"] = govt.get("active", False)
    result["govt_legal_name"] = govt.get("legal_name", "")
    result["govt_trade_name"] = govt.get("trade_name", "")
    result["govt_status"] = govt.get("status", "")
    result["govt_taxpayer_type"] = govt.get("taxpayer_type", "")
    result["govt_registration_date"] = govt.get("registration_date", "")
    result["govt_address"] = govt.get("principal_address", "")
    if not govt.get("govt_verified"):
        result["govt_error"] = govt.get("reason", "")
    return result


def _operator_only(user) -> dict:
    if user.get("role") not in ("operator", "instructor", "admin"):
        raise HTTPException(status_code=403, detail="Operator access required")


# ─── OPERATOR APPLICATION / REGISTRATION ───

@router.post("/apply")
async def apply_as_operator(data: dict, current_user: dict = Depends(get_current_user)):
    """Submit operator application for admin review.
    Country is mandatory. If India, GSTIN is mandatory and must pass validation.
    """
    existing = await db.operator_applications.find_one(
        {"user_id": current_user["id"], "status": {"$in": ["pending", "approved"]}},
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="Application already submitted")

    country = (data.get("country") or "").strip()
    if not country:
        raise HTTPException(status_code=400, detail="Country is required for operator registration")

    gstin = ""
    gstin_verified = False
    gstin_state = ""
    gstin_govt_legal_name = ""
    gstin_govt_status = ""
    if (country or "").strip().lower() in ("india", "in"):
        gstin = (data.get("gstin") or "").strip().upper()
        if not gstin:
            raise HTTPException(status_code=400, detail="GSTIN is mandatory for operators registered in India")
        validation = validate_gstin(gstin)
        if not validation["valid"]:
            raise HTTPException(status_code=400, detail=f"Invalid GSTIN: {'; '.join(validation['errors'])}")

        # Verify against govt records
        govt = await verify_gstin_with_sandbox(gstin)
        if govt.get("govt_verified") and govt.get("active"):
            gstin_verified = True
            gstin_state = validation.get("state_name", "")
            gstin_govt_legal_name = govt.get("legal_name", "")
            gstin_govt_status = govt.get("status", "")
        elif govt.get("govt_verified") and not govt.get("active"):
            raise HTTPException(status_code=400, detail=f"GSTIN is not active as per government records. Status: {govt.get('status', 'Unknown')}")
        else:
            # Govt API unavailable — reject, do not accept offline-only validation
            raise HTTPException(status_code=503, detail="Unable to verify GSTIN against government records at this time. Please try again later.")

    application = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "business_name": data.get("business_name", ""),
        "business_type": data.get("business_type", "dive_center"),
        "registration_number": data.get("registration_number", ""),
        "years_in_business": int(data.get("years_in_business", 0)),
        "num_employees": int(data.get("num_employees", 1)),
        "certifications": data.get("certifications", []),
        "certification_agencies": data.get("certification_agencies", []),
        "location": {
            "country": country,
            "city": data.get("city", ""),
            "address": data.get("address", ""),
        },
        "gstin": gstin,
        "gstin_verified": gstin_verified,
        "gstin_state": gstin_state,
        "gstin_govt_legal_name": gstin_govt_legal_name if (country or "").strip().lower() in ("india", "in") else "",
        "gstin_govt_status": gstin_govt_status if (country or "").strip().lower() in ("india", "in") else "",
        "website": data.get("website", ""),
        "contact_email": data.get("contact_email", current_user.get("email", "")),
        "contact_phone": data.get("contact_phone", ""),
        "description": data.get("description", ""),
        "documents": data.get("documents", []),
        "status": "pending",
        "verified": False,
        "admin_notes": "",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    await db.operator_applications.insert_one(application.copy())

    # Fire emails + notifications asynchronously (don't block the response)
    asyncio.create_task(_notify_application_submitted(application, current_user))

    return application


@router.get("/application/status")
async def get_application_status(current_user: dict = Depends(get_current_user)):
    """Check current application status."""
    app = await db.operator_applications.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0},
    )
    return {"application": app}


# ─── ADMIN: Review applications ───

@router.get("/admin/applications")
async def get_all_applications(
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    query = {}
    if status:
        query["status"] = status
    apps = await db.operator_applications.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(200)
    summary = {
        "total": len(apps),
        "pending": len([a for a in apps if a["status"] == "pending"]),
        "approved": len([a for a in apps if a["status"] == "approved"]),
        "rejected": len([a for a in apps if a["status"] == "rejected"]),
    }
    return {"applications": apps, "summary": summary}


@router.put("/admin/applications/{app_id}/review")
async def review_application(app_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    action = data.get("action")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be approve or reject")

    app = await db.operator_applications.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    notes = data.get("notes", "")
    result = await _process_review(app, action, current_user["id"], notes, data.get("verified", False))
    return result


async def _process_review(app: dict, action: str, reviewer_id: str, notes: str = "", verified: bool = False) -> dict:
    """Shared logic for reviewing an application (admin panel or email link)."""
    update = {
        "status": "approved" if action == "approve" else "rejected",
        "admin_notes": notes,
        "verified": action == "approve" and verified,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": reviewer_id,
    }
    await db.operator_applications.update_one({"id": app["id"]}, {"$set": update})

    user_status_update = {"status": "active"} if action == "approve" else {"status": "rejected"}

    if action == "approve":
        user_status_update.update({
            "role": "operator",
            "operator_verified": verified,
            "business_name": app["business_name"],
            "operator_application_id": app["id"],
            "location_country": app.get("location", {}).get("country", ""),
        })
        if app.get("gstin"):
            user_status_update["gstin"] = app["gstin"]
            user_status_update["gstin_verified"] = app.get("gstin_verified", False)
            user_status_update["gstin_state"] = app.get("gstin_state", "")

    await db.users.update_one({"id": app["user_id"]}, {"$set": user_status_update})

    # Send email + notification to operator asynchronously
    asyncio.create_task(_notify_review_decision(app, action, notes))

    return {"message": f"Application {action}d", "status": update["status"]}


async def _notify_application_submitted(application: dict, user: dict):
    """Send emails + notifications after operator application is submitted."""
    try:
        op_name = application.get("user_name", user.get("name", ""))
        op_email = application.get("user_email", user.get("email", ""))
        biz_name = application.get("business_name", "")

        # 1. Email to operator: "We've received your application"
        await send_operator_pending_email(op_name, op_email, biz_name)

        # 2. Email to admin team with all details + approve/decline buttons
        await send_admin_review_email(application)

        # 3. In-app notification for all super admins
        for admin in SUPER_ADMINS:
            admin_user = await db.users.find_one({"email": admin["email"]}, {"_id": 0, "id": 1})
            if admin_user:
                loc = application.get("location", {})
                country = loc.get("country", "Unknown")
                await create_notification(
                    admin_user["id"],
                    "operator_application",
                    "New Operator Application",
                    f"{op_name} ({biz_name}) from {country} has applied to become an operator.",
                    {"application_id": application["id"], "navigate_to": "operator-apps"},
                )
    except Exception as e:
        logger.error(f"Failed to send application notifications: {e}")


async def _notify_review_decision(app: dict, action: str, notes: str):
    """Send email + notification to operator after admin decision."""
    try:
        op_name = app.get("user_name", "")
        op_email = app.get("user_email", "")
        biz_name = app.get("business_name", "")

        if action == "approve":
            await send_operator_approved_email(op_email, op_name, biz_name, notes)
            await create_notification(
                app["user_id"],
                "operator_approved",
                "Application Approved!",
                f"Your operator application for {biz_name} has been approved. You can now create listings!",
                {"application_id": app["id"]},
            )
        else:
            await send_operator_declined_email(op_email, op_name, biz_name, notes)
            await create_notification(
                app["user_id"],
                "operator_declined",
                "Application Update",
                f"Your operator application for {biz_name} was not approved.{(' Reason: ' + notes) if notes else ''}",
                {"application_id": app["id"]},
            )
    except Exception as e:
        logger.error(f"Failed to send review decision notifications: {e}")


# ─── EMAIL-BASED REVIEW (token links from admin email) ───

@review_router.get("/api/operator-review/{token}/approve", response_class=HTMLResponse)
async def email_approve(token: str):
    """Approve operator application via email link."""
    return await _handle_email_review(token, "approve")


@review_router.get("/api/operator-review/{token}/decline", response_class=HTMLResponse)
async def email_decline(token: str):
    """Decline operator application via email link."""
    return await _handle_email_review(token, "decline")


async def _handle_email_review(token: str, expected_action: str) -> HTMLResponse:
    try:
        payload = jose_jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return HTMLResponse(
            content='<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">'
                    '<div style="text-align:center;"><h2>Link Expired</h2><p>This review link has expired. Please use the Admin Panel.</p></div></body></html>',
            status_code=400,
        )

    app_id = payload.get("app_id")
    token_action = payload.get("action")
    if token_action != expected_action:
        return HTMLResponse(content="<html><body>Invalid action</body></html>", status_code=400)

    app = await db.operator_applications.find_one({"id": app_id}, {"_id": 0})
    if not app:
        return HTMLResponse(content="<html><body>Application not found</body></html>", status_code=404)

    if app["status"] != "pending":
        already = app["status"]
        return HTMLResponse(
            content=f'<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">'
                    f'<div style="text-align:center;"><h2>Already Reviewed</h2><p>This application has already been {already}.</p></div></body></html>',
        )

    await _process_review(app, expected_action, "email-review")
    html = build_review_confirmation_html(expected_action, app.get("business_name", "Unknown"))
    return HTMLResponse(content=html)


# ─── OPERATOR PROFILE ───

@router.get("/profile")
async def get_operator_profile(current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    app = await db.operator_applications.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return {
        "profile": app,
        "verified": current_user.get("operator_verified", False),
        "business_name": current_user.get("business_name", ""),
    }


# ─── DIVE LISTING CRUD ───

@router.post("/listings")
async def create_listing(data: dict, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)

    listing = {
        "id": str(uuid.uuid4()),
        "operator_id": current_user["id"],
        "operator_name": current_user.get("business_name", current_user.get("name", "")),
        "operator_verified": current_user.get("operator_verified", False),
        # Basic
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "listing_type": data.get("listing_type", "day_dive"),
        "location": data.get("location", ""),
        "country": data.get("country", ""),
        # Media
        "photos": data.get("photos", []),
        "videos": data.get("videos", []),
        # Dive details
        "dive_sites": data.get("dive_sites", []),
        "num_dives": int(data.get("num_dives", 1)),
        "nitrox_available": data.get("nitrox_available", False),
        "nitrox_price": float(data.get("nitrox_price", 0)),
        "max_depth": float(data.get("max_depth", 0)),
        "difficulty_level": data.get("difficulty_level", "beginner"),
        "certification_required": data.get("certification_required", "Open Water"),
        # Gear
        "gear_rental": data.get("gear_rental", {"included": False, "price": 0, "items": []}),
        # Dates
        "arrival_date": data.get("arrival_date"),
        "departure_date": data.get("departure_date"),
        "duration_days": int(data.get("duration_days", 1)),
        "schedule_type": data.get("schedule_type", "on_demand"),
        "max_participants": int(data.get("max_participants", 10)),
        # Accommodation
        "accommodation": data.get("accommodation", {"included": False, "rooms": []}),
        # Inclusions
        "inclusions": data.get("inclusions", []),
        "exclusions": data.get("exclusions", []),
        # Pricing
        "price": float(data.get("price", 0)),
        "currency": data.get("currency", "USD"),
        # Policies
        "cancellation_policy": data.get("cancellation_policy", ""),
        "refund_policy": data.get("refund_policy", ""),
        "terms_conditions": data.get("terms_conditions", ""),
        "legal_disclaimer": data.get("legal_disclaimer", ""),
        "tcs_compliance": data.get("tcs_compliance", {
            "applicable": False,
            "rate": 5.0,
            "disclaimer": "TCS of 5% is applicable on overseas tour packages for Indian residents as per Section 206C(1G) of the Income Tax Act.",
        }),
        # Directions
        "directions": data.get("directions", {
            "text": "",
            "nearest_airport": "",
            "transfers_available": False,
            "transfer_price": 0,
        }),
        # Medical
        "medical_waiver_required": data.get("medical_waiver_required", True),
        # Status
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.operator_dive_listings.insert_one(listing.copy())
    return listing


@router.get("/listings")
async def get_my_listings(
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    _operator_only(current_user)
    query = {"operator_id": current_user["id"]}
    if status:
        query["status"] = status
    listings = await db.operator_dive_listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"listings": listings}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing["operator_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return listing


@router.put("/listings/{listing_id}")
async def update_listing(listing_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing["operator_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    protected = {"id", "operator_id", "created_at"}
    update = {k: v for k, v in data.items() if k not in protected}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "price" in update:
        update["price"] = float(update["price"])
    if "num_dives" in update:
        update["num_dives"] = int(update["num_dives"])

    await db.operator_dive_listings.update_one({"id": listing_id}, {"$set": update})
    return await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if str(listing.get("operator_id")) != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.operator_dive_listings.delete_one({"id": listing_id})
    return {"message": "Listing deleted"}


@router.put("/listings/{listing_id}/publish")
async def publish_listing(listing_id: str, current_user: dict = Depends(get_current_user)):
    """Submit listing for review / publish."""
    _operator_only(current_user)
    listing = await db.operator_dive_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing["operator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    required = ["title", "description", "price"]
    for f in required:
        if not listing.get(f):
            raise HTTPException(status_code=400, detail=f"Missing required field: {f}")

    new_status = "active" if current_user.get("operator_verified") else "pending"
    await db.operator_dive_listings.update_one(
        {"id": listing_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"status": new_status, "message": "Listing published" if new_status == "active" else "Listing submitted for review"}


# ─── MEDIA UPLOAD (local for now, GCS-ready) ───

@router.post("/upload")
async def upload_media(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    allowed_images = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    allowed_videos = {"video/mp4", "video/quicktime", "video/webm"}
    allowed = allowed_images | allowed_videos

    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    contents = await file.read()
    max_size = 50 * 1024 * 1024 if file.content_type in allowed_videos else 10 * 1024 * 1024
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail=f"File too large (max {max_size // (1024*1024)}MB)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    allowed_extensions = {"jpg", "jpeg", "png", "webp", "heic", "mp4", "mov", "webm"}
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file extension")
    media_type = "video" if file.content_type in allowed_videos else "image"
    filename = f"operator_{media_type}_{uuid.uuid4().hex[:12]}.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)

    return {
        "url": f"/api/uploads/{filename}",
        "type": media_type,
        "size": len(contents),
        "filename": filename,
    }


# ─── MEDICAL WAIVERS ───

@router.get("/waivers")
async def get_operator_waivers(current_user: dict = Depends(get_current_user)):
    """Get all medical waivers for operator's listings."""
    _operator_only(current_user)
    waivers = await db.medical_waivers.find(
        {"operator_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"waivers": waivers}


@router.post("/waivers/submit")
async def submit_medical_waiver(data: dict, current_user: dict = Depends(get_current_user)):
    """Customer submits a signed medical waiver."""
    waiver = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "booking_id": data.get("booking_id", ""),
        "listing_id": data.get("listing_id", ""),
        "operator_id": data.get("operator_id", ""),
        "form_type": "PADI_MEDICAL",
        "answers": data.get("answers", {}),
        "physician_clearance_required": data.get("physician_clearance_required", False),
        "physician_clearance_url": data.get("physician_clearance_url", ""),
        "emergency_contact": data.get("emergency_contact", {}),
        "signature_data": data.get("signature_data", ""),
        "signed_at": datetime.now(timezone.utc).isoformat() if data.get("signature_data") else None,
        "status": "signed" if data.get("signature_data") else "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.medical_waivers.insert_one(waiver.copy())
    return waiver


# ─── DIVE SHOP OPERATIONS ───

@router.get("/customers")
async def get_shop_customers(current_user: dict = Depends(get_current_user)):
    """Get all customers who have booked with this operator."""
    _operator_only(current_user)
    bookings = await db.bookings.find(
        {"operator_id": current_user["id"]},
        {"_id": 0, "user_id": 1, "user_name": 1, "user_email": 1, "created_at": 1, "status": 1},
    ).sort("created_at", -1).to_list(500)

    seen = {}
    for b in bookings:
        uid = b.get("user_id", "")
        if uid not in seen:
            seen[uid] = {
                "user_id": uid,
                "name": b.get("user_name", ""),
                "email": b.get("user_email", ""),
                "first_booking": b.get("created_at", ""),
                "total_bookings": 0,
            }
        seen[uid]["total_bookings"] += 1

    # Also add walk-in customers
    walkins = await db.walkin_customers.find(
        {"operator_id": current_user["id"]}, {"_id": 0}
    ).to_list(500)

    return {"online_customers": list(seen.values()), "walkin_customers": walkins}


@router.post("/customers/walkin")
async def add_walkin_customer(data: dict, current_user: dict = Depends(get_current_user)):
    """Add a walk-in customer."""
    _operator_only(current_user)
    customer = {
        "id": str(uuid.uuid4()),
        "operator_id": current_user["id"],
        "name": data.get("name", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "certification_level": data.get("certification_level", ""),
        "num_dives": int(data.get("num_dives", 0)),
        "source": data.get("source", "walk-in"),
        "notes": data.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.walkin_customers.insert_one(customer.copy())
    return customer


# ─── EQUIPMENT / INVENTORY ───

@router.get("/equipment")
async def get_equipment(current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    items = await db.operator_equipment.find(
        {"operator_id": current_user["id"]}, {"_id": 0}
    ).sort("name", 1).to_list(500)
    return {"equipment": items}


@router.post("/equipment")
async def add_equipment(data: dict, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    item = {
        "id": str(uuid.uuid4()),
        "operator_id": current_user["id"],
        "name": data.get("name", ""),
        "category": data.get("category", "general"),
        "serial_number": data.get("serial_number", ""),
        "quantity": int(data.get("quantity", 1)),
        "available": int(data.get("available", 1)),
        "condition": data.get("condition", "good"),
        "rental_price": float(data.get("rental_price", 0)),
        "purchase_date": data.get("purchase_date", ""),
        "last_service_date": data.get("last_service_date", ""),
        "next_service_date": data.get("next_service_date", ""),
        "notes": data.get("notes", ""),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.operator_equipment.insert_one(item.copy())
    return item


@router.put("/equipment/{item_id}")
async def update_equipment(item_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    item = await db.operator_equipment.find_one({"id": item_id, "operator_id": current_user["id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    protected = {"id", "operator_id", "created_at"}
    update = {k: v for k, v in data.items() if k not in protected}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.operator_equipment.update_one({"id": item_id}, {"$set": update})
    return await db.operator_equipment.find_one({"id": item_id}, {"_id": 0})


@router.delete("/equipment/{item_id}")
async def delete_equipment(item_id: str, current_user: dict = Depends(get_current_user)):
    _operator_only(current_user)
    result = await db.operator_equipment.delete_one({"id": item_id, "operator_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted"}


# ─── PUBLIC: Browse dive listings ───

@router.get("/browse")
async def browse_listings(
    listing_type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    nitrox: Optional[bool] = Query(None),
):
    """Public endpoint to browse active dive listings."""
    query = {"status": "active"}
    if listing_type:
        query["listing_type"] = listing_type
    if difficulty:
        query["difficulty_level"] = difficulty
    if country:
        query["directions.country"] = {"$regex": country, "$options": "i"}
    if min_price is not None:
        query["price"] = {"$gte": min_price}
    if max_price is not None:
        query.setdefault("price", {})["$lte"] = max_price
    if nitrox is not None:
        query["nitrox_available"] = nitrox

    listings = await db.operator_dive_listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"listings": listings}
