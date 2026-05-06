"""
Test file for iteration 66 - Testing data-index fix and admin OTP bypass
Tests the fixes for @tanstack/react-virtual data-index warnings and admin test account
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marine-social-1.preview.emergentagent.com')


class TestAuthAPIs:
    """Auth API tests - verifying admin@bottomtime.com is now in TEST_IDENTIFIERS"""
    
    def test_send_otp_test_account(self):
        """Test that test accounts can send OTP without rate limiting"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "shubham.shukla@hotmail.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "channel" in data
        assert data["channel"] == "email"
        
    def test_send_otp_admin_account(self):
        """Test that admin@bottomtime.com can send OTP (new fix)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "admin@bottomtime.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "channel" in data
        assert data["channel"] == "email"
    
    def test_verify_otp_test_account(self):
        """Test OTP verification with test code 123456 for test accounts"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "shubham.shukla@hotmail.com", "code": "123456"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
        assert "verification_token" in data
    
    def test_verify_otp_admin_account(self):
        """Test OTP verification for admin@bottomtime.com (new in TEST_IDENTIFIERS)"""
        # First send OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "admin@bottomtime.com"}
        )
        # Verify with test code
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "admin@bottomtime.com", "code": "123456"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
    
    def test_login_init_existing_user(self):
        """Test login-init for existing user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login-init",
            json={"email": "shubham.shukla@hotmail.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "phone_hint" in data


class TestAddressAPI:
    """Address API tests - verifying proper error handling (httpx.HTTPStatusError)"""
    
    def test_address_autocomplete(self):
        """Test address autocomplete endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "Mumbai"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
    
    def test_address_details_invalid_place_id(self):
        """Test that invalid place_id returns proper error (not 500)"""
        response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": "invalid_place_id_12345"}
        )
        # Should return 4xx (client error from Google), not 500
        assert response.status_code != 500, "Should not return 500 for invalid place ID"
        assert response.status_code in [400, 403, 404], f"Got {response.status_code}"


class TestPublicPages:
    """Test public pages load correctly"""
    
    def test_discover_page(self):
        """Test /discover page loads"""
        response = requests.get(f"{BASE_URL}/discover")
        assert response.status_code == 200
    
    def test_shop_page(self):
        """Test /shop page loads"""
        response = requests.get(f"{BASE_URL}/shop")
        assert response.status_code == 200
    
    def test_listings_api(self):
        """Test listings API returns data"""
        response = requests.get(f"{BASE_URL}/api/listings")
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
    
    def test_products_api(self):
        """Test products API returns data"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data


class TestDestinationsAPI:
    """Test destinations API"""
    
    def test_destinations_list(self):
        """Test destinations endpoint"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        assert response.status_code == 200
        data = response.json()
        assert "destinations" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
