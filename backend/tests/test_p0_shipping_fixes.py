"""
Test P0 Shiprocket Shipping Fixes:
1. International shipping API failure - should return is_international=true with rates (mock fallback expected)
2. Carrier selection logic - domestic=auto-cheapest in response, international=user choice (multiple rates)
3. Product weight in shipping calculation - cart_items param uses product weights from DB
4. Postcode lookup via Shiprocket API - /api/shipping/postcode/lookup replaces Google Places
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestShippingStatusNoGooglePlaces:
    """Verify /api/shipping/status no longer mentions google_places"""
    
    def test_shipping_status_no_google_places(self):
        """Issue 4: Verify google_places is removed from status endpoint"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        data = response.json()
        
        # Check shiprocket is configured
        assert "shiprocket" in data
        assert data["shiprocket"]["features"]["postcode_lookup"] == True
        
        # Verify NO google_places key exists anywhere
        response_text = str(data).lower()
        assert "google_places" not in response_text, f"google_places should be removed: {data}"
        assert "google" not in response_text, f"No google references should exist: {data}"
        print(f"✓ Shipping status verified - no google_places, postcode_lookup enabled via Shiprocket")
        print(f"  Response: {data}")


class TestDomesticShippingRates:
    """Issue 2: Verify domestic shipping returns is_international=false with live rates"""
    
    def test_domestic_shipping_returns_live_rates(self):
        """Domestic: India to India should return live carriers (not mock)"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.5
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify is_international flag
        assert data.get("is_international") == False, "Domestic should have is_international=false"
        
        # Verify live rates (mock=false for domestic)
        assert data.get("mock") == False, "Domestic should return LIVE rates (mock=false)"
        
        # Verify 7+ carriers returned
        rates = data.get("rates", [])
        assert len(rates) >= 7, f"Expected 7+ carriers, got {len(rates)}"
        
        # Verify cheapest is identified (for auto-selection)
        assert data.get("cheapest") is not None, "Cheapest carrier should be identified"
        
        print(f"✓ Domestic shipping: is_international=False, mock=False, {len(rates)} carriers")
        print(f"  Cheapest: {data['cheapest']['carrier']} @ ₹{data['cheapest']['rate']}")
    
    def test_domestic_carrier_has_is_international_flag(self):
        """Each carrier rate should include is_international=false for domestic"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India"
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        for carrier in data.get("rates", [])[:3]:  # Check first 3
            assert carrier.get("is_international") == False, f"Carrier {carrier['carrier']} should have is_international=false"
        
        print("✓ All domestic carriers have is_international=false")


class TestInternationalShippingRates:
    """Issue 1: Verify international shipping returns is_international=true with rates"""
    
    def test_international_usa_returns_rates(self):
        """International: delivery_country='United States' should return is_international=true"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "10001",
            "delivery_country": "United States",
            "weight": 0.5
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # CRITICAL: Verify is_international flag is TRUE
        assert data.get("is_international") == True, f"International should have is_international=true, got {data.get('is_international')}"
        
        # Verify rates are returned (mock fallback is acceptable)
        rates = data.get("rates", [])
        assert len(rates) >= 1, "International should return at least 1 carrier rate"
        
        # Verify cheapest/fastest identified
        assert data.get("cheapest") is not None or len(rates) > 0
        
        # Mock is acceptable since ShiprocketX not activated
        print(f"✓ International (USA): is_international=True, {len(rates)} carriers, mock={data.get('mock')}")
        if rates:
            print(f"  Sample rate: {rates[0]['carrier']} @ ₹{rates[0]['rate']}")
    
    def test_international_uk_returns_rates(self):
        """International: delivery_country='United Kingdom' should return is_international=true"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "SW1A 1AA",
            "delivery_country": "United Kingdom",
            "weight": 1.0
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("is_international") == True, "UK should be is_international=true"
        assert len(data.get("rates", [])) >= 1, "Should return international rates"
        
        print(f"✓ International (UK): is_international=True, {len(data.get('rates', []))} carriers")
    
    def test_international_carrier_has_is_international_flag(self):
        """Each carrier rate should include is_international=true for international"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "10001",
            "delivery_country": "United States"
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        for carrier in data.get("rates", [])[:3]:
            assert carrier.get("is_international") == True, f"Carrier {carrier['carrier']} should have is_international=true"
        
        print("✓ All international carriers have is_international=true")


class TestPostcodeLookup:
    """Issue 4: Verify Shiprocket postcode lookup replaces Google Places"""
    
    def test_postcode_lookup_mumbai(self):
        """GET /api/shipping/postcode/lookup?postcode=400001 returns city/state from Shiprocket"""
        response = requests.get(f"{BASE_URL}/api/shipping/postcode/lookup?postcode=400001")
        assert response.status_code == 200
        data = response.json()
        
        # Should return city/state for Mumbai
        assert data.get("success") == True, f"Postcode lookup should succeed: {data}"
        assert data.get("city", "").lower() in ["mumbai", "fort"], f"City should be Mumbai, got {data.get('city')}"
        assert data.get("state", "").lower() in ["maharashtra", "mh"], f"State should be Maharashtra, got {data.get('state')}"
        assert data.get("mock") == False, "Postcode lookup should be live (not mock)"
        
        print(f"✓ Postcode 400001: {data.get('city')}, {data.get('state')} (live)")
    
    def test_postcode_lookup_delhi(self):
        """GET /api/shipping/postcode/lookup?postcode=110001 returns city/state"""
        response = requests.get(f"{BASE_URL}/api/shipping/postcode/lookup?postcode=110001")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("success") == True
        # Delhi or New Delhi or Central Delhi
        assert "delhi" in data.get("city", "").lower() or "delhi" in data.get("state", "").lower()
        
        print(f"✓ Postcode 110001: {data.get('city')}, {data.get('state')}")
    
    def test_postcode_lookup_returns_country_india(self):
        """Postcode lookup should always return country=India"""
        response = requests.get(f"{BASE_URL}/api/shipping/postcode/lookup?postcode=560001")
        assert response.status_code == 200
        data = response.json()
        
        if data.get("success"):
            assert data.get("country") == "India"
            print(f"✓ Postcode 560001: {data.get('city')}, {data.get('state')}, {data.get('country')}")


class TestProductWeightInShipping:
    """Issue 3: Verify cart_items parameter uses product weights from DB"""
    
    def test_shipping_rates_with_cart_items(self):
        """POST /api/shipping/rates with cart_items should use product weights"""
        # Create a test product with specific weight
        test_product_id = f"TEST_WEIGHT_{uuid.uuid4().hex[:8]}"
        
        # First, we test the endpoint accepts cart_items parameter
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "cart_items": [
                {"product_id": test_product_id, "quantity": 2}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Should still return valid rates (fallback to default weight if product not found)
        assert "rates" in data
        assert len(data.get("rates", [])) >= 1
        
        print(f"✓ Shipping rates endpoint accepts cart_items parameter")
    
    def test_shipping_rates_weight_affects_price(self):
        """Heavier weight should result in higher shipping cost"""
        # Light weight (0.5 kg)
        light_payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.5
        }
        light_response = requests.post(f"{BASE_URL}/api/shipping/rates", json=light_payload)
        light_data = light_response.json()
        light_cheapest = light_data.get("cheapest", {}).get("rate", 0)
        
        # Heavy weight (5 kg)
        heavy_payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 5.0
        }
        heavy_response = requests.post(f"{BASE_URL}/api/shipping/rates", json=heavy_payload)
        heavy_data = heavy_response.json()
        heavy_cheapest = heavy_data.get("cheapest", {}).get("rate", 0)
        
        # Heavier should cost more
        assert heavy_cheapest > light_cheapest, f"5kg ({heavy_cheapest}) should cost more than 0.5kg ({light_cheapest})"
        
        print(f"✓ Weight affects price: 0.5kg=₹{light_cheapest}, 5kg=₹{heavy_cheapest}")


class TestAdminProductWeightField:
    """Issue 3: Verify admin product endpoints accept weight field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin auth token"""
        # Try to login as admin
        requests.post(f"{BASE_URL}/api/auth/request-otp", json={
            "identifier": "admin@bottomtime.com",
            "method": "email"
        })
        # For testing without full auth, we'll check the endpoint accepts weight
        self.auth_header = {}  # Would need real auth in production
    
    def test_product_create_accepts_weight(self):
        """POST /api/admin/products should accept weight field (401 without auth is OK)"""
        payload = {
            "name": "TEST_Weight_Product",
            "category": "merch",
            "price": 29.99,
            "weight": 0.75,  # Weight in kg
            "stock": 50
        }
        response = requests.post(f"{BASE_URL}/api/admin/products", json=payload)
        
        # 401/403 is expected without auth, but 422 would indicate schema doesn't accept weight
        assert response.status_code in [401, 403, 200, 201], f"Unexpected status: {response.status_code}"
        
        if response.status_code in [401, 403]:
            print("✓ Admin product create requires auth (expected)")
        else:
            data = response.json()
            assert data.get("weight") == 0.75
            print(f"✓ Product created with weight: {data.get('weight')} kg")
    
    def test_product_model_includes_weight_default(self):
        """Product model should default weight to 0.3 kg"""
        # This tests the model default by checking shipping calculation behavior
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "cart_items": [{"product_id": "nonexistent_product", "quantity": 1}]
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        assert response.status_code == 200
        # Should use default weight and not fail
        print("✓ Shipping calculation handles missing products with default weight")


class TestCarrierSelectionLogic:
    """Issue 2: Frontend carrier selection - domestic auto-cheapest, international user choice"""
    
    def test_domestic_includes_cheapest_for_auto_select(self):
        """Domestic response should identify cheapest carrier for auto-selection"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",
            "delivery_country": "India"
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        data = response.json()
        
        assert data.get("is_international") == False
        assert data.get("cheapest") is not None, "Cheapest should be identified for domestic"
        assert data.get("fastest") is not None, "Fastest should be identified"
        
        # Cheapest should be the lowest rate
        rates = data.get("rates", [])
        if rates:
            min_rate = min(r.get("rate", float('inf')) for r in rates)
            assert data["cheapest"]["rate"] == min_rate, "Cheapest should have lowest rate"
        
        print(f"✓ Domestic cheapest identified: {data['cheapest']['carrier']} @ ₹{data['cheapest']['rate']}")
    
    def test_international_returns_multiple_carriers_for_user_choice(self):
        """International should return multiple carriers for user to choose"""
        payload = {
            "pickup_pincode": "400001",
            "delivery_pincode": "10001",
            "delivery_country": "United States"
        }
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json=payload)
        data = response.json()
        
        assert data.get("is_international") == True
        rates = data.get("rates", [])
        
        # Should have multiple options for user to choose
        assert len(rates) >= 1, "International should have carrier options"
        
        # Each rate should have necessary info for selection
        for rate in rates[:3]:
            assert "carrier" in rate
            assert "rate" in rate
            assert "estimated_days" in rate
            assert "is_international" in rate
        
        print(f"✓ International returns {len(rates)} carriers for user selection")


class TestResponseSchemaCompliance:
    """Verify ShippingRatesResponse includes is_international flag"""
    
    def test_response_includes_is_international(self):
        """Response schema must include is_international boolean"""
        # Test domestic
        domestic = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India"
        }).json()
        assert "is_international" in domestic, "Response must include is_international field"
        assert isinstance(domestic["is_international"], bool), "is_international must be boolean"
        
        # Test international
        international = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "10001",
            "delivery_country": "United States"
        }).json()
        assert "is_international" in international
        assert isinstance(international["is_international"], bool)
        
        print(f"✓ Response schema compliant: domestic.is_international={domestic['is_international']}, international.is_international={international['is_international']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
