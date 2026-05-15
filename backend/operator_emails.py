"""
Operator verification email templates and sending functions.
All HTML emails follow the Bottom Time branded design (matching OTP emails).
"""
import os
import asyncio
import logging
import resend
from datetime import datetime, timezone, timedelta
from jose import jwt
from tax_engine import is_india
from config import JWT_SECRET, ALGORITHM

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get('RESEND_API_KEY', '')
EMAIL_FROM = os.environ.get('EMAIL_FROM', 'noreply@bottom-time.com')
APP_BASE_URL = os.environ.get('APP_BASE_URL', '')

ADMIN_EMAIL = "operator@bottom-time.com"
EMAIL_TIMEOUT = 10


def _create_review_token(app_id: str, action: str) -> str:
    """Create a JWT for email-based approve/decline links (7-day expiry)."""
    payload = {
        "app_id": app_id,
        "action": action,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def _email_shell(inner_html: str) -> str:
    """Wrap content in the standard Bottom Time email shell."""
    logo_url = f"{APP_BASE_URL}/api/uploads/brand-logo-full.png" if APP_BASE_URL else ""
    logo_img = (
        f'<img src="{logo_url}" alt="Bottom Time" '
        f'width="240" height="58" style="display:block;margin:0 auto;width:240px;height:auto;" />'
        if logo_url else ""
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
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
  <tr><td style="padding:36px 40px 0;text-align:center;">{logo_img}</td></tr>
  <tr><td style="padding:20px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:3px;border-radius:2px;background:#22d3ee;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 40px 32px;">{inner_html}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _detail_row(label: str, value: str) -> str:
    if not value:
        return ""
    return (
        f'<tr>'
        f'<td style="padding:6px 12px;font-size:12px;color:#94a3b8;font-weight:600;white-space:nowrap;vertical-align:top;">{label}</td>'
        f'<td style="padding:6px 12px;font-size:13px;color:#0f172a;font-weight:500;">{value}</td>'
        f'</tr>'
    )


def build_operator_pending_email(operator_name: str, business_name: str) -> str:
    """Email to operator: Your application is under review."""
    inner = f"""
    <p style="margin:0 0 20px;font-size:14px;color:#0f172a;font-weight:700;line-height:1.5;text-align:center;">
      Your operator application is in the pipeline.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;text-align:center;">
      Hi {operator_name},<br><br>
      Thank you for applying to list <strong>{business_name}</strong> on Bottom Time.
      Our compliance team is reviewing your application and will get back to you
      within <strong>48 hours</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f0fdfa;border-radius:12px;border:1px solid #ccfbf1;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">What happens next?</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">1. Our team verifies your business details</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">2. You'll receive an email once a decision is made</p>
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">3. Once approved, you can start creating listings immediately</p>
    </td></tr>
    </table>

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
      If you have questions, reply to this email or reach out at support@bottom-time.com.
    </p>"""
    return _email_shell(inner)


VERIFICATION_PORTALS = {
    "united kingdom": {"url": "https://find-and-update.company-information.service.gov.uk/", "label": "Verify on Companies House"},
    "australia": {"url": "https://abr.business.gov.au/", "label": "Verify ABN on ABR"},
    "singapore": {"url": "https://www.uen.gov.sg/", "label": "Verify UEN"},
    "new zealand": {"url": "https://www.nzbn.govt.nz/", "label": "Verify NZBN"},
    "denmark": {"url": "https://datacvr.virk.dk/", "label": "Verify on CVR Register"},
    "philippines": {"url": "https://portal.sec.gov.ph/", "label": "Verify on SEC Portal"},
    "japan": {"url": "https://www.houjin-bangou.nta.go.jp/en/", "label": "Verify Corporate Number on NTA"},
    "china": {"url": "https://www.gsxt.gov.cn/", "label": "Verify on NECIPS/GSXT"},
    "united arab emirates": {"url": "https://eservices.dubaided.gov.ae/", "label": "Verify on DED eServices"},
    "thailand": {"url": "https://datawarehouse.dbd.go.th/", "label": "Verify on DBD DataWarehouse"},
    "indonesia": {"url": "https://oss.go.id/", "label": "Verify NIB on OSS Portal"},
    "egypt": {"url": "https://www.gafi.gov.eg/", "label": "Check on GAFI Portal"},
}

EU_COUNTRIES = {"austria", "belgium", "bulgaria", "croatia", "cyprus", "czech republic", "estonia",
    "finland", "france", "germany", "greece", "hungary", "ireland", "italy", "latvia",
    "lithuania", "luxembourg", "malta", "netherlands", "poland", "portugal", "romania",
    "slovakia", "slovenia", "spain", "sweden"}


def _get_verification_portal(country: str, reg_num: str = "") -> dict:
    key = country.lower()
    if key in VERIFICATION_PORTALS:
        return VERIFICATION_PORTALS[key]
    if key in EU_COUNTRIES:
        return {"url": "https://ec.europa.eu/taxation_customs/vies/", "label": "Verify VAT on EU VIES"}
    return None


def _is_eu_country(country: str) -> bool:
    return country.lower() in EU_COUNTRIES


def build_admin_review_email(application: dict) -> str:
    """Email to admin team: New operator application with all details + approve/decline buttons."""
    app_id = application["id"]
    approve_token = _create_review_token(app_id, "approve")
    decline_token = _create_review_token(app_id, "decline")
    approve_url = f"{APP_BASE_URL}/api/operator-review/{approve_token}/approve"
    decline_url = f"{APP_BASE_URL}/api/operator-review/{decline_token}/decline"

    loc = application.get("location", {})
    country = loc.get("country", "N/A")
    city = loc.get("city", "")
    location_str = f"{city}, {country}" if city else country

    # Build verification status section
    if is_india(country):
        gstin = application.get("gstin", "")
        verified = application.get("gstin_verified", False)
        legal_name = application.get("gstin_govt_legal_name", "")
        verify_html = f"""
        <tr><td colspan="2" style="padding:10px 12px 4px;"><p style="margin:0;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;">India Tax Verification</p></td></tr>
        {_detail_row("GSTIN", gstin or "Not provided")}
        {_detail_row("Govt Verified", '<span style="color:#10b981;font-weight:700;">Yes</span>' if verified else '<span style="color:#ef4444;font-weight:700;">No</span>')}
        {_detail_row("Legal Name (Govt)", legal_name or "N/A")}
        """
    else:
        reg_num = application.get("registration_number", "")
        docs = application.get("documents", [])
        doc_count = len(docs) if docs else 0
        portal = _get_verification_portal(country, reg_num)
        portal_html = ""
        if portal:
            portal_html = f'<tr><td colspan="2" style="padding:6px 12px;"><a href="{portal["url"]}" style="color:#0ea5e9;font-size:12px;text-decoration:underline;" target="_blank">{portal["label"]}</a></td></tr>'
        verify_html = f"""
        <tr><td colspan="2" style="padding:10px 12px 4px;"><p style="margin:0;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;">{country} Verification</p></td></tr>
        {_detail_row("Registration #", reg_num or "Not provided")}
        {_detail_row("Documents", f"{doc_count} uploaded" if doc_count else "None uploaded")}
        {portal_html}
        <tr><td colspan="2" style="padding:4px 12px;"><p style="margin:0;font-size:11px;color:#f59e0b;font-weight:600;">{"Auto-verifiable via VIES" if _is_eu_country(country) else "Manual review required"}</p></td></tr>
        """

    certs = ", ".join(application.get("certifications", [])) or "None listed"

    inner = f"""
    <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:700;line-height:1.4;text-align:center;">
      New Operator Application
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;text-align:center;">
      {application.get("user_name", "Unknown")} wants to list their business on Bottom Time
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:20px;">
      <tr><td colspan="2" style="padding:10px 12px 4px;"><p style="margin:0;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;">Business Details</p></td></tr>
      {_detail_row("Business Name", application.get("business_name", "N/A"))}
      {_detail_row("Business Type", (application.get("business_type", "") or "").replace("_", " ").title())}
      {_detail_row("Location", location_str)}
      {_detail_row("Years in Business", str(application.get("years_in_business", "N/A")))}
      {_detail_row("Employees", str(application.get("num_employees", "N/A")))}
      {_detail_row("Certifications", certs)}
      {_detail_row("Website", application.get("website", "") or "N/A")}

      <tr><td colspan="2" style="padding:10px 12px 4px;"><p style="margin:0;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;">Contact</p></td></tr>
      {_detail_row("Name", application.get("user_name", "N/A"))}
      {_detail_row("Email", application.get("contact_email", application.get("user_email", "N/A")))}
      {_detail_row("Phone", application.get("contact_phone", "") or "N/A")}

      {verify_html}
    </table>

    {f'<div style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:12px 16px;margin-bottom:20px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;">Description</p><p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">{application.get("description", "")}</p></div>' if application.get("description") else ""}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr>
      <td width="48%" style="padding:0 4px 0 0;">
        <a href="{approve_url}" style="display:block;background:#10b981;color:#ffffff;text-decoration:none;text-align:center;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:700;">
          Approve Application
        </a>
      </td>
      <td width="48%" style="padding:0 0 0 4px;">
        <a href="{decline_url}" style="display:block;background:#ef4444;color:#ffffff;text-decoration:none;text-align:center;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:700;">
          Decline Application
        </a>
      </td>
    </tr>
    </table>

    <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;text-align:center;">
      Or review in the <a href="{APP_BASE_URL}/admin?section=operator-apps" style="color:#0ea5e9;text-decoration:underline;">Admin Panel</a>.
      These action links expire in 7 days.
    </p>"""
    return _email_shell(inner)


def build_operator_approved_email(operator_name: str, business_name: str, admin_notes: str = "") -> str:
    """Email to operator: You're approved!"""
    notes_html = ""
    if admin_notes:
        notes_html = f"""
        <div style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:12px 16px;margin:16px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0e7490;">Note from our team</p>
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">{admin_notes}</p>
        </div>"""

    inner = f"""
    <p style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:700;line-height:1.3;text-align:center;">
      Welcome aboard, {operator_name}!
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;text-align:center;">
      Great news &mdash; your operator application for <strong>{business_name}</strong> has been
      <span style="color:#10b981;font-weight:700;">approved</span> by our compliance team.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f0fdfa;border-radius:12px;border:1px solid #ccfbf1;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">You can now:</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">&#10003; Create and publish dive listings</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">&#10003; Accept bookings from divers worldwide</p>
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">&#10003; Manage your business from the Operator Dashboard</p>
    </td></tr>
    </table>

    {notes_html}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr><td style="text-align:center;">
      <a href="{APP_BASE_URL}/operator" style="display:inline-block;background:#22d3ee;color:#0f172a;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;">
        Go to Your Dashboard
      </a>
    </td></tr>
    </table>

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
      Welcome to the Bottom Time operator community. Let's help divers discover amazing underwater experiences.
    </p>"""
    return _email_shell(inner)


def build_operator_declined_email(operator_name: str, business_name: str, admin_notes: str = "") -> str:
    """Email to operator: Application not approved."""
    notes_html = ""
    if admin_notes:
        notes_html = f"""
        <div style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:12px 16px;margin:16px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#b91c1c;">Reason</p>
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">{admin_notes}</p>
        </div>"""

    inner = f"""
    <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:700;line-height:1.4;text-align:center;">
      Update on your operator application
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;text-align:center;">
      Hi {operator_name},<br><br>
      After reviewing your application for <strong>{business_name}</strong>, our compliance team
      was unable to approve it at this time.
    </p>

    {notes_html}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">What can you do?</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">&#8226; Review the feedback above and address any issues</p>
      <p style="margin:0 0 4px;font-size:12px;color:#334155;line-height:1.6;">&#8226; Ensure your business registration and documents are up to date</p>
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">&#8226; Reapply through your profile once you've made the necessary changes</p>
    </td></tr>
    </table>

    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;text-align:center;">
      Questions? Reach out at support@bottom-time.com &mdash; we're happy to help.
    </p>"""
    return _email_shell(inner)


def build_review_confirmation_html(action: str, business_name: str) -> str:
    """HTML page returned after clicking approve/decline from email."""
    is_approve = action == "approve"
    color = "#10b981" if is_approve else "#ef4444"
    icon = "&#10003;" if is_approve else "&#10007;"
    word = "approved" if is_approve else "declined"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<title>Application {word.title()} - Bottom Time</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f5;font-family:Outfit,Segoe UI,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:#fff;border-radius:20px;padding:48px;text-align:center;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
  <div style="width:64px;height:64px;border-radius:50%;background:{color};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;color:#fff;">{icon}</div>
  <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;">Application {word.title()}</h1>
  <p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 24px;">
    <strong>{business_name}</strong> has been {word}. The operator has been notified via email.
  </p>
  <a href="{APP_BASE_URL}/admin?section=operator-apps" style="display:inline-block;background:#22d3ee;color:#0f172a;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:700;">
    Back to Admin Panel
  </a>
</div>
</body>
</html>"""


async def _send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend with retry."""
    if not resend.api_key:
        logger.warning("Resend API key not configured, skipping email")
        return False
    params = {
        "from": EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "reply_to": "support@bottom-time.com",
        "html": html,
    }
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(resend.Emails.send, params),
            timeout=EMAIL_TIMEOUT,
        )
        email_id = result.get("id", "") if isinstance(result, dict) else str(result)
        logger.info(f"Email sent to {to} (subject={subject[:40]}, id={email_id})")
        return True
    except Exception as e:
        logger.error(f"Email send failed to {to}: {e}")
        return False


async def send_operator_pending_email(operator_name: str, operator_email: str, business_name: str):
    html = build_operator_pending_email(operator_name, business_name)
    await _send_email(operator_email, "We've received your operator application", html)


async def send_admin_review_email(application: dict):
    html = build_admin_review_email(application)
    biz = application.get("business_name", "New Operator")
    await _send_email(ADMIN_EMAIL, f"New Operator Application: {biz}", html)


async def send_operator_approved_email(operator_email: str, operator_name: str, business_name: str, notes: str = ""):
    html = build_operator_approved_email(operator_name, business_name, notes)
    await _send_email(operator_email, f"Welcome aboard! {business_name} is approved", html)


async def send_operator_declined_email(operator_email: str, operator_name: str, business_name: str, notes: str = ""):
    html = build_operator_declined_email(operator_name, business_name, notes)
    await _send_email(operator_email, "Update on your operator application", html)
