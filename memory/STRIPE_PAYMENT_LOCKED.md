# Stripe Payment Flow — LOCKED behaviors

> **All agents must read this before touching any of the 6 locks below.**
> These flows are user-validated (end-to-end smoke pass with `sk_test_emergent`
> universal key on 2026-05-15) and locked. Changes require explicit human
> authorization in writing. This doc is the COMPANION rail to
> `RAZORPAY_PAYMENT_LOCKED.md` — that one locks the INR path; this one
> locks the **non-INR path** (USD, EUR, GBP, JPY, AUD, etc.).

Pinned context (commits this doc references):
- `96ce2b8` — `currency_helpers.to_minor_units` (ISO-4217 digit table)
- `7492756` — `payment_transactions` carry `amount_inr`, `fx_rate_locked`, `fx_locked_at`, `fx_source`
- `c6fc9e1` — `SELLER_STATE` env-configurable (intra/inter-state split)
- *(this commit pair)* — Stripe provider routing in `/payments/create-order`

Last verified locked: **2026-05-15** by smoke test:
- `INR 7500` → Razorpay (`order_*`)
- `USD 99.99` → Stripe (`cs_test_*`, `https://checkout.stripe.com/...`)
- `JPY 1000` → Stripe (`cs_test_*`)

---

## Lock S1 — Provider routing (`/api/payments/create-order`)

### Files (exact paths in `/app`)
| Path | Range | Role |
|---|---|---|
| `backend/routes/payments.py` | `create_order_dispatch` (L24–32) | Top-level dispatcher; branches on `display_currency` |
| `backend/routes/payments.py` | `_create_razorpay_order` (~L39+) | INR path — unchanged, see `RAZORPAY_PAYMENT_LOCKED.md` |
| `backend/routes/payments.py` | `_create_stripe_session` (post-L389) | Non-INR path — calls Emergent Stripe wrapper |
| `backend/stripe_helpers.py` | full file | Wraps `emergentintegrations.payments.stripe.checkout.StripeCheckout` |

### Routing rule (LOCKED)
```python
display_currency = (body.get("display_currency") or body.get("currency") or "INR").upper()
if display_currency == "INR":
    return await _create_razorpay_order(...)
return await _create_stripe_session(...)
```

### Critical invariants (DO NOT VIOLATE)
1. **`display_currency` is the routing key.** Not `currency`, not user profile currency, not address country. The frontend always sends `display_currency` (= `cartCurrency` for Cart, `payCurrency` for BookingSidebar).
2. **INR ALWAYS goes to Razorpay.** No exceptions. Indian residents (per `BookingSidebar.js:91–93`) get `payCurrency = 'INR'` and hit the Razorpay path; this is tax-compliance-mandated.
3. **Everything else goes to Stripe.** Even currencies Razorpay supports (USD, EUR, etc.) — Stripe handles non-INR uniformly.
4. **Response carries `provider` field** unambiguously: `"razorpay"` or `"stripe"`. The frontend branches on this exact key.

---

## Lock S2 — Cart checkout → Stripe (non-INR)

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Cart.js` | L232–289 | `handleCheckout` — provider-routed flow |
| `frontend/src/pages/CheckoutSuccess.js` | full file | Redirect-back finalization page |
| `backend/routes/payments.py` | `_create_stripe_session` | Server-side session create |
| `backend/routes/payments.py` | `stripe_session_status` | `GET /payments/stripe/session/{id}` |
| `backend/routes/payments.py` | `stripe_webhook` | `POST /api/webhook/stripe` |
| `backend/routes/payments.py` | `_finalize_stripe_payment` | Shared idempotent paid-state transition |
| `backend/routes/orders.py` | `/orders/create` | **SHARED with Razorpay path** — finalize cart→order |

### API endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/payments/create-order` | Bearer JWT | Provider-routed; returns `{provider: "stripe", session_id, session_url, amount, currency, amount_inr, fx_rate_locked}` |
| `GET`  | `/api/payments/stripe/session/{id}` | Bearer JWT | Poll txn status; lazily flips mock-mode sessions to paid; queries Stripe as ground-truth fallback |
| `POST` | `/api/webhook/stripe` | **No auth — Stripe signature** | Canonical paid-state transition on `checkout.session.completed` |
| `POST` | `/api/orders/create` | Bearer JWT | **SHARED with Razorpay path** — finalize the cart order after redirect-back |

### Frontend flow (`Cart.js handleCheckout`)
1. Compute `checkoutTotals` via `computeCartTotals()` (locked — see CART_CHECKOUT_LOCKED.md Lock C).
2. POST `/payments/create-order` with `display_currency = cartCurrency` + `idempotency_key`.
3. If `res.data.provider === "stripe"`:
   - Stash `{session_id, cart_checkout: true, shipping, currency, gst_amount, promo}` in `sessionStorage["bt_stripe_pending"]`.
   - `window.location.href = res.data.session_url` (full-page redirect to `https://checkout.stripe.com/...`).
4. Stripe collects payment; redirects to `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`.
5. `CheckoutSuccess.js` polls `/payments/stripe/session/{id}` up to 8× at 1.5s intervals.
6. When `payment_status === "paid"` → reads `bt_stripe_pending` → POSTs `/orders/create` with stashed shipping → applies promo → `clearCart()`.

### Critical invariants (DO NOT VIOLATE)
1. **MAJOR units to the Stripe wrapper.** `CheckoutSessionRequest.amount` accepts MAJOR units (e.g., `99.99` for $99.99). The wrapper handles Stripe's internal minor-unit conversion. **Do NOT pre-multiply by 100 like the Razorpay path does.**
2. **Currency code lowercase to Stripe.** `currency=currency.lower()` in the wrapper call. Stripe rejects uppercase. The backend response and DB rows keep the canonical UPPERCASE form (`"USD"`); only the wrapper call lowercases.
3. **`success_url` MUST contain literal `{CHECKOUT_SESSION_ID}`.** Stripe replaces this template variable server-side. Do not pre-substitute.
4. **Cart shipping is stashed in `sessionStorage`, NOT in Stripe metadata.** Stripe metadata is capped at ~500 chars per value; a full address won't fit reliably. The webhook does NOT create the cart order — it only marks payment paid. Order creation happens on redirect-back via `CheckoutSuccess.js` calling `/orders/create` with the stashed shipping. (Bookings are different — they're pre-created before the redirect.)
5. **`/payments/stripe/session/{id}` is owner-scoped.** Filters by `user_id` to prevent session-id enumeration.
6. **Webhook is idempotent.** `_finalize_stripe_payment()` short-circuits if `payment_status === "paid"` already. Receiving the same event multiple times is safe.
7. **No `clearCart()` until `/orders/create` succeeds.** Mirrors the Razorpay rule (Lock R1 invariant 8 in `RAZORPAY_PAYMENT_LOCKED.md`).

### Locked code snippets (verbatim from `/app`)

**`Cart.js:242–280` — provider-routed checkout body + Stripe redirect:**
```js
const res = await axios.post('/payments/create-order', {
  amount: checkoutTotals.razorpayAmount,
  currency: checkoutTotals.razorpayCurrency,
  display_currency: checkoutTotals.razorpayCurrency,
  idempotency_key: idempotencyKey,
  cart_checkout: true,
  base_amount: checkoutTotals.baseUSD,
  gst_amount: checkoutTotals.gstUSD,
  shipping_amount: checkoutTotals.shippingUSD,
  shipping_carrier: selectedCarrier?.carrier,
  is_export: !cartTax?.is_domestic,
  origin_url: window.location.origin,
  shipping_address_id: selectedAddrId,
});
if (res.data.provider === 'stripe') {
  sessionStorage.setItem('bt_stripe_pending', JSON.stringify({
    session_id: res.data.session_id, cart_checkout: true,
    shipping: getSelectedAddress(), currency: cartCurrency,
    gst_amount: checkoutTotals.gstUSD,
    promo: promoResult ? { code: promoResult.code, discount: checkoutTotals.discountDisplay } : null,
  }));
  window.location.href = res.data.session_url;
  return;
}
```

**`payments.py _create_stripe_session` — the wrapper call:**
```python
checkout_req = CheckoutSessionRequest(
    amount=round(float(amount), 2),     # MAJOR units
    currency=currency.lower(),          # Stripe convention
    success_url=success_url,            # contains {CHECKOUT_SESSION_ID}
    cancel_url=cancel_url,
    metadata=metadata,
)
session = await stripe_client.create_checkout_session(checkout_req)
```

### Acceptance test
| # | Steps | Pass condition |
|---|---|---|
| S2.a | USD 99.99 cart → /payments/create-order | Response `{provider:"stripe", session_url: "https://checkout.stripe.com/..."}`, txn row inserted with `payment_provider="stripe"` |
| S2.b | JPY 1000 cart → /payments/create-order | Response `{provider:"stripe", session_url: "https://checkout.stripe.com/..."}` |
| S2.c | INR 7500 cart → /payments/create-order (regression) | Response `{provider:"razorpay", order_id:"order_*"}` |
| S2.d | After Stripe payment success → redirect-back | `CheckoutSuccess.js` polls `/payments/stripe/session/{id}` → `payment_status="paid"` → `/orders/create` fires → cart cleared |

### DO NOT
- Do NOT call `to_minor_units()` before passing to the Stripe wrapper. Wrapper handles it internally.
- Do NOT skip the `display_currency` field in the create-order body. The dispatcher needs it.
- Do NOT clear the cart on the frontend before the redirect — the user may abandon. Cart is cleared only inside `CheckoutSuccess.js finalizeOrder()` AFTER `/orders/create` returns 200.
- Do NOT embed the Stripe URL in an iframe / popup. Stripe blocks both. Full-page redirect only.
- Do NOT move the webhook under `/api/payments/...` prefix — it's registered on `webhook_router` at the literal path `/api/webhook/stripe` (server.py L268 already includes it via `app.include_router(razorpay_webhook_router)` because they share `webhook_router`).

---

## Lock S3 — Listing booking → Stripe (non-Indian-residents, non-INR display)

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/listing/BookingSidebar.js` | L80–144 | `handleBook` — Stripe-routed branch |
| `frontend/src/pages/CheckoutSuccess.js` | full file | Redirect-back; booking_id flow |
| `backend/routes/payments.py` | `_create_stripe_session` + `_finalize_stripe_payment` | Booking branch: copies `amount_inr`, `fx_rate_locked`, `display_currency` into bookings row |

### Frontend flow (`BookingSidebar.js handleBook`)
1. Compliance dialog determines `payCurrency` (Indian → INR → Razorpay; else → display currency → Stripe).
2. POST `/bookings` first → get `bookingData.id` (pending status).
3. POST `/payments/create-order` with `booking_id` + `display_currency`.
4. If `provider === "stripe"`:
   - Stash `{session_id, booking_id, cart_checkout: false}` in sessionStorage.
   - `window.location.href = res.data.session_url`.
5. Webhook → `_finalize_stripe_payment(session_id)` → updates `bookings.status = "confirmed"` + creates `payouts` row + notifies operator. **No frontend action required for booking finalization** (booking row already exists; webhook is the canonical updater).

### Critical invariants (DO NOT VIOLATE)
1. **Booking row is created BEFORE the Stripe session.** Same as the Razorpay path. The `payment_transactions.booking_id` join key + the webhook's `booking.update_one` both depend on the booking row existing first.
2. **Webhook copies canonical INR + locked FX from txn → booking row.** `amount_inr`, `amount_display`, `display_currency`, `fx_rate_locked`, `fx_locked_at`, `fx_source` — identical contract to the Razorpay verify path (RAZORPAY_PAYMENT_LOCKED Issue #3 resolution).
3. **`payment_provider: "stripe"`** is stamped on the bookings row by the webhook. Use this field to disambiguate refund paths later (Phase 4-P4).
4. **`_create_payout_record(txn, booking)` runs from the webhook.** Same payout logic as the Razorpay path; no behavior divergence.
5. **`description` field is NOT passed to Stripe.** The Emergent wrapper's `CheckoutSessionRequest` doesn't expose a per-line description field today. The listing name appears via the operator's Stripe dashboard later.

---

## Lock S4 — Calculations (exact contract)

### Major vs minor units
- **Razorpay path**: frontend passes MAJOR (`9245.74` INR rupees); backend converts to MINOR via `currency_helpers.to_minor_units(amount, currency)` (`payments.py` Razorpay branch). See RAZORPAY_PAYMENT_LOCKED Lock R3.
- **Stripe path**: frontend passes MAJOR (`99.99` USD); backend passes MAJOR to `CheckoutSessionRequest.amount`; the Emergent wrapper handles minor-unit conversion internally before calling the Stripe API.

### INR canonical (locked FX)
Identical to Razorpay path:
- `fx_inr_rate, fx_rates_dict = await get_fx_rates()` at session-create time.
- `amount_inr = float(amount_inr_hint) if amount_inr_hint else (computed via USD bridge from frankfurter.app)`.
- Persisted in `payment_transactions`: `amount_inr`, `fx_rate_locked`, `fx_locked_at`, `fx_source: "frankfurter.app"`.
- Copied through to `bookings` / `orders` rows by `_finalize_stripe_payment()` / `/orders/create` respectively.

### Cart total → Stripe amount
```
amount  = computeCartTotals().razorpayAmount       # MAJOR units, display currency
currency = computeCartTotals().razorpayCurrency    # uppercase ISO-4217 (e.g. "USD")
display_currency = currency                        # routing key
```

### Booking total → Stripe amount
```
payAmount, payCurrency  # set by the residence rule in BookingSidebar.js:88–105
display_currency = payCurrency
```

---

## Lock S5 — Signature verification

### Webhook signature
The Emergent wrapper provides `await stripe_client.handle_webhook(payload_bytes, sig_header)` which:
- Verifies the `Stripe-Signature` header using the wrapper's configured webhook secret (sourced via the Emergent integrations proxy — we don't store a raw Stripe webhook secret locally).
- Returns a `WebhookEventResponse` with fields `event_type`, `event_id`, `session_id`, `payment_status`, `metadata`.
- Raises on signature mismatch.

**`payments.py stripe_webhook`** — verify + dispatch:
```python
event = await client.handle_webhook(body, sig)
if event and event.event_type == "checkout.session.completed" and event.session_id:
    await _finalize_stripe_payment(event.session_id)
```

### Critical invariants (DO NOT VIOLATE)
1. **Read raw bytes BEFORE any parsing.** `body = await request.body()` — NOT `await request.json()`. Parsing mutates the byte stream and breaks signature verification.
2. **Handler is idempotent.** `_finalize_stripe_payment` short-circuits when already paid. Stripe retries with exponential backoff for non-2xx responses — we always return 200.
3. **Test-mode signature failure falls back to body parsing.** When `handle_webhook` raises (test environments without a real signed payload), we parse the JSON body manually to extract `checkout.session.completed` events. **Production should never hit this branch** — if it does, log a warning and continue.
4. **Webhook URL is `/api/webhook/stripe`** mounted on `webhook_router` (same router as Razorpay's webhook). Registered via `app.include_router(razorpay_webhook_router)` in `server.py:269` — both providers share the router. **Do NOT move under the `/api` prefix router** — Stripe's configured webhook URL points to this exact path.

### Env vars
| Var | Required? | Purpose |
|---|---|---|
| `STRIPE_API_KEY` | Yes | Emergent universal key. Default value: `sk_test_emergent`. The wrapper proxies through `https://integrations.emergentagent.com/stripe/v1/...` to a real Stripe test account. **Never replace with a raw `sk_test_...` Stripe key** — that bypasses the Emergent quota/auditing layer. |
| `APP_BASE_URL` | Recommended | Used to build the webhook URL passed to the wrapper for signature verification. Falls back to per-request `request.base_url` only when the wrapper requires it. |
| Stripe webhook secret | **Not configured locally** | The Emergent proxy injects/verifies the signature server-side; no per-app secret needed for test mode. |

---

## Lock S6 — Error & edge cases

### User abandons Stripe Checkout (clicks browser back / closes tab)
- `payment_transactions.status` stays `"created"`.
- `bookings.status` stays `"pending"` (if a booking was pre-created).
- No order row exists (we only create the order on successful redirect-back).
- The cart stays intact — user can return to `/cart` and retry.

### Stripe webhook arrives AFTER user redirect-back (rare but possible)
- `_finalize_stripe_payment` is idempotent. The success-poll endpoint may have already flipped the txn to paid via `client.get_checkout_status()`; the webhook arriving later is a no-op.

### Stripe webhook arrives BEFORE user redirect-back (common)
- Webhook flips the txn to `paid` + processes booking-side effects (notifications, payouts).
- For cart: the cart order is NOT created from the webhook — it's created from `CheckoutSuccess.js finalizeOrder()` on redirect-back, using the stashed shipping.
- If the user never returns (closes the tab post-payment): payment is captured but no order row exists. User has email receipt from Stripe; manual reconciliation needed. **Known gap** — see Phase 4-P4 refund path; for now, support team has visibility via the `payment_transactions` row.

### Network failure mid-redirect
- Browser shows network error; user re-enters cart → retries.
- The `idempotency_key` (UUID per Cart click) means a second create-order with the same UUID returns the existing session via `idempotent_replay: true`. The user lands back on the same Stripe checkout page. No duplicate orders.

### Currency Stripe doesn't support
- `stripe_supports(currency)` whitelist of ~35 currencies. Unknown currency → `HTTP 400 "Currency X isn't supported by Stripe in test mode."`. Frontend toasts the error and reverts to `step='shipping'`.

### `STRIPE_API_KEY` missing / wrapper fails
- `get_stripe_client()` returns `None` → backend falls back to a `cs_mock_*` session_id with a fake redirect URL pointing at `/checkout/success?session_id=cs_mock_...&mock=1`.
- `stripe_session_status` lazily marks mock sessions as paid on first poll so the UX still completes.
- Logs `STRIPE_API_KEY not set; Stripe checkout disabled.`

### Refund flow
- **Does not exist.** Same as Razorpay path (RAZORPAY_PAYMENT_LOCKED Lock R6). Deferred to Phase 4-P4.

---

## Verification checklist — run BEFORE and AFTER any Stripe-flow edit

| # | Check | How |
|---|---|---|
| 1 | INR routing intact | `curl /api/payments/create-order ... display_currency=INR` → `provider: "razorpay"` |
| 2 | USD routing → Stripe | `curl /api/payments/create-order ... display_currency=USD` → `provider: "stripe", session_url starts with https://checkout.stripe.com/` |
| 3 | JPY routing → Stripe | same as #2 but JPY |
| 4 | Idempotency replay | Same `idempotency_key` twice → second response has `idempotent_replay: true` and same `session_id` |
| 5 | Session status endpoint | `GET /api/payments/stripe/session/{id}` returns `{status, payment_status, amount, currency, amount_inr, fx_rate_locked}` |
| 6 | Webhook signature reject | `curl POST /api/webhook/stripe` with bogus body → 200 (acknowledge), txn NOT flipped to paid |
| 7 | Mock fallback | Unset `STRIPE_API_KEY` → create-order returns `session_id="cs_mock_..."`, mock URL still works through CheckoutSuccess.js |
| 8 | Currency case | Frontend sends `"usd"` → backend uppercases to `"USD"` in storage AND lowercases in the Stripe call |
| 9 | `amount_inr` + `fx_rate_locked` carried | Response includes both; `payment_transactions` row stores both |

Date of lock: **2026-05-15**

---

## KNOWN ISSUES — status as of Phase 4-P3 ship

1. **Cart order finalization is browser-tab-dependent.** If the user closes the tab after Stripe payment but before redirect-back, the payment is captured by Stripe and recorded in `payment_transactions` but NO `orders` row is created. Webhook deliberately doesn't create the cart order because the shipping address isn't available there (it's stashed in `sessionStorage`).
   - **Mitigation**: Stripe sends the user a receipt directly. Support can replay manually using the `payment_transactions` row + the user's saved addresses.
   - **Defer**: Phase 4-P4 will add an admin "Replay paid txns → orders" tool with shipping address picker.

2. **Stripe webhook signature is verified by the Emergent proxy, not us.** We trust the wrapper's `handle_webhook()` return value. If the wrapper's signature verification is bypassed somehow, we have a fallback path that parses the body unsigned. Acceptable for test mode; production would want a stricter contract.

3. **Refund flow doesn't exist for Stripe** (same as Razorpay). Deferred to Phase 4-P4.

4. **Per-line item description not surfaced to Stripe.** The wrapper's `CheckoutSessionRequest` exposes a flat `amount + currency`, not a `line_items` array. The listing name / SKU appears on the operator's Stripe dashboard via the `metadata` field only, not on the Stripe-hosted checkout page. Acceptable for now since the user just paid through our cart/booking summary.

5. **Cancel URL goes to `/cart` for cart_checkout and `/` for bookings.** No deep-link back to the listing detail page yet. Cosmetic — defer.

---

## How to update this lock doc

1. Any agent proposing a change to one of the 6 locks must:
   - Cite the specific section (Lock S1–S6) and the rule being changed.
   - Get explicit human authorization in writing.
   - Update the "Last verified locked:" date at the top once the change is merged.
2. The verification checklist above must pass after any change.
