"""
Test suite for Order Tracking and Product Weights
Tests: 
- GET /api/shipping/track/{awb_code} - Tracking API with mock fallback
- GET /api/products - Product weights verification  
- POST /api/shipping/rates - Weight-based shipping calculation
"""
import pytest
import requests
import os

# Read from frontend .env file if env var not set
def get_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '')
    if not url:
        try:
            with open('/app/frontend/.env', 'r') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.split('=', 1)[1].strip()
                        break
        except:
            pass
    return url.rstrip('/')

BASE_URL = get_base_url()

class TestTrackingAPI:
    """Tracking endpoint tests with mock fallback"""
    
    def test_tracking_returns_mock_for_non_existent_awb(self):
        """Track non-existent AWB should return mock data"""
        response = requests.get(f"{BASE_URL}/api/shipping/track/TEST123")
        assert response.status_code == 200
        
        data = response.json()
        assert data["awb_code"] == "TEST123"
        assert data["mock"] == True  # Should fallback to mock
        assert data["current_status"] == "In Transit"
        assert data["courier"] == "Delhivery"
        assert "activities" in data
        assert len(data["activities"]) > 0
        print(f"PASS: Tracking mock fallback working - status: {data['current_status']}")
    
    def test_tracking_activities_have_required_fields(self):
        """Verify tracking activities have date, activity, location"""
        response = requests.get(f"{BASE_URL}/api/shipping/track/ANYAWB")
        assert response.status_code == 200
        
        data = response.json()
        for activity in data["activities"]:
            assert "date" in activity
            assert "activity" in activity
            assert "location" in activity
        print(f"PASS: Tracking activities have all required fields")
    
    def test_tracking_has_estimated_delivery(self):
        """Verify tracking includes estimated delivery date"""
        response = requests.get(f"{BASE_URL}/api/shipping/track/TEST999")
        assert response.status_code == 200
        
        data = response.json()
        assert "estimated_delivery" in data
        assert data["estimated_delivery"]  # Not empty
        print(f"PASS: Estimated delivery: {data['estimated_delivery']}")


class TestProductWeights:
    """Product weight verification tests"""
    
    def test_all_products_have_weight(self):
        """All products should have weight field"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        
        data = response.json()
        products = data.get("products", [])
        assert len(products) >= 10, f"Expected at least 10 products, got {len(products)}"
        
        for product in products:
            assert "weight" in product, f"Product {product['name']} missing weight"
            assert product["weight"] is not None, f"Product {product['name']} has null weight"
        print(f"PASS: All {len(products)} products have weight field")
    
    def test_product_weights_in_realistic_range(self):
        """Product weights should be in 0.05 to 0.6 kg range"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        
        data = response.json()
        products = data.get("products", [])
        
        weight_issues = []
        for product in products:
            weight = product.get("weight", 0)
            if weight < 0.05 or weight > 0.6:
                weight_issues.append(f"{product['name']}: {weight}kg")
        
        assert len(weight_issues) == 0, f"Products with weight outside range: {weight_issues}"
        print(f"PASS: All product weights in 0.05-0.6kg range")
    
    def test_specific_product_weights(self):
        """Verify specific products have expected weights"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        
        products = response.json().get("products", [])
        weight_map = {p["name"]: p["weight"] for p in products}
        
        # Expected weights from seed.py
        expected = {
            "Reef Sticker Pack": 0.05,  # lightest
            "Dive Flag Cap": 0.1,
            "Bottom Time Logo Tee": 0.2,
            "Ocean Explorer Hoodie": 0.6,  # heaviest
        }
        
        for name, expected_weight in expected.items():
            if name in weight_map:
                assert weight_map[name] == expected_weight, f"{name}: expected {expected_weight}, got {weight_map[name]}"
                print(f"PASS: {name} weight = {expected_weight}kg")


class TestWeightBasedShipping:
    """Weight-based shipping rate calculation tests"""
    
    def test_domestic_shipping_with_weight(self):
        """Domestic rates should vary based on weight"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "400001",
            "delivery_country": "India",
            "weight": 0.3
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["is_international"] == False
        assert data["cheapest"] is not None
        assert data["cheapest"]["rate"] > 0
        print(f"PASS: Domestic shipping rate = {data['cheapest']['rate']} INR for 0.3kg")
    
    def test_heavier_weight_costs_more(self):
        """Heavier items should cost more to ship"""
        # Light item (0.1 kg)
        light = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India", 
            "weight": 0.1
        }).json()
        
        # Heavy item (0.6 kg)
        heavy = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "weight": 0.6
        }).json()
        
        light_rate = light["cheapest"]["rate"]
        heavy_rate = heavy["cheapest"]["rate"]
        
        # Heavy should cost same or more (weight-based calculation)
        assert heavy_rate >= light_rate, f"Heavy ({heavy_rate}) should cost >= light ({light_rate})"
        print(f"PASS: Light (0.1kg) = {light_rate} INR, Heavy (0.6kg) = {heavy_rate} INR")


class TestShippingStatus:
    """Shipping service status tests"""
    
    def test_shiprocket_status(self):
        """Verify Shiprocket is configured"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "shiprocket" in data
        assert data["shiprocket"]["configured"] == True
        assert data["shiprocket"]["features"]["tracking"] == True
        print(f"PASS: Shiprocket configured, mode={data['shiprocket']['mode']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
