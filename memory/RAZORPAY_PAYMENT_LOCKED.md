# Razorpay Payment Flow — LOCKED behaviors

> **All agents must read this before touching any of the 6 locks below.**
> These flows are user-validated (end-to-end with `rzp_test_***lBI9` test
> key) and locked. Changes require explicit human authorization in
> writing. This doc COMPLEMENTS `CART_CHECKOUT_LOCKED.md` — that one
> locks the cart **calculation**; this one locks the **payment leg**.

Pinned context (commits this doc references):
- `e2b27db` — `is_domestic` accepts ISO 'IN' (used by `/tax/calculate-cart` upstream)
- `505ab9b` — native-INR domestic GST `totals_inr` block (feeds Razorpay amount)
- `0955d5e` — CGST/SGST/IGST display split (consumed by Order Summary)
- `c6fc9e1` — `SELLER_STATE` env-configurable (drives intra/inter-state split)
- `978d1a5` — single canonical country list (used in shipping address picker)

Last verified locked: **2026-05-15** by user (end-to-end Razorpay test-mode
modal renders on BOTH Cart and Listing-booking flows; backend
`/api/payments/create-order` returns real `order_*` ids; signature
verification path intact).

---

## Lock R1 — Cart checkout → Razorpay

> **Provider routing (Phase 4-P3)**: INR → Razorpay (this lock). Non-INR → Stripe (see `STRIPE_PAYMENT_LOCKED.md` Lock S1/S2). The dispatcher at `payments.py create_order_dispatch` branches on `display_currency`. This lock applies only to the INR branch.

### Files (exact paths in `/app`)
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Cart.js` | L229–268 | `handleCheckout` — opens Razorpay modal, handler→verify→`/orders/create` |
| `frontend/src/utils/cartCalc.js` | L1–146 | `computeCartTotals()` — single source of truth for `razorpayAmount` + `razorpayCurrency` |
| `backend/routes/payments.py` | L17–106 | `POST /payments/create-order` — server-side Razorpay order create |
| `backend/routes/payments.py` | L109–165 | `POST /payments/verify` — HMAC signature verify + completed-state persist |
| `backend/routes/orders.py` | L12 onward | `POST /orders/create` — fires AFTER `verify` returns 200; clears cart |
| `backend/config.py` | L25–30 | Razorpay SDK client construction (gated on non-empty key+secret) |

### API endpoints (URL + method + auth)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/payments/create-order` | Bearer JWT | Create Razorpay order; insert `payment_transactions` row with `status=created` |
| `POST` | `/api/payments/verify` | Bearer JWT | Verify `razorpay_signature` via SDK; mark `status=completed, payment_status=paid` |
| `POST` | `/api/payments/mock-verify` | Bearer JWT | Used ONLY when backend Razorpay creds are empty (`mock: true` branch) |
| `POST` | `/api/orders/create` | Bearer JWT | Persist the shop order row + clear the cart server-side |
| `POST` | `/api/webhook/razorpay` | **No auth — HMAC** | Async server-to-server payment.captured / payment.failed updates |

### State stores
- `useAuthStore` — supplies bearer JWT via axios interceptor
- `useCartStore` — `cartItems`, `cartTotal`, `clearCart()`
- `useUIStore` — `currency` (display), `exchangeRates` (USD-base from frankfurter)
- Local `Cart.js` state — `cartCurrency` (auto-switches to INR for India addresses), `cartTax`, `shippingCost`, `selectedAddrId`, `selectedCarrier`, `paymentSuccess`, `step ∈ {cart|shipping|paying}`

### Critical invariants (DO NOT VIOLATE)
1. **Use `computeCartTotals()` output verbatim.** Cart.js L233–238 recomputes totals at checkout time with shipping included — the result's `razorpayAmount` + `razorpayCurrency` MUST be passed straight to `/payments/create-order` and into the `new Razorpay(options)` block. **No inline recomputation.**
2. **`razorpayAmount` is in MAJOR units in the frontend, MINOR in the backend.** Frontend passes `amount: 9245.74` (rupees). Backend converts to paise: `int(round(amount * 100))` (`payments.py:64, 72`). Razorpay SDK strictly requires the minor unit. **Do not pre-multiply on the client.**
3. **`razorpayCurrency` equals `displayCurrency`** at all times in the cart flow (`cartCalc.js:116`). The cart page auto-switches `displayCurrency` to `INR` whenever the shipping address resolves to India (`Cart.js:187, 210`). This guarantees what the user sees in Order Summary == what Razorpay charges.
4. **`payment_transactions` row is inserted BEFORE the SDK call** (`payments.py:61, 96`). The order_id returned by Razorpay is the join key for `verify` to look up the txn. No txn row → `verify` 404s.
5. **`/payments/verify` rejects on signature mismatch** by setting `status=failed` and raising HTTP 400 (`payments.py:130–135`). NEVER persist the order, clear the cart, or set `paymentSuccess=true` without a verified handler response.
6. **`/orders/create` is called AFTER `verify` returns 200** — not before, not in parallel (`Cart.js:261`). The verify endpoint sets `payment_status=paid` first; orders/create depends on that.
7. **`prefill` carries the saved shipping address.** Name + email + phone come from the selected `<Address>` row + `user` object (`Cart.js:263`). Do not prefill from a hardcoded constant.
8. **`modal.ondismiss`** restores `setStep('shipping')` and `setCheckingOut(false)` (`Cart.js:262`). The user must be able to retry without a full page reload.

### Locked code snippets (verbatim from `/app`)

**`Cart.js:240–250` — create-order body shape (the contract):**
```js
const res = await axios.post('/payments/create-order', {
  amount: checkoutTotals.razorpayAmount,
  currency: checkoutTotals.razorpayCurrency,
  cart_checkout: true,
  base_amount: checkoutTotals.baseUSD,
  gst_amount: checkoutTotals.gstUSD,
  shipping_amount: checkoutTotals.shippingUSD,
  shipping_carrier: selectedCarrier?.carrier,
  is_export: !cartTax?.is_domestic,
});
```

**`Cart.js:260–266` — Razorpay options + open:**
```js
const options = { key: res.data.key_id, amount: res.data.amount, currency: res.data.currency, order_id: res.data.order_id, name: 'Bottom Time', description: 'Shop Purchase',
  handler: async (response) => { try { const verifyRes = await axios.post('/payments/verify', { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }); if (verifyRes.data.verified) { await createOrder(verifyRes.data.payment_id); setPaymentSuccess(true); clearCart(); } } catch (e) { toast.error('Payment verification failed'); } setCheckingOut(false); },
  modal: { ondismiss: () => { setCheckingOut(false); setStep('shipping'); } },
  prefill: { name: getSelectedAddress()?.name, email: user?.email, contact: getSelectedAddress()?.phone || user?.phone },
  theme: { color: '#0e7490' }
};
new Razorpay(options).open();
```

**`payments.py:70–104` — server-side order create (the canonical amount conversion):**
```python
try:
    order_data = {
        "amount": int(round(amount * 100)),
        "currency": currency,
        "payment_capture": 1,
        "notes": {
            "user_id": current_user["id"],
            "booking_id": booking_id or "",
            "cart_checkout": str(cart_checkout)
        }
    }
    order = razorpay_client.order.create(data=order_data)

    txn = {
        "id": str(uuid.uuid4()),
        "order_id": order["id"],
        "user_id": current_user["id"],
        "amount": amount,
        "currency": currency,
        "booking_id": booking_id,
        "cart_checkout": cart_checkout,
        **tax_fields,
        "status": "created",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payment_transactions.insert_one(txn.copy())
```

### Acceptance test
| # | Steps | Pass condition |
|---|---|---|
| R1.a | Login `testuser` → add product → Cart → Proceed to Shipping → select Maharashtra address → click Pay | Razorpay test-mode modal opens with Test Mode banner, "Bottom Time" merchant header, ₹ amount matching `grandTotal` from Order Summary, Cards/Netbanking/Wallet rails |
| R1.b | Submit Razorpay test card `4111 1111 1111 1111` | `/payments/verify` returns 200; `paymentSuccess=true` rendered; cart cleared; navigated to "Order Placed!" panel |
| R1.c | Modal opens → click X to dismiss | `step` reverts to `'shipping'`; `checkingOut` becomes `false`; user can retry without reload |
| R1.d | Test with Egypt address (international) | `is_export=true` in create-order body; `razorpayCurrency` = user's display currency (e.g. USD); GST line shows "Export — zero-rated" |

### DO NOT
- Do NOT multiply by 100 in the frontend — the backend does it at `payments.py:72`.
- Do NOT pass a fixed `key_id` to the SDK — always read `res.data.key_id` from the create-order response (it differs between mock and real branches).
- Do NOT call `clearCart()` or `setPaymentSuccess(true)` before `verifyRes.data.verified` is `true`.
- Do NOT skip `/orders/create` — verify only marks the payment paid, doesn't persist the shop order.
- Do NOT change `theme.color: '#0e7490'` without a design review (matches the app's cyan primary).

---

## Lock R2 — Listing booking → Razorpay

### Files (exact paths in `/app`)
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/listing/BookingSidebar.js` | L80–142 | `handleBook` — booking + Razorpay modal open |
| `frontend/src/pages/listing/BookingSidebar.js` | L53–66 | `handlePayClick` — pre-pay compliance gate (TCS/PAN) |
| `frontend/src/pages/listing/ComplianceDialog.js` | full file | Modal that captures residence country + PAN before payment |
| `backend/routes/bookings.py` | full file | `POST /bookings` — creates booking row with `status=pending` |
| `backend/routes/tax.py` | L100–230+ | `POST /tax/booking-compliance`, `POST /tax/calculate-checkout` |
| `backend/routes/payments.py` | **SHARED** with R1 | Same `create-order` + `verify` endpoints — booking_id field is the discriminator |

### API endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/bookings` | Bearer JWT | Create booking row with `status=pending`, returns `bookingData.id` |
| `POST` | `/api/tax/booking-compliance` | Bearer JWT | Returns `{is_indian_resident, total_inr, total_list, list_currency, tcs_amount, ...}` |
| `POST` | `/api/tax/calculate-checkout` | Bearer JWT | Returns `{base_total, gst_rate, gst_amount, igst, cgst, sgst, total_amount, listing_currency, sac_hsn, is_export}` |
| `POST` | `/api/payments/create-order` | Bearer JWT | **SAME endpoint as R1.** Discriminator: `booking_id` non-null + `cart_checkout=false` |
| `POST` | `/api/payments/verify` | Bearer JWT | **SAME endpoint as R1.** On verify, `payments.py:148–161` additionally updates `bookings` row → `status=confirmed, payment_status=paid` and creates a `payouts` row |

**Note**: `/payments/verify` is shared. The booking-specific post-verify logic (`_create_payout_record`) fires automatically when `txn.booking_id` is present (`payments.py:148`). The cart path skips that branch.

### State stores
- `useAuthStore` — `user`, JWT
- `useRazorpay()` hook from `react-razorpay` — provides the SDK constructor
- Local `BookingSidebar.js` state — `bookingDate`, `bookingParticipants`, `checkoutTax`, `complianceData`, `bookingSaving`

### Critical invariants (DO NOT VIOLATE)
1. **Compliance gate first.** `handlePayClick` calls `/tax/booking-compliance` BEFORE creating the order. If the listing is taxable for the user's residence, the `ComplianceDialog` collects PAN + residence country first. Only `handleBook(compliance)` opens Razorpay.
2. **Indian residents charge in INR; everyone else in display currency** (`BookingSidebar.js:88–105`). Indian residency is determined server-side via `is_india(residence_country)` (post-`e2b27db`). The frontend just reads `compliance.is_indian_resident`.
3. **Booking row is created BEFORE the Razorpay order.** `axios.post('/bookings', …)` (L85) inserts a `pending` booking row. The Razorpay `booking_id` note + `payment_transactions.booking_id` join key both depend on that row's id. Skipping it breaks the operator notification + payout creation chain at `payments.py:148–161`.
4. **`payAmount` is in the SAME currency as `payCurrency`.** Whichever branch (compliance/checkoutTax/fallback) wins, both must be set together. The Razorpay options block then passes them straight through.
5. **`description: listing.name`** — Razorpay shows this to the user (`BookingSidebar.js:123`). Don't replace with a generic string.
6. **Modal dismiss only clears `bookingSaving`** (`BookingSidebar.js:129`) — the booking row stays `pending`. The user sees the form again, can retry. **DO NOT delete the pending booking on dismiss** — operators have visibility into pending bookings; auto-cleanup happens via TTL elsewhere if needed.

### Locked code snippets (verbatim from `/app`)

**`BookingSidebar.js:88–105` — currency selection (the residence rule):**
```js
// Indian residents: charge in INR (tax compliance). Everyone else: charge in their display currency.
let payAmount, payCurrency;
if (compliance) {
  const isIndianResident = compliance.is_indian_resident;
  if (isIndianResident) {
    payAmount = compliance.total_inr;
    payCurrency = 'INR';
  } else {
    // Convert from listing currency to user's display currency
    payAmount = convertAndRound(compliance.total_list || compliance.total_inr, compliance.list_currency || listCur, currency, exchangeRates);
    payCurrency = currency;
  }
}
```

**`BookingSidebar.js:108–134` — booking-specific create-order body + modal open:**
```js
const orderRes = await axios.post('/payments/create-order', {
  amount: payAmount, currency: payCurrency, booking_id: bookingData.id,
  base_amount: checkoutTax?.base_total || payAmount, gst_rate: checkoutTax?.gst_rate || 0, gst_amount: checkoutTax?.gst_amount || 0,
  igst: checkoutTax?.igst || 0, cgst: checkoutTax?.cgst || 0, sgst: checkoutTax?.sgst || 0,
  sac_hsn: checkoutTax?.sac_hsn || '', is_export: checkoutTax?.is_export || false,
  tcs_amount: compliance?.tcs_amount || 0,
});

if (orderRes.data.mock) {
  await axios.post('/payments/mock-verify', { order_id: orderRes.data.order_id });
  toast.success('Booking confirmed & payment processed!');
  setShowBooking(false);
} else {
  const options = {
    key: orderRes.data.key_id, amount: orderRes.data.amount, currency: orderRes.data.currency, order_id: orderRes.data.order_id,
    name: 'Bottom Time', description: listing.name,
    handler: async (response) => {
      try { await axios.post('/payments/verify', { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }); toast.success('Booking confirmed & payment successful!'); setShowBooking(false); }
      catch (e) { toast.error('Payment verification failed'); }
      setBookingSaving(false);
    },
    modal: { ondismiss: () => setBookingSaving(false) },
    prefill: { name: user?.name, email: user?.email, contact: user?.phone },
    theme: { color: '#0e7490' }
  };
  new Razorpay(options).open();
  return;
}
```

### Acceptance test
| # | Steps | Pass condition |
|---|---|---|
| R2.a | Login `testuser` → `/listing/{id}` → Book Now → pick future date → Pay & Book | Razorpay test-mode modal opens, ₹6,680 (or local-currency equivalent) total, `name: "Bottom Time"`, `description: <listing.name>` |
| R2.b | Submit test card `4111 1111 1111 1111` | `/payments/verify` returns 200; `bookings.status=confirmed, payment_status=paid`; `payouts` row created via `_create_payout_record`; operator gets `payment_received` notification |
| R2.c | Indian-resident user (location_country=India) | `payAmount = compliance.total_inr`, `payCurrency = 'INR'` regardless of display currency |
| R2.d | Non-Indian user | `payAmount = convertAndRound(compliance.total_list, list_currency, displayCurrency, exchangeRates)`, `payCurrency = displayCurrency` |

### DO NOT
- Do NOT call `/payments/create-order` before `/bookings` returns the booking id.
- Do NOT skip the `/tax/booking-compliance` call for taxable listings — TCS exposure follows.
- Do NOT override `description` with a generic string; the listing name is what the user sees in Razorpay.
- Do NOT swap the residence-rule branches: Indian residents MUST charge in INR per tax compliance.
- Do NOT delete the pending booking on `ondismiss`.

---

## Lock R3 — Calculations (exact formulas as of 2026-05-15)

### Cart Sub-Total (display currency)
Per `cartCalc.js:57–61`:
```
unitInDisplay = convertAndRound(product.price, product.currency, displayCurrency, FX)
lineTotal     = round(unitInDisplay × quantity × 100) / 100
displaySubtotal = Σ lineTotal  over all cartItems
```

### Cart GST (display currency)
Per `cartCalc.js:69–74`:
- `is_domestic = cartTax.is_domestic` (driven by `is_india(shipping_country)` server-side)
- **Domestic + displayCurrency='INR'** → `gstDisplay = round(cartTax.totals_inr.gst × 100) / 100` (native INR, no FX hop)
- **Otherwise** → `gstDisplay = convertAndRound(cartTax.totals.gst, 'USD', displayCurrency, FX)`
- **International (export)** → `cartTax.totals.gst = 0` → `gstDisplay = 0`

### CGST / SGST / IGST split (per-line, in display currency)
Per `cartCalc.js:80–91`:
- Backend determines: `is_interstate = shipping_state.lower() != SELLER_STATE.lower()` (`tax_engine.py:148`)
- **Interstate or missing state** → `igst = gst_amount, cgst = sgst = 0`
- **Intrastate** (shipping_state == SELLER_STATE) → `cgst = sgst = round(gst_amount/2, 2), igst = 0`
- Display values follow the same native-INR-when-domestic-INR rule as the aggregate GST.

### Cart Shipping (display currency)
Per `cartCalc.js:95–97`:
```
shippingDisplay = shippingCostINR > 0 ? convertAndRound(shippingCostINR, 'INR', displayCurrency, FX) : 0
```
Source: `Shiprocket /rates` (or 50/800 INR flat fallback when keys absent, `shipping.py:355`).

### Cart Discount (display currency)
Per `cartCalc.js:100–103`:
```
discountDisplay = promoResult.discount > 0 ? convertAndRound(promoResult.discount, 'USD', displayCurrency, FX) : 0
```

### Cart Grand Total (the Razorpay amount)
Per `cartCalc.js:107–117`:
```
grandTotal      = round((displaySubtotal + gstDisplay + shippingDisplay − discountDisplay) × 100) / 100
razorpayAmount   = grandTotal           # major units, frontend
razorpayCurrency = displayCurrency
```
Backend then converts to minor units: `int(round(amount × 100))` (`payments.py:72`) — paise for INR, cents for USD/EUR/etc.

### Booking Sub-Total (display currency)
Per `BookingSidebar.js:32–33`:
```
unitDisplay = convertAndRound(listing.price, listing.currency, displayCurrency, FX)
lineTotal   = round(unitDisplay × participants × 100) / 100
```

### Booking GST + Grand Total
- Source of truth: `POST /tax/calculate-checkout` → returns `{base_total, gst_amount, igst, cgst, sgst, total_amount}` in the listing's currency
- Display: `formatPrice(checkoutTax.total_amount, displayCurrency, FX, listing_currency)` — `BookingSidebar.js:263`

### Booking Razorpay amount
Per `BookingSidebar.js:88–105` (the **residence rule**):
- **Indian resident (`compliance.is_indian_resident=true`)** → `payAmount = compliance.total_inr, payCurrency = 'INR'`
- **Non-Indian resident** → `payAmount = convertAndRound(compliance.total_list, list_currency, displayCurrency, FX), payCurrency = displayCurrency`

### Razorpay amount conversion (the minor-unit rule)
**Frontend passes major units; backend multiplies by 100.** This is consistent across both R1 and R2 because `payments.py:64, 72` performs the exact same `int(round(amount * 100))` regardless of the entry path. Razorpay SDK is strict about minor units — INR paise, USD cents, EUR cents. **Note**: JPY has 0 minor digits; the current `* 100` would over-charge by 100× for JPY orders. (See KNOWN ISSUES.)

---

## Lock R4 — Currency handling (CURRENT state, NOT future state)

> ⚠️ This section documents the **current** dual-currency model. Phase 1
> Item 4 of `PROPOSAL_SELLER_WAREHOUSES_INR.md` will RE-LOCK this once
> INR-canonical pricing lands. Until then: this is the baseline.

### Cart
- Cart **computes in user's display currency** (`cartCalc.js:54–61`). Product unit prices stored as `{price: float, currency: str (default "USD")}` are converted via `convertAndRound` per line.
- Backend `/tax/calculate-cart` returns USD `totals` always + INR `totals_inr` when `is_domestic=true`.
- Razorpay charges in `displayCurrency` — which auto-switches to INR for India addresses (`Cart.js:187, 210`). Net effect: domestic = INR, international = whatever the user picked.

### Listing booking
- Listing prices stored as `{price: float, currency: str}` per listing (operator-chosen, USD default).
- **Indian residents always charged in INR** regardless of display currency (`BookingSidebar.js:91–93`).
- Non-Indian residents charged in display currency (converted from listing currency).
- This means a USD-priced listing booked by an Indian user → backend Razorpay order is `currency: "INR", amount: compliance.total_inr * 100`.

### FX conversion
- **Source**: `https://api.frankfurter.app/latest?from=USD&to=...` — fetched on cart mount, cached in `useUIStore.exchangeRates`.
- **Base**: USD. INR is treated as one of the target currencies, not the canonical.
- **Applied at**: product display, line-total, cart GST (when not domestic-INR), shipping conversion, discount conversion, booking display.
- **NOT applied at**: backend Razorpay amount conversion — backend does `amount * 100` only, trusting the frontend already converted.

### USD records on backend
- `payment_transactions` stores `amount` in the **request currency** (whatever the frontend sent — INR for domestic, display currency for international/non-Indian-resident bookings).
- `tax_fields.base_amount` etc. are passed as USD by Cart.js (`checkoutTotals.baseUSD`, `Cart.js:244`). So the **same row mixes currencies**: `amount` in request currency, tax fields in USD. (See KNOWN ISSUES.)

---

## Lock R5 — Signature verification

### Payment signature (synchronous, on every payment)
Per `payments.py:123–135`:
```python
if razorpay_client:
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature
        })
    except Exception:
        await db.payment_transactions.update_one(
            {"order_id": order_id},
            {"$set": {"status": "failed", "payment_status": "failed"}}
        )
        raise HTTPException(status_code=400, detail="Payment verification failed")
```
Razorpay's SDK internally computes `hmac_sha256(secret=RAZORPAY_KEY_SECRET, message=f"{order_id}|{payment_id}").hexdigest()` and compares with `signature` using constant-time compare. Mismatch → 400, transaction marked failed, NO order persisted.

### Webhook signature (asynchronous, server-to-server)
Per `payments.py:260–270`:
```python
@webhook_router.post("/api/webhook/razorpay")
async def razorpay_webhook(request: StarletteRequest) -> dict:
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if razorpay_webhook_secret and signature:
        expected = hmac.new(
            razorpay_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
```

### Critical invariants (DO NOT VIOLATE)
1. **`compare_digest` is mandatory** — never use `==`. Timing attacks against `hmac` comparisons are a Razorpay-specific documented risk.
2. **Webhook URL is mounted on the root `app`, NOT under `/api` prefix** (`server.py:268`). The literal path is `/api/webhook/razorpay` defined in the route decorator. Don't move it under the `api_router` — Razorpay's dashboard webhook URL is configured to this exact path.
3. **`razorpay_webhook_secret` is optional today** (`payments.py:265`). When empty, signature check is **skipped** entirely — webhooks become a trust-by-network endpoint. Setting it in `.env` activates the check; the user has explicitly left it empty for now.
4. **Webhook handler is idempotent**: payment.captured upserts `status=completed, payment_status=paid` — same as `/payments/verify`. Receiving both the verify call AND the webhook is normal and safe.
5. **Signature comparison input order**: `expected, signature` — not `signature, expected`. Doesn't matter for `compare_digest` since it's symmetric, but stay consistent.

### Env vars
| Var | Required? | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | Yes (for non-mock) | Public key; shipped to frontend in `/create-order` response |
| `RAZORPAY_KEY_SECRET` | Yes (for non-mock) | Used by SDK for both order create AND signature verify |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | When empty, webhook signature check is skipped |

---

## Lock R6 — Error & edge cases

### User closes Razorpay modal without paying
- **Cart**: `modal.ondismiss` fires → `setCheckingOut(false); setStep('shipping')` (`Cart.js:262`). `payment_transactions.status` stays `created`. No `/orders/create` call. Cart is intact, user can retry.
- **Booking**: `modal.ondismiss` fires → `setBookingSaving(false)` (`BookingSidebar.js:129`). `bookings.status` stays `pending`. `payment_transactions.status` stays `created`. User can retry without re-entering booking form.

### Network failure mid-payment
- **Before Razorpay opens** (failure on `/payments/create-order`): toast "Checkout failed", state reverts. No txn row, no Razorpay order. Clean.
- **After successful payment, before `/payments/verify` POST succeeds**: Razorpay has captured payment; webhook (if configured) updates `status=completed` independently. The handler's `try/catch` swallows the verify failure with a toast. The user thinks the payment failed; backend webhook receives `payment.captured` and reconciles. **Acceptable failure mode.**
- **After `/payments/verify`, before `/orders/create`**: payment is verified-and-paid, but no shop order row exists. User sees a "Payment verification failed" toast in some edge cases; the txn row is marked paid but `orders` collection has no record. **Known soft inconsistency** (see KNOWN ISSUES).

### Duplicate submission (double-click on Pay)
- `Cart.js:231` sets `checkingOut=true` → button is `disabled` while true (visible at `Cart.js:391` `checkingOut={checkingOut}`).
- `BookingSidebar.js:271` button has `disabled={!bookingDate || bookingSaving || taxLoading}`.
- Both prevent the second click client-side. **No server-side idempotency** today — if the disabled gate is bypassed, two Razorpay orders are created and two txn rows are inserted. (See KNOWN ISSUES.)

### Refund flow
- **Does not exist.** Grep `/app/backend/` for `refund` returns nothing in the payments path. No `/api/payments/refund` endpoint, no admin UI, no operator self-serve refund button.
- Razorpay dashboard supports refunds manually, but they will NOT trigger any local DB updates without a corresponding webhook handler (today's webhook handles only `payment.captured` and `payment.failed`).
- **Booking cancellation** at `bookings.py` updates `status` to cancelled but does NOT initiate a Razorpay refund.
- **Order returns** similarly have no payment-flow integration.

### Mock-mode fallback
- When `razorpay_client is None` (empty keys), backend returns `{mock: true, order_id: "order_mock_*", key_id: ""}` (`payments.py:46–68`).
- Frontend detects `res.data.mock === true` and calls `/payments/mock-verify` directly, skipping the Razorpay SDK entirely (`Cart.js:255–259`, `BookingSidebar.js:116–119`).
- **This is the path that was being hit before commit-less env fix on 2026-05-15.** When the user reported "Razorpay test page is NOT showing", they were on this path.

---

## Verification checklist — run BEFORE and AFTER any payment-flow edit

| # | Check | How |
|---|---|---|
| 1 | Backend Razorpay client constructs | `curl /api/payments/create-order` returns `mock: false` |
| 2 | Real Razorpay order id format | Response `order_id` starts with `order_` (NOT `order_mock_`) |
| 3 | Cart pay opens real modal | Login → cart → ship to India → pay → Razorpay Test Mode banner visible |
| 4 | Booking pay opens real modal | Login → listing → Book Now → pick date → Pay & Book → Razorpay modal visible with `description: <listing.name>` |
| 5 | Test card succeeds end-to-end | Submit `4111 1111 1111 1111` → "Order Placed!" / "Booking confirmed" → `payment_transactions.payment_status=paid` |
| 6 | Modal dismiss does not poison state | Open → X → can retry without reload |
| 7 | Currency rule for Indian-resident booking | `payment_transactions.currency=INR` even when user's display currency is USD |
| 8 | GST line matches Order Summary | Razorpay-charged amount === Order Summary grand total to the paise |
| 9 | Webhook signature check (if `RAZORPAY_WEBHOOK_SECRET` set) | `curl -X POST /api/webhook/razorpay` with bad signature → 401 |
| 10 | No duplicate orders on rapid double-click | Pay button is disabled while `checkingOut` / `bookingSaving` is true |

Date of lock: **2026-05-15**
Cumulative Razorpay-related commits referenced by this doc:
- `e2b27db` — backend/tax: accept ISO 'IN' alongside 'india' for domestic GST gating
- `505ab9b` — backend/tax: compute domestic GST in INR natively
- `0955d5e` — web/cart: display CGST/SGST/IGST split on Order Summary
- `c6fc9e1` — backend/tax: SELLER_STATE configurable via env
- `978d1a5` — web+backend/countries: single canonical 245-entry country list
- *(no code commit for Razorpay key wire-in — env-only change, by design)*

---

## KNOWN ISSUES — status as of Phase 4-P1/P2 pass

> Issues #1, #2, #3 (partial), #7 RESOLVED in this pass. Issues #4, #5, #6 deferred to later phases (4-P3/P4).

1. **JPY (and KWD/BHD/etc.) minor-unit miscalculation** — **RESOLVED in `96ce2b8`**:
   Replaced `int(round(amount * 100))` with `currency_helpers.to_minor_units(amount, currency)` carrying the full ISO-4217 digit table (JPY=0, KWD/BHD/JOD=3, CLF/UYW=4, default=2). Smoke proves: JPY 1000 → 1000 minor (not 100000); KWD 10.5 → 10500 (not 1050).

2. **Frontend `=== 'india'` lowercase compare in Cart.js** — **RESOLVED in `96ce2b8`**:
   `Cart.js:212` now imports `isIndia` from `frontend/src/utils/country.js` and calls it directly. Consistent with the `978d1a5` canonical pass.

3. **Tax-fields currency mismatch on `payment_transactions`** — **PARTIALLY RESOLVED in `96ce2b8`**:
   Added `base_amount_inr`, `gst_amount_inr`, `discount_amount_inr` companions alongside the display-currency `base_amount`, `gst_amount`, `discount_amount`. The row now carries both the as-charged values AND the canonical INR equivalents, plus the locked FX rate to reconcile them. Cart.js still passes the legacy `*USD` values for the display side — that frontend follow-up is outside Phase 4-P2 scope.

4. **Cart → orders/create race window**: still open. Mitigated by the new `payment_transactions.amount_inr` + `fx_rate_locked` being available to reconstruct the order if `/orders/create` failed post-verify. Not auto-recovered yet.

5. **No refund flow**: deferred to Phase 4-P4 per `PROPOSAL_SELLER_WAREHOUSES_INR.md`.

6. **Webhook signature check is OPTIONAL**: unchanged. User left `RAZORPAY_WEBHOOK_SECRET` empty intentionally.

7. **No server-side rate-limit / idempotency on `/payments/create-order`** — **RESOLVED in `96ce2b8`**:
   Server now accepts an `idempotency_key` in the request body. When supplied, the endpoint looks up the existing `payment_transactions` row by `(user_id, idempotency_key)` and replays the same `order_id` + amount-in-minor-units in the response (with `idempotent_replay: true`). The frontend now always sends a `crypto.randomUUID()` per attempt — see `Cart.js:247` and `BookingSidebar.js:110` (post-`7492756`). A double-click on Pay will create exactly one Razorpay order regardless of how many times the request fires.

Phase 4-P1 also introduced (commit `7492756`):
- `orders` rows now carry `amount_inr`, `amount_display`, `display_currency`, `fx_rate_locked`, `fx_locked_at`, `fx_source` — pulled from the verified `payment_transactions` row at create-order time.
- `routes/orders.py:31` latent bug (display amount stored as if INR) is FIXED — order now persists both the as-paid display amount AND the canonical INR equivalent.
- Backfill migration `python -m migrations.backfill_order_fx` populated 7 orders + 11 bookings with `amount_inr` + `fx_rate_locked` derived from today's frankfurter FX. Backups in `/app/backups/`.
