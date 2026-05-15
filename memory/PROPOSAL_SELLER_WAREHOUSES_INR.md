# Proposal: Seller-State Admin UI · Multi-Warehouse · INR Base Currency

> **Status: AUDIT ONLY — no code shipped.**
> Author: agent · Date: 2026-05-15
> Pinned against commits `e2b27db..978d1a5` (post-Country-helper merge).
>
> Two architectural changes (warehouse model + currency rebase) and one
> small admin-UI surface area (seller state). The audit below is the
> minimum viable plan; phase boundaries are recommendations, not commits.

---

# Item 3 — Seller State (admin-editable) + Multi-Warehouse

## 3a. Seller State admin-editable

### Current state diagnosis
1. `SELLER_STATE` is read from env once at module load (`tax_engine.py:148`, default `"Maharashtra"`). No DB persistence, no admin UI.
2. Admin UI surface area exists at `frontend/src/pages/admin/PlatformSection.js` — currently only renders auto-refreshing platform metrics. **No site-settings card.**
3. Sister hardcodes in the same family:
   - `shipping_helpers.py:78` — `pickup_pincode: str = Field(default="400001")` (Mumbai 400001 PIN)
   - `shipping_helpers.py:352` — `"origin": "Mumbai"` (rate-card display string)
   - `routes/orders.py:78` — `"country": shipping.get("country", "India")` fallback
4. No `site_settings` collection exists in MongoDB today (grepped; only tests reference one). All site-wide config is env-only.

### Proposed changes by surface

**Backend models**
- New collection `site_settings` (single-doc pattern: `{_id: "default", seller_state, seller_state_iso, seller_pincode, seller_city, seller_country, updated_at, updated_by}`)
- New Pydantic model `SiteSettings` with the above fields
- New helper `async def get_seller_state() -> str` in `tax_engine.py` that prefers DB, falls back to `os.environ["SELLER_STATE"]`, finally `"Maharashtra"`. Cache 60 s in-memory to avoid Mongo round-trip on every cart-tax call (the hot path).

**Backend endpoints** (admin-only)
- `GET  /api/admin/site-settings` → returns the single-doc
- `PUT  /api/admin/site-settings` body: `{seller_state, seller_pincode, seller_city}` → upserts + invalidates cache
- Bumps `updated_at`/`updated_by` for audit trail

**Frontend**
- New "Company / GST Registration" card in `PlatformSection.js` (or a new `CompanySection.js` if Platform is overloaded). Fields: seller state (dropdown from existing India-states list), pickup PIN, pickup city. "Save" button with optimistic UI + toast.

**Migration**
- One-time seed on first request to `GET /api/admin/site-settings`: if doc missing, create it from current env values (idempotent).

### Phasing
- **P0** (1 day): DB collection + 2 endpoints + admin card + cache. Replace `SELLER_STATE` constant with `await get_seller_state()` at the 1 call site in `tax_engine.calculate_tax`.
- **P1** (½ day): Also wire `seller_pincode` through `shipping_helpers.py` `pickup_pincode` default + `"origin"` string.
- **P2**: Multi-seller support (a `seller_id` index on the doc). NOT in scope today — current spec is single-seller.

### Risks
- **Cart tax lock**: Lock B invariants 3, 4, 5 reference `SELLER_STATE` directly. Updating the helper resolution path must NOT break the intra-/inter-state split rule. Lock doc must be patched in the same PR that flips the source.
- **Env fallback contract**: env-only deployments (no DB write) must still work. The `get_seller_state()` helper enforces this; do not remove the env fallback.
- **Cache staleness**: 60 s cache means admin edits take up to a minute to take effect. Acceptable for a setting that changes once a year, but document it.
- **Lock files**: `CART_CHECKOUT_LOCKED.md` Lock B inv 7 specifically says "Seller state is env-configurable". Updating to "DB-with-env-fallback" requires an explicit lock-doc edit in the same commit.

### Estimated effort
| Phase | Estimate |
|---|---|
| P0 (state alone) | 1 dev-day |
| P1 (+ pickup PIN/city) | +½ day |
| Total | **~1.5 dev-days** |

---

## 3b. Multi-Warehouse

### Current state diagnosis
1. **Product schema** (`products` collection, no Pydantic model — loose dicts via `shop_admin.py`):
   - `stock: int` (flat count)
   - `in_stock: bool` (computed from stock>0)
   - `country_of_origin: str` (declaration, not shipping origin)
   - **No warehouse field. No GPS coords. No multi-location inventory.**
2. **Stock deduction** at `routes/orders.py:43-53`: `$inc: {sold_count: +qty, stock: -qty}` on the product doc atomically. Trivial; no warehouse routing.
3. **Shipping origin** lives in `shipping_helpers.ShippingRateRequest.pickup_pincode` (default `"400001"`). The request-builder in `Cart.js`'s `fetchShippingRates()` doesn't pass it — it falls back to the default. Shiprocket calls then use that as the origin.
4. **Shiprocket integration** supports per-pickup-location IDs via the `pickup_location` parameter; today we send the implicit default Shiprocket account address.
5. **No distance/Haversine logic** anywhere — closest-warehouse routing does not exist.

### Proposed changes by surface

**Data model (new collections)**
- `warehouses`: `{id, name, owner_operator_id?, address_line1, address_line2?, city, state, country (ISO-2), pincode, gps_lat, gps_lng, shiprocket_pickup_location_id, is_active, created_at}`
- `product_inventory`: `{id, product_id, warehouse_id, qty, low_stock_threshold, last_replenished_at}` — unique compound index `(product_id, warehouse_id)`
- Keep legacy `products.stock` as a **computed aggregate** (sum of `product_inventory` rows) so existing UI keeps working.

**Backend endpoints**
- `GET    /api/admin/warehouses`
- `POST   /api/admin/warehouses` (CRUD)
- `PUT    /api/admin/warehouses/{id}`
- `DELETE /api/admin/warehouses/{id}` (soft-delete via `is_active`)
- `GET    /api/admin/products/{id}/inventory` → list of `{warehouse, qty}` rows
- `PUT    /api/admin/products/{id}/inventory` body: `[{warehouse_id, qty}]` (replace-semantics)
- `GET    /api/shipping/nearest-warehouse?product_id=X&pincode=Y` → returns the cheapest-or-closest warehouse with stock for that product, plus distance km. Phase-1 logic: Haversine between buyer-pincode GPS (resolved via existing pincode→GPS helper) and warehouse GPS.

**Cart / order flow changes**
- On `addToCart`, pin a `preferred_warehouse_id` per line item using the nearest-warehouse endpoint. Store on the cart line.
- On `POST /orders/create`, `$inc {qty: -n}` on the **specific** `product_inventory` row, not the rolled-up `products.stock`. Then refresh `products.stock` via aggregation pipeline.
- Stock-out semantics: if the preferred warehouse runs out between cart and checkout, surface "Stock changed — switching from {nearest} to {fallback}" or refuse with a clear error.

**Frontend**
- New admin page `pages/admin/WarehousesSection.js` with CRUD table.
- `ShopSection.js` (or wherever products are added/edited): replace the single "Stock" field with a per-warehouse grid (rows = warehouses, columns = stock). Use a `<table>` not nested `<Select>` (per `design.md` rule #6).
- Each warehouse row shows the address; bulk "Set all to N" helper.

**Migration script** (`backend/scripts/migrate_warehouses.py`)
1. Read `site_settings.seller_*` (from 3a). Insert a single warehouse row "Default Warehouse" using those values + reasonable GPS coords (Mumbai if Maharashtra).
2. For each product, insert one `product_inventory` row mapping the existing `products.stock` to the default warehouse.
3. Keep `products.stock` populated (computed). Add a post-migration check that aggregate equals original.

### Phasing
- **P0 — Schema + CRUD + single-warehouse migration** (3 days): Backend collections, admin Warehouses page, migration to seed a "Default Warehouse" for the existing seller. **No behaviour change yet** — `products.stock` remains the source of truth for order placement.
- **P1 — Per-warehouse inventory editing** (2 days): Product-add/edit UI carries per-warehouse stock rows. New `product_inventory` collection writes flow through. Aggregation keeps `products.stock` in sync. Admin can now stock individual warehouses but routing is still "first available".
- **P2 — Nearest-warehouse routing** (3 days): Haversine endpoint, cart pin, order-create deducts from specific warehouse. Shiprocket per-pickup-location routing.
- **P3 — Per-warehouse Shiprocket registration + rates** (2 days): Each warehouse registered as a Shiprocket pickup location; shipping rates computed per origin warehouse, not from the global default.

### Risks
- **Concurrent stock writes**: `$inc` on the specific inventory row is still atomic, but the products.stock aggregate becomes eventually-consistent. Mitigation: aggregate it on read for the admin views, not on every order. Display-only.
- **Listing flow unaffected**: listings have their own inventory model (`availability` array, not `stock`). Multi-warehouse applies to **products only**, not listings. Worth a callout in the spec to prevent scope creep.
- **Pincode→GPS resolution**: today's `shipping_helpers` resolves pincode regions via a static India dataset. International buyer pincodes have no coord lookup — phase-2 will need Google Maps Distance Matrix API (1.5¢/call) or a free fallback. Mitigation: fall back to country-centroid distance.
- **Lock impact**: `CART_CHECKOUT_LOCKED.md` Lock A inv 6 ("trigger points include addr select → refreshCartAndTax(country, state)") would need an additional bullet for warehouse re-pin. Not a regression, but a doc update.
- **Order placement race**: between "nearest warehouse pinned in cart" and "order placed", inventory may have moved. Use a transaction or compensating logic.

### Estimated effort
| Phase | Estimate |
|---|---|
| P0 (schema + migration) | 3 dev-days |
| P1 (per-WH editing) | +2 days |
| P2 (nearest routing) | +3 days |
| P3 (Shiprocket pickup) | +2 days |
| Total | **~10 dev-days** |

---

# Item 4 — INR as Base Currency

## Current state diagnosis

| Surface | Current storage | Notes |
|---|---|---|
| **Products** (`products`) | `price: float`, `currency: str` (default `"USD"`) | Mixed: shop_admin defaults to USD, but operators frequently leave it as-is |
| **Listings** (`operator_dive_listings`) | `price: float`, `currency: str` (default `"USD"`) | Operator-set; can vary per listing |
| **Cart preview** | Backend converts product USD price → INR via `inr_rate` for tax calc, returns **both** USD `totals` and (post-`505ab9b`) INR `totals_inr` | Two-currency response |
| **Bookings** | `price: float` from listing.price (operator currency) | No FX conversion at booking time |
| **Razorpay create-order** | `amount` (request param), `currency` (defaults `"INR"`) at `payments.py:21` | Razorpay enforces INR for Indian-issued cards (RBI rule) |
| **Stripe** | Listed in `requirements.txt` (`stripe`, `emergentintegrations.payments.stripe`) but **no call site in routes** today | Inactive |
| **Orders** | `subtotal`, `gst_amount`, `total`, `currency` (default `"INR"`) — `routes/orders.py:60-66` | Currency is stored, but base subtotal is summed from `product.price` **without conversion** — assumes price is already in INR. **Real footgun.** |
| **Operator payouts** | `payouts.py` — Razorpay Route domestic (INR) OR Wise international (operator currency). Booking `price` (operator currency) drives the payout calc | Wise auto-converts; Razorpay Route is INR-only |
| **Refunds** | Same currency as the order (Razorpay) | Stripe refunds not wired |
| **Display** | `useUIStore.displayCurrency` (user pick), `useUIStore.exchangeRates` (USD-base from `frankfurter.app`) | FX rates fetched on cart mount |
| **Exchange-rate source** | `https://api.frankfurter.app/latest?from=USD&to=...` — **USD-base**, not INR-base | Pivot math required for INR base |

### Numbered findings
1. **Two currency conventions silently coexist**: product/listing prices default to USD; orders default to INR. The cart-preview reconciles them, but `orders.py:31` does `line_total = product["price"] * item["quantity"]` **without converting** — if a USD-priced product enters this code path with a non-USD currency, the persisted order is wrong by a factor of `inr_rate`.
2. **Operator listings can be any currency**: an operator in Indonesia may list in IDR. Today's booking flow stores that IDR value as-is — Razorpay then charges INR, payout in IDR — three currencies on one transaction, with FX deltas absorbed by us.
3. **`frankfurter.app` is USD-base**. INR-base requires a pivot: `INR→FOREIGN = USD→FOREIGN / USD→INR`. This works but introduces a 2nd rounding step.
4. **Stripe not wired**: no impact today, but the long-term plan implies Stripe for non-Indian cards — that path must accept the buyer's local currency.
5. **Razorpay INR enforcement**: for Indian buyers paying with Indian cards, Razorpay won't accept non-INR amounts — already INR-aligned post-`505ab9b`. Foreign cards via Razorpay International (separate sandbox) accept other currencies.
6. **Tax engine is INR-native** (post-fix-pass): `calculate_tax` operates on INR amounts; GST display uses `totals_inr` when domestic+INR. So **GST already conforms** to an INR-base model.

## Proposed changes by surface

### Storage rebase

**Products** (`products` collection):
- New field: `price_inr: float` (canonical, ≥0)
- Keep `price` and `currency` fields for **read-only display compatibility** during transition. After migration, both reflect the same logical value (`price` becomes a deprecated mirror of `price_inr` and `currency` becomes `"INR"` for all rows).
- New optional `price_overrides: {USD: 99.0, EUR: 89.0, ...}` — for products where the operator pins a non-INR price (rare). FX layer prefers override if present, else converts `price_inr` to display currency.

**Listings** (`operator_dive_listings`):
- Same pattern: `price_inr` canonical, `price_overrides` for explicit currency pricing.
- Per-listing operator can still set "I want this priced at exactly USD 250" via the override — frontend shows the override as primary, computes INR equivalent via FX for tax/Razorpay.

### Endpoint changes

- `GET /api/cart/preview` and `POST /api/tax/calculate-cart` already return `totals_inr` when domestic. **Expand**: always return `totals_inr` (drop the domestic gate — INR is the canonical, even for export orders where GST = 0).
- `POST /api/payments/create-order`:
  - Domestic INR card → amount = `totals_inr.total`, currency = INR (no change).
  - Foreign card (Stripe path, future): amount = `convertAndRound(totals_inr.total, "INR", target_currency)`, currency = target_currency, with locked FX rate persisted on the order.
- `POST /api/orders/create`: persist `amount_inr` (canonical), `amount_paid` (whatever was charged), `payment_currency`, `fx_rate_locked` (INR→payment), `fx_rate_locked_at` (timestamp). Future refunds / reconciliation use the locked rate.

### Frontend

- `cartCalc.js` already prefers `totals_inr` when display=INR (Fix #5). Extend: when domestic AND display≠INR, do **one** INR→displayCurrency conversion (instead of USD→displayCurrency). Single FX hop, lowest drift.
- `useUIStore.exchangeRates`: change source query to `from=INR` if frankfurter supports it (it does — `https://api.frankfurter.app/latest?from=INR&to=USD,EUR,...`). Otherwise pivot through USD.
- Product/listing display: read `price_overrides[displayCurrency]` if present, else `convertAndRound(price_inr, "INR", displayCurrency)`.

### Migration script (`backend/scripts/migrate_to_inr_base.py`)
1. Lock current `inr_rate` from FX cache (e.g. 83.5 USD/INR).
2. For each `product` and each `operator_dive_listing`:
   - If `currency == "INR"`: `price_inr = price`.
   - If `currency == "USD"`: `price_inr = round(price * inr_rate, 2)`.
   - Otherwise: convert via `price → USD → INR` using cached rates.
   - Write `price_inr` + keep `price`/`currency` as legacy mirrors.
3. Log every conversion + source rate to `migration_logs` collection for audit + reversibility.
4. Dry-run mode first (`--dry-run`); only commit after admin reviews the log.

### Phasing

- **P0 — Schema + dual-write + display preference** (3 days): Add `price_inr` everywhere, dual-write on product/listing create+edit, migrate existing data, flip cartCalc to prefer INR base. No payment-flow change yet.
- **P1 — Order persistence in INR** (2 days): `orders.amount_inr` canonical, `amount_paid` per-currency, `fx_rate_locked`. Fix the `orders.py:31` bug (must convert if product currency ≠ INR).
- **P2 — Razorpay always INR** (1 day): Already today's behavior; just lock-doc it.
- **P3 — Stripe for foreign cards** (3-5 days): NEW integration, requires Emergent integration playbook + Stripe-Atlas-style merchant account verification. Out of scope for the immediate rebase.
- **P4 — Refund/reconciliation tooling** (2 days): Admin view that lets us replay the locked FX rate on refunds. Important for GSTR-1 export-rate reconciliation.

### Risks

- **Operator-set non-INR prices**: must be respected via `price_overrides`. Forcing all operators onto INR-base will break their pricing expectations. Mitigation: surface a "Display currency" picker on operator listing edit; the value they type is `price_overrides[X]`, INR is auto-computed.
- **Razorpay sandbox quirks**: `payments.py:64` does `int(round(amount * 100))` — that's correct for INR paise. Don't accidentally use this multiplier for foreign currencies where the minor unit varies (JPY has 0 minor digits).
- **FX rate drift between cart and pay**: today the cart shows INR using whatever rate is in `exchangeRates` cache. Payment locks at order-create time. Mitigation: re-fetch FX at the moment of `create-order`, persist that rate, use it for everything downstream.
- **Listing currency vs operator payout currency**: a listing priced in USD with an Indonesian operator means the FX path is INR→USD (charge) then USD→IDR (payout). Two FX hops = double slippage. Mitigation: operators specify a "payout currency" (today's `payout_country` drives it) and we route INR→payout-currency directly via Wise's mid-market rate.
- **Lock impact**: `CART_CHECKOUT_LOCKED.md` Lock C invariants 1, 2, 3 mention "GST computed in INR, totals in USD". Switching the canonical means rewriting the math description in Lock C. Same commit must update the lock doc.
- **GSTR-1 reconciliation**: GST returns must match the actual transacted INR amount. Persisting `amount_inr` per order — not derived at report time — is the only way to match the filed value 1:1.

### Estimated effort
| Phase | Estimate |
|---|---|
| P0 (rebase) | 3 dev-days |
| P1 (order persistence) | +2 days |
| P2 (lock-doc Razorpay) | +½ day |
| P3 (Stripe foreign cards) | +3-5 days |
| P4 (refund tooling) | +2 days |
| Total (P0+P1+P2) | **~5.5 dev-days** |
| Total inc. P3+P4 | **~11 dev-days** |

---

# Cross-cutting recommendations

1. **Do 3a first.** It's a 1.5-day micro-feature that unlocks the "configurable" mindset; the admin card is reused as a slot for company-level settings going forward.
2. **Do Item 4 P0+P1 next.** Stabilises the financial baseline before multiplying it by warehouse complexity. Don't ship multi-warehouse on top of a currency model that has a known footgun at `orders.py:31`.
3. **Do 3b last.** Warehouses are the heaviest change and benefit from the INR-base + admin-settings groundwork. Phase 3b P3 (Shiprocket per-pickup) can stagger.
4. **Lock-doc updates are mandatory** with each phase. The phases that affect cart/checkout MUST include a same-commit edit to `CART_CHECKOUT_LOCKED.md`.
5. **No new dependencies** in any phase except P3 of Item 4 (Stripe SDK + Emergent playbook). Everything else uses what's already installed.

---

## Verification before kicking off each phase

- `git log -1 --format='%H %s'` matches the latest lock-doc commit
- `CART_CHECKOUT_LOCKED.md` reads "All RESOLVED" — no open known issues
- `WEB_REGRESSIONS_LOCKED.md`, `WEB_PASSKEY_LOCKED.md`, `MOBILE_AUTH_LOCKED.md`, `WEB_APPLE_AUTH_LOCKED.md` files are present (don't touch them)
- Cart smoke test (India/IN/Egypt) still passes after each shipped phase

Last audit: **2026-05-15**
