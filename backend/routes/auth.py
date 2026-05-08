from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Request
from jose import JWTError, jwt
from datetime import datetime, timezone, timedelta
import os
from database import db
from config import JWT_SECRET, ALGORITHM, ACCESS_TOKEN_EXPIRE, twilio_client, twilio_verify_sid, UPLOAD_DIR, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
from models import (
    SendOTPRequest, VerifyOTPRequest, SignupInitRequest, CompleteSignupRequest,
    LoginInitRequest, CompleteLoginRequest, TokenResponse, OnboardingRequest,
    ProfileUpdateRequest, User, SocialGoogleRequest, SocialGoogleCodeRequest,
    SocialMicrosoftRequest, SocialMicrosoftTokenRequest, SocialSignupCompleteRequest,
    SocialAppleTokenRequest,
)
from auth_utils import (
    is_email, is_phone, create_access_token, create_verification_token,
    get_current_user, send_email_otp,
)
from device_sessions import create_session, revoke_sessions_for_user
from apple_auth import verify_apple_identity_token, AppleTokenError
from rate_limiter import limiter
import uuid
import secrets
import httpx

router = APIRouter()


async def _maybe_attach_session(payload: dict, user_id: str, device) -> dict:
    """If the request included a `device` payload, mint a device-session and
    fold {refresh_token, session_id, refresh_expires_at} into the response.
    Returns the (possibly augmented) payload. No-op when device is None — so
    web clients keep their existing response shape exactly."""
    if not device:
        return payload
    session = await create_session(
        user_id=user_id,
        device_id=device.device_id,
        device_name=device.device_name,
        platform=device.platform,
        biometric_enabled=device.biometric_enabled,
    )
    payload["refresh_token"] = session["refresh_token"]
    payload["session_id"] = session["session_id"]
    payload["refresh_expires_at"] = session["refresh_expires_at"]
    return payload

ALLOWED_UPLOAD_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

TEST_IDENTIFIERS = (
    "testuser@bottom-time.com",        # diver
    "testoperator@bottom-time.com",    # operator
    "testinstructor@bottom-time.com",  # instructor
)
# OTP bypass code accepted for the 3 test identifiers above. Real users
# (incl. shubham@bottom-time.com — promoted to a real super-admin) go
# through the regular Resend send flow and receive a random 6-digit code.
TEST_OTP_CODE = "007320"


async def _check_otp_rate_limit(identifier: str):
    """Check if identifier has exceeded OTP rate limit (5 per 10 min)."""
    window_start = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent_attempts = await db.otp_rate_limits.count_documents({
        "identifier": identifier,
        "sent_at": {"$gte": window_start}
    })
    if recent_attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait 10 minutes before trying again.")
    await db.otp_rate_limits.insert_one({
        "identifier": identifier,
        "sent_at": datetime.now(timezone.utc)
    })


async def _store_otp(identifier: str, code: str, ttl_minutes: int = 10):
    """Store OTP code in database with expiry. Default 10 min to match email template."""
    await db.otp_codes.update_one(
        {"identifier": identifier},
        {"$set": {
            "code": code,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)).isoformat()
        }},
        upsert=True
    )


async def _deliver_otp(identifier: str, code: str, is_email_auth: bool):
    """Send OTP via email or SMS."""
    if is_email_auth:
        sent = await send_email_otp(identifier, code)
        if not sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please try again.")
    else:
        if twilio_client and twilio_verify_sid:
            try:
                twilio_client.verify.services(twilio_verify_sid).verifications.create(to=identifier, channel="sms")
            except Exception:
                raise HTTPException(status_code=500, detail="Failed to send SMS verification")
        else:
            raise HTTPException(status_code=500, detail="SMS service not configured")


@router.post("/auth/send-otp")
@limiter.limit("10/minute")
async def send_otp(request: Request, body: SendOTPRequest) -> dict:
    identifier = body.identifier.strip()
    is_email_auth = is_email(identifier)
    is_phone_auth = is_phone(identifier)

    if not is_email_auth and not is_phone_auth:
        raise HTTPException(status_code=400, detail="Invalid email or phone number")

    if identifier in TEST_IDENTIFIERS:
        await _store_otp(identifier, TEST_OTP_CODE, ttl_minutes=10)
        return {
            "channel": "email" if is_email_auth else "phone",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        }

    await _check_otp_rate_limit(identifier)

    if not twilio_client or not twilio_verify_sid:
        if is_phone_auth:
            raise HTTPException(status_code=500, detail="SMS service not configured")

    otp_code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    await _store_otp(identifier, otp_code)
    await _deliver_otp(identifier, otp_code, is_email_auth)

    return {
        "channel": "email" if is_email_auth else "phone",
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    }


@router.post("/auth/verify-otp")
@limiter.limit("15/minute")
async def verify_otp(request: Request, body: VerifyOTPRequest) -> dict:
    identifier = body.identifier.strip()

    # Test account bypass — hardcoded OTP TEST_OTP_CODE for the 3 emails
    if identifier in TEST_IDENTIFIERS and body.code == TEST_OTP_CODE:
        await db.otp_codes.delete_many({"identifier": identifier})
        verification_token = create_verification_token(identifier)
        return {"verified": True, "verification_token": verification_token}

    otp_record = await db.otp_codes.find_one({"identifier": identifier}, {"_id": 0})

    if not otp_record:
        raise HTTPException(status_code=404, detail="No verification code found")

    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Code expired")

    verified_via_twilio = False
    if is_phone(identifier) and twilio_client and twilio_verify_sid:
        try:
            check = twilio_client.verify.services(twilio_verify_sid).verification_checks.create(to=identifier, code=body.code)
            if check.status == "approved":
                verified_via_twilio = True
        except Exception:
            pass

    if not verified_via_twilio:
        if otp_record["code"] != body.code:
            raise HTTPException(status_code=400, detail="Invalid code")

    await db.otp_codes.delete_one({"identifier": identifier})
    verification_token = create_verification_token(identifier)

    return {"verified": True, "verification_token": verification_token}


@router.post("/auth/signup-init")
@limiter.limit("15/minute")
async def signup_init(request: Request, body: SignupInitRequest) -> dict:
    email = body.email.strip().lower()
    if len(email) > 254:
        raise HTTPException(status_code=400, detail="Invalid email address")
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return {"message": "Ready to send OTP", "email": email}


@router.post("/auth/signup-complete", response_model=TokenResponse)
@limiter.limit("10/minute")
async def signup_complete(request: Request, body: CompleteSignupRequest) -> dict:
    email = body.email.strip().lower()
    try:
        email_payload = jwt.decode(body.email_verified_token, JWT_SECRET, algorithms=[ALGORITHM])
        phone_payload = jwt.decode(body.phone_verified_token, JWT_SECRET, algorithms=[ALGORITHM])

        if email_payload.get("identifier") != body.email:
            raise HTTPException(status_code=400, detail="Invalid email verification")
        if phone_payload.get("identifier") != body.phone:
            raise HTTPException(status_code=400, detail="Invalid phone verification")
    except JWTError:
        raise HTTPException(status_code=400, detail="Verification tokens expired or invalid")

    existing_user = await db.users.find_one(
        {"$or": [{"email": email}, {"phone": body.phone}]},
        {"_id": 0}
    )
    if existing_user:
        raise HTTPException(status_code=400, detail="Email or phone already registered")

    signup_data = await db.signup_temp.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    if not signup_data:
        raise HTTPException(status_code=404, detail="Signup session not found")

    user_id = str(uuid.uuid4())
    status_val = "pending_approval" if signup_data["role"] == "operator" else "active"

    user_doc = {
        "id": user_id,
        "email": email,
        "phone": body.phone,
        "name": signup_data["name"],
        "role": signup_data["role"],
        "email_verified": True,
        "phone_verified": True,
        "status": status_val,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(user_doc.copy())
    await db.signup_temp.delete_one({"email": {"$regex": f"^{email}$", "$options": "i"}})

    access_token = create_access_token(
        data={"sub": user_id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    )

    return await _maybe_attach_session(
        {"access_token": access_token, "token_type": "bearer", "user": user_doc},
        user_id, body.device,
    )


@router.post("/auth/store-signup-data")
@limiter.limit("15/minute")
async def store_signup_data(request: Request, body: SignupInitRequest) -> dict:
    email = body.email.strip().lower()
    if len(email) > 254 or len(body.name) > 200:
        raise HTTPException(status_code=400, detail="Input too long")
    await db.signup_temp.update_one(
        {"email": email},
        {"$set": {
            "name": body.name,
            "role": body.role,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        }},
        upsert=True
    )
    return {"message": "Data stored"}


@router.post("/auth/login-init")
@limiter.limit("15/minute")
async def login_init(request: Request, body: LoginInitRequest) -> dict:
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
        if user:
            await db.users.update_one({"id": user["id"]}, {"$set": {"email": email}})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Send OTP to email first", "phone_hint": user["phone"][-4:]}


@router.post("/auth/login-complete", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_complete(request: Request, body: CompleteLoginRequest) -> dict:
    email = body.email.strip().lower()
    try:
        email_payload = jwt.decode(body.email_verified_token, JWT_SECRET, algorithms=[ALGORITHM])
        if email_payload.get("identifier") != body.email:
            raise HTTPException(status_code=400, detail="Invalid email verification")
    except JWTError:
        raise HTTPException(status_code=400, detail="Verification token expired or invalid")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
        if user:
            await db.users.update_one({"id": user["id"]}, {"$set": {"email": email}})
            user["email"] = email
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("role") == "operator" and user.get("status") == "pending_approval":
        raise HTTPException(status_code=403, detail="Your operator account is pending approval")

    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    )

    return await _maybe_attach_session(
        {"access_token": access_token, "token_type": "bearer", "user": user},
        user["id"], body.device,
    )


@router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.put("/auth/onboarding")
async def complete_onboarding(data: OnboardingRequest, current_user: dict = Depends(get_current_user)):
    currency_map = {
        "India": "INR", "United Kingdom": "GBP", "Germany": "EUR", "France": "EUR",
        "Italy": "EUR", "Spain": "EUR", "Netherlands": "EUR", "Portugal": "EUR",
        "Greece": "EUR", "Croatia": "EUR", "Malta": "EUR", "Australia": "AUD",
        "New Zealand": "NZD", "Japan": "JPY", "South Korea": "KRW",
        "Thailand": "THB", "Indonesia": "IDR", "Malaysia": "MYR",
        "Philippines": "PHP", "Singapore": "SGD", "Egypt": "EGP",
        "South Africa": "ZAR", "Kenya": "KES", "Tanzania": "TZS",
        "Brazil": "BRL", "Mexico": "MXN", "Colombia": "COP",
        "Canada": "CAD", "Sweden": "SEK", "Norway": "NOK",
        "Turkey": "TRY", "Israel": "ILS", "Saudi Arabia": "SAR",
        "United Arab Emirates": "AED", "Oman": "OMR", "Sri Lanka": "LKR",
    }
    currency = currency_map.get(data.location_country, "USD")

    update = {
        "experience_level": data.experience_level,
        "certification_level": data.certification_level,
        "interests": data.interests,
        "location_country": data.location_country,
        "location_city": data.location_city,
        "date_of_birth": data.date_of_birth,
        "referral_source": data.referral_source,
        "total_dives": data.total_dives,
        "instructor_certification": data.instructor_certification,
        "instructor_agency": data.instructor_agency,
        "instructor_specialties": data.instructor_specialties or [],
        "instructor_years": data.instructor_years,
        "currency": currency,
        "onboarding_complete": True
    }
    await db.users.update_one({"id": current_user["id"]}, {"$set": update})
    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return updated_user


@router.put("/auth/profile")
async def update_profile(data: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": current_user["id"]}, {"$set": update})
    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return updated_user


@router.put("/auth/profile-photo")
async def update_profile_photo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images allowed")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file extension")
    filename = f"profile_{current_user['id'][:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    photo_url = f"/api/uploads/{filename}"
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"profile_photo": photo_url}})
    return {"url": photo_url}


@router.get("/user/download-data")
async def download_user_data(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    user_data = {
        "export_info": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "format_version": "1.0"
        },
        "profile": await db.users.find_one({"id": user_id}, {"_id": 0}),
        "bookings": await db.bookings.find({"user_id": user_id}, {"_id": 0}).to_list(1000),
        "dive_logs": await db.dive_logs.find({"user_id": user_id}, {"_id": 0}).to_list(1000),
        "reviews": await db.reviews.find({"user_id": user_id}, {"_id": 0}).to_list(1000),
        "wishlists": await db.wishlists.find({"user_id": user_id}, {"_id": 0}).to_list(1000),
        "connections": await db.connections.find(
            {"$or": [{"from_id": user_id}, {"to_id": user_id}]}, {"_id": 0}
        ).to_list(1000),
        "messages_sent": await db.messages.find({"sender_id": user_id}, {"_id": 0}).to_list(1000),
        "notifications": await db.notifications.find({"user_id": user_id}, {"_id": 0}).to_list(500),
        "event_rsvps": [],
    }
    events = await db.events.find({"attendees": user_id}, {"_id": 0, "id": 1, "title": 1, "date": 1}).to_list(100)
    user_data["event_rsvps"] = events
    if current_user.get("role") in ("operator", "instructor"):
        user_data["listings"] = await db.listings.find({"operator_id": user_id}, {"_id": 0}).to_list(500)
        user_data["bookings_received"] = await db.bookings.find({"operator_id": user_id}, {"_id": 0}).to_list(1000)
    return user_data


@router.delete("/user/delete-account")
async def delete_user_account(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    await db.bookings.delete_many({"user_id": user_id})
    await db.dive_logs.delete_many({"user_id": user_id})
    await db.reviews.delete_many({"user_id": user_id})
    await db.wishlists.delete_many({"user_id": user_id})
    await db.connections.delete_many({"$or": [{"from_id": user_id}, {"to_id": user_id}]})
    await db.messages.delete_many({"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]})
    await db.notifications.delete_many({"user_id": user_id})
    await db.analytics_events.delete_many({"user_id": user_id})
    await db.utm_events.delete_many({"user_id": user_id})
    await db.events.update_many({"attendees": user_id}, {"$pull": {"attendees": user_id}})
    if current_user.get("role") in ("operator", "instructor"):
        listing_ids = [doc["id"] async for doc in db.listings.find({"operator_id": user_id}, {"id": 1})]
        if listing_ids:
            await db.availability.delete_many({"listing_id": {"$in": listing_ids}})
            await db.reviews.delete_many({"listing_id": {"$in": listing_ids}})
        await db.listings.delete_many({"operator_id": user_id})
        await db.bookings.delete_many({"operator_id": user_id})
    await db.users.delete_one({"id": user_id})
    return {"message": "Account and all associated data have been permanently deleted"}


async def _lookup_social_user(email: str, provider: str, name: str) -> dict:
    """Shared logic: find user by email (case-insensitive), link provider, or return needs_setup."""
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
        if user:
            await db.users.update_one({"id": user["id"]}, {"$set": {"email": email}})
            user["email"] = email
    if user:
        if user.get("role") == "operator" and user.get("status") == "pending_approval":
            raise HTTPException(status_code=403, detail="Your operator account is pending approval.")
        link_field = f"{provider}_linked"
        if not user.get(link_field):
            await db.users.update_one({"id": user["id"]}, {"$set": {link_field: True}})
        access_token = create_access_token(data={"sub": user["id"]}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE))
        return {"status": "logged_in", "access_token": access_token, "token_type": "bearer", "user": user}
    return {"status": "needs_setup", "email": email, "name": name, "provider": provider}


# ─────────────────────────────────────────
# SOCIAL AUTH ENDPOINTS
# ─────────────────────────────────────────

@router.post("/auth/social/google")
@limiter.limit("10/minute")
async def social_google(request: Request, body: SocialGoogleRequest) -> dict:
    """Legacy Emergent Google session — kept for backward compat."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
            timeout=10.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Google session. Please try again.")
        data = resp.json()

    email = (data.get("email") or "").strip().lower()
    name = data.get("name") or ""
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address.")

    return await _lookup_social_user(email, "google", name)


@router.post("/auth/social/google-code")
@limiter.limit("10/minute")
async def social_google_code(request: Request, body: SocialGoogleCodeRequest) -> dict:
    """Exchange Google auth code for tokens (custom Google OAuth — no Emergent branding)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
                "code": body.code,
                "code_verifier": body.code_verifier,
                "redirect_uri": body.redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=15.0,
        )
        if resp.status_code != 200:
            try:
                err = resp.json()
                detail = err.get("error_description") or err.get("error") or resp.text
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=400, detail=f"Google: {detail[:300]}")
        token_data = resp.json()

    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="Google did not return an ID token.")

    try:
        claims = jwt.get_unverified_claims(id_token)
        email = (claims.get("email") or "").strip().lower()
        name = claims.get("name") or ""
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse Google token.")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Could not retrieve a valid email from Google.")

    return await _lookup_social_user(email, "google", name)


@router.post("/auth/social/microsoft")
@limiter.limit("10/minute")
async def social_microsoft(request: Request, body: SocialMicrosoftRequest) -> dict:
    """Exchange Microsoft auth code for ID token — kept for backward compat, prefer /microsoft-token."""
    raise HTTPException(status_code=400, detail="Use /auth/social/microsoft-token instead (SPA flow).")


@router.post("/auth/social/microsoft-token")
@limiter.limit("10/minute")
async def social_microsoft_token(request: Request, body: SocialMicrosoftTokenRequest) -> dict:
    """Accept a Microsoft ID token (obtained by the browser) and log in or prepare signup."""
    if not body.id_token:
        raise HTTPException(status_code=400, detail="No ID token provided.")

    try:
        claims = jwt.get_unverified_claims(body.id_token)
        email = (claims.get("email") or claims.get("preferred_username") or "").strip().lower()
        name = claims.get("name") or ""
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse Microsoft token.")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Could not retrieve a valid email from Microsoft.")

    return await _lookup_social_user(email, "microsoft", name)


@router.post("/auth/social/apple-token")
@limiter.limit("10/minute")
async def social_apple_token(request: Request, body: SocialAppleTokenRequest) -> dict:
    """Verify an Apple identity token (from AuthenticationServices on iOS or
    Sign in with Apple JS on web) and either log the user in or return the
    `needs_setup` shape so the client can collect phone + role + OTP and call
    /auth/social/signup-complete.

    Lookup order:
      1. users.apple_sub == token.sub  (most stable — Apple may return a
         relay address that differs between first login and subsequent logins)
      2. users.email == token.email    (first-time link to an existing
         email account)
      3. otherwise → stash `{email, name, apple_sub}` in signup_temp and
         return {status: "needs_setup", email, name, provider: "apple"}
         so signup-complete can pull apple_sub out later.
    """
    allowed_audiences = [
        os.environ.get("APPLE_BUNDLE_ID", ""),
        os.environ.get("APPLE_SERVICES_ID", ""),
    ]
    try:
        claims = await verify_apple_identity_token(body.identity_token, allowed_audiences)
    except AppleTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Apple: {exc}")

    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=400, detail="Apple token missing subject claim.")

    email = (claims.get("email") or "").strip().lower()
    email_verified_raw = claims.get("email_verified")
    # Apple sometimes returns the bool as a string ("true" / "false").
    if isinstance(email_verified_raw, str):
        email_verified = email_verified_raw.lower() == "true"
    else:
        email_verified = bool(email_verified_raw)

    # full_name is only delivered on FIRST authentication (and only by iOS). Fall
    # back to whatever Apple put in the token (rare — Apple strips it out after
    # the first login).
    name = (
        (body.full_name or "").strip()
        or (claims.get("name") or "").strip()
        or ""
    )

    # 1) Look up by apple_sub — the stable identifier.
    user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
    # 2) Fall back to email match (first-time link).
    if not user and email:
        user = await db.users.find_one(
            {"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
        )

    if user:
        if user.get("role") == "operator" and user.get("status") == "pending_approval":
            raise HTTPException(status_code=403, detail="Your operator account is pending approval.")
        update_fields: dict = {"apple_linked": True}
        if not user.get("apple_sub"):
            update_fields["apple_sub"] = apple_sub
        if email and user.get("email", "").lower() != email:
            # Don't overwrite an existing email with Apple's relay address —
            # only fill it in when the user had no email on file (shouldn't
            # happen in this codebase but safe).
            if not user.get("email"):
                update_fields["email"] = email
        if update_fields:
            await db.users.update_one({"id": user["id"]}, {"$set": update_fields})
            user.update(update_fields)
        access_token = create_access_token(
            data={"sub": user["id"]}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE)
        )
        payload = {
            "status": "logged_in",
            "access_token": access_token,
            "token_type": "bearer",
            "user": user,
        }
        return await _maybe_attach_session(payload, user["id"], body.device)

    # 3) No user found — stash apple_sub + email_verified in signup_temp so
    #    signup-complete can persist them when the user finishes phone OTP.
    #    Apple relay emails ARE valid destinations for OTP delivery, so we
    #    don't block on email_verified here.
    if not email:
        # Rare: user hid email AND this is a new account. We can't proceed
        # without an email because the signup flow requires one.
        raise HTTPException(
            status_code=400,
            detail="Apple did not return an email. Please enable email sharing in Apple ID settings and try again.",
        )
    await db.signup_temp.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "name": name,
            "provider": "apple",
            "apple_sub": apple_sub,
            "apple_email_verified": email_verified,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {
        "status": "needs_setup",
        "email": email,
        "name": name,
        "provider": "apple",
    }


@router.post("/auth/social/signup-complete", response_model=TokenResponse)
@limiter.limit("10/minute")
async def social_signup_complete(request: Request, body: SocialSignupCompleteRequest) -> dict:
    """Create a new account after social login — phone OTP verified."""
    email = body.email.strip().lower()
    try:
        phone_payload = jwt.decode(body.phone_verified_token, JWT_SECRET, algorithms=[ALGORITHM])
        if phone_payload.get("identifier") != body.phone:
            raise HTTPException(status_code=400, detail="Invalid phone verification token.")
    except JWTError:
        raise HTTPException(status_code=400, detail="Phone verification token expired or invalid.")

    existing = await db.users.find_one(
        {"$or": [{"email": email}, {"email": {"$regex": f"^{email}$", "$options": "i"}}, {"phone": body.phone}]}, {"_id": 0}
    )
    if existing:
        # Merge: existing user found by email — log them in and link provider
        if existing.get("email").lower() == email:
            update_fields = {"email": email}
            if body.provider == "microsoft":
                update_fields["microsoft_linked"] = True
            elif body.provider == "google":
                update_fields["google_linked"] = True
            elif body.provider == "apple":
                update_fields["apple_linked"] = True
                # Pull apple_sub out of the signup_temp row that apple-token
                # upserted earlier in this flow.
                temp = await db.signup_temp.find_one(
                    {"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
                )
                if temp and temp.get("apple_sub") and not existing.get("apple_sub"):
                    update_fields["apple_sub"] = temp["apple_sub"]
            phone_attached = False
            if not existing.get("phone") and body.phone:
                update_fields["phone"] = body.phone
                update_fields["phone_verified"] = True
                phone_attached = True
            await db.users.update_one({"id": existing["id"]}, {"$set": update_fields})
            # Phone (re)attached on this account → invalidate every prior device
            # session so a previously stolen refresh token can't outlive the
            # credential change. Spec: revoke_reason = "phone_changed".
            if phone_attached:
                await revoke_sessions_for_user(user_id=existing["id"], reason="phone_changed")
            access_token = create_access_token(data={"sub": existing["id"]}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE))
            return await _maybe_attach_session(
                {"access_token": access_token, "token_type": "bearer", "user": {**existing, **update_fields}},
                existing["id"], body.device,
            )
        raise HTTPException(status_code=400, detail="This phone number is already registered.")

    user_id = str(uuid.uuid4())
    status_val = "pending_approval" if body.role == "operator" else "active"
    user_doc = {
        "id": user_id,
        "email": email,
        "phone": body.phone,
        "name": body.name,
        "role": body.role,
        "email_verified": True,
        "phone_verified": True,
        "status": status_val,
        "provider": body.provider,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Carry Apple's stable subject into the new user doc so future Apple logins
    # hit it directly via the `apple_sub` unique index instead of relying on
    # the (possibly rotated) relay email address.
    if body.provider == "apple":
        temp = await db.signup_temp.find_one(
            {"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
        )
        if temp and temp.get("apple_sub"):
            user_doc["apple_sub"] = temp["apple_sub"]
        user_doc["apple_linked"] = True
    elif body.provider == "google":
        user_doc["google_linked"] = True
    elif body.provider == "microsoft":
        user_doc["microsoft_linked"] = True
    await db.users.insert_one(user_doc.copy())
    # signup_temp has served its purpose — clean it up to keep the collection
    # from accumulating stale rows.
    await db.signup_temp.delete_one({"email": {"$regex": f"^{email}$", "$options": "i"}})
    access_token = create_access_token(data={"sub": user_id}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE))
    return await _maybe_attach_session(
        {"access_token": access_token, "token_type": "bearer", "user": user_doc},
        user_id, body.device,
    )
