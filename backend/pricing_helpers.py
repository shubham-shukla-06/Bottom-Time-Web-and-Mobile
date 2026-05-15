"""
Pricing helpers — Phase 4-P0 INR canonical pricing.

Single source of truth for the "operator types price in X currency → canonical
INR persisted" conversion. Used by:
  - shop_admin.create_product / update_product
  - operator_listings.create_listing / update_listing
  - migrations/add_price_inr (one-time backfill)

Resolution order for the FX rate:
  1. db.exchange_rates singleton (USD-base, refreshed by routes/public.py)
  2. Frankfurter live fetch as fallback
  3. Hardcoded FALLBACK_INR_RATE = 83.5 (last resort; never silent-fails)
"""
from typing import Optional, Tuple
from database import db

FALLBACK_INR_RATE = 83.5
SUPPORTED_CURRENCIES = "EUR,GBP,INR,AUD,CAD,JPY,THB,IDR,MYR,PHP,SGD,NZD,BRL,MXN"


async def get_fx_rates() -> Tuple[float, dict]:
    """Return (inr_rate, rates_dict). rates_dict[X] is units of X per 1 USD."""
    doc = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    if doc and doc.get("rates"):
        rates = dict(doc["rates"])
        rates["USD"] = 1.0
        return rates.get("INR", FALLBACK_INR_RATE), rates
    # Live fallback
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(f"https://api.frankfurter.app/latest?from=USD&to={SUPPORTED_CURRENCIES}")
            resp.raise_for_status()
            rates = resp.json().get("rates", {})
            rates["USD"] = 1.0
            return rates.get("INR", FALLBACK_INR_RATE), rates
    except Exception:
        return FALLBACK_INR_RATE, {"USD": 1.0, "INR": FALLBACK_INR_RATE}


def convert_to_inr(price: Optional[float], currency: str, rates: dict, inr_rate: float) -> Optional[float]:
    """Convert price from `currency` to INR using USD-base rates."""
    if price is None:
        return None
    try:
        p = float(price)
    except (TypeError, ValueError):
        return None
    cur = (currency or "USD").upper()
    if cur == "INR":
        return round(p, 2)
    if cur == "USD":
        return round(p * inr_rate, 2)
    rate = rates.get(cur)
    if not rate:
        return round(p * inr_rate, 2)
    return round((p / float(rate)) * inr_rate, 2)


async def derive_price_inr(price: Optional[float], currency: str) -> Optional[float]:
    """One-shot convenience: fetch rates + compute price_inr. Use in write handlers."""
    if price is None:
        return None
    inr_rate, rates = await get_fx_rates()
    return convert_to_inr(price, currency, rates, inr_rate)
