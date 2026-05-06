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
    """Logo MUST be ONE pre-rendered PNG (waves icon + wordmark + cyan
    underline baked in). Single absolute https:// PNG, HEAD/GET 200,
    content-type image/*."""
    img_match = re.search(r'<img[^>]+src="([^"]+)"[^>]*alt="Bottom Time"', html)
    assert img_match, "Bottom Time logo <img> not found in email"
    url = img_match.group(1)
    assert url.endswith("logo-bottomtime-email.png"), \
        f"logo URL must point at logo-bottomtime-email.png — got {url!r}"
    assert url.startswith("https://"), f"logo URL must be absolute https:// — got {url!r}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BottomTimeTest"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            assert 200 <= resp.status < 300, f"logo URL returned {resp.status}"
            ctype = resp.headers.get("Content-Type", "")
            assert ctype.startswith("image/png"), f"logo URL not image/png — got {ctype!r}"
    except Exception as e:  # pragma: no cover
        pytest.fail(f"logo URL unreachable: {url} — {e}")


def test_wordmark_is_baked_into_png_no_inline_spans(html: str) -> None:
    """Wordmark used to be two coloured <span> elements; now it lives inside
    the PNG. Assert there are NO `<span>` elements containing the literal
    text "Bottom" or "Time" with a `color:` attribute — they would defeat
    the whole "single PNG" robustness fix."""
    bad_bottom = re.search(r'<span[^>]*color:[^>]*>\s*Bottom\s*</span>', html, re.IGNORECASE)
    bad_time = re.search(r'<span[^>]*color:[^>]*>\s*Time\s*</span>', html, re.IGNORECASE)
    assert not bad_bottom, "Stray <span color=...>Bottom</span> found — wordmark belongs in the PNG"
    assert not bad_time, "Stray <span color=...>Time</span> found — wordmark belongs in the PNG"


def test_no_cyan_border_bottom_underline(html: str) -> None:
    """The cyan underline used to be a separate `border-bottom`. After the
    PNG refactor it lives inside the image. Assert no `border-bottom: ... #22d3ee`
    declarations leak through."""
    cyan_borders = re.findall(r'border-bottom\s*:\s*[^;"]*#22d3ee', html, re.IGNORECASE)
    assert not cyan_borders, (
        f"Found {len(cyan_borders)} cyan border-bottom declaration(s) — "
        "the underline must live in the logo PNG, not in CSS"
    )


def test_phrase_it_used_your_email_not_present(html: str) -> None:
    assert "it used your email" not in html.lower(), \
        '"It used your email." must NOT appear in the email body'


def test_phrase_ocean_just_called_not_present(html: str) -> None:
    """Removed in 2026-05-06 evening polish — keep gone for good."""
    assert "ocean just called" not in html.lower(), \
        '"The ocean just called" line must NOT appear in the email body'


def test_body_and_outer_wrapper_white(html: str) -> None:
    """Both <body> and the outer 100%-width wrapper table must be pure
    white. Earlier the outer was `#f0f4f5` slate which produced a grey
    band above and below the content card."""
    body_tag = re.search(r'<body[^>]*style="[^"]*background-color:\s*([^;"\s]+)', html)
    assert body_tag, "<body> tag with inline style not found"
    bg = body_tag.group(1).lower()
    assert bg in ("#fff", "#ffffff", "white"), f"body background must be white — got {bg!r}"
    # Now the OUTER 100% wrapper:
    outer = re.search(r'<table[^>]*width="100%"[^>]*style="[^"]*background-color:\s*([^;"\s]+)', html)
    assert outer, "outer 100%-width wrapper <table> not found"
    obg = outer.group(1).lower()
    assert obg in ("#fff", "#ffffff", "white"), f"outer wrapper background must be white — got {obg!r}"


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
