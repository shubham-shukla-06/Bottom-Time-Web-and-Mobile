"""Auto-generate 1200x630 social preview cards for listings.
Cached on disk; invalidated by listing.updated_at.
"""
import io
import os
import hashlib
from pathlib import Path
from typing import Optional, Tuple

import httpx
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cairosvg

CACHE_DIR = Path("/app/backend/og_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

FONT_DIR = "/app/backend/fonts"
FONT_BLACK = f"{FONT_DIR}/Outfit-Black.ttf"
FONT_BOLD = f"{FONT_DIR}/Outfit-Bold.ttf"
FONT_SEMI = f"{FONT_DIR}/Outfit-SemiBold.ttf"
FONT_MED = f"{FONT_DIR}/Outfit-Medium.ttf"
FONT_REG = f"{FONT_DIR}/Outfit-Regular.ttf"

W, H = 1200, 630
CYAN = (34, 211, 238)
CYAN_SOFT = (103, 232, 249)
WHITE = (255, 255, 255)
WHITE_85 = (255, 255, 255, 217)
DARK = (15, 23, 42)
DARK_GLASS = (15, 23, 42, 105)  # plate tint — translucent, true glass morphism
SLATE_300 = (203, 213, 225)

TAGLINE = "THE OCEAN IS CALLING."

# Hard size budget: WhatsApp drops OG images > 600 KB. Stay well under so
# previews work across WhatsApp, LinkedIn, X, Facebook, Telegram, iMessage.
MAX_OG_BYTES = 300_000
JPEG_QUALITY_STEPS = (88, 82, 75, 68, 60, 52, 45)


def _cache_key(listing_id: str, updated_at: Optional[str]) -> str:
    raw = f"{listing_id}:{updated_at or ''}"
    return hashlib.md5(raw.encode()).hexdigest()


def _font(size: int, weight: str = "bold") -> ImageFont.FreeTypeFont:
    path = {
        "black": FONT_BLACK,
        "bold": FONT_BOLD,
        "semi": FONT_SEMI,
        "medium": FONT_MED,
        "regular": FONT_REG,
    }.get(weight, FONT_BOLD)
    return ImageFont.truetype(path, size)


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, max_lines: int = 2) -> list:
    if not text:
        return [""]
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        if font.getlength(test) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) == max_lines and font.getlength(current) > max_width:
        # truncate last line with ellipsis
        last = lines[-1]
        while last and font.getlength(last + "…") > max_width:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


async def _fetch_image_bytes(url: str) -> Optional[bytes]:
    if not url:
        return None
    # Local operator-uploaded photos are stored as relative URLs (e.g.
    # "/api/uploads/abc.jpg"). httpx cannot resolve relative URLs, so read
    # them directly from disk — same path StaticFiles serves them from.
    if url.startswith("/api/uploads/"):
        try:
            from config import UPLOAD_DIR
            filename = url[len("/api/uploads/"):]
            path = UPLOAD_DIR / filename
            if path.exists():
                return path.read_bytes()
        except Exception:
            pass
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8) as c:
            r = await c.get(url)
            if r.status_code == 200:
                return r.content
    except Exception:
        return None
    return None


def _build_background(img_bytes: Optional[bytes]) -> Image.Image:
    """Crop photo to 1200x630 with a center-fill, fall back to ocean gradient."""
    base = Image.new("RGB", (W, H), DARK)
    if not img_bytes:
        # ocean gradient fallback
        draw = ImageDraw.Draw(base)
        for y in range(H):
            t = y / H
            r = int(15 * (1 - t) + 8 * t)
            g = int(23 * (1 - t) + 51 * t)
            b = int(42 * (1 - t) + 90 * t)
            draw.line([(0, y), (W, y)], fill=(r, g, b))
        return base
    try:
        photo = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception:
        return base
    # center-crop to aspect 1200/630
    target_aspect = W / H
    src_w, src_h = photo.size
    src_aspect = src_w / src_h
    if src_aspect > target_aspect:
        new_w = int(src_h * target_aspect)
        left = (src_w - new_w) // 2
        photo = photo.crop((left, 0, left + new_w, src_h))
    else:
        new_h = int(src_w / target_aspect)
        top = (src_h - new_h) // 2
        photo = photo.crop((0, top, src_w, top + new_h))
    photo = photo.resize((W, H), Image.LANCZOS)
    return photo


# ── Bottom glass bar (Apple-style, stuck to image bottom) ──────────────
CARD_H = 180
CARD_X = 0
CARD_Y = H - CARD_H
CARD_W = W


def _make_floating_glass_card(photo: Image.Image) -> Image.Image:
    """Apple-style glass bar — backdrop-blurred photo strip, translucent dark
    tint, top hairline only. No rounded corners (sticks to image bottom edge).
    """
    region = photo.crop((CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H))
    blurred = region.filter(ImageFilter.GaussianBlur(radius=40)).convert("RGBA")
    tint = Image.new("RGBA", (CARD_W, CARD_H), (15, 23, 42, 33))
    card = Image.alpha_composite(blurred, tint)
    # Top hairline (frosted-glass edge)
    hair = ImageDraw.Draw(card)
    hair.line([(0, 0), (CARD_W, 0)], fill=(255, 255, 255, 90), width=1)
    hair.line([(0, 1), (CARD_W, 1)], fill=(255, 255, 255, 30), width=1)
    return card


def _icon_layer(size_target: int, scale: int = 4):
    """Supersampled RGBA canvas for anti-aliased icons. Returns (layer, draw, scale)."""
    s = size_target * scale
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer), scale


def _rgba(c) -> Tuple[int, int, int, int]:
    return c if len(c) == 4 else (*c, 255)


def _draw_lucide_waves(target: Image.Image, x: int, y: int, size: int = 32, color=CYAN, stroke: float = 2.0):
    """Lucide 'Waves' icon — pixel-perfect render of the official SVG paths.
    Matches the navbar logo unit exactly (`<Waves />` from lucide-react).
    """
    r, g, b = color[:3]
    # Official Lucide v0.475 'waves' paths, 24x24 viewBox, stroke-linecap=round, stroke-linejoin=round.
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
fill="none" stroke="rgb({r},{g},{b})" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">
<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
<path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
<path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
</svg>"""
    png_bytes = cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                                 output_width=size * 4, output_height=size * 4)
    icon = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    icon = icon.resize((size, size), Image.LANCZOS)
    target.alpha_composite(icon, (x, y))


def _draw_lucide_mappin(target: Image.Image, x: int, y: int, size: int = 28, color=WHITE, stroke: float = 2.2):
    """Lucide 'MapPin' — outline teardrop with hollow circle."""
    layer, draw, scale = _icon_layer(size)
    s = size * scale
    sw = max(2, int(stroke * scale))
    rgba = _rgba(color)
    pad = s * 0.10
    cx = s / 2
    r = (s - 2 * pad) * 0.36
    cy_top = pad + r
    bbox = (cx - r, cy_top - r, cx + r, cy_top + r)
    draw.arc(bbox, start=180, end=360, fill=rgba, width=sw)
    tip_y = s - pad * 0.55
    draw.line([(cx - r, cy_top), (cx, tip_y)], fill=rgba, width=sw)
    draw.line([(cx + r, cy_top), (cx, tip_y)], fill=rgba, width=sw)
    inner_r = r * 0.42
    draw.ellipse((cx - inner_r, cy_top - inner_r, cx + inner_r, cy_top + inner_r), outline=rgba, width=sw)
    layer = layer.resize((size, size), Image.LANCZOS)
    target.alpha_composite(layer, (x, y))


def _draw_lucide_star(target: Image.Image, x: int, y: int, size: int = 24, color=(250, 204, 21), filled: bool = True):
    """Lucide 'Star' — 5-point, filled."""
    import math
    layer, draw, scale = _icon_layer(size)
    s = size * scale
    rgba = _rgba(color)
    cx, cy = s / 2, s / 2
    r_outer = s / 2 * 0.96
    r_inner = r_outer * 0.46
    pts = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        r = r_outer if i % 2 == 0 else r_inner
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    if filled:
        draw.polygon(pts, fill=rgba)
    else:
        for j in range(10):
            draw.line([pts[j], pts[(j + 1) % 10]], fill=rgba, width=max(2, int(2 * scale)))
    layer = layer.resize((size, size), Image.LANCZOS)
    target.alpha_composite(layer, (x, y))


def _draw_tracked(target: Image.Image, x: int, y: int, text: str, font: ImageFont.FreeTypeFont, color, tracking: int = 4) -> int:
    """Draw text with extra letter-spacing. Returns total drawn width (px)."""
    draw = ImageDraw.Draw(target)
    cx = x
    rgba = _rgba(color)
    for ch in text:
        draw.text((cx, y), ch, font=font, fill=rgba)
        cx += int(font.getlength(ch)) + tracking
    return cx - x


def _render(listing: dict, photo_bytes: Optional[bytes]) -> bytes:
    # 1. Hero photo — full bleed, untouched.
    photo = _build_background(photo_bytes)
    img = photo.convert("RGBA")

    # 2. Bottom glass bar (sticks to image bottom edge, full width)
    card = _make_floating_glass_card(photo)
    img.alpha_composite(card, (CARD_X, CARD_Y))

    draw = ImageDraw.Draw(img)
    pad_x = 48
    pad_y = 26

    # ── Eyebrow tagline (top of bar, left-aligned) ─────────────────
    f_tagline = _font(22, "black")
    f_meta = _font(22, "medium")
    meta_color = (226, 232, 240, 255)
    eyebrow_y = CARD_Y + pad_y
    _draw_tracked(img, CARD_X + pad_x, eyebrow_y, TAGLINE, f_tagline, CYAN, tracking=4)

    # ── Title — Outfit Black 54, white, single line, fits card width ─
    title = (listing.get("title") or listing.get("name") or "Untitled Listing").strip()
    f_title = _font(54, "black")
    title_w_max = CARD_W - pad_x * 2
    title_lines = _wrap_text(title, f_title, max_width=title_w_max, max_lines=1)
    title_y = eyebrow_y + 30
    draw.text((CARD_X + pad_x, title_y), title_lines[0], font=f_title, fill=WHITE)

    # ── Location — under title (MapPin + text) ─────────────────────
    loc = (listing.get("location") or "").strip()
    country = (listing.get("country") or "").strip()
    if country and country.lower() in loc.lower():
        location = loc
    elif loc and country:
        location = f"{loc}, {country}"
    else:
        location = loc or country

    if location:
        meta_y = title_y + 70
        pin_size = 22
        _draw_lucide_mappin(img, CARD_X + pad_x, meta_y - 1, size=pin_size, color=CYAN, stroke=2.4)
        draw.text((CARD_X + pad_x + pin_size + 8, meta_y), location, font=f_meta, fill=meta_color)

    # ── Brand lockup TOP-RIGHT (62 icon + 40 text + ™), no shadow ──
    brand_text = "Bottom Time"
    f_brand = _font(40, "bold")
    f_tm = _font(20, "bold")
    waves_size = 62
    gap = 16
    tm_text = "\u2122"
    track = -0.025 * 40

    chars = list(brand_text)
    text_w = int(sum(f_brand.getlength(c) for c in chars) + track * (len(chars) - 1))

    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    bm_bbox = probe.textbbox((0, 0), brand_text, font=f_brand)
    tm_bbox = probe.textbbox((0, 0), tm_text, font=f_tm)
    bm_ink_top = bm_bbox[1]
    tm_ink_top = tm_bbox[1]
    tm_w = tm_bbox[2] - tm_bbox[0]
    tm_gap = 6

    brand_block_w = waves_size + gap + text_w + tm_gap + tm_w
    brand_x = W - 56 - brand_block_w
    icon_top = 44

    bm_cap_h = bm_bbox[3] - bm_bbox[1]
    text_top = icon_top + (waves_size - bm_cap_h) // 2 - bm_ink_top

    _draw_lucide_waves(img, brand_x, icon_top, size=waves_size, color=CYAN, stroke=2.0)

    cx = brand_x + waves_size + gap
    for ch in chars:
        draw.text((cx, text_top), ch, font=f_brand, fill=WHITE)
        cx += int(f_brand.getlength(ch) + track)

    wordmark_cap_top = text_top + bm_ink_top
    tm_y = wordmark_cap_top - tm_ink_top
    draw.text((cx + tm_gap, tm_y), tm_text, font=f_tm, fill=WHITE)

    return _encode_under_budget(img.convert("RGB"))


def _encode_under_budget(img: Image.Image) -> bytes:
    """Encode the OG card as JPEG and progressively lower quality until under
    `MAX_OG_BYTES`. Guarantees compatibility with WhatsApp's 600 KB hard limit
    for link-preview images while keeping LinkedIn/X/Facebook quality high.
    """
    rgb = img.convert("RGB") if img.mode != "RGB" else img
    last = None
    for q in JPEG_QUALITY_STEPS:
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=q, optimize=True, progressive=True, subsampling=2)
        data = buf.getvalue()
        last = data
        if len(data) <= MAX_OG_BYTES:
            return data
    # Final fallback: hard downscale + min quality (rare; only if photo was extreme)
    small = rgb.resize((900, 472), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=40, optimize=True, progressive=True, subsampling=2)
    data = buf.getvalue()
    return data if len(data) <= MAX_OG_BYTES else (last or data)


async def generate_og_image(listing: dict) -> bytes:
    """Generate (or fetch from cache) the OG image bytes (JPEG, < 300 KB)."""
    cache_key = _cache_key(listing.get("id", ""), listing.get("updated_at"))
    cache_path = CACHE_DIR / f"{cache_key}.jpg"
    if cache_path.exists():
        return cache_path.read_bytes()

    photo_url = None
    photos = listing.get("photos") or []
    if photos:
        first = photos[0]
        photo_url = first.get("url") if isinstance(first, dict) else first
    photo_url = photo_url or listing.get("image_url")

    photo_bytes = await _fetch_image_bytes(photo_url) if photo_url else None
    jpg = _render(listing, photo_bytes)

    try:
        cache_path.write_bytes(jpg)
    except Exception:
        pass

    # Best-effort: clean older caches for the same listing id (different updated_at)
    try:
        # Prune both legacy .png and new .jpg caches when they grow too large
        all_files = list(CACHE_DIR.glob("*.jpg")) + list(CACHE_DIR.glob("*.png"))
        if len(all_files) > 200:
            for f in all_files:
                if f.stem != cache_key:
                    try:
                        f.unlink()
                    except OSError:
                        pass
    except Exception:
        pass

    return jpg
