"""
Currency helpers — ISO-4217 minor-unit conversions.

Razorpay (and most payment processors) accept amounts in the currency's MINOR
unit. Most currencies have 2 digits (INR paise, USD cents, EUR cents), but
some have 0 (JPY, KRW, VND) and a few have 3 (KWD, BHD, JOD).

Fixes Phase 4-P2 / Razorpay-Lock Known Issue #1: `int(round(amount * 100))`
universally was over-charging 100× on JPY orders and undercharging 10× on
KWD/BHD orders.

Reference: https://en.wikipedia.org/wiki/ISO_4217#Active_codes
"""
from typing import Optional

# ISO-4217 currencies with NON-2 decimal digits. Everything not in this map
# defaults to 2 digits via `_DEFAULT_MINOR_DIGITS`.
_MINOR_DIGITS = {
    # 0 minor digits (no fractional unit)
    "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0,
    "KRW": 0, "PYG": 0, "RWF": 0, "UGX": 0, "UYI": 0, "VND": 0, "VUV": 0,
    "XAF": 0, "XOF": 0, "XPF": 0,
    # 3 minor digits (millimes)
    "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
    # 4 minor digits (rare; CLF, UYW)
    "CLF": 4, "UYW": 4,
}
_DEFAULT_MINOR_DIGITS = 2


def minor_digits(currency: str) -> int:
    """ISO-4217 minor-unit digit count for a currency code (case-insensitive)."""
    if not currency:
        return _DEFAULT_MINOR_DIGITS
    return _MINOR_DIGITS.get(currency.upper(), _DEFAULT_MINOR_DIGITS)


def to_minor_units(amount: float, currency: str) -> int:
    """Major→minor unit conversion for payment-processor amount fields.
    Example: to_minor_units(99.99, 'USD') → 9999 (cents)
             to_minor_units(1000, 'JPY')  → 1000 (yen, no fractional)
             to_minor_units(10.5, 'KWD')  → 10500 (3 digits)
    """
    if amount is None:
        return 0
    multiplier = 10 ** minor_digits(currency)
    return int(round(float(amount) * multiplier))


def from_minor_units(minor: int, currency: str) -> float:
    """Inverse of to_minor_units. Used for refund displays + invoice math."""
    if minor is None:
        return 0.0
    divisor = 10 ** minor_digits(currency)
    return round(float(minor) / divisor, minor_digits(currency))


# Razorpay-test-account supported currencies (subset of Razorpay International).
# Used to surface a clean error when a buyer picks a currency the test gateway
# rejects, rather than letting Razorpay return an opaque 400.
RAZORPAY_TEST_SUPPORTED = {
    "INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD",
}


def razorpay_supports(currency: str) -> bool:
    """True if Razorpay (test mode) accepts this currency."""
    return (currency or "").upper() in RAZORPAY_TEST_SUPPORTED
