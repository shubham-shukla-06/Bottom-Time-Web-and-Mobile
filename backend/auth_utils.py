from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from database import db
from config import JWT_SECRET, ALGORITHM
import re
import os
import asyncio
import resend
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()

resend.api_key = os.environ.get('RESEND_API_KEY', '')
EMAIL_FROM = os.environ.get('EMAIL_FROM', 'noreply@bottom-time.com')
APP_BASE_URL = os.environ.get('APP_BASE_URL', '')

MAX_EMAIL_RETRIES = 2
EMAIL_TIMEOUT_SECONDS = 10


def is_email(identifier: str) -> bool:
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_pattern, identifier))


def is_phone(identifier: str) -> bool:
    return identifier.startswith('+') and len(identifier) > 10


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> dict:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


def create_verification_token(identifier: str) -> str:
    data = {"identifier": identifier, "verified_at": datetime.now(timezone.utc).isoformat()}
    return create_access_token(data, expires_delta=timedelta(minutes=10))


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    # Fire-and-forget activity bookkeeping — bump device_sessions.last_used_at
    # for the session whose id the client passes in the X-Session-Id header.
    # Throttled in `touch_session` so we don't hammer Mongo on every request.
    # Imported lazily to avoid a circular import (device_sessions also reads
    # auth state in some flows).
    sid = request.headers.get("x-session-id") if request is not None else None
    if sid:
        try:
            from device_sessions import touch_session
            asyncio.create_task(touch_session(sid, user_id=user_id))
        except Exception:
            pass
    return user


async def require_admin(current_user: dict) -> dict:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _build_otp_email_subject(code: str) -> str:
    """Subject is a fixed literal — no OTP digits, no name, no interpolation.
    Per product spec: every OTP email uses the exact same subject so users can
    filter / search consistently and we don't leak the code into notification
    previews."""
    return "Your Bottom Time OTP"


def _build_otp_email_html(email: str, code: str) -> str:
    """Build the branded OTP email HTML.

    Robustness notes:
      • Logo is ONE pre-rendered PNG that bakes in the Waves icon (cyan) +
        "Bottom Time" wordmark (slate-900 Outfit Bold) + cyan underline.
        This sidesteps every email-client web-font / SVG / inline-style
        stripping issue (Gmail, Outlook desktop, Apple Mail all just paint
        the PNG).
      • No `border-radius` anywhere — every corner is square.
      • `color-scheme: light only` + `prefers-color-scheme: dark` overrides
        force light styling in dark-mode email clients.
    """
    digits = list(code)
    digit_cells = "".join(
        f'<td class="otp-cell" style="width:46px;height:54px;background-color:#22d3ee;'
        f'text-align:center;vertical-align:middle;'
        f'font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:26px;'
        f'font-weight:700;color:#0f172a;letter-spacing:0;">{d}</td>'
        for d in digits
    )
    logo_url = (
        f"{APP_BASE_URL}/api/uploads/logo-bottomtime-email.png"
        if APP_BASE_URL else
        "https://project-scanner-44.preview.emergentagent.com/api/uploads/logo-bottomtime-email.png"
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<style>
  /* Force light styling even when the email client renders in dark mode. */
  @media (prefers-color-scheme: dark) {{
    body, .container, td, table {{
      background-color: #ffffff !important;
      color: #0f172a !important;
    }}
    .otp-cell {{
      background-color: #22d3ee !important;
      color: #0f172a !important;
    }}
    .footer-text {{ color: #475569 !important; }}
  }}
  [data-ogsc] body, [data-ogsc] .container,
  [data-ogsb] body, [data-ogsb] .container {{
    background-color: #ffffff !important;
    color: #0f172a !important;
  }}
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:24px 0;">
<tr><td align="center">
<table class="container" role="presentation" width="500" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;">

  <!-- Logo (single PNG: Waves icon + "Bottom Time" wordmark) -->
  <tr><td style="padding:16px 0 0;text-align:center;">
    <img src="{logo_url}" width="300" height="50" alt="Bottom Time"
         style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:300px;height:50px;" />
  </td></tr>

  <!-- Cyan accent bar -->
  <tr><td style="padding:8px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:3px;background-color:#22d3ee;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:18px 40px 8px;">
    <p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#475569;font-weight:500;text-align:center;">
      Use these digits to get back to the reef:
    </p>

    <!-- OTP digits -->
    <table role="presentation" cellpadding="0" cellspacing="8" style="margin:0 auto 28px;">
    <tr>
      {digit_cells}
    </tr>
    </table>

    <p class="footer-text" style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#475569;font-weight:500;line-height:1.5;text-align:center;">
      This code is for your eyes only &mdash; treat it like your last 50 bar of air. Don't share it.
    </p>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr>
      <td style="border-top:1px solid #e2e8f0;height:1px;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>

    <p class="footer-text" style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#475569;line-height:1.6;text-align:center;">
      This code expires in <strong style="color:#0f172a;">10 minutes</strong>.
    </p>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
      <td style="border-top:1px solid #e2e8f0;height:1px;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>

    <p class="footer-text" style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#475569;line-height:1.6;text-align:center;">
      You are receiving this because someone used <strong style="color:#0f172a;">{email}</strong> to sign in.
    </p>
    <p class="footer-text" style="margin:6px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#475569;line-height:1.6;text-align:center;">
      Not your dive plan? No pressure. We'll just assume this was a message in a bottle meant for someone else.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


async def send_email_otp(email: str, code: str) -> bool:
    """Send OTP email via Resend with retry logic and timeout."""
    if not resend.api_key:
        raise Exception("Email service not configured")

    html = _build_otp_email_html(email, code)
    params = {
        "from": EMAIL_FROM,
        "to": [email],
        "subject": _build_otp_email_subject(code),
        "headers": {
            "X-Entity-Ref-ID": f"otp-{email}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        },
        "html": html,
    }

    last_error = None
    for attempt in range(1, MAX_EMAIL_RETRIES + 1):
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(resend.Emails.send, params),
                timeout=EMAIL_TIMEOUT_SECONDS,
            )
            email_id = result.get("id", "") if isinstance(result, dict) else str(result)
            logger.info(f"OTP email sent to {email} (attempt {attempt}, resend_id={email_id})")
            return True
        except asyncio.TimeoutError:
            last_error = f"Timeout after {EMAIL_TIMEOUT_SECONDS}s"
            logger.warning(f"OTP email timeout for {email} (attempt {attempt}/{MAX_EMAIL_RETRIES})")
        except Exception as e:
            last_error = str(e)
            logger.warning(f"OTP email error for {email} (attempt {attempt}/{MAX_EMAIL_RETRIES}): {e}")

        if attempt < MAX_EMAIL_RETRIES:
            await asyncio.sleep(1)

    logger.error(f"OTP email failed for {email} after {MAX_EMAIL_RETRIES} attempts: {last_error}")
    return False
