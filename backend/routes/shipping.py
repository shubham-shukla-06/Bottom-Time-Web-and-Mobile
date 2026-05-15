"""
Shipping routes for Bottom Time.
Route handlers only — all helpers, models, and mock data live in shipping_helpers.py.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime, timedelta, timezone
from database import db
from auth_utils import get_current_user
from tax_engine import is_india
from shipping_helpers import (
    GOOGLE_PLACES_API_KEY, SHIPROCKET_MOCK, SHIPROCKET_BASE_URL,
    _COUNTRY_ISO,
    ShippingRateRequest, CarrierRate, ShippingRatesResponse,
    get_shiprocket_headers, get_country_code, get_country_iso,
    is_metro_pincode, is_international, get_delivery_date,
    _calculate_cart_weight, _mock_shipping_rates,
    _mock_create_order, _mock_generate_awb, _mock_tracking,
)
import httpx
import uuid

router = APIRouter()

GOOGLE_PLACES_KEY = GOOGLE_PLACES_API_KEY


# ============ GOOGLE PLACES API ============
@router.get("/address/autocomplete")
async def address_autocomplete(
    query: str = Query(..., min_length=2),
    country: str = Query("", description="Country code to bias results")
):
    """Address autocomplete using Google Places API."""
    if not GOOGLE_PLACES_API_KEY:
        return {"suggestions": [], "mock": True}

    try:
        async with httpx.AsyncClient() as client:
            body = {"input": query, "languageCode": "en"}
            if country:
                body["includedRegionCodes"] = [country]
            response = await client.post(
                "https://places.googleapis.com/v1/places:autocomplete",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
                },
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

            suggestions = []
            for s in data.get("suggestions", []):
                pred = s.get("placePrediction", {})
                structured = pred.get("structuredFormat", {})
                suggestions.append({
                    "place_id": pred.get("placeId", ""),
                    "description": pred.get("text", {}).get("text", ""),
                    "main_text": structured.get("mainText", {}).get("text", ""),
                    "secondary_text": structured.get("secondaryText", {}).get("text", "")
                })
            return {"suggestions": suggestions, "mock": False}
    except Exception as e:
        return {"suggestions": [], "mock": True, "error": str(e)}


@router.get("/address/details")
async def get_address_details(place_id: str = Query(...)):
    """Get full address details from a Google place ID."""
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=500, detail="Google Places not configured")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://places.googleapis.com/v1/places/{place_id}",
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                    "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location"
                },
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

            components = {}
            for comp in data.get("addressComponents", []):
                for t in comp.get("types", []):
                    components[t] = {"long": comp.get("longText", ""), "short": comp.get("shortText", "")}

            premise = components.get("premise", {}).get("long", "")
            street_number = components.get("street_number", {}).get("long", "")
            route = components.get("route", {}).get("long", "")
            sublocality = components.get("sublocality_level_1", {}).get("long", "") or components.get("sublocality", {}).get("long", "")
            neighborhood = components.get("neighborhood", {}).get("long", "")
            sublocality2 = components.get("sublocality_level_2", {}).get("long", "")

            parts1 = [p for p in [premise, f"{street_number} {route}".strip() if street_number or route else ""] if p]
            address_line1 = ", ".join(parts1) if parts1 else sublocality or neighborhood

            parts2 = [p for p in [sublocality, sublocality2, neighborhood] if p and p not in address_line1]
            address_line2 = ", ".join(parts2)

            return {
                "formatted_address": data.get("formattedAddress", ""),
                "address_line1": address_line1,
                "address_line2": address_line2,
                "city": components.get("locality", {}).get("long", "") or components.get("administrative_area_level_2", {}).get("long", ""),
                "state": components.get("administrative_area_level_1", {}).get("long", ""),
                "pincode": components.get("postal_code", {}).get("long", ""),
                "country": components.get("country", {}).get("long", ""),
                "country_code": components.get("country", {}).get("short", ""),
                "latitude": data.get("location", {}).get("latitude"),
                "longitude": data.get("location", {}).get("longitude"),
                "mock": False
            }
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Address lookup failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch address details")


# ============ POSTCODE LOOKUP (Shiprocket) ============
@router.get("/shipping/postcode/lookup")
async def postcode_lookup(postcode: str = Query(..., min_length=4)):
    """Lookup city/state/locality from Indian pincode using Shiprocket."""
    if SHIPROCKET_MOCK:
        return {"success": False, "message": "Shiprocket not configured", "mock": True}

    headers = await get_shiprocket_headers()
    if not headers:
        return {"success": False, "message": "Auth failed"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SHIPROCKET_BASE_URL}/open/postcode/details",
                params={"postcode": postcode},
                headers=headers,
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

            if data.get("success"):
                details = data.get("postcode_details", {})
                return {
                    "success": True,
                    "city": details.get("city", ""),
                    "state": details.get("state", ""),
                    "state_code": details.get("state_code", ""),
                    "localities": details.get("locality", []),
                    "country": "India",
                    "mock": False
                }
            return {"success": False, "message": "Postcode not found"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.get("/shipping/pincode-lookup")
async def pincode_lookup(pincode: str = Query(..., min_length=3), country: str = Query("India")) -> dict:
    """Lookup city/state from pincode using Google Places API (New) Text Search."""
    iso = get_country_iso(country)
    if not GOOGLE_PLACES_KEY:
        return {"success": False, "message": "Google API key not configured"}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://places.googleapis.com/v1/places:searchText",
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
                    "X-Goog-FieldMask": "places.addressComponents",
                },
                json={
                    "textQuery": f"{pincode}, {country}",
                    "includedRegionCodes": [iso],
                    "maxResultCount": 1,
                },
                timeout=5.0,
            )
            data = resp.json()
            places = data.get("places", [])
            if not places:
                return {"success": False, "message": "Pincode not found"}

            components = places[0].get("addressComponents", [])
            city = ""
            state = ""
            result_country = ""
            for comp in components:
                types = comp.get("types", [])
                name = comp.get("longText", "")
                if "locality" in types:
                    city = name
                elif "sublocality_level_1" in types and not city:
                    city = name
                elif "administrative_area_level_2" in types and not city:
                    city = name
                elif "administrative_area_level_1" in types:
                    state = name
                elif "country" in types:
                    result_country = name

            if not city and not state:
                return {"success": False, "message": "Could not resolve location"}

            return {
                "success": True,
                "city": city,
                "state": state,
                "country": result_country or country,
            }
    except Exception as e:
        return {"success": False, "message": str(e)}


# ============ SHIPROCKET SHIPPING RATES ============
@router.post("/shipping/rates", response_model=ShippingRatesResponse)
async def get_shipping_rates(request: ShippingRateRequest) -> dict:
    """Get shipping rates from Shiprocket."""
    is_intl = is_international(request.delivery_country)

    if request.cart_items:
        weight = await _calculate_cart_weight(request.cart_items)
    else:
        weight = request.weight

    if SHIPROCKET_MOCK:
        return _mock_shipping_rates(request, is_intl, weight)

    headers = await get_shiprocket_headers()
    if not headers:
        return _mock_shipping_rates(request, is_intl, weight)

    try:
        async with httpx.AsyncClient() as client:
            if is_intl:
                country_code = get_country_code(request.delivery_country)
                payload = {
                    "pickup_postcode": request.pickup_pincode,
                    "delivery_country": country_code,
                    "weight": weight,
                    "cod": 0,
                }
                if request.delivery_pincode:
                    payload["delivery_postcode"] = request.delivery_pincode
                url = f"{SHIPROCKET_BASE_URL}/courier/international/serviceability"
            else:
                payload = {
                    "pickup_postcode": request.pickup_pincode,
                    "delivery_postcode": request.delivery_pincode,
                    "weight": weight,
                    "length": request.length,
                    "breadth": request.breadth,
                    "height": request.height,
                    "cod": 1 if request.cod else 0
                }
                url = f"{SHIPROCKET_BASE_URL}/courier/serviceability"

            response = await client.get(url, params=payload, headers=headers, timeout=15.0)
            data = response.json()

            rates = []
            courier_data = data.get("data", {}).get("available_courier_companies", [])

            is_same_city_live = (
                not is_intl
                and len(request.pickup_pincode) >= 2
                and len(request.delivery_pincode) >= 2
                and request.pickup_pincode[:2] == request.delivery_pincode[:2]
            )

            for courier in courier_data:
                service_type = courier.get("courier_type", "Standard").lower()
                courier_name = courier.get("courier_name", "").lower()
                if any(kw in service_type for kw in ["instant", "pickup", "same day"]):
                    continue
                if any(kw in courier_name for kw in ["instant", "pickup"]):
                    continue
                raw_ct = courier.get("courier_type", "")
                is_air = raw_ct in [1, "1"] or str(raw_ct).lower() in ["air", "air express"] or "air" in courier_name
                if is_same_city_live and is_air:
                    continue
                if not is_same_city_live and not is_intl and not is_air:
                    continue

                raw_type = courier.get("courier_type", "")
                courier_type_map = {0: "Surface", 1: "Air", "0": "Surface", "1": "Air"}
                service_label = courier_type_map.get(raw_type, raw_type if isinstance(raw_type, str) and raw_type else "Standard")

                rates.append(CarrierRate(
                    carrier_id=courier.get("courier_company_id", 0),
                    carrier=courier.get("courier_name", ""),
                    service=service_label,
                    rate=float(courier.get("rate", 0)),
                    currency="INR",
                    estimated_days=int(courier.get("estimated_delivery_days", 5)),
                    estimated_delivery=get_delivery_date(int(courier.get("estimated_delivery_days", 5))),
                    cod_available=courier.get("cod", 0) == 1,
                    is_international=is_intl
                ))

            if not rates:
                return _mock_shipping_rates(request, is_intl, weight)

            rates.sort(key=lambda x: x.rate)
            fastest = min(rates, key=lambda x: x.estimated_days)

            return ShippingRatesResponse(
                rates=rates,
                cheapest=rates[0] if rates else None,
                fastest=fastest,
                recommended=rates[1] if len(rates) > 1 else rates[0] if rates else None,
                is_international=is_intl,
                mock=False
            )

    except Exception:
        return _mock_shipping_rates(request, is_intl, weight)


@router.get("/shipping/rates/simple")
async def simple_shipping_rate(
    pincode: str = Query(...),
    country: str = Query("India"),
    weight: float = Query(0.5)
):
    """Simple shipping rate for cart display."""
    request = ShippingRateRequest(
        delivery_pincode=pincode,
        delivery_country=country,
        weight=weight
    )

    result = await get_shipping_rates(request)

    if result.cheapest:
        return {
            "shipping_cost": result.cheapest.rate,
            "currency": result.cheapest.currency,
            "carrier": result.cheapest.carrier,
            "estimated_days": f"{result.cheapest.estimated_days}",
            "estimated_delivery": result.cheapest.estimated_delivery,
            "is_international": result.is_international,
            "mock": result.mock
        }

    return {
        "shipping_cost": 50 if is_india(country) else 800,
        "currency": "INR",
        "carrier": "Standard",
        "estimated_days": "5-7",
        "estimated_delivery": get_delivery_date(7),
        "is_international": is_international(country),
        "mock": True
    }


# ============ SHIPROCKET ORDER MANAGEMENT ============
@router.post("/shipping/create-order")
async def create_shiprocket_order(
    order_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Create order in Shiprocket after payment."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("shiprocket_order_id"):
        return {
            "message": "Order already created in Shiprocket",
            "shiprocket_order_id": order["shiprocket_order_id"],
            "awb_code": order.get("awb_code")
        }

    if SHIPROCKET_MOCK:
        return await _mock_create_order(order)

    headers = await get_shiprocket_headers()
    if not headers:
        return await _mock_create_order(order)

    try:
        async with httpx.AsyncClient() as client:
            items = []
            for item in order.get("items", []):
                items.append({
                    "name": item.get("product_name", ""),
                    "sku": item.get("product_id", ""),
                    "units": item.get("quantity", 1),
                    "selling_price": item.get("unit_price", 0),
                    "hsn": item.get("hsn_code", "")
                })

            shipping = order.get("shipping", {})

            payload = {
                "order_id": order["order_number"],
                "order_date": order.get("created_at", datetime.now(timezone.utc).isoformat()),
                "pickup_location": "Primary",
                "billing_customer_name": shipping.get("name", ""),
                "billing_last_name": "",
                "billing_address": shipping.get("address_line1", ""),
                "billing_address_2": shipping.get("address_line2", ""),
                "billing_city": shipping.get("city", ""),
                "billing_pincode": shipping.get("pincode", ""),
                "billing_state": shipping.get("state", ""),
                "billing_country": shipping.get("country", "India"),
                "billing_email": order.get("user_email", ""),
                "billing_phone": shipping.get("phone", ""),
                "shipping_is_billing": True,
                "order_items": items,
                "payment_method": "Prepaid",
                "sub_total": order.get("subtotal", 0),
                "length": 20,
                "breadth": 15,
                "height": 10,
                "weight": 0.5
            }

            response = await client.post(
                f"{SHIPROCKET_BASE_URL}/orders/create/adhoc",
                json=payload,
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            shiprocket_order_id = data.get("order_id")
            shipment_id = data.get("shipment_id")

            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "shiprocket_order_id": shiprocket_order_id,
                    "shiprocket_shipment_id": shipment_id,
                    "fulfillment_status": "processing",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )

            return {
                "message": "Order created in Shiprocket",
                "shiprocket_order_id": shiprocket_order_id,
                "shipment_id": shipment_id
            }

    except Exception:
        return await _mock_create_order(order)


@router.post("/shipping/generate-awb/{order_id}")
async def generate_awb(
    order_id: str,
    carrier_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generate AWB (Air Waybill) for an order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("awb_code"):
        return {
            "message": "AWB already generated",
            "awb_code": order["awb_code"],
            "courier": order.get("courier_name")
        }

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        raise HTTPException(status_code=400, detail="Create Shiprocket order first")

    if SHIPROCKET_MOCK:
        return await _mock_generate_awb(order_id, order)

    headers = await get_shiprocket_headers()
    if not headers:
        return await _mock_generate_awb(order_id, order)

    try:
        async with httpx.AsyncClient() as client:
            payload = {"shipment_id": shipment_id}
            if carrier_id:
                payload["courier_id"] = carrier_id

            response = await client.post(
                f"{SHIPROCKET_BASE_URL}/courier/assign/awb",
                json=payload,
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            awb_data = data.get("response", {}).get("data", {})
            awb_code = awb_data.get("awb_code", "")
            courier_name = awb_data.get("courier_name", "")

            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "awb_code": awb_code,
                    "courier_name": courier_name,
                    "courier_id": awb_data.get("courier_company_id"),
                    "tracking_url": f"https://shiprocket.co/tracking/{awb_code}",
                    "fulfillment_status": "ready_to_ship",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )

            return {
                "message": "AWB generated successfully",
                "awb_code": awb_code,
                "courier": courier_name,
                "tracking_url": f"https://shiprocket.co/tracking/{awb_code}"
            }

    except Exception:
        return await _mock_generate_awb(order_id, order)


@router.get("/shipping/label/{order_id}")
async def get_shipping_label(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get shipping label PDF URL for an order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        raise HTTPException(status_code=400, detail="No shipment found")

    if SHIPROCKET_MOCK:
        return {"label_url": f"https://shiprocket.co/label/mock/{order_id}", "mock": True}

    headers = await get_shiprocket_headers()
    if not headers:
        return {"label_url": "", "error": "Failed to authenticate"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SHIPROCKET_BASE_URL}/courier/generate/label",
                json={"shipment_id": [shipment_id]},
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            label_url = data.get("label_url", "")
            await db.orders.update_one({"id": order_id}, {"$set": {"label_url": label_url}})
            return {"label_url": label_url}

    except Exception as e:
        return {"label_url": "", "error": str(e)}


@router.post("/shipping/schedule-pickup/{order_id}")
async def schedule_pickup(
    order_id: str,
    pickup_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Schedule carrier pickup for an order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    shipment_id = order.get("shiprocket_shipment_id")
    if not shipment_id:
        raise HTTPException(status_code=400, detail="No shipment found")

    if SHIPROCKET_MOCK:
        pickup_scheduled = pickup_date or (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "pickup_scheduled": pickup_scheduled,
                "fulfillment_status": "pickup_scheduled",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Pickup scheduled (MOCK)", "pickup_date": pickup_scheduled, "mock": True}

    headers = await get_shiprocket_headers()
    if not headers:
        raise HTTPException(status_code=500, detail="Failed to authenticate with Shiprocket")

    try:
        async with httpx.AsyncClient() as client:
            payload = {"shipment_id": [shipment_id]}
            if pickup_date:
                payload["pickup_date"] = pickup_date

            response = await client.post(
                f"{SHIPROCKET_BASE_URL}/courier/generate/pickup",
                json=payload,
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            await db.orders.update_one(
                {"id": order_id},
                {"$set": {
                    "pickup_scheduled": pickup_date or datetime.now().strftime("%Y-%m-%d"),
                    "fulfillment_status": "pickup_scheduled",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )

            return {
                "message": "Pickup scheduled successfully",
                "pickup_token": data.get("pickup_token_number"),
                "pickup_date": pickup_date
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ TRACKING ============
@router.get("/shipping/track/{awb_code}")
async def track_shipment(awb_code: str) -> dict:
    """Get real-time tracking for a shipment."""
    if SHIPROCKET_MOCK:
        return _mock_tracking(awb_code)

    headers = await get_shiprocket_headers()
    if not headers:
        return _mock_tracking(awb_code)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SHIPROCKET_BASE_URL}/courier/track/awb/{awb_code}",
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()

            tracking = data.get("tracking_data", {})
            if not tracking.get("shipment_status") and not tracking.get("shipment_track_activities"):
                return _mock_tracking(awb_code)

            return {
                "awb_code": awb_code,
                "current_status": tracking.get("shipment_status", ""),
                "current_status_id": tracking.get("shipment_status_id", 0),
                "courier": tracking.get("courier_name", ""),
                "origin": tracking.get("origin", ""),
                "destination": tracking.get("destination", ""),
                "estimated_delivery": tracking.get("etd", ""),
                "activities": tracking.get("shipment_track_activities", []),
                "delivered_date": tracking.get("delivered_date"),
                "mock": False
            }

    except Exception:
        return _mock_tracking(awb_code)


# ============ SERVICE STATUS ============
@router.get("/shipping/status")
async def get_shipping_status() -> dict:
    """Check which shipping services are configured."""
    return {
        "shiprocket": {
            "configured": not SHIPROCKET_MOCK,
            "mode": "live" if not SHIPROCKET_MOCK else "mock",
            "features": {
                "domestic": True,
                "international": True,
                "tracking": True,
                "labels": True,
                "pickups": True,
                "postcode_lookup": True
            }
        }
    }


# ============ LEGACY ENDPOINTS ============
@router.get("/delivery-estimate-simple")
async def simple_delivery_estimate(
    pincode: str = Query(...),
    country: str = Query("India")
):
    """Simple delivery estimate for checkout display."""
    is_intl = is_international(country)
    is_metro = is_metro_pincode(pincode)

    if is_intl:
        days = "7-14"
        estimate_type = "international"
    elif is_metro:
        days = "2-4"
        estimate_type = "metro"
    else:
        days = "4-7"
        estimate_type = "domestic"

    return {
        "estimate": f"{days} business days",
        "delivery_by": f"Estimated by {get_delivery_date(int(days.split('-')[1]))}",
        "type": estimate_type,
        "provider": "shiprocket"
    }


@router.post("/delivery/estimate")
async def legacy_delivery_estimate(request: dict) -> dict:
    """Legacy endpoint for backward compatibility."""
    shipping_request = ShippingRateRequest(
        delivery_pincode=request.get("destination_pincode", "400001"),
        delivery_country=request.get("destination_country", "India"),
        weight=request.get("weight_kg", 0.5)
    )

    result = await get_shipping_rates(shipping_request)

    estimates = []
    for rate in result.rates:
        estimates.append({
            "carrier": rate.carrier,
            "service": rate.service,
            "rate": rate.rate,
            "currency": rate.currency,
            "estimated_days": rate.estimated_days,
            "estimated_delivery": rate.estimated_delivery
        })

    return {
        "estimates": estimates,
        "cheapest": {
            "carrier": result.cheapest.carrier,
            "service": result.cheapest.service,
            "rate": result.cheapest.rate,
            "currency": result.cheapest.currency,
            "estimated_days": result.cheapest.estimated_days,
            "estimated_delivery": result.cheapest.estimated_delivery
        } if result.cheapest else None,
        "fastest": {
            "carrier": result.fastest.carrier,
            "service": result.fastest.service,
            "rate": result.fastest.rate,
            "currency": result.fastest.currency,
            "estimated_days": result.fastest.estimated_days,
            "estimated_delivery": result.fastest.estimated_delivery
        } if result.fastest else None,
        "recommended": {
            "carrier": result.recommended.carrier,
            "service": result.recommended.service,
            "rate": result.recommended.rate,
            "currency": result.recommended.currency,
            "estimated_days": result.recommended.estimated_days,
            "estimated_delivery": result.recommended.estimated_delivery
        } if result.recommended else None,
        "provider": "shiprocket",
        "mock": result.mock
    }
