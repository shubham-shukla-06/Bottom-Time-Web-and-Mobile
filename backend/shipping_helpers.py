"""
Shipping helpers for Bottom Time.
Contains Shiprocket integration helpers, models, mock data, and utility functions.
Extracted from routes/shipping.py for reusability.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from database import db
import os
import httpx
import uuid

# ============ CONFIG ============
GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
SHIPROCKET_API_EMAIL = os.environ.get("SHIPROCKET_API_EMAIL", "")
SHIPROCKET_API_PASSWORD = os.environ.get("SHIPROCKET_API_PASSWORD", "")
SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external"

SHIPROCKET_MOCK = not (SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD)

COUNTRY_TO_ISO = {
    "united states": "US", "usa": "US", "us": "US",
    "united kingdom": "GB", "uk": "GB", "gb": "GB",
    "canada": "CA", "australia": "AU", "germany": "DE",
    "france": "FR", "japan": "JP", "singapore": "SG",
    "united arab emirates": "AE", "uae": "AE",
    "netherlands": "NL", "italy": "IT", "spain": "ES",
    "brazil": "BR", "mexico": "MX", "south korea": "KR",
    "thailand": "TH", "malaysia": "MY", "indonesia": "ID",
    "new zealand": "NZ", "south africa": "ZA", "sweden": "SE",
    "norway": "NO", "denmark": "DK", "switzerland": "CH",
    "china": "CN", "hong kong": "HK", "taiwan": "TW",
    "philippines": "PH", "vietnam": "VN", "ireland": "IE",
    "belgium": "BE", "austria": "AT", "portugal": "PT",
    "poland": "PL", "greece": "GR", "israel": "IL",
    "saudi arabia": "SA", "qatar": "QA", "oman": "OM",
    "bahrain": "BH", "kuwait": "KW", "egypt": "EG",
    "turkey": "TR", "russia": "RU", "sri lanka": "LK",
    "nepal": "NP", "bangladesh": "BD", "maldives": "MV",
}

_COUNTRY_ISO = {
    "India": "IN", "United States": "US", "United Kingdom": "GB", "Canada": "CA",
    "Australia": "AU", "Germany": "DE", "France": "FR", "Japan": "JP", "Singapore": "SG",
    "United Arab Emirates": "AE", "Netherlands": "NL", "Italy": "IT", "Spain": "ES",
    "Brazil": "BR", "Mexico": "MX", "South Korea": "KR", "Thailand": "TH",
    "Malaysia": "MY", "Indonesia": "ID", "New Zealand": "NZ", "South Africa": "ZA",
    "Sweden": "SE", "Norway": "NO", "Denmark": "DK", "Switzerland": "CH",
    "China": "CN", "Philippines": "PH", "Vietnam": "VN", "Ireland": "IE",
    "Belgium": "BE", "Austria": "AT", "Portugal": "PT", "Poland": "PL",
    "Greece": "GR", "Israel": "IL", "Turkey": "TR", "Russia": "RU",
    "Sri Lanka": "LK", "Bangladesh": "BD", "Argentina": "AR", "Colombia": "CO",
    "Chile": "CL", "Peru": "PE", "Finland": "FI", "Czech Republic": "CZ",
    "Romania": "RO", "Hungary": "HU",
}


def get_country_code(country: str) -> str:
    """Convert country name to ISO Alpha-2 code."""
    c = country.strip().lower()
    if len(c) == 2:
        return c.upper()
    return COUNTRY_TO_ISO.get(c, country[:2].upper())


def get_country_iso(country: str) -> str:
    """Get ISO code from display country name."""
    return _COUNTRY_ISO.get(country, country.upper()[:2])


# Token cache (valid for 10 days, we'll refresh every 9 days)
_shiprocket_token_cache = {"token": None, "expires_at": None}


# ============ MODELS ============
class ShippingRateRequest(BaseModel):
    pickup_pincode: str = Field(default="400001")
    delivery_pincode: str
    delivery_country: str = "India"
    weight: float = Field(default=0.5, gt=0, description="Weight in KG")
    length: float = Field(default=10, gt=0, description="Length in CM")
    breadth: float = Field(default=10, gt=0, description="Breadth in CM")
    height: float = Field(default=10, gt=0, description="Height in CM")
    cod: bool = False
    cart_items: Optional[List[Dict[str, Any]]] = None


class CarrierRate(BaseModel):
    carrier_id: int
    carrier: str
    service: str
    rate: float
    currency: str
    estimated_days: int
    estimated_delivery: str
    cod_available: bool = True
    is_international: bool = False


class ShippingRatesResponse(BaseModel):
    rates: List[CarrierRate]
    cheapest: Optional[CarrierRate] = None
    fastest: Optional[CarrierRate] = None
    recommended: Optional[CarrierRate] = None
    is_international: bool = False
    mock: bool = False


class CreateShipmentRequest(BaseModel):
    order_id: str
    carrier_id: Optional[int] = None


class ShipmentResponse(BaseModel):
    shipment_id: str
    order_id: str
    awb_code: str
    courier_name: str
    tracking_url: str
    label_url: Optional[str] = None
    status: str


# ============ MOCK DATA ============
MOCK_CARRIERS_DOMESTIC = [
    {"carrier_id": 1, "carrier": "Delhivery", "service": "Surface", "base_rate": 45, "per_kg": 15, "days": 4, "mode": "surface"},
    {"carrier_id": 2, "carrier": "Delhivery", "service": "Express", "base_rate": 65, "per_kg": 20, "days": 2, "mode": "air"},
    {"carrier_id": 3, "carrier": "Blue Dart", "service": "Express", "base_rate": 85, "per_kg": 25, "days": 2, "mode": "air"},
    {"carrier_id": 4, "carrier": "DTDC", "service": "Standard", "base_rate": 40, "per_kg": 12, "days": 5, "mode": "surface"},
    {"carrier_id": 5, "carrier": "Ecom Express", "service": "Standard", "base_rate": 42, "per_kg": 14, "days": 4, "mode": "surface"},
    {"carrier_id": 6, "carrier": "Xpressbees", "service": "Express", "base_rate": 55, "per_kg": 18, "days": 3, "mode": "surface"},
]

MOCK_CARRIERS_INTERNATIONAL = [
    {"carrier_id": 101, "carrier": "India Post EMS", "service": "International", "base_rate": 800, "per_kg": 400, "days": 12},
    {"carrier_id": 102, "carrier": "UPS", "service": "Express Saver", "base_rate": 1500, "per_kg": 600, "days": 5},
    {"carrier_id": 103, "carrier": "DHL", "service": "Express", "base_rate": 1800, "per_kg": 700, "days": 4},
    {"carrier_id": 104, "carrier": "FedEx", "service": "International Economy", "base_rate": 1200, "per_kg": 500, "days": 7},
]


# ============ HELPERS ============
async def get_shiprocket_token() -> dict:
    """Get or refresh Shiprocket API token."""
    global _shiprocket_token_cache

    if _shiprocket_token_cache["token"] and _shiprocket_token_cache["expires_at"]:
        if datetime.now(timezone.utc) < _shiprocket_token_cache["expires_at"]:
            return _shiprocket_token_cache["token"]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SHIPROCKET_BASE_URL}/auth/login",
                json={
                    "email": SHIPROCKET_API_EMAIL,
                    "password": SHIPROCKET_API_PASSWORD
                },
                headers={"Content-Type": "application/json"},
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()

            token = data.get("token")
            if token:
                _shiprocket_token_cache["token"] = token
                _shiprocket_token_cache["expires_at"] = datetime.now(timezone.utc) + timedelta(days=9)
                return token
            else:
                return None

    except Exception:
        return None


async def get_shiprocket_headers() -> dict:
    """Get headers with valid token."""
    token = await get_shiprocket_token()
    if not token:
        return None
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def is_metro_pincode(pincode: str) -> bool:
    """Check if pincode is in a metro city."""
    metro_prefixes = ["11", "40", "50", "56", "60", "70", "38"]
    return pincode[:2] in metro_prefixes if len(pincode) >= 2 else False


def is_international(country: str) -> bool:
    """Check if destination is international."""
    return country.lower() not in ["india", "in"]


def get_delivery_date(days: int) -> str:
    """Return formatted delivery date."""
    delivery = datetime.now() + timedelta(days=days)
    return delivery.strftime("%b %d, %Y")


def calculate_mock_rate(carrier: dict, weight: float, is_metro: bool) -> float:
    """Calculate mock shipping rate."""
    base = carrier["base_rate"]
    weight_charge = carrier["per_kg"] * max(weight, 0.5)
    if is_metro:
        return round((base + weight_charge) * 0.9, 2)
    return round(base + weight_charge, 2)


async def _calculate_cart_weight(cart_items: Optional[List[Dict[str, Any]]]) -> float:
    """Calculate total weight from cart items using product weights from DB."""
    if not cart_items:
        return 0.5

    total_weight = 0.0
    product_ids = [item.get("product_id") for item in cart_items if item.get("product_id")]

    if product_ids:
        products = await db.products.find(
            {"id": {"$in": product_ids}},
            {"_id": 0, "id": 1, "weight": 1}
        ).to_list(100)
        weight_map = {p["id"]: p.get("weight", 0.3) for p in products}

        for item in cart_items:
            pid = item.get("product_id", "")
            qty = item.get("quantity", 1)
            w = weight_map.get(pid, 0.3)
            total_weight += w * qty

    return max(total_weight, 0.1)


def _mock_shipping_rates(request: ShippingRateRequest, is_intl: bool, weight: float) -> ShippingRatesResponse:
    """Generate mock shipping rates."""
    carriers = MOCK_CARRIERS_INTERNATIONAL if is_intl else MOCK_CARRIERS_DOMESTIC
    is_metro = is_metro_pincode(request.delivery_pincode)

    is_same_city = (
        not is_intl
        and len(request.pickup_pincode) >= 2
        and len(request.delivery_pincode) >= 2
        and request.pickup_pincode[:2] == request.delivery_pincode[:2]
    )
    if is_same_city:
        carriers = [c for c in carriers if c.get("mode") != "air"]
    elif not is_intl:
        carriers = [c for c in carriers if c.get("mode") == "air"]

    rates = []
    for carrier in carriers:
        rate = calculate_mock_rate(carrier, weight, is_metro and not is_intl)
        days = carrier["days"]
        if is_metro and not is_intl:
            days = max(2, days - 1)
        if is_same_city:
            days = max(1, days - 1)

        rates.append(CarrierRate(
            carrier_id=carrier["carrier_id"],
            carrier=carrier["carrier"],
            service=carrier["service"],
            rate=rate,
            currency="INR",
            estimated_days=days,
            estimated_delivery=get_delivery_date(days),
            cod_available=not is_intl,
            is_international=is_intl
        ))

    rates.sort(key=lambda x: x.rate)
    fastest = min(rates, key=lambda x: x.estimated_days)

    return ShippingRatesResponse(
        rates=rates,
        cheapest=rates[0] if rates else None,
        fastest=fastest,
        recommended=rates[1] if len(rates) > 1 else rates[0] if rates else None,
        is_international=is_intl,
        mock=True
    )


async def _mock_create_order(order: dict) -> dict:
    """Mock order creation for testing."""
    mock_sr_id = f"SR{datetime.now().strftime('%y%m%d')}{str(uuid.uuid4())[:6].upper()}"
    mock_shipment_id = f"SHP{str(uuid.uuid4())[:8].upper()}"

    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {
            "shiprocket_order_id": mock_sr_id,
            "shiprocket_shipment_id": mock_shipment_id,
            "fulfillment_status": "processing",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    return {
        "message": "Order created in Shiprocket (MOCK)",
        "shiprocket_order_id": mock_sr_id,
        "shipment_id": mock_shipment_id,
        "mock": True
    }


async def _mock_generate_awb(order_id: str, order: dict) -> dict:
    """Mock AWB generation."""
    mock_awb = f"AWB{datetime.now().strftime('%y%m%d')}{str(uuid.uuid4())[:8].upper()}"
    mock_courier = "Delhivery"

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "awb_code": mock_awb,
            "courier_name": mock_courier,
            "tracking_url": f"https://shiprocket.co/tracking/{mock_awb}",
            "fulfillment_status": "ready_to_ship",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    return {
        "message": "AWB generated (MOCK)",
        "awb_code": mock_awb,
        "courier": mock_courier,
        "tracking_url": f"https://shiprocket.co/tracking/{mock_awb}",
        "mock": True
    }


def _mock_tracking(awb_code: str) -> dict:
    """Mock tracking data."""
    now = datetime.now()
    activities = [
        {"date": (now - timedelta(hours=2)).isoformat(), "activity": "Out for delivery", "location": "Local Hub"},
        {"date": (now - timedelta(days=1)).isoformat(), "activity": "In transit", "location": "Mumbai Hub"},
        {"date": (now - timedelta(days=2)).isoformat(), "activity": "Picked up", "location": "Seller Location"},
        {"date": (now - timedelta(days=2, hours=2)).isoformat(), "activity": "Order placed", "location": "Online"},
    ]

    return {
        "awb_code": awb_code,
        "current_status": "In Transit",
        "current_status_id": 18,
        "courier": "Delhivery",
        "origin": "Mumbai",
        "destination": "Delhi",
        "estimated_delivery": get_delivery_date(2),
        "activities": activities,
        "delivered_date": None,
        "mock": True
    }
