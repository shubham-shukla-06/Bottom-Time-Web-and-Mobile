# Bottom Time - Product Requirements Document

## Original Problem Statement
Build a comprehensive, global dive logging and marketplace platform called "Bottom Time" with:
1. Operator & Marketplace System
2. Advanced Dive Logging (Subsurface-level)
3. Dive Planning Tool (Buhlmann ZH-L16C)
4. Education & Usability
5. Social Platform ("Instagram for Divers")
6. Trip Planner
7. Mobile-First Design
8. E-commerce (Gear catalog)
9. Group Booking
10. Marine Life Database (iNaturalist)

## Critical Instructions from User
- **FINAL LOGO:** Lucide `Waves` icon in `#22d3ee` cyan-400 + "Bottom Time" text in `#0f172a` slate-900, Outfit font. Official and final.
- **LOGO FONT SPEC:** `font-family: Outfit, sans-serif; font-weight: 700; letter-spacing: -0.025em;`
- **Google Maps default map provider.** Do NOT use Leaflet.
- **Desktop-first development.** Mobile adaptation later.
- **GST compliance 100% legal.** No listing country fallbacks.
- **No offline-only validation for GSTIN or PAN.** Must verify via Sandbox.co.in.
- **No tax abbreviations in user-facing text.** Full names always.
- **MANDATORY: Read `/app/design.md` before writing any layout code.** Contains hard rules on `space-y-*` vs `flex gap-*`, Fragment wrapping, conditional rendering, and design-system reuse. Violating these rules silently breaks UI.
- **Registered legal entity:** `Bottom Time LLP`, WeWork Enam Sambhav, C-20, G Block, Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra — 400051, India. This is the only legal entity name permitted in contracts, copyright, ToS, privacy policy, invoices, and GST filings. The brand name `Bottom Time` (no suffix) is used everywhere else. The single brand domain is `bottom-time.com` (hyphenated). `bottomtime.com` (no hyphen) and `bottomtimescuba.com` are NOT owned domains — never introduce them in code.

## Dropdowns, Select menus, and popover-style inputs (app-wide rule)
Never use `@radix-ui/react-select` (the Shadcn `Select` component) for form fields or any dropdown the user will interact with. Radix Select always engages `react-remove-scroll` on open, which injects `padding-right: ~17px` on `<body>` to compensate for the scrollbar disappearance — this causes every `max-w-[1600px] mx-auto` container (Navbar, Footer, page content) to re-center and visibly shift each time the dropdown opens/closes. The `modal={false}` prop that works on Radix `Dialog`/`Popover`/`DropdownMenu` is **silently ignored** on Radix Select and cannot be disabled.

The canonical pattern used by the app is the custom `TopicDropdown` in `/app/frontend/src/pages/Contact.js` — a small self-contained React component:
- A `<button type="button">` trigger styled like an input (same classes as other form fields).
- A conditionally rendered `<ul role="listbox">` absolutely positioned below the trigger with `top-full left-0`, full keyboard + click-outside handling, and `aria-expanded` / `aria-selected` a11y.
- No library, no `react-remove-scroll`, no body mutations, zero layout shift.

**When to use each option:**
| Need | Use |
|---|---|
| Form select field | Custom React dropdown (`TopicDropdown` pattern) OR plain native `<select>` with the OS chevron. Never Radix Select. |
| Simple action menu (e.g. "more" 3-dot) | Radix `DropdownMenu` with `modal={false}` |
| Hover card / info popover | Radix `Popover` with `modal={false}` |
| True blocking modal | Radix `Dialog` / `AlertDialog` (leave `modal={true}` default — scroll lock is desired) |

Do **not** apply `appearance: none` / Tailwind `appearance-none` to a native `<select>` — on Safari <17 and some Chromium builds this disables the OS picker entirely (element accepts focus, never opens). If you want a custom chevron, use the `TopicDropdown` custom component, not a styled native select.

Full technical analysis and the 5 broken approaches we've already eliminated live in `/app/design.md` Rule 9. Do not re-discover them.

## Core Architecture
- **Frontend**: React + Zustand + Tailwind CSS
- **Backend**: FastAPI + MongoDB
- **Auth**: Google OAuth 2.0, Microsoft Azure AD, Email OTP
- **Maps**: Google Maps (`@vis.gl/react-google-maps`) + SafeMapWrapper
- **Payments**: Razorpay (MOCKED)
- **PAN Verification**: Sandbox.co.in
- **Emails**: Resend (branded HTML templates)
- **Shipping**: Shiprocket

## Backend Module Architecture
```
/app/backend/
├── server.py             # FastAPI app, middleware, route registration
├── config.py             # Environment config
├── database.py           # MongoDB connection
├── auth_utils.py         # JWT, OTP email, auth helpers
├── operator_emails.py    # Operator verification email templates + portal links
├── models.py             # Pydantic models
├── helpers.py            # Notifications, push notifications
├── tax_engine.py         # Tax computation, GST/TCS, PAN verification
├── shipping_helpers.py   # Shipping models, Shiprocket helpers
├── security_scanner.py   # Automated security scanner
├── routes/
│   ├── auth.py           # Auth endpoints
│   ├── operator_listings.py # Operator CRUD + application + review + email review
│   ├── admin.py          # Admin panel
│   └── ... (29+ route files)
```

## Operator Verification System (Country-Aware)
### Automated Verification:
- **India** → GSTIN via Sandbox.co.in (live govt records)
### Countries with admin portal links (manual review with one-click verify):
- **UK** → Companies House (free)
- **EU (26 countries)** → VIES VAT validation
- **Australia** → ABN Lookup
- **Singapore** → UEN Search
- **New Zealand** → NZBN Register
- **Denmark** → CVR Register
- **Philippines** → SEC Portal
- **Japan** → NTA Corporate Number
- **China** → NECIPS/GSXT
- **UAE** → DED eServices
- **Thailand** → DBD DataWarehouse
- **Indonesia** → OSS Portal (NIB)
- **Egypt** → GAFI Portal
### All other countries → Manual document review

## Prioritized Backlog

### P0 (Next Up)
- Room selector in booking flow (single/double/shared occupancy)
- Multi-PAN collection for group bookings (TCS compliance)
- Add preview domain to Google Maps API key (user action)

### P1 (Important)
- E-commerce Payments: Live Razorpay/Wise keys
- Operator Dashboard polish
- Razorpay webhook secret configuration

### P2 (Nice to Have)
- Component refactoring (large files >300 lines)
- Web-Vitals Monitoring
- Mobile responsiveness
- TypeScript migration

## Recently Completed
- **2026-05-03**: **Site Content CMS — live iframe preview + draft/publish + upload-with-crop**:
  - New `/app/backend/routes/site_content.py` with 6 endpoints: GET `/admin/site-content` (returns `{published, draft, has_unpublished_changes}`), PUT `/admin/site-content/draft` (autosave partial, deep-merges `section_images`), POST `/admin/site-content/publish` (promotes draft → published, clears draft), POST `/admin/site-content/discard-draft`, POST `/admin/site-content/upload` (images ≤15 MB jpg/png/webp, videos ≤50 MB mp4/webm/mov, hard-blocks unknown formats, returns width/height for images via PIL), GET `/site-content/draft-preview` (admin-gated).
  - Draft + Publish model: `site_content_draft` collection holds the draft; published pipeline preserved.
  - New `/app/frontend/src/pages/admin/SiteContentEditor.jsx` — CMS-style UI: Edit/Preview toggle, Desktop/Mobile viewport, live iframe of `/home?access=…&preview_draft=1`, postMessage bridge so edits stream into iframe without re-fetching.
  - New `/app/frontend/src/components/admin/MediaUploader.jsx` using `react-easy-crop` — format hard-block, size cap, dimension warnings, crop+zoom+rotate, images auto-cropped, videos uploaded as-is.
  - LandingPage hero now honours CMS fields: `hero_media_type` (image|video), `hero_image`, `hero_video`, `hero_title`, `hero_subtitle`, `hero_description`, `cta_primary_label/link`, `cta_secondary_label/link`. Listens for `cms-preview` postMessage for iframe-driven edits.
  - Legacy `/admin/site-content` GET/PUT endpoints in admin.py removed; `ManageContent` function in ManageSection swapped for `SiteContentEditor`.
  - Tests: 25/25 backend pytest cases pass (iteration_102).
- **2026-05-03**: **Admin Bulk Select across ALL list-based admin sections** — user-requested reusable bulk operation system with confirmation modals:
  - New reusable frontend primitives: `useBulkSelect` hook, `BulkSelectCheckbox`, `BulkActionBar` (sticky), `BulkConfirmDialog` (with optional typed-confirmation for destructive ops).
  - Integrated into 7 admin sections with context-appropriate actions:
    - Waitlist → bulk delete
    - Operator Applications → bulk approve / reject (pending-only, with email + status propagation via `_process_review`)
    - Manage > Users → bulk suspend / activate / delete (DELETE typed-confirm required, admins & self excluded)
    - Manage > Listings → bulk approve / reject / delete (DELETE typed-confirm required, notifications fire on approve/reject)
    - Referrals (promo codes) → bulk activate / deactivate / delete
    - Campaigns → bulk delete
    - Inventory (products) → bulk mark in-stock / out-of-stock / delete
  - New centralised backend route `/app/backend/routes/admin_bulk.py` — 7 endpoints, all `require_admin`, idempotent, per-ID error reporting via `{processed, failed, errors}` response shape.
  - Tests: 15/15 backend pytest cases pass (`/app/backend/tests/test_admin_bulk.py`); 7/7 admin sections render bulk UI without React errors (iteration_101).
- **2026-04-26**: **Branded short links + server-rendered OG meta** (fixes ugly UUID-with-UTM URLs and broken social unfurls):
  - New endpoints `GET /api/r/{slug}` (operator preset) and `GET /api/d/{listing_id}` (diver static) return server-rendered HTML with full `og:image` (auto-PNG card), `twitter:card`, `og:title`, `description` etc., then meta-refresh humans to `/listing/{id}?utm_*=...` so booking-attribution + click-tracking still fire client-side.
  - Each share preset now auto-gets a slug like `whatsapp_x4f2k`. Display in modal: `host.com/r/whatsapp_x4f2k` (~14 chars vs old 130-char URL).
  - Honors `X-Forwarded-Proto` / `X-Forwarded-Host` so OG URLs resolve correctly through k8s ingress.
  - Diver share button now uses `/api/d/{listing_id}` so even when a diver shares, WhatsApp/Twitter/Slack render the auto-PNG card (previously SPA tags were invisible to crawlers).
  - Lazy-fills slugs for legacy presets on first list-fetch.
- **2026-02-04**: **Version history + Preview + Revert (with audit trail)**:
  - Every CMS publish (manual or scheduled) writes a snapshot to a new `cms_history` collection: `{ id, page, version, content, published_at, published_by, published_by_name }`. Indexed by `(page, published_at desc)` and `id` unique.
  - Endpoints (per page): `GET /admin/{site,gate}-content/history` (list, content stripped), `GET /admin/{site,gate}-content/history/{version_id}` (full snapshot), `POST /admin/{site,gate}-content/revert` body `{ version_id }` (copies that snapshot into the draft — admin reviews and re-publishes).
  - Frontend: shared `HistoryPanel.jsx` lives at the bottom of the sidebar in both editors. Each row shows v#, IST timestamp, author, "X ago" + Preview & Revert buttons. Latest row is tagged "Live". Preview clicks override the iframe via the existing `cms-preview` / `cms-preview-gating` postMessage channel; a violet banner above the iframe shows "Previewing v4 — by Shubham · Exit preview" so admins never confuse a preview with the live state. Revert opens a confirm dialog that explicitly says "Nothing changes on the live site until you click Publish".
  - Verified end-to-end via Playwright: 2 sequential publishes → both rows appear → Preview v1 renders historical content in iframe → Exit restores draft view → Revert confirm → draft populated with v1 content + "Unpublished changes" pill active.
- **2026-02-04**: **Scheduled publish for CMS (IST always)**:
  - Both Landing and Gating CMS docs now support scheduling. New endpoints `POST /admin/site-content/schedule`, `POST /admin/gate-content/schedule` accept a UTC ISO `publish_at` and stamp it on the draft as `scheduled_publish_at`. Past times are 400-rejected. Companion `cancel-schedule` endpoints unset the field.
  - Background worker in `server.py` lifespan polls every 30s (`run_scheduled_publisher_once`) and promotes any draft whose moment has arrived — verified end-to-end (badge change scheduled → public endpoint reflected the change after ~30s without admin action).
  - Discarding a draft naturally cancels its schedule (single-document model).
  - New shared component `SchedulePublishMenu.jsx` provides a split button: primary "Publish" + chevron menu with "Schedule…". Modal accepts a `datetime-local` input explicitly interpreted as IST regardless of the admin's browser timezone. Live "Will publish at … IST" preview. Once scheduled, the button collapses into a violet chip showing the IST timestamp + a "Cancel schedule" link. Used by both editors.
- **2026-02-04**: **CMS overhaul — gating page CMS + editor UX cleanup**:
  - **Gating Page CMS (NEW)**: ComingSoon page now consumes `/api/gate-content/public` (image, badge, accent title, slate title, description, email placeholder, submit label, footer). Backend stores draft + published in `gate_content` / `gate_content_draft`. Editor lives at `/app/frontend/src/pages/admin/GatingPageEditor.jsx`. Verified end-to-end: admin upload → publish → public visitor (no cookies, no access key) sees the new image immediately.
  - **Site gating toggle**: `gate_enabled` flag on the gating CMS doc. `App.useSiteGate` fetches the public flag (cached in localStorage to prevent flash) and skips ComingSoon entirely when OFF. Verified: toggle OFF → public visitors land directly on `/discover`/landing.
  - **Mapping bug fixed**: removed dead `group` section_image slot. Renamed in code to `community` so the slot the admin edits is the one rendered in the Community section. Backend `_normalize` migrates legacy `group` data into `community` on read so existing drafts survive.
  - **Editor UX**: section labels now describe the SECTION (e.g. "About section — 'What is Bottom Time?'") instead of the default-image content (no more "sea turtle"/"clownfish"/"reef" labels). Hero subtitle rewritten with "Used in: Hero banner" wording.
  - **Upload progress**: `MediaUploader` now shows a real 0–100% progress bar (slot UI + crop modal footer) wired to axios `onUploadProgress`.
  - **Zoom buttons**: `ZoomIn` / `ZoomOut` icons in the cropper are now real `<button>` elements, step ±0.25, clamped 1–4 with `disabled` at boundaries. Verified: 1 → click + → 1.25 → click − → 1 → button disabled.
  - **Sidebar IA reorganised**: groups renamed to *Insights / Growth / Marketplace / Commerce / Community / Finance / Trust & Security / Content / System*. **Site Content** removed from the Manage tab — split into two top-level items: **Landing Page** and **Gating Page** under the new **Content** group (alongside **Waitlist**). Performance moved to *Insights*; Operator Applications stays in *Marketplace*; Security Scanner moved next to Trust & Safety.
  - **Admin profile**: the "New UI Test" tab (Diver Profile / Dive Log mockups) is now hidden for admin role; profile header reads "Manage your admin account" instead of "Manage your diving profile". Tab bar collapses entirely when only one option remains.
- **2026-02-04**: **App-wide tab persistence + scroll-to-top fixes**:
  - New `useTabParam` hook (`/app/frontend/src/hooks/useTabParam.js`) syncs tab/section state with URL search params using `replace: true` (no history pollution). Validates against a whitelist; falls back to default for invalid/unknown values. Adopted by `AdminPanel` (`?section`), `ManageSection` (`?sub`), `OperatorDashboard`, `Community`, `MarineLife`, `SurfaceLog`, `UserProfile`, `Profile`, `connect/ProfileTab`. Browser refresh now keeps the user on the exact tab they were viewing.
  - New `RouteScrollRestorer` component (`/app/frontend/src/components/RouteScrollRestorer.js`) mounted in `App.js` scrolls the window to top on every `pathname` change. Search-param/tab changes do NOT trigger scroll (so changing tabs preserves scroll position). POP navigations (back/forward) and hash-anchor URLs are skipped so the browser's native scroll-restoration / anchor-scrolling stays intact. Verified: `/discover` (Y=1003) → `/shop` (Y=0); admin sub-tab change at Y=199 stays at Y=199.
- **2026-04-26**: Share modal redesign — unified per-platform table, click "Activate" → row lights up with cyan glow + tracked link inline + Copy/Open/Remove buttons. Custom platform input. No emojis.
- **2026-04-26**: **OG card visual redesign — Spotify glass-morphism aesthetic**: Outfit font installed (Regular/Medium/SemiBold/Bold/Black), Lucide-spec icons (Waves, MapPin, Star) hand-traced and supersampled for crisp anti-aliasing, heavy vignette+gradient stack replaced with a single bottom glass plate (blurred photo + dark tint + feathered top edge so photo bleeds in smoothly), single signature tagline `THE OCEAN IS CALLING.` in tracked-wide cyan eyebrow, title in Outfit Black 60px on plate, MapPin·Location·★·Rating meta row. **Price removed** — pricing changes/discounts wouldn't break the card. Bottom-right Waves+wordmark brand lockup. ~73 KB JPEG (24% of 300 KB budget).
- **2026-04-26**: **OG image size budget enforced** — all listing share cards now JPEG-encoded at progressive quality steps until under 300 KB (well below WhatsApp's 600 KB hard limit). Verified: was ~683 KB PNG → now ~115 KB JPEG. WhatsApp/LinkedIn/X/Facebook all render rich card. Disk cache also moved to `.jpg`.
- **2026-04-26**: **Social preview deep fix (LinkedIn rich card)**: (a) `og:url` and `<link rel=canonical>` now point to the short-link itself (was destination `/listing/{id}`, causing crawlers to re-fetch the generic SPA), (b) `GET`+`HEAD` accepted on `/api/r/{slug}`, `/api/d/{id}`, `/api/listings/{id}/og-image` (was 405 on HEAD), (c) `og:description` auto-padded to ≥100 chars (LinkedIn warning), (d) added `og:image:secure_url` and `og:site_name`. Plus restarted frontend supervisor so updated `public/index.html` is actually served.
- **2026-04-26**: **Social preview crawler fix** — removed `<meta http-equiv="refresh">` from `/api/r/{slug}` and `/api/d/{listing_id}` HTML responses in `share_tracking.py`. Crawlers (LinkedIn/WhatsApp/X) now read OG/Twitter meta tags instead of following the refresh to the SPA fallback. Real users still get redirected via JS `window.location.replace`. Verified via curl: HTTP 200, 0 meta-refresh, all OG tags + JS redirect present.
- **2026-04-26**: Diver-vs-operator UTM split (`utm_source=diver_share` for divers).
- **2026-04-26**: UTM tracking infrastructure (operator presets CRUD, click ping, booking attribution, operator + admin analytics) — 18/18 backend tests pass.
- **2026-04-26**: Auto-generated 1200×630 social preview cards (`og_image.py`).
- **2026-04-26**: SEO structured data + page meta.
- **2026-04-26**: Rich operator data on user-facing listings (`RichSections.js`).
- **2026-04-26**: **Listings architecture consolidation** (Option B — single source of truth): (PhotoGallery, DiveSitesSection, GearRentalSection, DirectionsSection, PoliciesSection, DiveSpecsBadges) now powers ListingDetail. Discover ListingCard shows mini badges (# dives, Nitrox).
- **2026-04-26**: **Listings architecture consolidation** (Option B — single source of truth):
  - Removed duplicate `db.listings` legacy collection. Migrated all data to `db.operator_dive_listings`.
  - Public endpoints (`/api/listings`, `/api/listings/{id}`, `/api/destinations`, `/api/listings/locations/popular`) now read from `operator_dive_listings` and normalize to legacy schema via new `listing_normalize.py`.
  - Operator Dashboard: removed legacy "My Listings" tab + `ListingFormModal`. Single tab "My Listings" backed by rich `DiveListingBuilder`.
  - DiveListingBuilder: added required `location` + `country` fields (Basic section) for Discover filters/destinations.
  - Admin endpoints redirected to `operator_dive_listings`; field-name fallback (`title` → `name`).
  - 21/21 backend tests pass (iteration_97).
- **2026-04-26**: Renamed test credentials to `testuser@bottom-time.com` and `testoperator@bottom-time.com`.
- **2026-04-26**: Operator Dashboard duplicate "New Listing" button removed; "Dive Trip" button restyled to cyan pill.
- **2026-02-XX**: Removed redundant "+ Create Listing" pill inside My Listings section of Operator Dashboard (top-level "Dive Listing" button at header is the single CTA). Cleaned unused `Plus` lucide-react import.
- **2026-04-21**: Country-Aware Operator Verification System:
  - OperatorApplicationForm with country-specific fields (GSTIN, VAT, ABN, NIB, Corporate Number, etc.)
  - OperatorDashboard shows application form when pending, review banner when submitted, reapply on rejection
  - Admin review UI (VerificationBlock) with country-specific portal links
  - Admin review email includes portal verification links per country
  - 13+ countries with direct portal links for admin verification
- **2026-04-14**: Operator Verification Email Flow (4 branded HTML emails, token-based approve/decline, notifications)
- **2026-04-14**: Currency selector close-on-outside-click fix (Cart.js)
- **2026-04-14**: Razorpay payment rounding fix (int→round)
- **2026-04-14**: Google Maps SafeMapWrapper (Error Boundary)
