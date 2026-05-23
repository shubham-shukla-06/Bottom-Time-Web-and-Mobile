"""
Phase 5-A — Re-runnable app-icon renderer.

Source of truth: the navbar's `<Waves />` lucide-react icon.
Brand palette (sampled from the live app):
  - background:  slate-900 #0f172a   (LandingPage.js:271, manifest theme_color)
  - accent:      cyan-400  #22d3ee   (Navbar.js:59 — text-cyan-400 on Waves)
  - secondary:   slate-800 #1e293b   (Tailwind sibling — used for the gradient toe)

The output lives in /app/backend/static/branding/. Re-run this whenever the
brand colors shift or the icon source changes:

    python3 /app/backend/scripts/render_app_icon.py

Locked behavior — see /app/memory/BRANDING_ASSETS_LOCKED.md.
"""
from __future__ import annotations

import io
import os
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter

# ─── Brand palette ──────────────────────────────────────────────────────────
BG_TOP = (15, 23, 42)        # slate-900  #0f172a
BG_BOTTOM = (30, 41, 59)     # slate-800  #1e293b
ACCENT = "#22d3ee"           # cyan-400 — Lucide Waves stroke colour

# ─── Lucide Waves SVG (copied verbatim from lucide-react v0.507.0) ──────────
# This is the canonical Waves icon from lucide-static / lucide-react. It is
# a 24×24 viewBox, three horizontal wave paths. We stroke it in cyan-400 with
# a slightly thicker width (2.5 instead of 2) so the small 100×100 render is
# crisp and reads as a logo, not a body-text icon.
LUCIDE_WAVES_SVG = """<svg xmlns="http://www.w3.org/2000/svg"
    width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="{stroke}" stroke-width="{sw}"
    stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
  <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
  <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
</svg>"""

# Sizes to produce. 100 is the explicit ask; rest cover iOS @2x/@3x, Android,
# PWA manifest, favicon high-DPI.
SIZES = [32, 64, 100, 120, 180, 192, 512, 1024]
OUT_DIR = Path(__file__).resolve().parent.parent / "static" / "branding"


def _radial_inner_glow(size: int) -> Image.Image:
    """A soft radial highlight blended over the gradient bg. Sells 'depth'
    on the larger sizes without looking AI-generated on the small ones."""
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    # A subtle cyan halo, biased toward upper-center
    cx, cy = size // 2, int(size * 0.45)
    r = int(size * 0.55)
    # Soft cyan overlay, then blur heavily so it just lifts the centre.
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(34, 211, 238, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.18))
    return glow


def _make_background(size: int) -> Image.Image:
    """Vertical gradient slate-900 → slate-800 + faint cyan glow.
    Tailwind already publishes these as the dominant dark surface, so the
    icon reads as 'part of the app' on every store thumbnail page."""
    bg = Image.new("RGB", (size, size), BG_TOP)
    px = bg.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    out = bg.convert("RGBA")
    out.alpha_composite(_radial_inner_glow(size))
    return out


def _rounded_square_mask(size: int, radius_pct: float = 0.225) -> Image.Image:
    """iOS-style rounded-corner mask (~22.5% radius). Cleaner than full
    squircle and matches what Apple/Android stores render anyway."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * radius_pct)
    draw.rounded_rectangle((0, 0, size, size), radius=r, fill=255)
    return mask


def _rasterize_waves(target_px: int) -> Image.Image:
    """Rasterize the SVG at the desired pixel size. Stroke-width nudged up
    for small renders so the lines don't fade out at favicon scales."""
    sw = 2.0 if target_px >= 256 else (2.4 if target_px >= 128 else 2.8)
    svg = LUCIDE_WAVES_SVG.format(stroke=ACCENT, sw=sw)
    png_bytes = cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        output_width=target_px,
        output_height=target_px,
    )
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def render(size: int) -> Image.Image:
    bg = _make_background(size)

    # 12% padding on all sides → icon occupies the central 76% box.
    inner = int(size * 0.76)
    icon = _rasterize_waves(inner)
    pad = (size - inner) // 2
    bg.alpha_composite(icon, dest=(pad, pad))

    # Apply iOS-style rounded mask so the icon previews correctly on the
    # admin section and in the App Store thumbnail row.
    mask = _rounded_square_mask(size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        img = render(s)
        path = OUT_DIR / f"app_icon_{s}.png"
        img.save(str(path), "PNG", optimize=True)
        print(f"  wrote {path}  ({os.path.getsize(path):,} bytes)")
    # Multi-size .ico
    master = render(1024)
    ico_path = OUT_DIR / "favicon.ico"
    master.save(str(ico_path), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print(f"  wrote {ico_path}  ({os.path.getsize(ico_path):,} bytes)")
    print("Done.")


if __name__ == "__main__":
    main()
