"""
Performance Optimization Testing - Iteration 68
Tests:
1. GZip compression on API responses
2. API endpoints functionality (/products, /listings, /exchange-rates)
3. Login flow (send-otp, verify-otp, login-complete)
4. Response time checks (basic)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGZipCompression:
    """Test GZip middleware is working"""
    
    def test_products_api_gzip_compressed(self):
        """Test /api/products response is gzip compressed"""
        response = requests.get(
            f"{BASE_URL}/api/products",
            headers={"Accept-Encoding": "gzip"}
        )
        assert response.status_code == 200
        # Check gzip compression is working
        assert response.headers.get("content-encoding") == "gzip"
        print(f"Products API compressed - content-length: {response.headers.get('content-length')}")
        
    def test_listings_api_gzip_compressed(self):
        """Test /api/listings response is gzip compressed"""
        response = requests.get(
            f"{BASE_URL}/api/listings",
            headers={"Accept-Encoding": "gzip"}
        )
        assert response.status_code == 200
        assert response.headers.get("content-encoding") == "gzip"
        print(f"Listings API compressed - content-length: {response.headers.get('content-length')}")


class TestCoreAPIs:
    """Test core API endpoints functionality"""
    
    def test_products_api_returns_data(self):
        """Test /api/products returns valid product data"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "count" in data
        assert len(data["products"]) > 0
        # Verify product structure
        product = data["products"][0]
        assert "id" in product
        assert "name" in product
        assert "price" in product
        print(f"Products API: {data['count']} products returned")
        
    def test_listings_api_returns_data(self):
        """Test /api/listings returns valid listing data"""
        response = requests.get(f"{BASE_URL}/api/listings")
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        assert "count" in data
        assert len(data["listings"]) > 0
        # Verify listing structure
        listing = data["listings"][0]
        assert "id" in listing
        assert "name" in listing
        assert "price" in listing
        print(f"Listings API: {data['count']} listings returned")
        
    def test_exchange_rates_api(self):
        """Test /api/exchange-rates returns valid rates"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200
        data = response.json()
        assert "rates" in data
        assert "USD" in data["rates"]
        assert data["rates"]["USD"] == 1.0
        # Should have common currencies
        assert "INR" in data["rates"]
        assert "EUR" in data["rates"]
        print(f"Exchange rates: {len(data['rates'])} currencies, base: {data.get('base', 'USD')}")


class TestAuthFlow:
    """Test the multi-step authentication flow"""
    
    def test_send_otp_email(self):
        """Test send-otp endpoint for email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "test@bottomtime.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["channel"] == "email"
        assert "expires_at" in data
        print(f"Email OTP sent, channel: {data['channel']}")
        
    def test_send_otp_phone(self):
        """Test send-otp endpoint for phone (test number)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "+919876543210"}  # Test phone number
        )
        assert response.status_code == 200
        data = response.json()
        assert data["channel"] == "phone"
        print(f"Phone OTP sent, channel: {data['channel']}")
        
    def test_verify_otp_email(self):
        """Test verify-otp for email returns verification token"""
        # First send OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "test@bottomtime.com"}
        )
        
        # Verify with test OTP
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "test@bottomtime.com", "code": "123456"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
        assert "verification_token" in data
        print("Email OTP verified, token received")
        return data["verification_token"]
        
    def test_verify_otp_phone(self):
        """Test verify-otp for phone returns verification token"""
        # First send OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "+919876543210"}
        )
        
        # Verify with test OTP
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "+919876543210", "code": "123456"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
        assert "verification_token" in data
        print("Phone OTP verified, token received")
        return data["verification_token"]
        
    def test_complete_login_flow(self):
        """Test complete login flow: send-otp -> verify-otp -> login-complete"""
        # Step 1: Send OTP to email
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "test@bottomtime.com"}
        )
        
        # Step 2: Verify email OTP
        email_verify = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "test@bottomtime.com", "code": "123456"}
        )
        assert email_verify.status_code == 200
        email_token = email_verify.json()["verification_token"]
        
        # Step 3: Send OTP to phone
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "+919876543210"}
        )
        
        # Step 4: Verify phone OTP
        phone_verify = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "+919876543210", "code": "123456"}
        )
        assert phone_verify.status_code == 200
        phone_token = phone_verify.json()["verification_token"]
        
        # Step 5: Complete login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login-complete",
            json={
                "email": "test@bottomtime.com",
                "email_verified_token": email_token,
                "phone_verified_token": phone_token
            }
        )
        assert login_response.status_code == 200
        data = login_response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@bottomtime.com"
        print(f"Login complete! User: {data['user']['name']}")
        return data["access_token"]


class TestAPIPerformance:
    """Basic response time checks"""
    
    def test_products_response_time(self):
        """Test /api/products responds within reasonable time"""
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/products")
        elapsed = time.time() - start
        assert response.status_code == 200
        assert elapsed < 2.0, f"Response took {elapsed:.2f}s, expected < 2s"
        print(f"Products API response time: {elapsed:.3f}s")
        
    def test_listings_response_time(self):
        """Test /api/listings responds within reasonable time"""
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/listings")
        elapsed = time.time() - start
        assert response.status_code == 200
        assert elapsed < 2.0, f"Response took {elapsed:.2f}s, expected < 2s"
        print(f"Listings API response time: {elapsed:.3f}s")
        
    def test_exchange_rates_response_time(self):
        """Test /api/exchange-rates responds within reasonable time"""
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        elapsed = time.time() - start
        assert response.status_code == 200
        assert elapsed < 1.0, f"Response took {elapsed:.2f}s, expected < 1s"
        print(f"Exchange rates API response time: {elapsed:.3f}s")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated tests"""
        # Email OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "test@bottomtime.com"}
        )
        email_verify = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "test@bottomtime.com", "code": "123456"}
        )
        email_token = email_verify.json()["verification_token"]
        
        # Phone OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "+919876543210"}
        )
        phone_verify = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "+919876543210", "code": "123456"}
        )
        phone_token = phone_verify.json()["verification_token"]
        
        # Login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login-complete",
            json={
                "email": "test@bottomtime.com",
                "email_verified_token": email_token,
                "phone_verified_token": phone_token
            }
        )
        return login_response.json()["access_token"]
        
    def test_auth_me_endpoint(self, auth_token):
        """Test /api/auth/me returns current user"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@bottomtime.com"
        print(f"Auth me: {data['name']} ({data['email']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
