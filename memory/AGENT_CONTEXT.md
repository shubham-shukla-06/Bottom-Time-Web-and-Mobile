# AGENT CONTEXT — Bottom Time

**Read this FIRST at the start of every task. Do not regenerate or analyse the codebase from scratch.**

## Canonical source
- `/app` is the live, running codebase. Three surfaces:
  - `/app/backend` — FastAPI + Motor + ~34 routers, served at `/api`. Lifespan migrations, background scanners, OG-image generator.
  - `/app/frontend` — React 19 + CRACO + Tailwind + shadcn (web).
  - **`/app/mobile`** — Expo Router SDK 54 + React Native 0.81. **The mobile app exists.** ~41 screens. Do not claim it doesn't exist.
- `/tmp/bottom-time-source/` was a stale zip snapshot — it has been deleted. Ignore any reference to `/tmp/...`.

## Services already running (supervisorctl)
- `backend`, `frontend`, `mobile`, `mongodb`, `nginx-code-proxy` — all RUNNING.
- Mobile Metro is `CI=true` — file edits don't hot-reload. You MUST `sudo supervisorctl restart mobile` after changing files in `/app/mobile/`.

## Live URLs
- Web + API: `https://project-scanner-44.preview.emergentagent.com/`
- Mobile (Expo tunnel): `https://project-scanner-44.expo.preview.emergentagent.com/`

## Test credentials
- See `/app/memory/test_credentials.md`.
- `testuser@bottom-time.com` accepts OTP `007320` (canonical test bypass).
- Other accounts: `testoperator@bottom-time.com`, `testinstructor@bottom-time.com`, `shubham@bottom-time.com` (admin — read OTP from `db.otp_codes` post-send, no bypass).

## Major phases already shipped (do NOT re-do)
1. **Device sessions + mobile biometric** — `device_sessions` collection, refresh-token rotation (`apple_auth.py`, `routes/sessions.py`), Face ID / Touch ID / Android fingerprint enrollment + resume, Profile → Security screen. `expo-local-authentication` + `expo-secure-store`. Docs in `/app/memory/BIOMETRIC_AUTH.md`.
2. **Web passkeys (WebAuthn)** — `passkeys` + `webauthn_challenges` collections, register/login endpoints, `@simplewebauthn/browser`, login button + Profile → Security on web.
3. **Apple OAuth JWKS verifier** — `/api/auth/social/apple-token` no longer a 501 stub; verifies `identity_token` against `appleid.apple.com/auth/keys`, audiences `APPLE_BUNDLE_ID` (com.bottomtime.mobile) + `APPLE_SERVICES_ID` (com.bottomtime.web).
4. **Welcome carousel CMS** — admin → `/AdminPanel` → Welcome Carousel section. `welcome_slides` Mongo collection. Server-side Pillow crop on save (Pillow installed). Canonical `MOBILE_VISIBLE_ASPECT_RATIO = 0.7388` lives in `backend/welcome_visible.py`. Schema: `{id, image_url, image_url_original, attribution_text, show_attribution, crop_box {x,y,width,height}, sort_order, active}`. Public payload returns only the first 5 + sort_order. Lifespan migration converts legacy `focal_point+zoom` rows. Admin UI uses `react-easy-crop` `<Cropper>`.
5. **Mobile listing-detail parity** — 887-line `app/listing/[id].tsx` rewrite. 16 render-gated sections. Reads canonical backend field names. Reviews stats + write + helpful, wishlist heart, map link, FAQ + Policies accordions. Currency conversion via `useCurrency()` with `Intl.NumberFormat` locale per currency.
6. **Icon shim** — `/app/mobile/src/components/Icon.tsx` routes 89 Ionicons names → `lucide-react-native`. Brand marks (Apple/Google/Microsoft) use custom SVG components under `/app/mobile/src/components/brand/` (e.g. `AppleMark.tsx`) — NEVER routed through Lucide. `isFilled` allow-list is STRICTLY `star / heart / bookmark` (single-path glyphs only — adding multi-path glyphs causes filled-disc bug).
7. **Country picker** — canonical 245-entry list in `/app/mobile/src/constants/countries.ts` + `/app/frontend/src/data/countries.js`. Every phone-input + country-select picker filters by name + ISO + dial.
8. **Welcome carousel images** — `/app/mobile/assets/welcome/{whale-sharks,jellyfish,sea-turtle,yellow-tang}.jpg`. Mobile `app/welcome.tsx` renders via `expo-image` + BlurHash placeholder; auth sheet at the bottom with rounded-top corners.
9. **Splash icon** — `/app/mobile/assets/images/splash-icon.png` (1024×1024, cyan Waves + black wordmark). `app.json` plugin block configured.
10. **Currency conversion** — boot-time `fetchExchangeRates()` in mobile `_layout.tsx`. Frankfurter-backed `GET /api/exchange-rates`. Mobile + web both convert correctly.
11. **Listing card on Discover** — `/app/mobile/src/components/ListingCard.tsx` has type pill overlay, difficulty pill overlay, horizontal image carousel, no upper bleed.

## Design rules (mandatory, no exceptions)
- **Cyan pills (background `#22d3ee` / cyan-400 / cyan-500) ALWAYS use white text.** Black text on cyan is forbidden — fails accessibility contrast and breaks brand consistency.
- Outfit font family across web + mobile.
- Brand marks (Apple/Google/Microsoft) use custom SVG, never generic icon libraries.
- Tailwind: no `space-y-*` (use `flex flex-col gap-N` instead). No bare React Fragments in layout containers.

## Active task tracking
- Wave 2 media manager (operator upload multiple images/videos per listing with BlurHash placeholders) — PAUSED awaiting user decision on `listings` vs `operator_dive_listings` collection consolidation.

## How to start any task
1. Read this file.
2. Re-read `/app/memory/test_credentials.md`, `/app/memory/BIOMETRIC_AUTH.md`, `/app/memory/PRD.md` if relevant.
3. Run `ls /app/mobile/app /app/mobile/src` if you ever doubt mobile exists.
4. Do NOT regenerate codebase analysis. Do NOT report "I have explored the artifact". Execute the briefed task.
