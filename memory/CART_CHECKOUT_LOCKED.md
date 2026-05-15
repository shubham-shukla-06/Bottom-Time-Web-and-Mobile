# Cart & Checkout — LOCKED behaviors

> **All agents must read this before touching any of the 5 flows below.**
> These flows are user-validated and locked. Changes require explicit human
> authorization in writing.

Pinned context:
- `095b07e` — postal_code_prefix fallback in AddressAutocomplete
- `52e5ba4` — settings test UI + Learn button + 4 nav entries removed
- `e2b27db` — `is_domestic` accepts ISO 'IN' alongside 'india' (Fix #1)
- `c3fefab` — idempotent wishlist add endpoints (Fix #2)
- `244c52c` — wishlist→cart rollback on second-step failure (Fix #3)
- `c6fc9e1` — `SELLER_STATE` env-configurable (Fix #4)
- `505ab9b` — native-INR domestic GST (no FX drift) (Fix #5)
- `0955d5e` — CGST/SGST/IGST split on Order Summary (Fix #6)
- `cartCalc.js` carries its own DO-NOT-MODIFY ASCII banner at the top of the file — see Lock C below.

Last verified locked: **2026-05-15** by user (post-cleanup pass).
Re-verified locked **2026-05-15** (post-bug-fix pass) — 6 fixes applied. SHAs: `e2b27db`, `c3fefab`, `244c52c`, `c6fc9e1`, `505ab9b`, `0955d5e`. All originally-flagged Known Issues are RESOLVED. Locked snippets below have been re-pinned to the post-fix code.

Phase 4-P1/P2 additions (**`96ce2b8`** + **`7492756`**): orders + payment_transactions now carry `amount_inr`, `amount_display`, `display_currency`, `fx_rate_locked`, `fx_locked_at`, `fx_source`. Razorpay amount conversion now uses `currency_helpers.to_minor_units()` with ISO-4217 digit table (JPY=0, KWD=3, default=2). `/payments/create-order` requires/honors `idempotency_key` for double-click safety. `Cart.js:212` uses `isIndia()` helper. Backfill migration `python -m migrations.backfill_order_fx` populated 7 historical orders + 11 historical bookings.

---

## Lock A — Shipping Address Add Behavior

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Cart.js` | L156–193 | Address handlers (`onAddressSelect`, `onAddNew`, `onEditAddress`, `saveAddress`, `deleteAddress`, `setDefault`) |
| `frontend/src/pages/cart/ShippingStep.js` | L250–280 (Quick Search), L295–305 (PIN field), L240–399 (form) | Address form UI |
| `frontend/src/components/AddressAutocomplete.js` | full file (168 LOC) | Google Places autocomplete wrapper, returns `{address_line1, address_line2, city, state, pincode, country, country_code, formatted_address, location}` |
| `backend/routes/orders.py` | L186, L193, L223, L236, L245 | `GET / POST / PUT / DELETE /user/addresses` + `PUT /user/addresses/{id}/default` |
| `backend/routes/shipping.py` | L28, L70 | `GET /address/autocomplete`, `GET /address/details` (server-side proxy to Google Places New API) |

### API endpoints
- `GET /api/user/addresses` → `{addresses: [...]}`
- `POST /api/user/addresses` body: `{name, phone, country_code, address_line1, address_line2, landmark, city, state, pincode, country, label, is_default}`
- `PUT /api/user/addresses/{id}` (same body)
- `DELETE /api/user/addresses/{id}`
- `PUT /api/user/addresses/{id}/default`
- `GET /api/address/autocomplete?input=...&country=IN` (server-side Google Places proxy)
- `GET /api/address/details?place_id=...` (server-side Google Place Details proxy)

### State stores
- `useCartStore` — for `refreshCart()` after address change.
- Local component state in `Cart.js`: `addresses, defaultAddrId, selectedAddrId, shipping, showAddrForm, editingAddr, triedSave`.

### Critical invariants (DO NOT VIOLATE)
1. **9 fields are required to save:** `name, phone, country_code, house_number, street_address, city, state, pincode, country`. `address_line2`, `landmark`, `label` are optional.
2. **`address_line1` is derived** at save time as `[house_number, street_address].filter(Boolean).join(', ')` — never store `address_line1` separately; the form decomposes it back into `house_number` + `street_address` on edit.
3. **First-saved address auto-becomes default**: `data.is_default = addresses.length === 0` at POST time.
4. **Currency auto-switches on address select/save**: `country.toLowerCase() === 'india'` → `setCartCurrency('INR')`, else `setCartCurrency(currency)` (user's display preference).
5. **PIN code extraction must read both variants**: `components.postal_code?.long || components.postal_code_prefix?.long || ''` (see `AddressAutocomplete.js:32`). Area-level Indian results return `postal_code_prefix` — removing the fallback regresses to commit before `095b07e`.
6. **`onAddressSelect` triggers two side effects:** `fetchDeliveryEstimate(pincode, country)` AND `refreshCartAndTax(country, state)` (in that order).
7. **`saveAddress` triggers the same two side effects** plus `fetchAddresses()` after the POST resolves.

### Locked code snippets (verbatim — do not alter)

**`AddressAutocomplete.js:32`** — postal_code parsing:
```js
pincode: components.postal_code?.long || components.postal_code_prefix?.long || '',
```

**`Cart.js:174–181`** — save flow:
```js
const saveAddress = async () => {
  if (!shipping.name || !shipping.phone || !shipping.country_code || !shipping.house_number || !shipping.street_address || !shipping.city || !shipping.state || !shipping.pincode || !shipping.country) { setTriedSave(true); toast.error('Fill all required fields'); return; }
  const address_line1 = [shipping.house_number, shipping.street_address].filter(Boolean).join(', ');
  const data = { name: shipping.name, phone: shipping.phone, country_code: shipping.country_code, address_line1, address_line2: shipping.address_line2, landmark: shipping.landmark, city: shipping.city, state: shipping.state, pincode: shipping.pincode, country: shipping.country, label: shipping.label };
  try {
    if (editingAddr) { await axios.put(`/user/addresses/${editingAddr.id}`, data); toast.success('Address updated'); }
    else { data.is_default = addresses.length === 0; const res = await axios.post('/user/addresses', data); setSelectedAddrId(res.data.id); toast.success('Address saved'); }
```

### Acceptance test
1. Add a new address with Quick Search "Bandra West, Mumbai" — PIN field auto-fills (e.g. "400050") and city/state populate. **PASS / FAIL**
2. Add a second address with country = India → currency display switches to INR. **PASS / FAIL**
3. Add a third address (Egypt) → currency switches back to the user's display preference. **PASS / FAIL**
4. The first address saved is marked as `is_default: true` in the DB. **PASS / FAIL**
5. Editing an address decomposes `address_line1` correctly into `house_number` + `street_address` on form load. **PASS / FAIL**

### DO NOT
- Strip the `postal_code_prefix` fallback (regresses 095b07e).
- Switch from "toggle" to "set" semantics on `is_default` — `PUT /user/addresses/{id}/default` is a setter on the chosen address only; it must clear `is_default` on all sibling addresses (backend enforced).
- Bypass `refreshCartAndTax` on address change — GST and shipping cost get stale.
- Add new required fields to the validation gate without seeding a default for legacy addresses.

---

## Lock B — GST Calculation at Shipping

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Cart.js` | L86–104, L161–164, L187 | Trigger points for `/tax/calculate-cart` |
| `backend/routes/tax.py` | L401–462 | `POST /tax/calculate-cart` handler |
| `backend/tax_engine.py` | L257–283 | `calculate_tax()` core function |
| `backend/tax_engine.py` | L131 | `SELLER_STATE = "Maharashtra"` |

### API endpoints
- `POST /api/tax/calculate-cart` body: `{shipping_country?: str, shipping_state?: str}` → returns:
  ```
  {
    items: [{ product_id, base, gst, total, igst, cgst, sgst, is_export, ... }],
    totals:     { base, gst, igst, cgst, sgst, total },              // USD
    totals_inr: { base, gst, igst, cgst, sgst, total },              // only when is_domestic=true
    is_domestic: bool
  }
  ```
  `totals.*` is **USD**; `totals_inr.*` is the authoritative **native INR** copy and is the field the frontend MUST use when the display currency is INR.

### State stores
- Local state `cartTax` on Cart.js. Refreshed by `refreshCartAndTax(country, state)`.

### Critical invariants (DO NOT VIOLATE)
1. **`is_domestic` accepts both the spelled country name AND the ISO-3166 alpha-2 code** — `_country = (shipping_country or "").strip().lower(); is_domestic = _country in ("india", "in")` (`tax.py` cart handler). If `shipping_country` is not supplied, fall back to the same check on `current_user["location_country"]`. **Do NOT** add other domestic-detection paths (no IP geolocation, no buyer's GSTIN state). The same `("india","in")` check is mirrored in `tax.py` operator-preview + residency, `shipping.py` flat-rate, `operator_listings.py` GSTIN validation, and `operator_emails.py`.
2. **Export rule** — `if not is_domestic: gst_rate = 0, is_export = True, igst = cgst = sgst = 0`. Goods/services shipped outside India are zero-rated.
3. **Interstate determination** — `is_interstate = shipping_state.strip().lower() != SELLER_STATE.lower() if shipping_state else True`. Default to interstate when state is empty (IGST applies).
4. **Split rule:**
   - Interstate (or missing shipping_state) → `igst = gst_amount, cgst = 0, sgst = 0`
   - Intrastate (`shipping_state == "Maharashtra"`) → `cgst = round(gst_amount / 2, 2), sgst = round(gst_amount / 2, 2), igst = 0`
5. **Rounding** — every money field uses Python `round(x, 2)`. Per-line-item rounding, **then** summation. Do not centralise rounding at the cart-level — it causes off-by-1¢ vs the GSTR-3B filing format.
6. **Trigger points** — `/tax/calculate-cart` MUST be re-fired when:
   - The user mounts the cart (`init()` useEffect with empty `{}` body, uses profile-country fallback)
   - The user selects a saved address (`onAddressSelect` → `refreshCartAndTax(addr.country, addr.state)`)
   - The user saves a new address (`saveAddress` → `refreshCartAndTax(savedCountry, savedState)`)
7. **Seller state is admin-editable** via `PUT /api/admin/settings/company` (super-admin only). Resolution order at runtime: `site_settings.singleton.seller_state` in MongoDB → `SELLER_STATE` env var → literal `"Maharashtra"`. Cached 60s in `tax_engine.get_seller_state()` to keep the cart-tax hot path fast; the admin PUT calls `invalidate_seller_settings_cache()` so edits apply immediately. Changing this requires updating the operator's filed GSTIN registration — **do not change without legal sign-off.** The env-default fallback string ("Maharashtra") MUST also stay in sync with the legal seller registration. **Pinned**: `3cd4018`.
8. **Native-INR domestic totals** — when `is_domestic=True`, the response carries an additional `totals_inr` block (`{base, gst, igst, cgst, sgst, total}`) computed natively in INR with per-line-item rounding. The frontend MUST prefer `totals_inr.*` when `displayCurrency === 'INR'` to skip the USD→INR round-trip and eliminate ≤ ₹0.50 drift vs GSTR-3B filing. Export (non-domestic) orders MUST NOT carry `totals_inr` (would imply GST liability where none exists).

### Locked code snippets (verbatim — do not alter)

**`tax_engine.py:271–283`** — GST split:
```python
    gst_amount = round(base_amount * gst_rate / 100, 2)
    is_interstate = shipping_state.strip().lower() != SELLER_STATE.lower() if shipping_state else True
    return {
        "base_amount": round(base_amount, 2),
        "gst_amount": round(gst_amount, 2),
        "gst_rate": gst_rate,
        "tax_category": category,
        "total_amount": round(base_amount + gst_amount, 2),
        "is_export": False,
        "is_interstate": is_interstate,
        "igst": round(gst_amount, 2) if is_interstate else 0,
        "cgst": 0 if is_interstate else round(gst_amount / 2, 2),
        "sgst": 0 if is_interstate else round(gst_amount / 2, 2),
    }
```

**`Cart.js:97–104`** — trigger:
```js
const refreshCartAndTax = async (shippingCountry, shippingState) => {
  if (shippingCountry) setCartTax(null);
  await globalRefreshCart();
  const payload = {};
  if (shippingCountry) payload.shipping_country = shippingCountry;
  if (shippingState) payload.shipping_state = shippingState;
  try { const res = await axios.post('/tax/calculate-cart', payload); setCartTax(res.data); } catch (e) { /* silent */ }
};
```

### Acceptance test
1. Domestic Maharashtra shipping address → `cartTax.items[].cgst == sgst > 0, igst == 0`. **PASS / FAIL**
2. Domestic non-Maharashtra (e.g. Karnataka) → `cartTax.items[].igst > 0, cgst == sgst == 0`. **PASS / FAIL**
3. International (Egypt) shipping → `cartTax.totals.gst == 0, cartTax.is_domestic == false`. **PASS / FAIL**
4. Empty `shipping_state` with `shipping_country = "India"` → IGST applied (default-interstate fallback). **PASS / FAIL**

### DO NOT
- Replace the per-line-item rounding with cart-level rounding.
- Bypass the `is_domestic` derivation by reading from any source other than `shipping_country`.
- Hardcode `SELLER_STATE` somewhere other than `tax_engine.py:131`.
- Introduce a 4th GST bucket (Cess, etc.) without finance review.

---

## Lock C — Billing Calculation (Cart Grand Total)

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/utils/cartCalc.js` | full file (119 LOC) | `computeCartTotals()` — **single source of truth** |
| `frontend/src/pages/Cart.js` | L209–229, L269–278 | Consumers (display + checkout) |
| `backend/routes/payments.py` | `/payments/create-order` | Final Razorpay order amount must equal `computeCartTotals().razorpayAmount` |

### API endpoints
- `POST /api/payments/create-order` body: `{amount, currency, cart_checkout: true, base_amount, gst_amount, shipping_amount, shipping_carrier, is_export}`
- `POST /api/promo-codes/validate` body: `{code, order_total, applies_to: 'shop'}`

### Critical invariants (DO NOT VIOLATE)
1. **One formula only:** `grandTotal = round((displaySubtotal + gstDisplay + shippingDisplay - discountDisplay) * 100) / 100`. Every visible row must mathematically add up to `grandTotal`.
2. **Display = Charge:** The Razorpay charge amount MUST equal the on-screen grand total in the same currency. `razorpayCurrency = displayCurrency` always.
3. **Domestic = INR forcing:** Cart.js auto-switches `cartCurrency` to `INR` when the selected/saved address country is India. Together with rule 2, this means domestic orders ALWAYS charge in INR.
4. **GST display conversion:** `cartTax.totals.gst` arrives in USD from the backend; convert to display currency via `convertAndRound(gstUSD, 'USD', displayCurrency, exchangeRates)`. **Exception:** for domestic Indian orders displayed in INR, prefer `cartTax.totals_inr.gst` directly (skip the FX round-trip) — eliminates ≤ ₹0.50 GSTR-3B drift. Mirror the same native-INR preference for `igstDisplay / cgstDisplay / sgstDisplay`.
5. **Subtotal calculation:** Convert each product unit price to display currency, **round per unit**, then multiply by quantity. Do NOT total-then-convert (introduces line-level rounding drift).
6. **Shipping in INR:** Shiprocket rates always come back in INR; converted to display currency.
7. **Discount stacking order:** `subtotal + GST + shipping - discount` — discount applies AFTER GST + shipping, never before.
8. **Discount is in USD** (from `promoResult.discount`); converted to display currency.

### Locked code snippets (verbatim — do not alter)

**`cartCalc.js:83–93`** — grand-total + payment derivation:
```js
  const grandTotal = Math.round(
    (displaySubtotal + gstDisplay + shippingDisplay - discountDisplay) * 100
  ) / 100;

  // ── Step 6: Razorpay payment amount & currency ─────────────
  // The cart page auto-switches displayCurrency to INR for domestic orders,
  // so displayCurrency and payment currency are ALWAYS the same.
  // This ensures Order Summary and Razorpay show identical amounts.
  const isDomestic = cartTax?.is_domestic ?? false;
  const razorpayCurrency = displayCurrency;
  const razorpayAmount = grandTotal;
```

**Cart.js:213–229** — checkout binding:
```js
const checkoutTotals = computeCartTotals({
  cartItems, cartTax,
  shippingCostINR: shippingCost,
  displayCurrency: cartCurrency,
  exchangeRates, promoResult, cartTotal,
});
try {
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

### Acceptance test
1. INR cart, 1 product ₹1,000, GST 18% interstate, shipping ₹80, no promo → display rows sum to ₹1,260, Razorpay charge ₹1,260, currency INR. **PASS / FAIL**
2. EUR cart shipping to Egypt, 1 product €40, GST 0% (export), shipping ₹80→EUR-converted, promo `WELCOME10` ($10 off in USD→EUR) → display rows sum to grand total, Razorpay in EUR. **PASS / FAIL**
3. Open `cartCalc.js` — top-of-file ASCII DO-NOT-MODIFY banner is intact. **PASS / FAIL**

### DO NOT
- Recompute amounts at the checkout call site. Always use `computeCartTotals()` output.
- Remove or modify the ASCII banner in `cartCalc.js`.
- Add payment-method-specific surcharges in `cartCalc.js` — surcharges must be applied by the payment provider (Razorpay), not added on top of `grandTotal`.
- Switch order of discount stacking (e.g. apply discount on subtotal then add GST) — currently discount is the last term subtracted from the grand total.

---

## Lock D — Wishlist Behavior

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Wishlist.js` | full file (120 LOC) | Listings wishlist page |
| `frontend/src/pages/Cart.js` | L140 (`fetchWishlist`), L151 (`handleMoveToWishlist`), L154 (`handleRemoveWishlist`), L362 (`<WishlistItemList>`) | Product wishlist (rendered inside cart page) |
| `frontend/src/pages/cart/CartItems.js` | `<WishlistItemList>` | UI list component |
| `backend/routes/content.py` | L74–119 | Wishlist endpoints (listings + products) |

### API endpoints — toggle vs idempotent add
| Method | Path | Effect |
|---|---|---|
| `POST` | `/api/wishlist/{listing_id}` | **Toggle** listing in wishlist. Response: `{wishlisted: bool}` |
| `POST` | `/api/wishlist/{listing_id}/add` | **Idempotent ADD** (upsert). Always returns `{wishlisted: true}` — spam-click safe. Use this for any flow that must guarantee an item is wishlisted (e.g. cart → wishlist). |
| `GET` | `/api/wishlist` | List wishlisted **listings** with full enrichment |
| `GET` | `/api/wishlist/ids` | Cheap ID-only fetch (for heart-icon state across cards) |
| `POST` | `/api/wishlist/product/{product_id}` | **Toggle** product. Response: `{wishlisted: bool}` |
| `POST` | `/api/wishlist/product/{product_id}/add` | **Idempotent ADD** (upsert). Always returns `{wishlisted: true}` — spam-click safe. Use for cart → wishlist. |
| `GET` | `/api/wishlist/products` | List wishlisted products with enrichment |

### State stores
- `useWishlistStore` (global) — heart-icon state; populated by `refreshWishlist()` after each toggle.
- Local state `listings` on `Wishlist.js`, `wishlistItems` on `Cart.js`.

### Critical invariants (DO NOT VIOLATE)
1. **Server-only persistence.** Login-gated via `Depends(get_current_user)`. No localStorage, no anonymous wishlist.
2. **Dedup by `(user_id, listing_id)` OR `(user_id, product_id)`** at the Mongo layer. Same endpoint is the add+remove toggle — duplicate calls flip state.
3. **Two collections live together in `db.wishlists`** — distinguish by which key is set:
   - `{user_id, listing_id, created_at}` — listing wishlist
   - `{user_id, product_id, created_at}` — product wishlist
4. **Wishlist.js optimistic update**: `setListings(prev => prev.filter(l => l.id !== listingId))` AFTER the POST resolves successfully. On error: toast `'Failed to remove'`; **do not** refetch the list to avoid masking the failure.
5. **No debounce on the heart-icon toggle.** Tap = immediate POST. Repeated taps yield alternating states (toggle semantics tolerate this).
6. **Listings (booked) vs Products (shopped) are SEPARATE wishlists** — listings go to `/booking/:id` flow, products go to `/cart`. There is NO unified wishlist page.
7. **Wishlist heart-icon style:** filled red when wishlisted (`fill-red-500`), hollow when not. Trash icon for removal in the dedicated `/wishlist` page only.

### Locked code snippets (verbatim — do not alter)

**`content.py:74–112`** — listing wishlist toggle + idempotent add:
```python
@router.post("/wishlist/{listing_id}")
async def toggle_wishlist(listing_id: str, current_user: dict = Depends(get_current_user)):
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0, "id": 1})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    existing = await db.wishlists.find_one({"user_id": current_user["id"], "listing_id": listing_id})
    if existing:
        await db.wishlists.delete_one({"user_id": current_user["id"], "listing_id": listing_id})
        return {"wishlisted": False}
    await db.wishlists.insert_one({"user_id": current_user["id"], "listing_id": listing_id, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"wishlisted": True}


@router.post("/wishlist/{listing_id}/add")
async def add_to_wishlist_idempotent(listing_id: str, current_user: dict = Depends(get_current_user)):
    """Idempotent ADD — always leaves the listing in the wishlist regardless of prior state.
    Use this for any flow that needs guaranteed-added semantics (e.g. wishlist-from-cart).
    Spam-click-safe; eliminates the toggle race in the legacy POST /wishlist/{id} endpoint."""
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0, "id": 1})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.wishlists.update_one(
        {"user_id": current_user["id"], "listing_id": listing_id},
        {"$setOnInsert": {"user_id": current_user["id"], "listing_id": listing_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"wishlisted": True}
```

The product variants follow the same pattern: `POST /wishlist/product/{product_id}` (toggle) and `POST /wishlist/product/{product_id}/add` (idempotent upsert).

**`Cart.js handleMoveToWishlist`** — cart → wishlist uses the **idempotent** add, not the toggle:
```js
const handleMoveToWishlist = async (productId) => { try { await axios.post(`/wishlist/product/${productId}/add`); await axios.delete(`/cart/${productId}`); toast.success('Moved to wishlist'); refreshCartAndTax(); refreshWishlist(); fetchWishlist(); } catch (e) { toast.error('Failed'); } };
```

**`Wishlist.js:33–39`** — remove with optimistic update:
```js
const removeItem = async (listingId) => {
  try {
    await axios.post(`/wishlist/${listingId}`);
    setListings(prev => prev.filter(l => l.id !== listingId));
    toast.success('Removed from wishlist');
  } catch (e) { toast.error('Failed to remove'); }
};
```

### Acceptance test
1. From `/discover` heart-icon a listing → it appears at `/wishlist`. **PASS / FAIL**
2. From `/wishlist` click the trash button → listing disappears immediately. **PASS / FAIL**
3. Log out, log back in → wishlist state persists. **PASS / FAIL**
4. From a product page, heart a product → it appears in the Cart page's "Wishlist" section (NOT in `/wishlist`). **PASS / FAIL**
5. Empty wishlist state shows the dive-themed empty card with "Browse Experiences" CTA. **PASS / FAIL**

### DO NOT
- Promote `POST /wishlist/{id}` from toggle to add-only — multiple legacy call sites depend on toggle semantics.
- Merge the listing wishlist and product wishlist into one collection or one endpoint — they have different enrichment fields and different downstream routes.
- Cache wishlist state in localStorage. The heart-icon state on listing/product cards must come from the live `useWishlistStore` so cross-tab toggles propagate.
- Make wishlist accessible to unauthenticated visitors.

---

## Lock E — Wishlist-to-Cart Behavior

### Files
| Path | Range | Role |
|---|---|---|
| `frontend/src/pages/Cart.js` | L153 (`handleWishlistToCart`) | Move-to-cart handler |
| `frontend/src/pages/cart/CartItems.js` | `<WishlistItemList>` | UI button binding |
| `backend/routes/bookings.py` | L110–135 (`/cart/add`), L165–187 (`/cart/move-to-cart`) | Cart add endpoints |

### API endpoints
- `POST /api/cart/add?product_id={id}&quantity=1` — add a product to cart (used for wishlist-product → cart)
- `POST /api/wishlist/product/{product_id}` — toggle product wishlist (called second, to remove)
- `POST /api/cart/move-to-cart?product_id={id}` — distinct flow used for "Saved for later" → cart (NOT wishlist; preserves size)

### Critical invariants (DO NOT VIOLATE)
1. **Sequence**: cart add **first**, wishlist remove **second**. If cart-add fails, the item stays in the wishlist and no rollback is needed. **If wishlist remove fails *after* cart-add succeeded, MUST roll back the cart-add** so the user ends up where they started (best-effort `DELETE /cart/{productId}`). Toast `"Could not move to cart, try again."` either way; never leave the item in both places.
2. **Quantity defaults to 1.** Products are flat (no size/variant for the wishlist-product flow). The `size` query param is only used by `/cart/move-to-cart` for the Saved-for-Later list.
3. **Stock check is server-side only.** `POST /cart/add` returns `400 {"detail": "Product is out of stock"}` when applicable. Frontend toasts that detail back to the user. **Do not** add a frontend stock check — stock can rotate between page load and click.
4. **`/cart/move-to-cart` is for Saved-for-Later, NOT wishlist.** Don't reuse it for wishlist items — Saved-for-Later items carry a `size`, wishlist products do not.
5. **Listings are NEVER moved to cart.** Listings are booked via `/listing/:id` → `/booking/:id`. There is no listing-to-cart action.
6. **Side effects after successful move**: `refreshCartAndTax()` (updates cart count + GST) + `fetchWishlist()` (local) + `refreshWishlist()` (global store) — all three must fire, and ONLY after both steps succeed.
7. **Two independent try/catch blocks** — do not collapse into one. Step 1 failure short-circuits before step 2; step 2 failure triggers compensating rollback. Single-try wrapping silently masks step-1 errors in the step-2 catch and breaks the rollback condition.

### Locked code snippets (verbatim — do not alter)

**`Cart.js handleWishlistToCart`** — wishlist → cart with compensating rollback:
```js
const handleWishlistToCart = async (productId) => {
  try {
    await axios.post(`/cart/add?product_id=${productId}&quantity=1`);
  } catch (e) {
    toast.error(e.response?.data?.detail || 'Could not add to cart.');
    return;
  }
  try {
    await axios.post(`/wishlist/product/${productId}`);
  } catch (e) {
    // Wishlist remove failed AFTER cart-add succeeded — best-effort rollback
    // so the user ends up where they started (item still in wishlist, no cart pollution).
    try { await axios.delete(`/cart/${productId}`); } catch { /* swallow */ }
    toast.error('Could not move to cart, try again.');
    return;
  }
  toast.success('Moved to cart');
  refreshCartAndTax();
  fetchWishlist();
  refreshWishlist();
};
```

**`bookings.py:110–122`** — cart-add server logic:
```python
@router.post("/cart/add")
async def add_to_cart(product_id: str = Query(...), quantity: int = Query(1), size: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    cart = await db.carts.find_one({"user_id": current_user["id"]})
    already_in_cart = cart and any(i["product_id"] == product_id and i.get("size") == size for i in cart.get("items", []))
    if not product.get("in_stock", True) and not already_in_cart:
        raise HTTPException(status_code=400, detail="Product is out of stock")
```

### Acceptance test
1. From Cart page Wishlist section, click "Move to Cart" on a product → item disappears from wishlist, appears in cart with qty=1, GST and shipping recalculate. **PASS / FAIL**
2. Click "Move to Cart" on an out-of-stock product → toast shows `"Product is out of stock"`, item remains in wishlist. **PASS / FAIL**
3. Move-to-cart fires exactly 2 network calls: `POST /cart/add` then `POST /wishlist/product/{id}`. **PASS / FAIL**
4. After moving, `useCartStore.cartCount` updates (heart-icon-bell-badge increments). **PASS / FAIL**

### DO NOT
- Swap the call order (wishlist toggle first → cart add). Leaves the user with an empty wishlist AND no cart item on failure.
- Add a frontend stock check before calling `/cart/add` — stock can change between page-load and click.
- Reuse `/cart/move-to-cart` for wishlist items — the size semantics differ.

---

## Verification checklist (run before AND after any cart/checkout edit)

| # | Test | Expected | Last run |
|---|---|---|---|
| 1 | Quick Search "Bandra West, Mumbai" auto-fills PIN | "400050" (or current Bandra W PIN) populates ZIP/PIN field | 2026-05-15 ✓ |
| 2 | Add new India address → cart currency switches to INR | INR symbol on all rows | 2026-05-15 ✓ |
| 3 | Domestic Maharashtra address → GST splits as CGST + SGST | `igst:0, cgst==sgst>0` | 2026-05-15 ✓ |
| 4 | Domestic non-Maharashtra (e.g. Karnataka) → GST is IGST | `igst>0, cgst==sgst==0` | 2026-05-15 ✓ |
| 5 | Egypt shipping address → GST = 0, is_export = true, Order Summary shows "Export — zero-rated" caption | `cartTax.totals.gst == 0` AND caption visible | 2026-05-15 ✓ |
| 6 | Cart grand total = sub + GST + ship − discount | Sum matches Razorpay charge | 2026-05-15 ✓ |
| 7 | Cart page Razorpay charge = display grand total in same currency | Identical numbers | 2026-05-15 ✓ |
| 8 | Heart a listing from `/discover` → it shows in `/wishlist` | Listing appears | 2026-05-15 ✓ |
| 9 | `/wishlist` trash button → optimistic remove | Item disappears immediately | 2026-05-15 ✓ |
| 10 | Move wishlist product → cart | Cart updates, wishlist clears, qty=1, GST recalcs | 2026-05-15 ✓ |
| 11 | Move out-of-stock product → expect toast, no cart update | Toast `"Product is out of stock"` | 2026-05-15 ✓ |

---

## Known issues surfaced during the lock audit — ALL RESOLVED in the 6-fix pass

| # | Original issue | Resolution | Commit |
|---|---|---|---|
| 1 | `handleMoveToWishlist` toggle race (`Cart.js:151`) — spam-click double-toggle could leave wishlist inconsistent. | Switched cart→wishlist to the new **idempotent** add endpoint (`POST /wishlist/product/{id}/add`). Upsert-on-Mongo guarantees the item is wishlisted regardless of prior state. | **`c3fefab`** |
| 2 | `handleWishlistToCart` no rollback (`Cart.js:153`) — if wishlist-remove failed after cart-add succeeded, item lived in both places. | Wrapped in two independent try/catch blocks. On step-2 failure, best-effort `DELETE /cart/{id}` rolls back the cart-add so the user lands where they started. | **`244c52c`** |
| 3 | `is_domestic` string-compared against `"india"` only (`tax.py:407`) — ISO `"IN"` silently missed. | `is_domestic` now accepts both forms: `_country in ("india", "in")`. Same fix mirrored in `tax.py` (cart, operator-preview, residency), `shipping.py` flat-rate, `operator_listings.py` GSTIN gate, `operator_emails.py`. | **`e2b27db`** |
| 4 | `SELLER_STATE = "Maharashtra"` hardcoded (`tax_engine.py:131`). | Now `SELLER_STATE = os.environ.get("SELLER_STATE", "Maharashtra")`. Default unchanged; ops can override per environment without code changes. `.env` documents the var. | **`c6fc9e1`** |
| 5 | Cart `cartTax.totals.gst` computed in USD then converted to INR — ≤ ₹0.50 drift vs GSTR-3B. | Backend now also returns `totals_inr` (native-INR sums with per-line-item rounding) when `is_domestic=true`. Frontend `cartCalc.js` prefers `totals_inr.*` when `displayCurrency === 'INR'`, skipping the USD round-trip entirely. International orders unchanged. | **`505ab9b`** |
| 6 | Order Summary aggregated GST only — no CGST/SGST/IGST per-bucket breakdown for B2B invoicing. | `cartCalc.js` exposes `igstDisplay / cgstDisplay / sgstDisplay`. `OrderSummary` consumes them with native-INR preference, and now renders an "Export — zero-rated" caption for non-domestic shipments. | **`0955d5e`** |

All fixes are documentation-pinned above (see Lock B invariants 1, 7, 8 + Lock C invariant 4 + Lock D snippet + Lock E snippet + invariant 1, 7).

---

## How to update this lock doc

1. Any agent proposing a change to one of the 5 flows must:
   - Cite the specific section (Lock A, B, C, D, or E) and the rule being changed.
   - Get explicit human authorization in writing.
   - Update the "Last verified locked:" date at the top once the change is merged.
2. The verification checklist above must pass after any change.
