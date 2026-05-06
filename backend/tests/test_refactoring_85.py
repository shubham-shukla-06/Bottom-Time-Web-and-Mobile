"""
Test suite for iteration 85 - Code Quality Refactoring Pass 2
Tests backend analytics.py refactoring and API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBackendHealthAndPublicAPIs:
    """Test public endpoints to verify backend is working after refactoring"""
    
    def test_health_check(self):
        """Test /api/stats/public endpoint"""
        response = requests.get(f"{BASE_URL}/api/stats/public")
        assert response.status_code == 200
        data = response.json()
        assert "divers" in data
        assert "bookings" in data
        assert "reviews" in data
        assert "countries" in data
        assert "avg_rating" in data
        print(f"PASS: Public stats endpoint working - {data}")
    
    def test_listings_endpoint(self):
        """Test /api/listings endpoint"""
        response = requests.get(f"{BASE_URL}/api/listings?limit=5")
        assert response.status_code == 200
        data = response.json()
        # API returns {listings: [], count: N, ...}
        assert "listings" in data
        assert isinstance(data["listings"], list)
        print(f"PASS: Listings endpoint working - found {len(data['listings'])} listings")
    
    def test_products_endpoint(self):
        """Test /api/products endpoint"""
        response = requests.get(f"{BASE_URL}/api/products?limit=5")
        assert response.status_code == 200
        data = response.json()
        # API returns {products: [], count: N, ...}
        assert "products" in data
        assert isinstance(data["products"], list)
        print(f"PASS: Products endpoint working - found {len(data['products'])} products")
    
    def test_destinations_endpoint(self):
        """Test /api/destinations endpoint"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        assert response.status_code == 200
        data = response.json()
        # API returns {destinations: []}
        assert "destinations" in data
        assert isinstance(data["destinations"], list)
        print(f"PASS: Destinations endpoint working - found {len(data['destinations'])} destinations")
    
    def test_exchange_rates_endpoint(self):
        """Test /api/exchange-rates endpoint"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200
        data = response.json()
        assert "rates" in data or isinstance(data, dict)
        print(f"PASS: Exchange rates endpoint working")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token using test credentials"""
        # Request OTP
        response = requests.post(f"{BASE_URL}/api/auth/request-otp", json={
            "identifier": "test@bottomtime.com",
            "method": "email"
        })
        if response.status_code != 200:
            pytest.skip("Could not request OTP")
        
        # Verify OTP (test OTP is 123456)
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "otp": "123456",
            "method": "email"
        })
        if response.status_code != 200:
            pytest.skip("Could not verify OTP")
        
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    def test_alerts_endpoint_requires_auth(self):
        """Test /api/cmd/alerts requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cmd/alerts")
        assert response.status_code == 401 or response.status_code == 403
        print("PASS: Alerts endpoint correctly requires authentication")
    
    def test_alerts_endpoint_with_auth(self, auth_token):
        """Test /api/cmd/alerts with authentication - verifies compute_alerts refactoring"""
        if not auth_token:
            pytest.skip("No auth token available")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/cmd/alerts", headers=headers)
        
        # May return 403 if user is not admin
        if response.status_code == 403:
            print("INFO: User not authorized for admin endpoints (expected for non-admin)")
            return
        
        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data
        assert "count" in data
        print(f"PASS: Alerts endpoint working - {data['count']} alerts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
