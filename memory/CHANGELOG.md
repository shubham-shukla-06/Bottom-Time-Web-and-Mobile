# Bottom Time - Changelog

## 2026-04-14: CVE Patching — Dependency Upgrades

### Packages Upgraded (24 CVEs patched)
| Package | From | To | CVEs Fixed |
|---------|------|----|------------|
| aiohttp | 3.13.3 | 3.13.5 | 10 (DNS cache, NTL info leak, parser bugs) |
| cryptography | 46.0.4 | 46.0.7 | 3 (EC key validation, DNS constraints, buffer read) |
| pymongo | 4.5.0 | 4.16.0 | 1 (out-of-bounds read CVE-2024-5629) |
| motor | 3.3.1 | 3.7.1 | — (dependency of pymongo upgrade) |
| starlette | 0.37.2 | 1.0.0 | 2 (multipart form, file parsing) |
| fastapi | 0.110.1 | 0.135.3 | — (required for starlette 1.0) |
| pyjwt | 2.11.0 | 2.12.1 | 1 (crit header validation CVE-2026-32597) |
| requests | 2.32.5 | 2.33.1 | 1 (zipped paths CVE-2026-25645) |
| ecdsa | 0.19.1 | 0.19.2 | 2 (Minerva timing, DER parsing) |
| pyasn1 | 0.6.2 | 0.6.3 | 1 (DoS via recursive structures) |
| pygments | 2.19.2 | 2.20.0 | 1 (arbitrary code execution) |
| pytest | 9.0.2 | 9.0.3 | 1 (UNIX tmp directory symlink) |
| black | 26.1.0 | 26.3.1 | 1 (cache file write CVE-2026-32274) |

### Not Upgradeable (dependency conflicts)
| Package | Reason |
|---------|--------|
| litellm 1.80.0 (3 CVEs) | Requires openai>=2.8.0 but emergentintegrations pins openai==1.99.9. CVEs affect litellm's JWT auth and config endpoints — not exploitable in our app (we don't expose litellm web UI) |
| pillow 11.3.0 (2 CVEs) | v12 incompatible with moviepy. CVEs affect PSD/GZIP parsing — low risk since we only accept JPEG/PNG/WebP uploads with content-type + size validation |

### Architecture Change
- Migrated from deprecated `@app.on_event("startup"/"shutdown")` to modern `lifespan` context manager (FastAPI 0.135 best practice)

## 2026-04-14: Automated Security Scanner

### New Feature: Security Scanner System
- **`security_scanner.py`** (backend): 9-category automated scanner
  - Secret detection (regex patterns for API keys, tokens, passwords)
  - Dangerous code patterns (eval, exec, os.system, pickle, etc.)
  - Auth coverage (verifies all non-public endpoints have Depends(get_current_user))
  - Environment config (checks CORS wildcard, weak JWT secret, placeholder values)
  - MongoDB security (detects find_one() without _id exclusion)
  - Rate limiting (verifies auth endpoints have @limiter.limit)
  - Dependency vulnerabilities (via pip-audit for Python CVEs)
  - Frontend security (dangerouslySetInnerHTML, localStorage sensitive data)
  - File upload security (content-type validation, size limits)
- **`routes/security.py`** (API): Admin-only endpoints
  - `POST /api/admin/security/scan` — trigger full scan
  - `GET /api/admin/security/latest` — get most recent scan
  - `GET /api/admin/security/history` — get scan history
  - `GET /api/admin/security/findings/{scan_id}` — filtered findings
- **`SecuritySection.js`** (frontend): Admin panel UI
  - Score ring (0-100) with color-coded assessment
  - 9 check cards showing pass/fail status
  - Filterable findings list (severity + type)
  - Run Scan button for on-demand scanning
- **Startup scan**: Automatically runs on server startup, results stored in MongoDB
- Installed `pip-audit` for dependency vulnerability scanning

## 2026-04-14: Comprehensive Codebase Refactoring

### Phase 1: Security Hardening
- **JWT secret fail-fast**: Removed insecure default `'your-secret-key-change-in-production'` from `config.py`. Now uses `os.environ['JWT_SECRET_KEY']` (fails immediately if missing)
- **Security headers**: Added CSP, Cache-Control, Pragma headers to SecurityHeadersMiddleware in `server.py`
- **Rate limiting on all auth routes**: Added `@limiter.limit` to previously unprotected endpoints: `signup-init` (15/min), `store-signup-data` (15/min), `social/google` (10/min), `social/google-code` (10/min), `social/microsoft` (10/min), `social/microsoft-token` (10/min), `social/signup-complete` (10/min)
- **Pydantic field validation**: Added `max_length`, `min_length`, `ge`, `le` constraints to models: `SendOTPRequest`, `VerifyOTPRequest`, `SignupInitRequest`, `CompleteSignupRequest`, `LoginInitRequest`, `CompleteLoginRequest`, `MessageSend`, `ReviewCreate`, `ReportCreateRequest`
- **Input length validation**: Added `len(email) > 254` checks in signup/store endpoints

### Phase 2: Stale File Cleanup
- Deleted: `/app/300`, `/app/backend/=2.0.0`, `/app/backend_test.py`, `/app/auth_testing.md`, `/app/INTEGRATION_SETUP.md`, `/app/yarn.lock`
- Archived superseded test files: `test_admin_dashboard.py`, `test_admin_refactor.py`, `test_dive_advanced_v2.py`, `test_trip_planner.py` → `/app/backend/tests/archive/`

### Phase 3: Backend Refactoring
- **`tax_engine.py` (NEW, 362 lines)**: Extracted from `routes/tax.py` (1155→719 lines). Contains: `DEFAULT_TAX_RATES`, tax category detection, GST/TCS calculation, payout computation, PAN verification (Sandbox.co.in), FastGST live rate lookups, booking GST matrix
- **`shipping_helpers.py` (NEW, 358 lines)**: Extracted from `routes/shipping.py` (1185→773 lines). Contains: Pydantic models, mock carrier data, Shiprocket token management, rate calculation helpers, mock order/AWB/tracking generation
- **Cross-module imports updated**: `payments.py`, `shop_admin.py`, `operator_listings.py` now import from `tax_engine`. `fulfillment.py` now imports from `shipping_helpers`

### Phase 5: Code Quality
- Verified all MongoDB queries exclude `_id` in projections
- Verified no `datetime.utcnow()` usage (all use `datetime.now(timezone.utc)`)
- Verified no `eval()`/`exec()` usage
- Verified no `console.log` in frontend
- Full Python lint pass (ruff) — zero errors

### Testing
- Testing agent iteration 87: **100% pass rate** (20/20 backend, all frontend pages)
- All auth flows verified
- All security headers confirmed present
- Pydantic validation working
- Extracted modules importing correctly

## 2026-02-13: OTP Email Redesign & Code Quality Sweep
(See previous changelog entries)
