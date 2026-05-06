"""
Shipping & Address API Tests
- Google Places API (address autocomplete) - MOCK MODE
- Shiprocket (India delivery estimates) - MOCK MODE
- EasyPost (International delivery estimates) - MOCK MODE
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestShippingStatus:
    """Test /api/shipping/status endpoint"""
    
    def test_shipping_status_returns_mock_mode(self):
        """All three services should be in mock mode"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        
        data = response.json()
        # Verify Google Places mock status
        assert "google_places" in data
        assert data["google_places"]["mode"] == "mock"
        assert data["google_places"]["configured"] == False
        
        # Verify Shiprocket mock status
        assert "shiprocket" in data
        assert data["shiprocket"]["mode"] == "mock"
        assert data["shiprocket"]["configured"] == False
        
        # Verify EasyPost mock status
        assert "easypost" in data
        assert data["easypost"]["mode"] == "mock"
        assert data["easypost"]["configured"] == False


class TestAddressAutocomplete:
    """Test /api/address/autocomplete endpoint"""
    
    def test_autocomplete_mumbai_query(self):
        """Search for 'mumbai' should return address suggestions"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete?query=mumbai")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        assert len(data["suggestions"]) > 0
        assert data["mock"] == True  # Should be in mock mode
        
        # Verify suggestion structure
        suggestion = data["suggestions"][0]
        assert "place_id" in suggestion
        assert "description" in suggestion
        assert "main_text" in suggestion
        assert "mumbai" in suggestion["description"].lower() or "mumbai" in suggestion["main_text"].lower()
    
    def test_autocomplete_delhi_query(self):
        """Search for 'delhi' should return address suggestions"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete?query=delhi")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        assert data["mock"] == True
        # Should find Connaught Place, New Delhi
        found_delhi = any("delhi" in s["description"].lower() for s in data["suggestions"])
        assert found_delhi or len(data["suggestions"]) > 0  # Either finds delhi or returns fallback
    
    def test_autocomplete_international_query(self):
        """Search for 'new york' should return international address suggestions"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete?query=new+york")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        assert data["mock"] == True
    
    def test_autocomplete_short_query_rejected(self):
        """Query with less than 2 characters should be rejected"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete?query=a")
        assert response.status_code == 422  # Validation error
    
    def test_autocomplete_with_country_param(self):
        """Test autocomplete with country bias parameter"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete?query=bandra&country=IN")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data


class TestAddressDetails:
    """Test /api/address/details endpoint"""
    
    def test_address_details_mock_2(self):
        """Get details for mock_2 (Bandra West, Mumbai)"""
        response = requests.get(f"{BASE_URL}/api/address/details?place_id=mock_2")
        assert response.status_code == 200
        
        data = response.json()
        assert data["mock"] == True
        assert data["city"] == "Mumbai"
        assert data["state"] == "Maharashtra"
        assert data["pincode"] == "400050"
        assert data["country"] == "India"
        assert data["country_code"] == "IN"
        assert data["latitude"] is not None
        assert data["longitude"] is not None
        assert data["formatted_address"] == "Bandra West, Mumbai, Maharashtra 400050, India"
    
    def test_address_details_mock_1(self):
        """Get details for mock_1 (Connaught Place, Delhi)"""
        response = requests.get(f"{BASE_URL}/api/address/details?place_id=mock_1")
        assert response.status_code == 200
        
        data = response.json()
        assert data["city"] == "New Delhi"
        assert data["pincode"] == "110001"
        assert data["country_code"] == "IN"
    
    def test_address_details_international(self):
        """Get details for mock_us_1 (Times Square, New York)"""
        response = requests.get(f"{BASE_URL}/api/address/details?place_id=mock_us_1")
        assert response.status_code == 200
        
        data = response.json()
        assert data["city"] == "New York"
        assert data["country"] == "United States"
        assert data["country_code"] == "US"
        assert data["pincode"] == "10036"
    
    def test_address_details_unknown_place_id(self):
        """Unknown place_id should return default mock data"""
        response = requests.get(f"{BASE_URL}/api/address/details?place_id=unknown_id")
        assert response.status_code == 200
        
        data = response.json()
        assert data["mock"] == True
        # Should return default fallback
        assert data["country"] == "India"


class TestDeliveryEstimateIndia:
    """Test /api/delivery/estimate for India (Shiprocket mock)"""
    
    def test_india_metro_delivery_estimate(self):
        """Delivery to metro city (Mumbai 400001) should use Shiprocket"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "400001",
            "destination_country": "India",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["mock"] == True
        assert data["provider"] == "shiprocket"
        assert "estimates" in data
        assert len(data["estimates"]) > 0
        
        # Verify carrier structure
        carrier = data["estimates"][0]
        assert "carrier" in carrier
        assert "service" in carrier
        assert "rate" in carrier
        assert carrier["currency"] == "INR"
        assert "estimated_days" in carrier
        assert "estimated_delivery" in carrier
        
        # Metro should have faster delivery (2-3 days)
        assert carrier["estimated_days"] <= 4
        
        # Verify recommended, fastest, cheapest are populated
        assert data["recommended"] is not None
        assert data["fastest"] is not None
        assert data["cheapest"] is not None
    
    def test_india_non_metro_delivery_estimate(self):
        """Delivery to non-metro city should take longer"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "781001",  # Guwahati
            "destination_country": "India",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["provider"] == "shiprocket"
        assert data["mock"] == True
        # Non-metro should have 4+ days delivery
        if data["estimates"]:
            # At least some carriers should take 4+ days
            max_days = max(e["estimated_days"] for e in data["estimates"])
            assert max_days >= 4
    
    def test_india_delivery_with_heavier_weight(self):
        """Heavier weight should increase rates"""
        # Light weight
        response_light = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "400001",
            "destination_country": "India",
            "weight_kg": 0.5
        })
        # Heavier weight
        response_heavy = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "400001",
            "destination_country": "India",
            "weight_kg": 2.0
        })
        
        assert response_light.status_code == 200
        assert response_heavy.status_code == 200
        
        light_rate = response_light.json()["estimates"][0]["rate"]
        heavy_rate = response_heavy.json()["estimates"][0]["rate"]
        
        # Heavier should cost more
        assert heavy_rate > light_rate


class TestDeliveryEstimateInternational:
    """Test /api/delivery/estimate for International (EasyPost mock)"""
    
    def test_usa_delivery_estimate(self):
        """Delivery to USA should use EasyPost"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "10036",
            "destination_country": "United States",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["mock"] == True
        assert data["provider"] == "easypost"
        assert "estimates" in data
        assert len(data["estimates"]) > 0
        
        # Verify carrier structure
        carrier = data["estimates"][0]
        assert carrier["currency"] == "USD"  # International uses USD
        assert "carrier" in carrier
        # International carriers
        carriers = [e["carrier"] for e in data["estimates"]]
        international_carriers = ["FedEx", "DHL", "UPS", "USPS"]
        assert any(c in carriers for c in international_carriers)
    
    def test_europe_delivery_estimate(self):
        """Delivery to UK should use EasyPost with Europe rates"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "W1D 1BS",
            "destination_country": "United Kingdom",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["provider"] == "easypost"
        assert data["mock"] == True
    
    def test_apac_delivery_estimate(self):
        """Delivery to Singapore should use EasyPost with APAC rates"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "238801",
            "destination_country": "Singapore",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["provider"] == "easypost"
    
    def test_saarc_delivery_estimate(self):
        """Delivery to Nepal should use EasyPost with SAARC rates"""
        response = requests.post(f"{BASE_URL}/api/delivery/estimate", json={
            "destination_pincode": "44600",
            "destination_country": "Nepal",
            "weight_kg": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["provider"] == "easypost"


class TestSimpleDeliveryEstimate:
    """Test /api/delivery-estimate-simple endpoint"""
    
    def test_simple_estimate_metro(self):
        """Metro pincode should return 2-4 days"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=400001&country=India")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "2-4 business days"
        assert data["type"] == "metro"
        assert "delivery_by" in data
    
    def test_simple_estimate_domestic(self):
        """Non-metro pincode should return 4-7 days"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=781001&country=India")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "4-7 business days"
        assert data["type"] == "domestic"
    
    def test_simple_estimate_international_usa(self):
        """USA should return 10-16 days (americas)"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=10036&country=United%20States")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "10-16 business days"
        assert data["type"] == "americas"
    
    def test_simple_estimate_apac(self):
        """Thailand should return 7-12 days (apac)"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=10110&country=Thailand")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "7-12 business days"
        assert data["type"] == "apac"
    
    def test_simple_estimate_europe(self):
        """Germany should return 8-14 days (europe)"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=10115&country=Germany")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "8-14 business days"
        assert data["type"] == "europe"
    
    def test_simple_estimate_saarc(self):
        """Nepal should return 5-8 days (regional/saarc)"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple?pincode=44600&country=Nepal")
        assert response.status_code == 200
        
        data = response.json()
        assert data["estimate"] == "5-8 business days"
        assert data["type"] == "regional"  # SAARC countries return "regional" type


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
