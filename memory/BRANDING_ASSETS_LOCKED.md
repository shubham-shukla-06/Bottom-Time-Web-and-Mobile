# Branding Assets — LOCKED behaviors

> **All agents must read this before touching branding/app-icon code.**
> The app store icon is the **only** logo asset rendered through this
> pipeline. Other brand assets (landing video, hero images, carousel
> slides) live in the CMS and are NOT affected by this lock.

Pinned context:
- Source of truth for the brand mark: the navbar's `<Waves />` lucide-react
  icon at `frontend/src/components/Navbar.js:59` — `text-cyan-400`.
- Brand palette sampled live:
  - background: **flat white `#FFFFFF`** — user-locked decision (2026-05-23).
    Was previously a `slate-900 #0f172a → slate-800 #1e293b` gradient with a
    faint cyan radial glow; switched to white because the cyan-400 Waves
    reads stronger on a clean white plate across every device store
    thumbnail. The dark-gradient code path is removed from the renderer.
  - accent: `cyan-400 #22d3ee` — Lucide Waves stroke colour (unchanged)
- Re-runnable renderer: `/app/backend/scripts/render_app_icon.py`

Last verified locked: **2026-05-23** by smoke:
- All 8 sizes generated (32/64/100/120/180/192/512/1024) + favicon.ico
- API smokes: `GET /api/branding/app-icon?size=100,512,1024` → 200 image/png
- Visual check (Gemini analysis): PASS on all 4 criteria
  (lines clear, gradient brand-consistent, corners clean, not AI-looking)

---

## Lock B1 — Static directory is authoritative

### Files
| Path | Role |
|---|---|
| `/app/backend/static/branding/app_icon_{32,64,100,120,180,192,512,1024}.png` | Derivative PNGs |
| `/app/backend/static/branding/favicon.ico` | Multi-size 16/32/48/64 |
| `/app/backend/scripts/render_app_icon.py` | Re-runnable renderer (Lucide Waves → rasterised PNG) |
| `/app/frontend/public/favicon.ico` | Copy of the master favicon for direct-serve |
| `/app/frontend/public/apple-touch-icon.png` | 180×180 derivative |
| `/app/frontend/public/favicon-32.png` / `favicon-64.png` | High-DPI derivatives for `<link rel="icon">` |
| `/app/mobile/assets/icons/app_icon_1024.png` | Master used by `app.json expo.icon` |

### Invariants (DO NOT VIOLATE)
1. **Never edit the PNGs directly.** They are renderer output. To change the
   icon: edit `render_app_icon.py` (palette, padding, source SVG) and re-run.
2. **The renderer is committed.** Re-running with no edits must produce
   byte-identical output. PIL + cairosvg are deterministic.
3. **`POST /api/admin/branding/app-icon`** atomically replaces ALL
   derivatives in one request — never leaves the directory half-updated.
   It also bumps `site_settings.app_icon_updated_at` so the admin UI shows
   when the icon last changed.

---

## Lock B2 — Endpoint contract

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/branding/app-icon?size=N` | Public | Streams matching PNG. Sizes accepted: 32, 64, 100, 120, 180, 192, 512, 1024. Falls back to nearest-larger. `Cache-Control: public, max-age=3600`. |
| GET | `/api/branding/favicon.ico` | Public | Streams the multi-size ICO. `Cache-Control: public, max-age=86400`. |
| GET | `/api/branding/app-icon.zip` | Public | All sizes + README + favicon as `bottom-time-app-icons.zip`. Use this for App Store submission. |
| GET | `/api/admin/branding/app-icon/info` | Admin | Lists `sizes[]`, `favicon_ico_exists`, `updated_at`, `uploaded_by`, `zip_url`. |
| POST | `/api/admin/branding/app-icon` | **Super-admin** (`SUPER_ADMINS` config) | Multipart upload. Validates: PNG content-type, ≤10MB, square, ≥1024×1024. Regenerates all derivatives + favicon. Records `app_icon_updated_at` + `app_icon_uploaded_by` in `site_settings`. |

### Critical invariants
1. **Super-admin gate on POST.** Same auth pattern as `/admin/refunds/create`. Plain admin role insufficient.
2. **Client-side validation in `BrandingSection.js`** must mirror server-side: PNG only, square, ≥1024×1024. Server is the source of truth — never disable the server check.
3. **All file writes use `.tmp` + `os.replace`.** Atomic rename so a partial regeneration doesn't leave the directory in a half-old/half-new state.
4. **Cache headers are deliberate.** 1h for PNG, 1d for favicon. Browsers/CDNs cache aggressively; admin UI cache-busts via `?_={timestamp}` after upload.

---

## Lock B3 — Renderer policy

### Why a renderer (not hand-drawn PNGs)?
The brand mark is the Lucide Waves icon. Treating the navbar icon as the
source of truth means the app store icon stays in sync with the live UI by
construction. If the brand palette shifts (e.g. cyan-400 → cyan-500), one
script edit + one `python3 render_app_icon.py` propagates everywhere.

### What the renderer does
1. Rasterises the Lucide Waves SVG (24×24 viewBox, three horizontal wave
   paths, stroke-width 2.0 nominal — bumped to 2.4 / 2.8 for ≤256 / ≤128
   renders so the lines stay readable at favicon scales).
2. Composites onto a vertical `#0f172a → #1e293b` gradient with a subtle
   centred cyan radial highlight (~10% alpha, blurred ~18% of size).
3. Applies an iOS-style rounded-square mask (22.5% corner radius).
4. Writes optimised PNGs for every size in `SIZES = [32,64,100,120,180,192,512,1024]`.
5. Builds a multi-size favicon.ico from the 1024 master with embedded
   16/32/48/64 layers.

### Critical invariants (DO NOT VIOLATE)
1. **The SVG markup in the script is the canonical Waves.** Copied verbatim
   from `lucide-react@0.507.0/dist/esm/icons/waves.js`. If lucide-react
   ships a new Waves path, sync it back into the script — don't import the
   icon at runtime (cairosvg can't read React components).
2. **Brand palette constants live at the top of the script.** Editing those
   3 constants + rerunning is the supported way to rebrand.
3. **Output sizes set is editable.** Adding new sizes requires:
   - Add to `SIZES` in the script
   - Add to `DERIVATIVE_SIZES` in `routes/branding.py`
   - Re-run the script
4. **Stroke-width is size-aware** (2.8 for ≤128, 2.4 for ≤256, 2.0 above).
   This keeps the small renders crisp without bloating the large ones.

---

## Lock B4 — Admin UI

### Location
- **Admin section**: `Content` group → `Branding & App Icon` (key: `branding`)
- **Component**: `frontend/src/pages/admin/BrandingSection.js`
- **Sidebar entry**: `frontend/src/pages/admin/constants.js` (between `gating-content` and `waitlist` — natural IA cluster with other brand-facing content tools)

### Why under Content, not under Trust/Compliance or Platform?
- The icon is rendered on the public-facing app stores, the navbar logo card, the favicon, and PWA install screens. It is **outbound brand content**, not platform-monitoring or regulatory compliance.
- Adjacent admin tools (`landing-content`, `welcome-carousel`, `gating-content`) are also outbound brand surfaces — the Content group is the natural cluster.

### UI invariants (DO NOT VIOLATE)
1. Preview must show **100×100 and 512×512 side-by-side** (100 is the user's
   explicit ask; 512 is the App Store listing thumbnail).
2. The upload zone supports both **click and drag-drop**.
3. Client-side dimension validation **must** run before the multipart POST.
4. **Cache-bust** the preview after a successful upload by appending
   `?_={Date.now()}` to every icon `src` (otherwise the user sees the old
   icon thanks to the 1h `Cache-Control`).
5. The "Last updated" / "Uploaded by" line must always render — fall back
   to "Master image (initial)" when `site_settings` has no record.
6. The amber warning banner explaining cache behaviour + mobile-app-build
   caveat must remain.

---

## Lock B5 — Frontend manifest + favicon wiring

| File | Reference |
|---|---|
| `frontend/public/index.html` | `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`, plus 32/64 PNGs and apple-touch-icon |
| `frontend/public/manifest.json` | `icons[]` array with 32, 64, 180 (static) + 192 + 512 (served from `/api/branding/app-icon?size=N`) |
| `frontend/public/favicon.ico` | Copy of `backend/static/branding/favicon.ico` |
| `frontend/public/favicon-32.png` / `favicon-64.png` / `apple-touch-icon.png` | Copies of the matching derivatives |
| `mobile/app.json` | `"icon": "./assets/icons/app_icon_1024.png"` (master copy) |

### Invariants
1. The 4 static copies in `public/` mirror the backend's authoritative
   derivatives. After running the renderer, **copy them across** — the
   upload endpoint does this server-side via its own logic; the renderer
   script does NOT (it's a backend-only artefact).
2. The manifest's 192 + 512 icons deliberately reference the API
   (`/api/branding/app-icon?size=N`) so PWA installs pick up the latest
   icon after an admin upload. The 32/64/180 entries point at the static
   copies so installation works even before the first API hit.
3. **Mobile** icon refreshes only on the next native build. Document this
   on the admin UI (already done — amber warning banner).

---

## Lock B6 — Error & edge cases

| Case | Behavior |
|---|---|
| Requested size not on disk | API falls back to nearest-larger size. `X-Icon-Size` response header tells the caller what was actually returned. |
| Master directory missing | API returns 404 (no auto-creation; signals deployment misconfiguration). |
| Upload of non-square PNG | HTTP 400 with `"Icon must be square. Got WxH."` |
| Upload of PNG < 1024×1024 | HTTP 400 with `"Icon must be at least 1024×1024. Got WxW."` |
| Upload >10MB | HTTP 400 with `"File too large (10MB max)"` |
| Upload of corrupt PNG | HTTP 400 with `"Could not decode PNG: ..."` |
| Pillow regeneration fails mid-flight | HTTP 500; original files preserved because of `.tmp + os.replace` (atomic). |
| Plain admin (not super-admin) attempts POST | HTTP 403 `"Super-admin required to modify branding assets"` |
| Browser shows old icon after upload | Expected — `Cache-Control: max-age=3600`. Admin UI cache-busts the preview; users see new icon on next hard refresh or after 1h. |
| Mobile native build hasn't shipped | Expected — `expo.icon` is baked into the binary; new icon ships with next EAS build. |

---

## Verification checklist — run BEFORE and AFTER any branding-flow edit

| # | Check | How |
|---|---|---|
| 1 | All 8 PNG sizes exist on disk | `ls /app/backend/static/branding/app_icon_*.png` → 8 lines |
| 2 | favicon.ico exists | `ls /app/backend/static/branding/favicon.ico` |
| 3 | Every size reachable via API | curl loop over [32,64,100,120,180,192,512,1024] → all 200 image/png |
| 4 | Nearest-larger fallback | `GET ?size=50` → returns 64px image with `X-Icon-Size: 64` header |
| 5 | Zip download | `GET /api/branding/app-icon.zip` → 200 application/zip, unzip lists 8 PNGs + favicon + README.txt |
| 6 | Admin info endpoint | `GET /api/admin/branding/app-icon/info` → returns `sizes[]`, `updated_at`, `uploaded_by` |
| 7 | Super-admin gate | non-super-admin POST → HTTP 403 |
| 8 | Square/size validation | POST a rectangular or sub-1024 PNG → HTTP 400 |
| 9 | Atomic replace | Interrupt mid-upload → original files still present and valid |
| 10 | Manifest references the API | `cat /app/frontend/public/manifest.json | grep "/api/branding"` → 2 lines (192 + 512) |
| 11 | Admin UI cache-busts | After upload, `<img src>` query string includes `_={timestamp}` |
| 12 | Renderer reproducible | `python3 /app/backend/scripts/render_app_icon.py` twice → identical bytes |

Date of lock: **2026-05-23**

---

## KNOWN ISSUES — status as of Phase 5-A ship

1. **The mobile app icon doesn't hot-update.** Expo bakes `expo.icon` into
   the binary at build time. Admin uploads only affect the web/PWA icon
   until the next EAS build picks up the new `assets/icons/app_icon_1024.png`.
   Add a follow-up task to the EAS build script: sync `assets/icons/`
   from `/app/backend/static/branding/` on every build.

2. **No A/B testing of icon variants.** Out of scope for this dispatch.

3. **The renderer's gradient + radial-glow are aesthetic decisions, not
   brand-locked.** If product wants a flat solid background or a different
   accent shape, edit the 3 helper functions in `render_app_icon.py`.
   The Waves SVG itself is locked (it's the Lucide source).

---

## Update protocol

1. Any agent proposing a change to one of the 6 locks (B1–B6) must:
   - Cite the specific lock + rule
   - Get explicit human authorisation in writing
   - Re-run the verification checklist above
   - Update the "Last verified locked:" date

2. If the brand mark itself changes (Lucide Waves → something else):
   - Update the SVG in `render_app_icon.py` AND the navbar `<Waves />` in
     `Navbar.js:59` IN THE SAME COMMIT — the navbar is the source of truth
     for what the icon is, so the two must never diverge.

3. **Never** add a competing icon-generation pipeline (e.g. nano-banana,
   DALL-E). The user has explicitly ruled out AI-generated brand assets
   for this app — the icon is the Lucide Waves rasterised, full stop.
