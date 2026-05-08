"""Canonical aspect ratio for the mobile welcome-screen visible area.

The mobile auth sheet (welcome.tsx) caps at 350 px and floors at 290 px:
    SHEET_H = min(350, max(290, round(SCREEN_H * 0.5) - 10))
On the iPhone 15 Pro Max (our design target, SCREEN_W=430, SCREEN_H=932)
this resolves to SHEET_H=350 → visible area = 430 × 582 → aspect = 0.7388.

We deliberately pick the *narrowest-visible* aspect (Pro Max) so that on
shorter devices `contentFit="cover"` always fills the visible rectangle
with horizontal overflow rather than ever leaving a vertical gap.

The same constant is hardcoded into the admin UI
(frontend/src/pages/admin/WelcomeCarouselSection.js) — keep them in sync.
"""

# 430 / 582 — iPhone 15 Pro Max visible-area aspect ratio.
MOBILE_VISIBLE_ASPECT_RATIO: float = 0.7388

# Pixel target for the cropped JPEG: high enough for retina, small enough
# for a fast first paint over cellular.
CROPPED_TARGET_WIDTH_PX: int = 1500

# How much the admin's submitted crop box may deviate from the canonical
# aspect ratio before we reject it. Generous because the admin UI nominally
# locks aspect via the FixedCropper but rounding can drift a hair.
CROP_ASPECT_TOLERANCE: float = 0.02
