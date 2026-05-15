"""
Tax computation engine for Bottom Time.
Handles GST, TCS, PAN verification (Sandbox.co.in), and FastGST live rate lookups.
Extracted from routes/tax.py for reusability across modules.
"""
from datetime import datetime, timezone, timedelta
from database import db
import os
import re
import httpx
import logging

logger = logging.getLogger(__name__)

FASTGST_API_KEY = os.environ.get('FASTGST_API_KEY', '')
FASTGST_BASE_URL = os.environ.get('FASTGST_BASE_URL', 'https://api.taxlookup.fastgst.in')
SANDBOX_API_KEY = os.environ.get('SANDBOX_API_KEY', '')
SANDBOX_API_SECRET = os.environ.get('SANDBOX_API_SECRET', '')
SANDBOX_BASE_URL = "https://api.sandbox.co.in"

_sandbox_token = {"access_token": None, "expires_at": None}


async def _get_sandbox_token():
    """Authenticate with Sandbox.co.in and cache the JWT token."""
    if _sandbox_token["access_token"] and _sandbox_token["expires_at"] and datetime.now(timezone.utc) < _sandbox_token["expires_at"]:
        return _sandbox_token["access_token"]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{SANDBOX_BASE_URL}/authenticate", headers={
            "x-api-key": SANDBOX_API_KEY,
            "x-api-secret": SANDBOX_API_SECRET,
            "Content-Type": "application/json",
        })
        resp.raise_for_status()
        data = resp.json()
        token = data.get("data", {}).get("access_token")
        if not token:
            raise Exception("No access_token in Sandbox auth response")
        _sandbox_token["access_token"] = token
        _sandbox_token["expires_at"] = datetime.now(timezone.utc) + timedelta(hours=1)
        return token


async def verify_pan_with_sandbox(pan: str, name: str) -> dict:
    """Verify PAN against govt records via Sandbox.co.in. Returns verification result."""
    try:
        token = await _get_sandbox_token()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{SANDBOX_BASE_URL}/kyc/pan/verify", headers={
                "Authorization": token,
                "x-api-key": SANDBOX_API_KEY,
                "Content-Type": "application/json",
            }, json={
                "@entity": "in.co.sandbox.kyc.pan_verification.request",
                "pan": pan.upper(),
                "name_as_per_pan": name,
                "date_of_birth": "01/01/1990",
                "consent": "Y",
                "reason": "TCS compliance verification",
            })
            data = resp.json()
            logger.info(f"Sandbox PAN verify response: status={resp.status_code} code={data.get('code')}")
            if resp.status_code == 200 and data.get("code") == 200:
                vdata = data.get("data", {})
                return {
                    "verified": True,
                    "pan_valid": vdata.get("status") == "valid",
                    "name_match": vdata.get("name_as_per_pan_match", False),
                    "name_on_record": vdata.get("name_as_per_pan", ""),
                    "category": vdata.get("category", ""),
                    "transaction_id": data.get("transaction_id", ""),
                }
            error_msg = data.get("data", {}).get("message", "") or data.get("message", "") or f"HTTP {resp.status_code}"
            logger.warning(f"Sandbox PAN verify failed: {error_msg}")
            return {"verified": True, "pan_valid": False, "name_match": False, "reason": error_msg}
    except Exception as e:
        logger.error(f"Sandbox PAN verification failed: {e}")
        return {"verified": False, "pan_valid": False, "name_match": False, "reason": str(e)}


# Default GST rates by service/product category (SAC/HSN codes)
DEFAULT_TAX_RATES = {
    # --- Services ---
    "dive_service": {"sac_hsn": "998555", "code_type": "sac", "description": "Tour operator services", "gst_rate": 5.0},
    "dive_course": {"sac_hsn": "999293", "code_type": "sac", "description": "Sporting & recreation services", "gst_rate": 18.0},
    "equipment_rental": {"sac_hsn": "997319", "code_type": "sac", "description": "Rental of other goods", "gst_rate": 18.0},
    "platform_commission": {"sac_hsn": "998311", "code_type": "sac", "description": "Management consulting services", "gst_rate": 18.0},
    # --- Apparel & Textiles ---
    "tshirts": {"sac_hsn": "610990", "code_type": "hsn", "description": "T-shirts, cotton knitted", "gst_rate": 5.0},
    "apparel": {"sac_hsn": "611490", "code_type": "hsn", "description": "Hoodies, shorts, rashguards", "gst_rate": 5.0},
    "towels": {"sac_hsn": "630493", "code_type": "hsn", "description": "Towels, ponchos, cotton textiles", "gst_rate": 5.0},
    # --- Bags & Cases ---
    "bags": {"sac_hsn": "420222", "code_type": "hsn", "description": "Handbags, totes, dry bags, backpacks", "gst_rate": 18.0},
    "phone_cases": {"sac_hsn": "392690", "code_type": "hsn", "description": "Phone cases, waterproof pouches", "gst_rate": 18.0},
    # --- Footwear ---
    "footwear": {"sac_hsn": "640520", "code_type": "hsn", "description": "Sandals, flip flops, dive booties", "gst_rate": 5.0},
    # --- Accessories & Jewellery ---
    "accessories": {"sac_hsn": "711790", "code_type": "hsn", "description": "Bracelets, keychains, lanyards, patches", "gst_rate": 5.0},
    "watches": {"sac_hsn": "910219", "code_type": "hsn", "description": "Dive watches, wristwatches", "gst_rate": 18.0},
    # --- Drinkware ---
    "mugs_ceramic": {"sac_hsn": "691110", "code_type": "hsn", "description": "Ceramic mugs, cups", "gst_rate": 5.0},
    "bottles_metal": {"sac_hsn": "732399", "code_type": "hsn", "description": "Metal bottles, sippers, flasks, tumblers", "gst_rate": 18.0},
    "bottles_plastic": {"sac_hsn": "392490", "code_type": "hsn", "description": "Plastic bottles, sippers", "gst_rate": 5.0},
    # --- Dive Gear ---
    "dive_suits": {"sac_hsn": "401590", "code_type": "hsn", "description": "Wetsuits, drysuits, neoprene gloves/boots", "gst_rate": 5.0},
    "dive_gear": {"sac_hsn": "950699", "code_type": "hsn", "description": "Masks, fins, snorkels, regulators, BCDs", "gst_rate": 18.0},
    # --- Electronics & Cameras ---
    "electronics": {"sac_hsn": "852580", "code_type": "hsn", "description": "Cameras, GoPro mounts, underwater housings", "gst_rate": 18.0},
    # --- Books & Printed ---
    "books": {"sac_hsn": "490110", "code_type": "hsn", "description": "Books, logbooks, field guides", "gst_rate": 0.0},
    "stickers_prints": {"sac_hsn": "491110", "code_type": "hsn", "description": "Stickers, posters, prints, decals", "gst_rate": 5.0},
    # --- Safety & Health ---
    "safety_kits": {"sac_hsn": "300690", "code_type": "hsn", "description": "First aid kits, medical supplies", "gst_rate": 12.0},
    "sunscreen": {"sac_hsn": "330499", "code_type": "hsn", "description": "Sunscreen, reef-safe lotion, skincare", "gst_rate": 18.0},
    # --- Novelty & Souvenirs ---
    "magnets": {"sac_hsn": "850511", "code_type": "hsn", "description": "Fridge magnets, souvenir magnets", "gst_rate": 18.0},
    # --- General ---
    "general_merch": {"sac_hsn": "950699", "code_type": "hsn", "description": "General merchandise & goods", "gst_rate": 18.0},
}

TCS_RATE = 1.0
TCS_OVERSEAS_TOUR_RATE = 2.0
TCS_OVERSEAS_TOUR_NO_PAN_RATE = 4.0

# In-memory cache for live rates (refreshed daily)
_rate_cache = {}
_cache_expiry = {}
CACHE_TTL_HOURS = 24

# Seller's registered state — configurable via env (default: Maharashtra).
# Used to determine intra-state (CGST+SGST) vs inter-state (IGST) split for domestic Indian GST.
# Changing this MUST be matched by an update to the operator's filed GSTIN registration.
SELLER_STATE = os.environ.get("SELLER_STATE", "Maharashtra")


async def _fetch_live_rate(code: str, code_type: str) -> dict | None:
    """Fetch live GST rate from FastGST API"""
    if not FASTGST_API_KEY:
        return None

    cache_key = f"{code_type}:{code}"
    now = datetime.now(timezone.utc)
    if cache_key in _rate_cache and _cache_expiry.get(cache_key, now) > now:
        return _rate_cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{FASTGST_BASE_URL}/search/{code_type}/{code}/taxes",
                headers={"X-API-Key": FASTGST_API_KEY}
            )
            if resp.status_code in (200, 206):
                data = resp.json()
                if data.get("success") and data.get("data"):
                    result = data["data"]
                    if isinstance(result, list):
                        result = result[0] if result else None
                    if result:
                        _rate_cache[cache_key] = result
                        _cache_expiry[cache_key] = now + timedelta(hours=CACHE_TTL_HOURS)
                        logger.info(f"FastGST live rate for {code_type}/{code}: {result.get('gst_rate')}%")
                        return result
                elif data.get("error", {}).get("code") == "QUOTA_EXCEEDED":
                    logger.warning("FastGST quota exceeded — using cached/default rates")
            else:
                logger.warning(f"FastGST API returned {resp.status_code} for {code_type}/{code}")
    except Exception as e:
        logger.warning(f"FastGST API error for {code_type}/{code}: {e}")

    return None


def get_listing_tax_category(listing_type: str) -> str:
    mapping = {
        "dive": "dive_service", "dives": "dive_service", "liveaboard": "dive_service",
        "liveaboards": "dive_service", "snorkeling": "dive_service", "freediving": "dive_service",
        "day_trips": "dive_service",
        "course": "dive_course", "courses": "dive_course",
        "equipment": "equipment_rental", "rental": "equipment_rental",
    }
    return mapping.get(listing_type.lower() if listing_type else "", "dive_service")


def get_product_tax_category(product: dict) -> str:
    """Determine tax category for a shop product based on its fields"""
    if product.get("tax_category"):
        return product["tax_category"]

    name = (product.get("name", "") or "").lower()
    category = (product.get("category", "") or "").lower()

    if any(w in name for w in ["tee", "t-shirt", "tshirt"]):
        return "tshirts"
    if any(w in name for w in ["hoodie", "shorts", "jacket", "rashguard", "rash guard", "jersey"]):
        return "apparel"
    if any(w in name for w in ["towel", "poncho", "changing robe"]):
        return "towels"
    if any(w in name for w in ["bag", "tote", "backpack", "dry bag", "duffel"]):
        return "bags"
    if any(w in name for w in ["phone case", "waterproof pouch", "phone pouch"]):
        return "phone_cases"
    if any(w in name for w in ["sandal", "flip flop", "slipper", "bootie", "boot"]):
        return "footwear"
    if any(w in name for w in ["cap", "hat", "beanie", "bracelet", "keychain", "key chain",
                                "patch", "lanyard", "pin", "badge", "wristband", "necklace"]):
        return "accessories"
    if any(w in name for w in ["watch", "dive watch"]):
        return "watches"
    if any(w in name for w in ["mug", "cup"]):
        return "mugs_ceramic"
    if any(w in name for w in ["bottle", "sipper", "flask", "tumbler"]):
        return "bottles_metal"
    if any(w in name for w in ["wetsuit", "drysuit", "dive suit", "neoprene", "glove"]):
        return "dive_suits"
    if any(w in name for w in ["mask", "fins", "fin", "regulator", "bcd", "computer",
                                "torch", "light", "snorkel", "gauge", "compass", "reel",
                                "knife", "whistle", "spool", "smb", "buoy"]):
        return "dive_gear"
    if any(w in name for w in ["camera", "gopro", "housing", "mount", "video", "photo",
                                "action cam", "underwater camera"]):
        return "electronics"
    if any(w in name for w in ["book", "logbook", "log book", "guide", "manual", "field guide"]):
        return "books"
    if any(w in name for w in ["sticker", "poster", "print", "decal", "art print"]):
        return "stickers_prints"
    if any(w in name for w in ["first aid", "medical", "kit", "emergency"]):
        return "safety_kits"
    if any(w in name for w in ["sunscreen", "lotion", "reef-safe", "sunblock", "lip balm"]):
        return "sunscreen"
    if any(w in name for w in ["magnet", "fridge magnet", "souvenir"]):
        return "magnets"
    if category == "gear":
        return "dive_gear"
    return "general_merch"


async def get_tax_rate(category: str) -> dict:
    """Get tax rate: live API (cached) > admin override > defaults"""
    custom = await db.tax_rates.find_one({"category": category}, {"_id": 0})
    if custom and custom.get("source") == "custom":
        return custom

    defaults = DEFAULT_TAX_RATES.get(category, DEFAULT_TAX_RATES["dive_service"])
    live = await _fetch_live_rate(defaults["sac_hsn"], defaults.get("code_type", "sac"))
    if live:
        return {
            **defaults,
            "gst_rate": float(live.get("gst_rate", defaults["gst_rate"])),
            "source": "fastgst_live",
            "is_exempted": live.get("is_exempted", False),
            "conditions": live.get("conditions", ""),
            "last_updated": live.get("last_updated", ""),
            "gst_source": live.get("source", ""),
        }

    return {**defaults, "source": "default"}


async def calculate_tax(base_amount: float, category: str, is_domestic: bool, shipping_state: str = "") -> dict:
    """Calculate GST for a transaction"""
    if not is_domestic:
        return {
            "base_amount": base_amount,
            "gst_rate": 0.0,
            "gst_amount": 0.0,
            "total_amount": base_amount,
            "is_export": True,
            "tax_note": "Zero-rated export of services"
        }

    rate_info = await get_tax_rate(category)
    gst_rate = rate_info["gst_rate"]
    gst_amount = round(base_amount * gst_rate / 100, 2)
    is_interstate = shipping_state.strip().lower() != SELLER_STATE.lower() if shipping_state else True

    return {
        "base_amount": base_amount,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "total_amount": round(base_amount + gst_amount, 2),
        "is_export": False,
        "sac_hsn": rate_info.get("sac_hsn", ""),
        "igst": round(gst_amount, 2) if is_interstate else 0,
        "cgst": 0 if is_interstate else round(gst_amount / 2, 2),
        "sgst": 0 if is_interstate else round(gst_amount / 2, 2),
    }


async def calculate_payout_with_tax(
    total_paid: float, base_amount: float, gst_amount: float,
    platform_fee_percent: float, is_domestic: bool
) -> dict:
    """Calculate operator payout with proper tax treatment"""
    commission = round(base_amount * platform_fee_percent / 100, 2)
    commission_gst_rate = 18.0 if is_domestic else 0.0
    commission_gst = round(commission * commission_gst_rate / 100, 2)
    tcs = round(base_amount * TCS_RATE / 100, 2) if is_domestic else 0
    operator_payout = round(total_paid - commission - commission_gst - tcs, 2)

    return {
        "total_collected": total_paid,
        "base_amount": base_amount,
        "gst_collected": gst_amount,
        "commission": commission,
        "commission_on": "base_amount_excl_gst",
        "commission_gst_rate": commission_gst_rate,
        "commission_gst": commission_gst,
        "tcs_rate": TCS_RATE if is_domestic else 0,
        "tcs_amount": tcs,
        "operator_payout": operator_payout,
        "is_domestic": is_domestic,
        "breakdown_note": (
            f"Commission {platform_fee_percent}% on base \u20b9{base_amount} = \u20b9{commission} + "
            f"GST on commission \u20b9{commission_gst} + TCS \u20b9{tcs}"
        ) if is_domestic else (
            f"Commission {platform_fee_percent}% on base = {commission} (zero-rated export, no GST/TCS)"
        )
    }


def _determine_booking_gst(operator: dict, buyer_country: str, listing: dict) -> dict:
    """Determine GST applicability for a booking based on operator + buyer."""
    operator_country = (operator.get("location_country") or "").strip().lower() if operator else ""
    if not operator_country:
        operator_country = (listing.get("country") or "").strip().lower()
    operator_state = (operator.get("location_state") or operator.get("state") or "").strip() if operator else ""
    operator_gstin = (operator.get("gstin") or "").strip() if operator else ""
    buyer = buyer_country.strip().lower()
    buyer_is_indian = buyer == "india"
    operator_is_indian = operator_country == "india"

    if not operator_is_indian:
        return {
            "applies": False,
            "reason": "Operator is based outside India \u2014 Indian Goods and Services Tax not applicable",
            "is_domestic": False,
            "is_export": False,
            "operator_gstin": "",
        }

    if buyer_is_indian:
        return {
            "applies": True,
            "reason": "Domestic supply \u2014 Goods and Services Tax collected by platform (ECO)",
            "is_domestic": True,
            "is_export": False,
            "operator_gstin": operator_gstin,
            "operator_state": operator_state,
        }

    return {
        "applies": True,
        "reason": "Experience in India \u2014 Goods and Services Tax applies (IGST, place of supply is India)",
        "is_domestic": False,
        "is_export": False,
        "operator_gstin": operator_gstin,
        "operator_state": operator_state,
    }


def _is_overseas_experience(listing: dict) -> bool:
    """Determine if a listing qualifies as an overseas tour package for TCS purposes."""
    country = (listing.get("country") or "").strip().lower()
    return country != "" and country != "india"
