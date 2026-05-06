"""
Shipping API Tests - Live Shiprocket Integration
- Tests LIVE Shiprocket carrier rates for domestic India
- Tests mock fallback for international shipping
- Cart.js carrier selection and shipping cost integration
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestShippingStatus:
    """Test /api/shipping/status endpoint - Verify Shiprocket is LIVE"""
    
    def test_shiprocket_is_configured_live(self):
        """Shiprocket should be configured in LIVE mode"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        
        data = response.json()
        # Shiprocket should be LIVE now
        assert "shiprocket" in data
        assert data["shiprocket"]["configured"] == True
        assert data["shiprocket"]["mode"] == "live"
        
        # Verify features available
        features = data["shiprocket"]["features"]
        assert features["domestic"] == True
        assert features["international"] == True
        assert features["tracking"] == True
        assert features["labels"] == True
        assert features["pickups"] == True
    
    def test_google_places_still_mock(self):
        """Google Places should remain in MOCK mode"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["google_places"]["configured"] == False
        assert data["google_places"]["mode"] == "mock"


class TestLiveShiprocketRates:
    """Test /api/shipping/rates with LIVE Shiprocket API for domestic India"""
    
    def test_domestic_india_returns_live_rates(self):
        """Domestic India should return LIVE Shiprocket rates"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",  # Delhi
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        # LIVE rates should have mock=false
        assert data["mock"] == False
        
        # Should have multiple carriers
        assert "rates" in data
        assert len(data["rates"]) >= 1  # At least 1 carrier
        
        # Verify carrier structure
        carrier = data["rates"][0]
        assert "carrier_id" in carrier
        assert "carrier" in carrier
        assert "rate" in carrier
        assert carrier["currency"] == "INR"
        assert "estimated_days" in carrier
        assert "estimated_delivery" in carrier
        assert "cod_available" in carrier
        assert carrier["is_international"] == False
    
    def test_live_rates_include_known_carriers(self):
        """LIVE rates should include known Shiprocket carriers"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "400001",  # Mumbai
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        carriers = [r["carrier"] for r in data["rates"]]
        
        # Should have at least one of these carriers
        known_carriers = ["Xpressbees", "Delhivery", "DTDC", "Ekart", "Blue Dart", "Ecom Express"]
        carrier_names_lower = [c.lower() for c in carriers]
        
        found_known = False
        for kc in known_carriers:
            if any(kc.lower() in cn for cn in carrier_names_lower):
                found_known = True
                break
        assert found_known, f"No known carriers found in: {carriers}"
    
    def test_live_rates_have_cheapest_and_fastest(self):
        """Response should include cheapest and fastest carrier options"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["cheapest"] is not None
        assert data["fastest"] is not None
        assert data["recommended"] is not None
        
        # Cheapest should have lowest rate
        cheapest_rate = data["cheapest"]["rate"]
        all_rates = [r["rate"] for r in data["rates"]]
        assert cheapest_rate == min(all_rates)
        
        # Fastest should have minimum days
        fastest_days = data["fastest"]["estimated_days"]
        all_days = [r["estimated_days"] for r in data["rates"]]
        assert fastest_days == min(all_days)
    
    def test_live_rates_for_different_weights(self):
        """Heavier shipments should cost more"""
        # Light weight
        response_light = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.5
        })
        
        # Heavy weight
        response_heavy = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 2.0
        })
        
        assert response_light.status_code == 200
        assert response_heavy.status_code == 200
        
        light_cheapest = response_light.json()["cheapest"]["rate"]
        heavy_cheapest = response_heavy.json()["cheapest"]["rate"]
        
        # Heavier should cost more
        assert heavy_cheapest > light_cheapest
    
    def test_live_rates_for_metro_vs_nonmetro(self):
        """Metro cities may have different delivery times"""
        # Metro - Delhi
        response_metro = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.5
        })
        
        # Non-metro - Guwahati
        response_nonmetro = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "781001",
            "delivery_country": "India",
            "weight": 0.5
        })
        
        assert response_metro.status_code == 200
        assert response_nonmetro.status_code == 200
        
        metro_data = response_metro.json()
        nonmetro_data = response_nonmetro.json()
        
        # Both should return live or mock rates (serviceable areas)
        assert "rates" in metro_data
        assert "rates" in nonmetro_data


class TestInternationalRatesFallback:
    """Test international shipping falls back to mock (ShiprocketX not fully configured)"""
    
    def test_international_usa_falls_back_to_mock(self):
        """International USA shipping should fall back to mock"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "10001",
            "delivery_country": "United States",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        # International falls back to mock
        assert data["mock"] == True
        assert len(data["rates"]) > 0
        assert data["rates"][0]["is_international"] == True
    
    def test_international_uk_falls_back_to_mock(self):
        """International UK shipping should fall back to mock"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "W1D 1BS",
            "delivery_country": "United Kingdom",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["mock"] == True


class TestSimpleShippingRate:
    """Test /api/shipping/rates/simple endpoint for cart display"""
    
    def test_simple_rate_returns_cheapest(self):
        """Simple rate endpoint should return cheapest carrier"""
        response = requests.get(f"{BASE_URL}/api/shipping/rates/simple?pincode=110001&country=India&weight=0.5")
        assert response.status_code == 200
        
        data = response.json()
        assert "shipping_cost" in data
        assert "currency" in data
        assert "carrier" in data
        assert "estimated_days" in data
        assert "estimated_delivery" in data
        
        # Should be in INR for India
        assert data["currency"] == "INR"
        # Rate should be a positive number
        assert data["shipping_cost"] > 0


class TestLegacyDeliveryEstimate:
    """Test legacy /api/delivery/estimate endpoint for backward compatibility"""
    
    def test_legacy_estimate_india(self):
        """Legacy estimate endpoint should return carrier options"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "110001",
            "destination_country": "India",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "estimates" in data
        assert "cheapest" in data
        assert "fastest" in data
        assert "provider" in data
        assert data["provider"] == "shiprocket"


class TestSimpleDeliveryEstimate:
    """Test /api/delivery-estimate-simple endpoint"""
    
    def test_simple_estimate_metro(self):
        """Metro pincode should return fast estimate"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=400001&country=India")
        assert response.status_code == 200
        
        data = response.json()
        assert "estimate" in data
        assert data["type"] == "metro"
        assert data["provider"] == "shiprocket"
    
    def test_simple_estimate_international(self):
        """International should return longer estimate"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=10001&country=United%20States")
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "international"
        assert "7-14" in data["estimate"]  # International 7-14 days


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
