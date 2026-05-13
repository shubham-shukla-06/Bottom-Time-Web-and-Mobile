# 🔒 Mobile Auth Flow — LOCKED Spec

**Approved:** 2026-05-06
**Status:** LOCKED — bug-fixes only, with explicit user approval.

## Locked files

| Path | Role |
|---|---|
| `/app/mobile/app/welcome.tsx` | Splash + email entry + social sign-in |
| `/app/mobile/app/signup.tsx`  | New-user 4-step onboarding (name/role → email OTP → phone → phone OTP) |
| `/app/mobile/app/verify.tsx`  | Existing-user email-OTP login |

Routing: `/app/mobile/app/_layout.tsx` redirects to `/welcome` when no auth token is present (handled by the existing root layout / auth gate).

---

## Pinned constants

| Constant | Value | Where |
|---|---|---|
| `SHEET_H` (cap / min) | **350 / 290** (`Math.min(350, Math.max(290, Math.round(SCREEN_H * 0.5) - 10))`) | `welcome.tsx` |
| `VISIBLE_OPEN_TOP` | **180** (px above keyboard while sheet is expanded) | `welcome.tsx` |
| `ANIM_DURATION` | **200 ms** (overrides OS-reported keyboard duration) | all 3 |
| `ANIM_EASING` | **`Easing.out(Easing.cubic)`** | all 3 |
| Sheet `bottom` | **`0`** (always anchored to screen bottom) | `welcome.tsx` |
| Sheet `zIndex` | **10** | `welcome.tsx` |
| Pagination `zIndex` | **1** | `welcome.tsx` |
| Inactive dot | **6×6 borderRadius:3 circle** | `welcome.tsx` |
| Active dot | **32×6 bar** with cyan progress fill | `welcome.tsx` |
| Title fontSize | **16**, weight 700, centered | `welcome.tsx` |
| Sheet borderTopRadius | **28** | `welcome.tsx` |
| Sheet paddingBottom | **constant 28** (NOT animated) | `welcome.tsx` |

---

## Layout (welcome.tsx)

- Carousel: `<View style={StyleSheet.absoluteFill}>` containing a horizontal `FlatList` of full-bleed `ImageBackground` slides (`width: SCREEN_W, height: SCREEN_H`). No gradient overlay — image renders unfiltered through the sheet's rounded top corners.
- Auto-rotate every 4 s. Active pagination dot drives a cyan progress bar 0 → 100 % via interpolated width.
- Skip pill: glassmorphic top-right (`BlurView intensity=40 tint=dark`).
- Pagination dots: positioned `bottom: SHEET_H + 16`, hidden via `display: keyboardVisible ? 'none' : 'flex'`.
- Bottom auth sheet: `position:absolute, left:0, right:0, bottom:0`, white background, borderTopRadius 28, big shadow, `overflow: hidden`.
- Sheet content order (top → bottom): title → email input → Continue button → error → social row → legal (2-line, links open in expo-web-browser).

## Keyboard behaviour

- Sheet stays anchored at `bottom: 0` always.
- On `keyboardWillShow` / `keyboardDidShow`:
  - `sheetHeight` animates to `VISIBLE_OPEN_TOP + kbH` (= 180 + keyboard height) so the visible-above-keyboard region is exactly 180 px (paddingTop 24 + title 22 + marginBottom 14 + email 52 + marginBottom 12 + Continue 52 + ~4 px buffer).
  - `setKeyboardVisible(true)` hides the pagination row.
- On `keyboardWillHide` / `keyboardDidHide`: `sheetHeight` animates back to `SHEET_H`.
- Inner `paddingBottom` is **constant 28** — content (title, email, Continue) flows from the top; social row and legal text render BELOW the keyboard line and are obscured by the keyboard.
- `signup.tsx` and `verify.tsx` use a sibling pattern: full-screen safe-area form, body wrapped in `<Animated.View transform: translateY(bodyTranslateY)>`. On show, translates up by `-(kbH - insets.bottom)`. On hide, back to 0.

## Animation params

- `Animated.timing` with `useNativeDriver: false` for layout properties (sheetHeight) and `useNativeDriver: true` for transform-based listeners (bodyTranslateY in signup/verify).
- Duration: fixed 200 ms (overrides `e.duration`).
- Easing: `Easing.out(Easing.cubic)` — snappy "Zomato-like" feel.

## Approval note

User reviewed welcome / signup / verify keyboard + sheet behaviour on 2026-05-06 and approved the current state. Layout, animations, sheet height, keyboard behaviour, pagination styling and z-order are now LOCKED. Any future change must be requested explicitly.

---

## Appendix — file dumps (recovery checkpoint)

The full sources of `welcome.tsx`, `signup.tsx`, and `verify.tsx` as of the approval date are stored alongside this doc:

- `/app/memory/locked/welcome.tsx`
- `/app/memory/locked/signup.tsx`
- `/app/memory/locked/verify.tsx`

If the live files drift, restore from the checkpoint copies above (preserving the lock comment block at the top of each).

---

## 2026-05-12 — LOCKED EDIT (explicit visual-only unlock)

**File:** `/app/mobile/app/welcome.tsx`
**Scope:** Restore image bleed behind the auth-sheet's rounded top corners.
**Change:** `visibleH` extended by `SHEET_CORNER_RADIUS` (28 px). Credit-text
`bottom` offset bumped by the same 28 px so its on-screen position relative
to the sheet's top edge is unchanged (still 30 px above the white sheet).
**Risk:** Cosmetic only — no auth flow, animation timing, sheet height,
slide rotation, biometric prompt, or sign-in routing touched.
**Diff:**
```diff
- const visibleH = SCREEN_H - SHEET_H;
+ const SHEET_CORNER_RADIUS = 28;
+ const visibleH = SCREEN_H - SHEET_H + SHEET_CORNER_RADIUS;
```
```diff
- <Text style={[styles.slideCredit, { bottom: 30 }]} numberOfLines={1}>
+ <Text style={[styles.slideCredit, { bottom: 30 + SHEET_CORNER_RADIUS }]} numberOfLines={1}>
```
**Rationale:** Previously-perfected behaviour (rounded corners reveal image
through them) had regressed when the slide clip was tightened to the
visible-area exactly. Brief required restoration with explicit unlock for
this single visual change. Logic unchanged.

---

## 2026-05-13 — Visual-only constant bump

Bumped `SHEET_CORNER_RADIUS` 28 → 44 in `welcome.tsx` (visual-only;
matches iPhone display corner radius). Hardcoded `borderTopLeftRadius:
28, borderTopRightRadius: 28` in `styles.sheet` also bumped to 44 to
match. Image-bleed math derived from the constant
(`visibleH = SCREEN_H - SHEET_H + SHEET_CORNER_RADIUS`) so it tracks
automatically — no other change required. No logic touched.
