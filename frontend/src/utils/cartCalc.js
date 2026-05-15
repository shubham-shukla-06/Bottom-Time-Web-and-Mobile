/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CART CALCULATION ENGINE — DO NOT MODIFY WITHOUT REVIEW         ║
 * ║                                                                 ║
 * ║  This module is the SINGLE SOURCE OF TRUTH for all cart totals. ║
 * ║  Both the OrderSummary display AND the Razorpay checkout use    ║
 * ║  the EXACT same output from computeCartTotals().                ║
 * ║                                                                 ║
 * ║  ALL display values are in the user's DISPLAY CURRENCY.         ║
 * ║  Payment currency follows the same rules as booking payments:   ║
 * ║    - Domestic order (shipping to India) → Razorpay in INR       ║
 * ║    - International order → Razorpay in user's display currency  ║
 * ║                                                                 ║
 * ║  If you change anything here, you MUST verify:                  ║
 * ║    1. Grand Total = Sub-Total + GST + Shipping - Discount       ║
 * ║    2. Razorpay amount matches Grand Total in payment currency   ║
 * ║    3. All displayed rows use the same currency                  ║
 * ║    4. Domestic orders charge INR, international charge display   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { convertAndRound } from './currency';

/**
 * Compute all cart totals in the user's display currency.
 *
 * Currency rules (matching booking payments — see BookingSidebar.js):
 *   - Domestic (shipping to India, cartTax.is_domestic=true):
 *       Razorpay charges in INR. GST (CGST+SGST or IGST) applies.
 *   - International (shipping outside India, cartTax.is_domestic=false):
 *       Razorpay charges in user's display currency. GST is zero-rated (export).
 *
 * GST determination: based on the SHIPPING ADDRESS country, not the buyer's profile.
 *   - Shipping to India → domestic GST applies
 *   - Shipping outside India → export, zero-rated
 *   - IGST vs CGST+SGST: determined by shipping state vs seller state (backend)
 *
 * @param {Array}  cartItems       - Cart items (each has .product.price, .product.currency, .quantity)
 * @param {Object} cartTax         - Response from POST /tax/calculate-cart (totals in USD, is_domestic flag)
 * @param {number} shippingCostINR - Shipping cost in INR from Shiprocket. 0 if no carrier selected.
 * @param {string} displayCurrency - User's display currency (e.g. 'EUR', 'INR', 'USD')
 * @param {Object} exchangeRates   - USD-based exchange rates from the UI store
 * @param {Object} [promoResult]   - Promo code result. Has .discount (USD) and .final_total (USD)
 * @param {number} cartTotal       - Fallback cart total in USD from the cart store
 */
export function computeCartTotals({
  cartItems,
  cartTax,
  shippingCostINR,
  displayCurrency,
  exchangeRates,
  promoResult,
  cartTotal,
}) {
  // ── Step 1: Sub-Total in display currency ──────────────────
  // Convert each product's unit price from its source currency to display currency,
  // round per-unit, then multiply by quantity. This matches what the user sees per line.
  const displaySubtotal = cartItems.reduce((sum, item) => {
    const prodCur = item.product?.currency || 'USD';
    const unitInDisplay = convertAndRound(item.product?.price || 0, prodCur, displayCurrency, exchangeRates);
    return sum + Math.round(unitInDisplay * item.quantity * 100) / 100;
  }, 0);

  // ── Step 2: GST in display currency ────────────────────────
  // Backend /tax/calculate-cart returns GST in USD (totals) and — when the
  // order ships to India — also in native INR (totals_inr). When the display
  // currency is INR for a domestic order, use the native-INR value directly
  // to skip the USD round-trip that otherwise introduces ≤ ₹0.50 rounding drift
  // vs the GSTR-3B filing figure. Export orders are zero-rated (gst=0).
  const isDomesticOrder = cartTax?.is_domestic ?? false;
  const gstUSD = cartTax?.totals?.gst || 0;
  const nativeInrGst = cartTax?.totals_inr?.gst;
  const gstDisplay = (isDomesticOrder && displayCurrency === 'INR' && nativeInrGst != null)
    ? Math.round(nativeInrGst * 100) / 100
    : convertAndRound(gstUSD, 'USD', displayCurrency, exchangeRates);

  // ── Step 3: Shipping in display currency ───────────────────
  // Shiprocket returns all rates in INR. Convert to display currency.
  const shippingDisplay = shippingCostINR > 0
    ? convertAndRound(shippingCostINR, 'INR', displayCurrency, exchangeRates)
    : 0;

  // ── Step 4: Discount in display currency ───────────────────
  const discountUSD = promoResult?.discount || 0;
  const discountDisplay = discountUSD > 0
    ? convertAndRound(discountUSD, 'USD', displayCurrency, exchangeRates)
    : 0;

  // ── Step 5: Grand Total (display currency) ─────────────────
  // CRITICAL: This is the single formula. Display rows must add up to this.
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

  // ── Step 7: USD values for backend records ─────────────────
  const baseUSD = cartTax?.totals?.base || cartTotal || 0;
  const gstUSDVal = gstUSD;
  const shippingUSD = shippingCostINR > 0
    ? convertAndRound(shippingCostINR, 'INR', 'USD', exchangeRates)
    : 0;

  return {
    // Display values (all in displayCurrency)
    displaySubtotal,
    gstDisplay,
    shippingDisplay,
    discountDisplay,
    grandTotal,
    // Payment values (currency depends on domestic vs international)
    razorpayAmount,
    razorpayCurrency,
    isDomestic,
    // Backend record values (USD)
    baseUSD,
    gstUSD: gstUSDVal,
    shippingUSD,
  };
}
