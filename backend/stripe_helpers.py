"""
Stripe Checkout integration for non-INR carts/bookings.

Locked behavior — see `/app/memory/STRIPE_PAYMENT_LOCKED.md`.

This module wraps `emergentintegrations.payments.stripe.checkout.StripeCheckout`.
It is the COMPANION rail to the Razorpay path (which keeps its INR-only routing).

Provider routing (locked):
  display_currency == "INR" → Razorpay  (see `payments.py:create_razorpay_order`)
  display_currency != "INR" → Stripe    (this module)

The Emergent wrapper uses our universal `STRIPE_API_KEY` env var. We never
ask the user for raw Stripe keys.
"""
from __future__ import annotations

import os
import logging
from typing import Optional, Tuple

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CheckoutStatusResponse,
    WebhookEventResponse,
)

logger = logging.getLogger(__name__)

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")

# Zero-decimal currencies (Stripe) are the same set as ISO-4217 minor-digits-0.
# Stripe rejects fractional cents for these; we already round to 0 decimals in
# `currency_helpers.to_minor_units()` which the wrapper's amount path defers to.
# `CheckoutSessionRequest.amount` is MAJOR units (float). The wrapper handles
# Stripe's minor-unit conversion internally per its source signature.

# Currencies safely supported by the test Stripe account. This is intentionally
# permissive — Stripe test mode covers ~135 currencies. We use this only to
# block currencies that we KNOW will fail (Razorpay-only test currencies).
STRIPE_TEST_SUPPORTED = {
    "USD", "EUR", "GBP", "AUD", "CAD", "JPY", "SGD", "HKD", "NZD", "CHF",
    "SEK", "NOK", "DKK", "MXN", "BRL", "ZAR", "THB", "MYR", "IDR", "PHP",
    "AED", "SAR", "ILS", "PLN", "CZK", "HUF", "RON", "TRY", "KRW", "TWD",
    "ARS", "CLP", "COP", "PEN", "INR",  # INR included in case of override
}


def stripe_supports(currency: str) -> bool:
    """True if Stripe test mode accepts this currency."""
    return (currency or "").upper() in STRIPE_TEST_SUPPORTED


def get_stripe_client(webhook_url: Optional[str] = None) -> Optional[StripeCheckout]:
    """Construct a `StripeCheckout` client using the Emergent universal key.
    Returns `None` if the key is missing — caller MUST handle the fallback."""
    if not STRIPE_API_KEY:
        logger.warning("STRIPE_API_KEY not set; Stripe checkout disabled.")
        return None
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)


__all__ = [
    "StripeCheckout",
    "CheckoutSessionRequest",
    "CheckoutSessionResponse",
    "CheckoutStatusResponse",
    "WebhookEventResponse",
    "STRIPE_API_KEY",
    "STRIPE_TEST_SUPPORTED",
    "stripe_supports",
    "get_stripe_client",
]
