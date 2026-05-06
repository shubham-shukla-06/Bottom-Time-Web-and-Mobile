"""
Email template integrity test — guards against regressions in the OTP email.

Run with: cd /app/backend && python -m pytest tests/test_email_template.py -v

Asserts:
  1. The rendered email HTML contains every critical user-facing section.
  2. The Bottom Time wordmark renders as two coloured spans: "Bottom" in
     #0f172a (slate-900), "Time" in #22d3ee (cyan).
  3. The logo is a publicly fetchable absolute https:// PNG (HEAD/GET 200).
     Inline-SVG was dropped because Outlook + Gmail strip it.
  4. The full email body length is non-trivial and ends with `</html>`.
  5. The phrase "It used your email." is NOT present.
  6. There is no rounded corner anywhere — every `border-radius: ...` value
     resolves to `0` (or no `border-radius:` declarations exist).
  7. Dark-mode safety: `<meta name="color-scheme" content="light only">`
     and a `prefers-color-scheme: dark` override block are both present.
  8. Reply-to support address is NOT leaked into the visible body.
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
    assert section.lower() in html.lower(), f"critical section missing: {section!r}"


def test_otp_digits_render_as_separate_cells(html: str) -> None:
    for d in "246810":
        assert f">{d}</td>" in html, f"OTP digit {d} not rendered as a cell"


def test_logo_png_url_is_absolute_and_reachable(html: str) -> None:
    """Logo MUST be a public absolute https:// PNG (no inline SVG, no relative URL)."""
    img_match = re.search(r'<img[^>]+src="([^"]+)"[^>]*alt="Waves"', html)
    assert img_match, "Waves logo <img> not found in email"
    url = img_match.group(1)
    assert url.startswith("https://"), f"logo URL must be absolute https:// — got {url!r}"
    try:
        # Browser-like UA — the preview ingress 403s the default `Python-urllib`.
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BottomTimeTest"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            assert 200 <= resp.status < 300, f"logo URL returned {resp.status}"
            assert resp.headers.get("Content-Type", "").startswith("image/"), "logo URL not image/*"
    except Exception as e:  # pragma: no cover
        pytest.fail(f"logo URL unreachable: {url} — {e}")


def test_wordmark_has_two_coloured_spans(html: str) -> None:
    """`Bottom` slate-900 + `Time` cyan-400, in that order."""
    bottom_match = re.search(r'<span[^>]*color:\s*#0f172a[^>]*>\s*Bottom\s*</span>', html, re.IGNORECASE)
    time_match = re.search(r'<span[^>]*color:\s*#22d3ee[^>]*>\s*Time\s*</span>', html, re.IGNORECASE)
    assert bottom_match, '"Bottom" must be wrapped in a <span> with color:#0f172a'
    assert time_match, '"Time" must be wrapped in a <span> with color:#22d3ee'


def test_phrase_it_used_your_email_not_present(html: str) -> None:
    assert "it used your email" not in html.lower(), \
        '"It used your email." must NOT appear in the email body'


def test_no_rounded_corners_anywhere(html: str) -> None:
    """Every `border-radius: NNpx` value (if any) must resolve to 0."""
    radii = re.findall(r'border-radius\s*:\s*([0-9]+)\s*px', html, re.IGNORECASE)
    nonzero = [r for r in radii if int(r) > 0]
    assert not nonzero, (
        f"non-zero border-radius values found in email: {nonzero!r} — "
        "every corner must be square"
    )


def test_dark_mode_overrides_present(html: str) -> None:
    assert '<meta name="color-scheme" content="light only">' in html, \
        "color-scheme=light-only meta tag missing"
    assert "prefers-color-scheme: dark" in html, \
        "@media (prefers-color-scheme: dark) override block missing"


def test_no_support_address_in_body(html: str) -> None:
    assert "support@bottom-time.com" not in html, \
        "support@bottom-time.com leaked into email body — this is a no-reply email"
