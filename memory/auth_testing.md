# Auth Testing — OTP Bypass Flow

> **For automated test agents.** Real users (anything not in the
> `TEST_IDENTIFIERS` allow-list inside `backend/routes/auth.py`) go through the
> live Resend / Twilio Verify pipeline and must NOT be used in tests.

Last verified: 2026-05-14 against pod HEAD `c03f7fe`.

## OTP bypass — three allow-listed test emails

Defined in `/app/backend/routes/auth.py`:

```python
TEST_OTP_CODE = "007320"   # line 57
TEST_IDENTIFIERS = {
    "testuser@bottom-time.com",
    "testoperator@bottom-time.com",
    "testinstructor@bottom-time.com",
}
```

For these three emails ONLY:
- `POST /api/auth/send-otp` short-circuits — no Resend / Twilio call is made;
  `007320` is written into `db.otp_codes` with a 10-min TTL.
- `POST /api/auth/verify-otp` accepts `007320` directly via the
  `identifier in TEST_IDENTIFIERS and body.code == TEST_OTP_CODE` branch.

`shubham@bottom-time.com` is a **real super-admin**, not a test account — it
goes through the full Resend send path and gets a random 6-digit OTP via
email. There is NO `007320` bypass for shubham. Do not use shubham in
automated tests.

## Email-OTP login (existing user) — full curl walkthrough

```bash
BURL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
EMAIL="testuser@bottom-time.com"

# 1. login-init — returns 200 + phone_hint (or 404 if user not found)
curl -s -X POST "$BURL/api/auth/login-init" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"

# 2. send-otp — short-circuited for the 3 test emails; stores 007320 in db.otp_codes
curl -s -X POST "$BURL/api/auth/send-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$EMAIL\"}"

# 3. verify-otp — returns { verification_token, identifier_type:"email" }
VTOK=$(curl -s -X POST "$BURL/api/auth/verify-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$EMAIL\",\"code\":\"007320\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['verification_token'])")

# 4. login-complete — returns { access_token, user }
ACCESS=$(curl -s -X POST "$BURL/api/auth/login-complete" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"email_verified_token\":\"$VTOK\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 5. Use it
curl -s "$BURL/api/auth/me" -H "Authorization: Bearer $ACCESS"
```

## Signup (new user) — flow shape

For the 3 test emails only (since live OTP would never deliver `007320`):

1. `POST /api/auth/signup-init`        → 200 `{ ok: true }`
2. `POST /api/auth/store-signup-data`  → 200 `{ ok: true }` (name, role, phone)
3. `POST /api/auth/send-otp`           → 200 (writes `007320`)
4. `POST /api/auth/verify-otp`         → `verification_token`
5. `POST /api/auth/signup-complete`    → `access_token`

## Phone OTP

Twilio Verify v2 (service SID `VA96841b...`). Phone-step bypass behaviour
varies — check `_phone_in_test_set` helper in `auth.py` for the current rule.
For email-only flows above, the phone step is not exercised.

## Bearer token

All authenticated endpoints expect `Authorization: Bearer <access_token>`.
`X-Session-Id` is optional but the backend's `touch_session` hook uses it to
update `device_sessions.last_used_at`. For automated tests, omit it; the
endpoints all work without a session id.

## Things NOT to do in tests

- Don't call OTP endpoints with emails outside the allow-list — Resend will
  send real mail to real inboxes.
- Don't use `shubham@bottom-time.com` for login tests — no bypass.
- Don't write to MongoDB directly to mint sessions; go through
  `/api/auth/login-complete` so `device_sessions` / `users.last_login_at` /
  analytics events all wire up correctly.
- Don't hardcode the JWT secret — get the access token from the API and
  forget where it came from.
