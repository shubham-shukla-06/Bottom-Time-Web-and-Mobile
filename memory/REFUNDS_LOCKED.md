# Refunds Flow — LOCKED behaviors

> **All agents must read this before touching refund logic.**
> Companion lock to `RAZORPAY_PAYMENT_LOCKED.md` (R5/R6) and
> `STRIPE_PAYMENT_LOCKED.md` (S5/S6). Refunds run on the same
> provider-routing rails as payments — see Lock F1 below.

Pinned context:
- Phase 4-P3 stamped `payment_provider` on `payment_transactions` AND the
  webhook-finalize path copies it onto `orders` / `bookings` rows.
- Refund canonical INR uses ORIGINAL order's `fx_rate_locked`, NOT current FX.
- Distance Matrix is still BLOCKED (Phase 3b parked) — see
  `/app/memory/PROPOSAL_SELLER_WAREHOUSES_INR.md` and end-of-Dispatch-D report.

Last verified locked: **2026-05-15** by smoke test:
- Razorpay INR refund attempt → integration reached Razorpay API; failed on
  fake seed `pay_smoke_inr_001` (expected).
- Stripe USD refund attempt → integration reached Stripe API via Emergent
  proxy; failed with `No such checkout.session: cs_test_smoke_usd_001`
  (expected, as the seed session_id was fictitious).
- Orphan replay → real order created from a paid Stripe txn with no order,
  using admin-supplied shipping; preserved `amount_inr=14365.96, fx=95.77`.
- Idempotency / listing endpoints → 200 OK.

---

## Lock F1 — Provider routing (`POST /api/admin/refunds/create`)

Body: `{kind: "order"|"booking", id, amount_to_refund_display, reason}`

### Provider branching
```python
payment_provider = record.get("payment_provider")  # set by webhook on payment
if payment_provider == "razorpay":
    razorpay_client.payment.refund(payment_id, {"amount": minor_units, ...})
elif payment_provider == "stripe":
    # Resolve session → payment_intent → stripe.Refund.create(...)
    stripe.Refund.create(payment_intent=pi, amount=minor_units, ...)
```

### Authorization (LOCKED)
- `require_admin(current_user)` → admin role check
- `SUPER_ADMINS` email check → super-admin gate. Refunds are legally sensitive (TCS / GST credit-note implications) — never demote to plain admin.

### Critical invariants (DO NOT VIOLATE)
1. **`payment_provider` is the single routing key.** Not the currency, not the order country, not the user profile. Backfill heuristic exists for older rows (uses `txn.order_id` prefix `order_*` → razorpay, `txn.session_id` prefix `cs_*` → stripe) but the canonical source is `payment_provider`.
2. **`amount_inr` for the refund row uses the ORIGINAL order's `fx_rate_locked`.** This guarantees that `sum(orders.amount_inr) - sum(refunds.amount_inr)` is the net INR you actually received — auditable against bank statements.
3. **Partial refunds permitted.** Sum of prior `refunded_amount_display` + this refund ≤ original `amount_display` (within 0.01 tolerance). Caps enforced server-side.
4. **Order/booking row gets running totals + `refunds: [refund_id...]` array.** Status transitions:
   - `partially_refunded` → some refunds done, more refundable
   - `refunded` → fully refunded (within 0.01)
5. **Customer notification fires on success.** Always uses display currency + original `order_number`.
6. **On any non-`failed` outcome we update the underlying record.** `failed` status leaves the order untouched.

---

## Lock F2 — Webhook reconciliation (dashboard-initiated refunds)

### Files
- `backend/routes/payments.py` — Razorpay webhook: handles `refund.created`, `refund.processed`, `refund.failed`. Stripe webhook: handles `charge.refunded`, `charge.refund.updated`.
- `backend/routes/refunds.py:_reconcile_refund_from_webhook` — shared idempotent reconciler.

### Idempotency
- Lookup by `provider_refund_id`. If exists, update status only (no duplicate row).
- If new (dashboard-initiated), create a fresh refund row marked `source: "dashboard"`. Computes `amount_inr` from the linked txn's `fx_rate_locked` (still respecting Lock F1 invariant #2).

### Critical invariants
1. **Webhook never trusts the wire's `amount_inr`.** Always recompute from `from_minor_units(amount, currency) × original_fx_rate_locked`.
2. **`source: "dashboard"` is set for webhook-originated rows.** App-initiated rows carry `source: "admin_initiated"` + `admin_id`/`admin_email`.
3. **If we can't resolve the order/booking target, we log + skip.** Better to surface the gap (operator alarms) than to write an unlinked refund row.

---

## Lock F3 — Customer-facing list (`GET /api/refunds/mine`)

- Returns refund rows linked to the current user's orders or bookings.
- Strips admin fields (`admin_id`, `admin_email`, `provider_payload`).
- No support for canceling or modifying refunds from the customer side. Refund flow is one-way (admin-only initiate).

---

## Lock F4 — Orphan Stripe payment replay (S6 known issue #1)

### Files
- `backend/routes/refunds.py:list_orphan_stripe_payments` (GET /admin/orphan-stripe-payments)
- `backend/routes/refunds.py:replay_orphan_stripe_payment` (POST /admin/orphan-stripe-payments/{session_id}/replay)

### Orphan detection
A Stripe txn is "orphan" when:
- `payment_provider == "stripe"`
- `payment_status == "paid"`
- `cart_checkout == true`
- No `orders` row matches by `payment_id` OR by `pi_stripe_<sid prefix>` regex.

### Replay flow
1. Super-admin opens orphan list.
2. Picks an orphan, enters shipping (manual), optional note.
3. POST creates the missing order row with:
   - `items: []` (NOT recoverable — flagged via `fulfillment_status: "needs_review"`)
   - `amount_inr` / `fx_rate_locked` / `display_currency` copied from txn (canonical preserved)
   - `replay_source: "orphan_stripe_payment"` + `replay_admin_id` + `replay_note`
4. Customer notification: "Order has been created. Our team is verifying line items."
5. Idempotent: if order already exists for this txn, returns it with `already_existed: true`.

### Critical invariants
1. **Super-admin only.** Same gate as refund creation.
2. **`items: []`** explicitly empty. Forces operator review before fulfillment. Never auto-populate with guessed line items.
3. **Same `amount_inr` / `fx_rate_locked` as the txn.** Don't recompute at replay time — would drift from the user's original receipt.

---

## Lock F5 — Admin UI (`FulfillmentSection.js`)

### Files
- `frontend/src/components/admin/RefundModal.js` — typed-confirm modal with FX line + per-currency amount entry
- `frontend/src/pages/admin/FulfillmentSection.js:setRefundTarget` — triggers the modal

### Modal invariants
- Submit disabled until: `amount > 0 && amount <= refundable && reason.length > 3 && confirmText === order_number`.
- Shows `FX ₹{fx_rate_locked}/{currency}` and the computed INR equivalent live as user types.
- After provider call returns `status: "failed"`, surfaces `provider_error` in a toast.
- On `mock_processed`, prepends `[MOCK]` to the success toast (visible signal).
- Refund button only appears for `payment_status in ("paid", "partially_refunded")`.

---

## Lock F6 — Error & edge cases

| Case | Behavior |
|---|---|
| Razorpay 5xx (test mode), e.g. fake payment_id | Refund row written with `status: "failed"`, `provider_error: <stringified exception>`. Order untouched. |
| Stripe 404 (session not found) | Same: failed row, error captured, order untouched. |
| Stripe session has no `payment_intent` (still pending) | Same: failed row. |
| `STRIPE_API_KEY` missing OR session is `cs_mock_*` | Mock fallback: `status: "mock_processed"`, `provider_refund_id: "re_mock_<uuid>"`, `mock: true`. Order DOES advance (visible to admin as "processed"). |
| `razorpay_client` is None at startup | Same mock fallback for Razorpay. |
| Refund exceeds remaining refundable | HTTP 400 with clear message: "Refund amount exceeds remaining refundable: X.YZ CURRENCY" |
| Multiple partial refunds | Each accumulates into `refunded_amount_display` / `refunded_amount_inr`; final refund (delta ≤ 0.01) flips `payment_status` to `"refunded"`. |
| Dashboard refund arrives before app-initiated row | First-write-wins via `provider_refund_id` lookup. Webhook creates the row with `source: "dashboard"`. |
| Webhook arrives twice | `_reconcile_refund_from_webhook` is idempotent (lookup by `provider_refund_id` short-circuits if status matches). |

---

## Verification checklist — run BEFORE and AFTER any refund-flow edit

| # | Check | How |
|---|---|---|
| 1 | INR refund routes to Razorpay | seed Razorpay-paid order → `/admin/refunds/create` → backend log shows `razorpay_client.payment.refund` call |
| 2 | USD/EUR/JPY refund routes to Stripe | seed Stripe-paid order → backend log shows `stripe.Refund.create` |
| 3 | FX audit trail | refund row's `fx_rate_locked` matches original order's; `amount_inr = amount_display × fx_rate_locked` |
| 4 | Partial refund caps | second refund attempt with `amount > remaining` → HTTP 400 |
| 5 | Order/booking status transitions | full refund → `payment_status: "refunded"`; partial → `"partially_refunded"` |
| 6 | Dashboard webhook idempotency | replay same webhook twice → only one refund row |
| 7 | Customer-facing list | `GET /refunds/mine` strips admin fields |
| 8 | Orphan list excludes orders that exist | seed paid txn + matching order → not in `/admin/orphan-stripe-payments` |
| 9 | Orphan replay idempotent | replay twice → second returns `already_existed: true` |
| 10 | Admin UI: typed-confirm | RefundModal blocks submit until order_number is typed |

Date of lock: **2026-05-15**

---

## KNOWN ISSUES — status as of Phase 4-P4 ship

1. **Razorpay test mode rejects fake `pay_*` IDs with empty error message.** The `razorpay.errors.ServerError` exception sometimes has no `str(e)` value. We capture it as empty string and surface "failed" status. **Workaround**: admins can see the request in Razorpay dashboard. **Defer**: when we have a real test payment id to exercise.

2. **Stripe refund webhook reconciliation uses metadata.order_id to link back.** App-initiated refunds set `metadata.order_id` correctly. Dashboard-initiated refunds may not have it — in that case the reconciliation logs a warning and skips the link. Operators should set the order_id in metadata when refunding manually via Stripe dashboard. **Defer**: add an admin "Re-link orphan refund" tool.

3. **No refund cancellation flow.** Once initiated, refunds run to completion. Stripe / Razorpay both eventually settle (or fail). The admin UI doesn't expose a "void pending refund" path. **Defer to user request.**

4. **`items: []` in orphan-replayed orders.** The replay tool can't reconstruct cart line items from the txn alone. Operators see `fulfillment_status: "needs_review"` and must manually populate items via the existing order edit path. **Defer**: snapshot cart contents into the txn at session-create time (would require schema change to `payment_transactions`).

5. **Stripe webhook only handles `charge.refunded` and `charge.refund.updated`.** Doesn't handle `charge.dispute.*` or `payment_intent.payment_failed` chargebacks. **Defer to Phase 4-P5** (disputes).

---

## Update protocol

1. Any agent proposing a change must cite the specific lock (F1–F6) and the rule being changed.
2. Get explicit human authorization in writing.
3. Update the "Last verified locked:" date.
4. The verification checklist above MUST pass after any change.
