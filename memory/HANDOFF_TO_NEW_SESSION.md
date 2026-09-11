# Bottom Time — Handoff to New Emergent Session

**Last known good SHA (local):** `7a960b3` on branch `main`
**Handoff created:** 2026-06-08

---

## ⚠️ CRITICAL: GitHub is NOT connected in the source pod

At handoff time, `git remote -v` in `/app/` returned empty and `git push` failed with
`fatal: No configured push destination`. The 31+ recent commits exist **only in the
source pod's local `.git`**. Before the new pod can inherit code + history, the user
must complete ONE of the two migration paths below.

---

## Migration paths (pick one)

### Option A — Save to GitHub then Import (recommended, preserves full history)

1. In the **source pod's** Emergent UI, click **Save** → **"Save to GitHub"**.
   This is the only supported way to connect a remote — do NOT try `git remote add`
   manually; the Emergent platform manages the credential + hook.
2. Wait for the push to complete (Emergent will confirm the remote URL + latest SHA).
3. Spin up the new pod → Import from GitHub → paste the same repo URL.
4. **Copy the `.env` files manually** (see § "Environment secrets" below). They are
   intentionally excluded from git for security and will NOT come across via GitHub.
5. Verify the memory lock docs are present on clone (see § "Memory lock docs" below).

### Option B — Emergent Fork (simplest, same account only)

If the new pod is under the **same Emergent account**, click the **Fork** button in
the source pod's UI. This creates a complete workspace copy including:
- Code + git history (31+ commits preserved)
- `/app/memory/` lock docs
- Filesystem state
- **Environment variables** (unlike GitHub, `.env` transfers here)

No manual `.env` re-entry needed on Option B.

There is no built-in "clone workspace" CLI — the Fork button in the UI is the only path.

---

## Environment secrets checklist

Every key currently set in `/app/backend/.env` and `/app/frontend/.env` and
`/app/mobile/.env`. **Required** = app won't boot without it. **Optional** = feature-
specific; app boots fine but that feature is dead until set.

### Backend (`/app/backend/.env`)

| Key | Purpose | Where to get it | Required? | Notes |
|---|---|---|---|---|
| `MONGO_URL` | Mongo connection string | Auto-provisioned by Emergent on new pod | **REQUIRED** | Keep pod-supplied value; never hardcode |
| `DB_NAME` | Database name | Keep same value (`bottomtime`) | **REQUIRED** | Changing breaks reads of existing data |
| `JWT_SECRET_KEY` | JWT signing secret | Generate new random 64-byte string or copy from source pod | **REQUIRED** | Rotating this invalidates all existing user sessions |
| `JWT_ALGORITHM` | JWT alg (`HS256`) | Static | **REQUIRED** | Do not change |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL | `60` | **REQUIRED** | |
| `CORS_ORIGINS` | Allowed CORS origins | `*` for preview, tighter in prod | **REQUIRED** | |
| `APP_BASE_URL` | Public URL of this pod's frontend | Emergent pod preview URL | **REQUIRED** | Rewrites needed on new pod |
| `EMERGENT_LLM_KEY` | Universal LLM key (Claude/GPT/Gemini/Nano Banana/Sora 2/Whisper) | Auto-provisioned by Emergent | **REQUIRED** for LLM/image gen features | Managed by platform — DO NOT paste from source pod; retrieve fresh via `emergent_integrations_manager` tool or Profile → Manage Plan → Universal Key |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in web client | Google Cloud Console → OAuth 2.0 Client IDs | Optional | Needed if Google login used |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in secret | Same as above | Optional | Pair with above |
| `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | Microsoft OAuth | Microsoft Azure AD app registrations | Optional | Web + mobile Microsoft sign-in |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CLAIMS_EMAIL` | Web push notifications | `web-push generate-vapid-keys` locally | Optional | Only if web push is used |
| `RESEND_API_KEY` | Transactional email | https://resend.com/api-keys | Optional | Sign-up + password-reset emails |
| `EMAIL_FROM` | Verified sending address in Resend | Resend dashboard | Optional | Must be a domain verified in Resend |
| `TWILIO_ACCOUNT_SID` | Twilio account ID | https://console.twilio.com | Optional | SMS OTP |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | Twilio API key | Twilio Console → Account → API keys | Optional | |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service | Twilio Console → Verify → Services | Optional | Used for SMS OTP flow |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay payments (INR) | https://dashboard.razorpay.com → Settings → API keys | Optional | Test mode currently active (`rzp_test_*`). Swap to live keys before prod |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing | Razorpay Dashboard → Webhooks | Optional | Empty in source pod (webhook not yet configured) |
| `STRIPE_API_KEY` | Stripe payments | Current value: `sk_test_emergent` — the Emergent-managed test key. Live key from https://dashboard.stripe.com/apikeys | Optional | Keep `sk_test_emergent` for preview/test |
| `WISE_API_TOKEN` / `WISE_API_BASE_URL` / `WISE_PROFILE_ID` | Wise (TransferWise) payouts | https://wise.com → Settings → Developer Tools | Optional | Empty in source pod; only needed for operator payouts |
| `SANDBOX_API_KEY` / `SANDBOX_API_SECRET` | Sandbox.co.in — Indian ID verification | https://sandbox.co.in dashboard | Optional | KYC / PAN / GSTIN verification |
| `FASTGST_API_KEY` / `FASTGST_BASE_URL` | FastGST — GSTIN lookup | https://fastgst.in dashboard | Optional | Seller GSTIN validation |
| `SHIPROCKET_API_EMAIL` / `SHIPROCKET_API_PASSWORD` | ShipRocket — Indian shipping | https://app.shiprocket.in | Optional | Empty in source pod; order fulfilment shipping |
| `GOOGLE_PLACES_API_KEY` | Google Places autocomplete | Google Cloud Console → APIs & Services → Credentials | Optional | Address autocomplete on checkout |
| `APPLE_BUNDLE_ID` / `APPLE_SERVICES_ID` | Apple app identifiers | Apple Developer portal | Optional | Sign in with Apple (mobile + web) |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple Sign In signing | Apple Developer → Certificates, IDs & Profiles → Keys | Optional | `APPLE_PRIVATE_KEY` is multi-line PEM — preserve line breaks in `.env` |
| `SELLER_STATE` | Seller INR home state (GST determination) | Static — `Maharashtra` | Optional | Determines intra-state vs inter-state GST calc |

### Frontend (`/app/frontend/.env`)

| Key | Purpose | Where to get it | Required? | Notes |
|---|---|---|---|---|
| `REACT_APP_BACKEND_URL` | Public backend URL for browser | Emergent pod's preview URL (auto-set by platform) | **REQUIRED** | Never hardcode; always `process.env.REACT_APP_BACKEND_URL` |
| `WDS_SOCKET_PORT` | webpack-dev-server socket | `443` for HTTPS preview | **REQUIRED** | Preserve as-is |
| `REACT_APP_DISABLE_WAITLIST_GATE` | If `true`, hides the ComingSoon gate | Optional — set for internal dev | Optional | Alternative: use `?access=bottomtime2026` query param at runtime |
| `REACT_APP_GOOGLE_MAPS_KEY` | Google Maps JS API | Google Cloud Console | Optional | Map on listing detail |
| `REACT_APP_GOOGLE_CLIENT_ID` | Google Sign-In (web) | Same as backend `GOOGLE_OAUTH_CLIENT_ID` | Optional | Must be the same client ID as backend for token exchange |
| `REACT_APP_MS_CLIENT_ID` | Microsoft OAuth (web) | Same as backend `MS_CLIENT_ID` | Optional | |
| `REACT_APP_APPLE_CLIENT_ID` | Sign in with Apple (web) | Same as backend `APPLE_SERVICES_ID` | Optional | |
| `ENABLE_HEALTH_CHECK` | Toggle `/health` in preview | `true` | Optional | |

### Mobile (`/app/mobile/.env`)

| Key | Purpose | Where to get it | Required? | Notes |
|---|---|---|---|---|
| `EXPO_TUNNEL_SUBDOMAIN` | Fixed Expo tunnel name | Emergent-provisioned per pod | **REQUIRED** | Auto-configured by pod |
| `EXPO_PACKAGER_HOSTNAME` | Metro packager hostname | Emergent-provisioned | **REQUIRED** | Auto-configured |
| `EXPO_PACKAGER_PROXY_URL` | Metro proxy URL | Emergent-provisioned | **REQUIRED** | Auto-configured |
| `EXPO_PUBLIC_BACKEND_URL` | Public backend URL for mobile | Emergent preview URL (same as `REACT_APP_BACKEND_URL`) | **REQUIRED** | |
| `EXPO_USE_FAST_RESOLVER` | Metro perf flag | `1` | Optional | Keep as-is |
| `METRO_CACHE_ROOT` | Metro cache dir | `.metro-cache` | Optional | |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google Sign-In (mobile) | Same as backend | Optional | Native flavor of OAuth client |
| `EXPO_PUBLIC_MS_CLIENT_ID` | Microsoft OAuth (mobile) | Same as backend | Optional | |
| `EXPO_PUBLIC_APPLE_CLIENT_ID` | Apple Sign In (mobile) | Same as backend `APPLE_BUNDLE_ID` (native) | Optional | |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | Google Maps in native app | Google Cloud Console | Optional | |

---

## Memory lock docs (all tracked in git)

Confirmed present in `/app/memory/` and tracked via `git ls-files memory/`. All will
transfer via Option A or Option B:

- `AGENT_CONTEXT.md` — coding agent context / conventions
- `BIOMETRIC_AUTH.md` — biometric-auth spec (mobile)
- `BRANDING_ASSETS_LOCKED.md` — favicons, logos, mask-icon canon
- `CART_CHECKOUT_LOCKED.md` — cart + checkout INR canon
- `CHANGELOG.md` — running changelog
- `MOBILE_AUTH_LOCKED.md` — mobile auth flow canon
- `PHASE_3B_BLOCKED.md` — multi-warehouse + Google Distance Matrix (blocked on API enable)
- `PRD.md` — product requirements doc
- `PROPOSAL_SELLER_WAREHOUSES_INR.md` — INR seller-warehouse proposal
- `RAZORPAY_PAYMENT_LOCKED.md` — Razorpay integration canon
- `REFUNDS_LOCKED.md` — refunds flow canon
- `ROADMAP.md` — roadmap
- `STRIPE_PAYMENT_LOCKED.md` — Stripe integration canon
- `WEB_APPLE_AUTH_LOCKED.md` — web Apple Sign In canon
- `WEB_PASSKEY_LOCKED.md` — web passkey canon
- `WEB_REGRESSIONS_LOCKED.md` — regression cases
- `auth_testing.md` — auth test creds + notes
- `design.md` — design notes
- `test_credentials.md` — **NOTE: exists on disk but NOT in `git ls-files`** — will need to be re-added on the new pod. Contents visible below.
- `locked/signup.tsx`, `locked/verify.tsx`, `locked/welcome.tsx` — mobile auth-screen canon references
- `web/commit_log.md`, `web/iteration_1.md`

⚠️ `test_credentials.md` is NOT git-tracked. Its contents (from source pod):
```
Test user:  testuser@bottom-time.com   OTP: 007320
Super Admin: shubham@bottom-time.com
Stripe test card: 4242 4242 4242 4242
Site access key (bypasses ComingSoon): ?access=bottomtime2026
```
Add this file manually on the new pod.

---

## Bring-up playbook on new pod

Run in this exact order. If any step fails, stop and diagnose before proceeding.

### 1. Get the code
- **Option A (GitHub Import)**: New pod → Import from GitHub → paste repo URL → wait for clone into `/app`
- **Option B (Fork)**: New pod inherits `/app` automatically — skip to step 4

### 2. Install backend dependencies
```bash
cd /app/backend && pip install -r requirements.txt
```
Should complete in ~90s. Verify: `python -c "import fastapi, motor, pymongo; print('ok')"`

### 3. Install frontend + mobile dependencies (use yarn, NOT npm)
```bash
cd /app/frontend && yarn install
cd /app/mobile   && yarn install
```
⚠️ Never run `npm install` — it will produce a `package-lock.json` that fights `yarn.lock` and break the build.

### 4. Populate `.env` files (Option A only — skipped for Option B)
- Backend: create `/app/backend/.env` with the keys from the table above. `MONGO_URL` and `DB_NAME` come from the new pod's environment; all others must be copied over.
- Frontend: create `/app/frontend/.env` with `REACT_APP_BACKEND_URL` (from new pod's Emergent preview URL) plus optional keys.
- Mobile: create `/app/mobile/.env` similarly.
- For `EMERGENT_LLM_KEY`: **do NOT paste the source pod's value** — retrieve a fresh one via the `emergent_integrations_manager` tool or from Profile → Manage Plan → Universal Key. The key is per-pod-account.
- Missing `.env` values are the #1 cause of "app boots but feature X is dead" reports.

### 5. Restart services
```bash
sudo supervisorctl restart backend frontend mobile
sudo supervisorctl status
```
All three should show RUNNING within ~10 seconds. Frontend hot-reloads, backend hot-reloads on Python changes, mobile Metro starts the tunnel.

### 6. Seed the database (only if the new pod's Mongo is empty)
```bash
cd /app/backend && python seed.py
```
`seed.py` is idempotent — safe to re-run. It creates the test users, operator listings, products, and destinations. Skip if you Forked (fork carries the DB) or restored from a Mongo dump.

### 7. Verify health
```bash
curl -sI http://localhost:3000/                       # expect HTTP/1.1 200 OK
curl -s  http://localhost:8001/api/health             # expect {"status":"ok","service":"bottom-time-backend"}
```
Mobile Metro is up when `sudo supervisorctl status mobile` shows RUNNING and `/var/log/supervisor/mobile.out.log` ends with `Waiting on http://localhost:3001`.

### 8. Verify preview URL from a browser
- Grab the pod's preview URL from the Emergent UI (top right of workspace).
- Open `<preview-url>/?access=bottomtime2026` to bypass the ComingSoon gate on first visit — this writes `localStorage.bt_site_access='granted'` and unlocks the site for that browser thereafter.
- Login as test user: `testuser@bottom-time.com` / OTP `007320`.

### 9. Sanity-check critical flows
- Discover page loads → 9 listing cards render
- Shop page loads → products render
- Cart → checkout → Stripe test card `4242 4242 4242 4242` succeeds
- Book a listing → Razorpay test flow completes
- Admin surface (login as `shubham@bottom-time.com` if super-admin creds available) → dashboard loads

---

## Known ongoing issues / carryover work

Not blockers, but the new-session agent should be aware:

| Issue | Blocker for? | Status |
|---|---|---|
| **Prod DB re-seed pending** | Prod site parity | Preview DB was re-seeded 2026-06-08; prod skipped because `MONGO_URL_PROD` credentials weren't in the pod. Awaiting user credentials or manual seed run. |
| **Google Routes API 403** | Multi-warehouse Phase 3B | GCP Routes API not enabled on user's account. See `memory/PHASE_3B_BLOCKED.md`. |
| **Mobile web-preview 500** | Web-target of mobile Expo bundle | `react-native-maps` imports native-only modules on web. Fix: gate `import 'react-native-maps'` behind `Platform.OS !== 'web'` in `app/listing/[id].tsx`. Native mobile builds unaffected. |
| **`mobile/yarn.lock` dirty** | Nothing | Metro touches it on every restart — harmless churn, safe to `git checkout mobile/yarn.lock` before commits. |

---

## Recent commit history (last 20, all local-only until pushed to GitHub)

```
7a960b3 (main) chore: session notes
d559c13 auto-commit
35dfbbf feat/discover: remove Recently Viewed section + all associated functionality
cc6c81a auto-commit
f9f385d ui/discover: drop 'N results' count; fix disclosure jitter with mode=wait + opacity-only
310a51f ui/discover: replace Radix popovers with inline disclosure rows
5551e22 ui/discover: move sort pill into the toolbar row (ml-auto pushes it right)
1ae6323 ui/discover: remove redundant Search button (live-search already active)
a2c42d5 ui/discover: merge search bar and filter triggers into one inline flex row
ee39944 ui/discover: collapse stacked filter sections into compact pill-triggered popovers
a1e72b3 ui/shop: port Discover's animated rotating search placeholder
01f75d3 ui/discover: vertically center search icon (was 3px high)
172c49c ui/discover: port mobile's animated rotating search placeholder to web
4b4ff92 ui/discover: restyle sort select; relocate Clear into Recently viewed header
a3c7c15 ui/discover: sort pill matches filter chips; Clear hugs Recently-viewed heading
aead16a ui/listings: swap Layers -> Waves icon next to dive-count meta
ab7a152 ui/discover-card: move rating back to bottom row alongside price
7614253 ui/discover-card: apply unified meta-row pattern
```

Full log preserved in `git log` — transfers with Option A or B.
