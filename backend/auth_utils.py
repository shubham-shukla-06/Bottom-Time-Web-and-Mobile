from fastapi import Depends, HTTPException
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


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
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
    return user


async def require_admin(current_user: dict) -> dict:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _build_otp_email_html(email: str, code: str) -> str:
    """Build the branded OTP email HTML."""
    digits = list(code)
    digit_cells = "".join(
        f'<td style="width:46px;height:54px;background:#22d3ee;border-radius:10px;text-align:center;'
        f'vertical-align:middle;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:26px;'
        f'font-weight:700;color:#0f172a;letter-spacing:0;">{d}</td>'
        for d in digits
    )
    # Inline SVG wordmark — works in Gmail, Apple Mail, iOS Mail. For older
    # Outlook clients that don't render inline SVG, the surrounding plain
    # text "Bottom Time" wordmark in the <span> below is the fallback (we
    # set the SVG to display:block and keep a text fallback above it via
    # MSO conditional comment so Outlook only sees the text).
    logo_block = (
        '<!--[if mso]>'
        '<div style="font-family:Arial,sans-serif;font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">'
        '<span style="color:#22d3ee;">Bottom</span>&nbsp;Time'
        '</div>'
        '<![endif]-->'
        '<!--[if !mso]><!-- -->'
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">'
        '<tr><td style="vertical-align:middle;padding-right:10px;">'
        '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" '
        'fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" '
        'style="display:block;">'
        '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'
        '<path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'
        '<path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'
        '</svg>'
        '</td><td style="vertical-align:middle;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;'
        'font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;line-height:1;">'
        '<span style="color:#22d3ee;">Bottom</span>&nbsp;Time'
        '</td></tr></table>'
        '<!--<![endif]-->'
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f0f4f5;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f5;padding:40px 0;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">

  <!-- Logo header -->
  <tr><td style="padding:36px 40px 0;text-align:center;">
    {logo_block}
  </td></tr>

  <!-- Cyan accent bar -->
  <tr><td style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:3px;border-radius:2px;background:#22d3ee;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 40px 8px;">
    <p style="margin:0 0 20px;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;font-weight:700;line-height:1.5;text-align:center;">
      The ocean just called. It used your email.
    </p>
    <p style="margin:0 0 12px;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;color:#0f172a;font-weight:600;text-align:center;">
      Use these digits to get back to the reef:
    </p>

    <!-- OTP digits -->
    <table role="presentation" cellpadding="0" cellspacing="8" style="margin:0 auto 28px;">
    <tr>
      {digit_cells}
    </tr>
    </table>

    <p style="margin:0 0 4px;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;color:#475569;font-weight:500;line-height:1.5;text-align:center;">
      This code is for your eyes only &mdash; treat it like your last 50 bar of air. Don't share it.
    </p>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr>
      <td style="border-top:1px solid #e2e8f0;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>

    <p style="margin:16px 0 0;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;color:#475569;line-height:1.6;text-align:center;">
      This code expires in <strong style="color:#0f172a;">10 minutes</strong>.
    </p>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
      <td style="border-top:1px solid #e2e8f0;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>

    <p style="margin:16px 0 0;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#475569;line-height:1.6;text-align:center;">
      You are receiving this because someone used <strong style="color:#0f172a;">{email}</strong> to sign in.
    </p>
    <p style="margin:6px 0 24px;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#475569;line-height:1.6;text-align:center;">
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
        "subject": "Your descent starts here",
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
