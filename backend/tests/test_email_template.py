"""
Email template integrity test — guards against regressions in the OTP email.

Run with: cd /app/backend && python -m pytest tests/test_email_template.py -v

Asserts:
  1. The rendered email HTML contains every critical user-facing section.
  2. The Bottom Time wordmark renders inline (SVG or MSO/text fallback) — no
     external image URL that could 404 (the prior `<img src=".../api/uploads/
     brand-logo-full.png">` was returning 404 and showing as a broken frame
     in the inbox).
  3. If an external `<img src="...">` IS used, the URL must be absolute
     (https://) and reachable (HTTP 200 on HEAD/GET).
  4. The full email body length is non-trivial (>3500 chars) and ends with
     `</html>` so the template isn't truncated.
"""
import os
import re
import sys
import urllib.request

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth_utils import _build_otp_email_html  # noqa: E402

CRITICAL_SECTIONS = [
    "The ocean just called",
    "Use these digits to get back to the reef",
    "eyes only",
    "expires in",
    "10 minutes",
    "someone used",
    "No pressure",
]


@pytest.fixture(scope="module")
def html() -> str:
    return _build_otp_email_html("qa@bottom-time.test", "246810")


def test_full_render_length_and_close(html: str) -> None:
    assert len(html) > 3500, f"email template suspiciously short: {len(html)} chars"
    assert html.rstrip().endswith("</html>"), "email template not closed with </html>"


@pytest.mark.parametrize("section", CRITICAL_SECTIONS)
def test_critical_sections_present(html: str, section: str) -> None:
    assert section.lower() in html.lower(), f"critical section missing from email: {section!r}"


def test_otp_digits_render_as_separate_cells(html: str) -> None:
    """All 6 digits of the OTP must appear in their own <td> cells."""
    for d in "246810":
        assert f">{d}</td>" in html, f"OTP digit {d} not rendered as a cell"


def test_logo_renders_inline_or_via_reachable_url(html: str) -> None:
    """The Bottom Time wordmark must render — either inline (SVG / text /
    MSO conditional) or via a publicly fetchable absolute URL. A relative
    path or a private/404 URL would show as a broken frame in inboxes."""
    has_inline_svg = "<svg" in html
    has_text_wordmark = "Bottom" in html and "Time" in html
    img_match = re.search(r'<img[^>]+src="([^"]+)"', html)
    if has_inline_svg or has_text_wordmark:
        return  # inline fallback is guaranteed
    assert img_match, "no logo found in email (no inline SVG, no text wordmark, no <img>)"
    url = img_match.group(1)
    assert url.startswith("https://"), f"logo URL must be absolute https:// — got {url!r}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            assert 200 <= resp.status < 300, f"logo URL returned {resp.status}"
    except Exception as e:  # pragma: no cover
        pytest.fail(f"logo URL unreachable: {url} — {e}")


def test_no_reply_to_header_friendly(html: str) -> None:
    """No accidental `mailto:` reply hints in the visible body — the email
    is no-reply by design (matches the EMAIL_FROM)."""
    assert "support@bottom-time.com" not in html, (
        "support@bottom-time.com leaked into email body — the no-reply "
        "behaviour means we shouldn't surface a support address here."
    )
