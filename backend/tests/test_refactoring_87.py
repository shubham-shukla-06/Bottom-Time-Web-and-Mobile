"""
Backend tests for Iteration 87 - Refactoring verification
Tests auth flow, shipping, tax, listings, and security features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marine-social-1.preview.emergentagent.com').rstrip('/')


class TestAuthFlow:
    """Auth endpoints with rate limits and Pydantic validation"""
    
    def test_send_otp_success(self):
        """Test OTP send for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        assert response.status_code == 200
        data = response.json()
        assert "channel" in data
        assert data["channel"] == "email"
        assert "expires_at" in data
        print(f"✓ Send OTP success: channel={data['channel']}")
    
    def test_verify_otp_success(self):
        """Test OTP verification for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] == True
        assert "verification_token" in data
        print(f"✓ Verify OTP success: verified={data['verified']}")
    
    def test_otp_code_too_short(self):
        """Test Pydantic validation - OTP code min_length=6"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "12345"  # 5 chars, should fail
        })
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data
        assert any("string_too_short" in str(d) for d in data["detail"])
        print("✓ Pydantic validation: OTP code too short rejected")
    
    def test_otp_code_too_long(self):
        """Test Pydantic validation - OTP code max_length=6"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "1234567"  # 7 chars, should fail
        })
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data
        assert any("string_too_long" in str(d) for d in data["detail"])
        print("✓ Pydantic validation: OTP code too long rejected")
    
    def test_login_init_user_not_found(self):
        """Test login-init for non-existent user"""
        response = requests.post(f"{BASE_URL}/api/auth/login-init", json={
            "email": "nonexistent@test.com"
        })
        assert response.status_code == 404
        print("✓ Login init: non-existent user returns 404")


class TestListingsAPI:
    """Listings and destinations endpoints"""
    
    def test_destinations_endpoint(self):
        """Test /api/destinations returns data"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        assert response.status_code == 200
        data = response.json()
        assert "destinations" in data
        assert isinstance(data["destinations"], list)
        print(f"✓ Destinations: {len(data['destinations'])} countries returned")
    
    def test_listings_endpoint(self):
        """Test /api/listings returns data"""
        response = requests.get(f"{BASE_URL}/api/listings")
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        assert "total" in data
        print(f"✓ Listings: {data['total']} total, {len(data['listings'])} returned")
    
    def test_products_endpoint(self):
        """Test /api/products returns data"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "total" in data
        print(f"✓ Products: {data['total']} total, {len(data['products'])} returned")


class TestShippingAPI:
    """Shipping endpoints - extracted to shipping_helpers.py"""
    
    def test_shipping_status(self):
        """Test /api/shipping/status returns config"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200
        data = response.json()
        assert "shiprocket" in data
        assert "configured" in data["shiprocket"]
        assert "mode" in data["shiprocket"]
        print(f"✓ Shipping status: mode={data['shiprocket']['mode']}")
    
    def test_shipping_rates_simple(self):
        """Test /api/shipping/rates/simple returns rate"""
        response = requests.get(f"{BASE_URL}/api/shipping/rates/simple", params={
            "pincode": "400001",
            "country": "India"
        })
        assert response.status_code == 200
        data = response.json()
        assert "shipping_cost" in data
        assert "carrier" in data
        assert "estimated_days" in data
        print(f"✓ Shipping rates: ₹{data['shipping_cost']} via {data['carrier']}")
    
    def test_delivery_estimate_simple(self):
        """Test /api/delivery-estimate-simple returns estimate"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple", params={
            "pincode": "400001"
        })
        assert response.status_code == 200
        data = response.json()
        assert "estimate" in data
        assert "type" in data
        print(f"✓ Delivery estimate: {data['estimate']} ({data['type']})")
    
    def test_delivery_estimate_international(self):
        """Test delivery estimate for international"""
        response = requests.get(f"{BASE_URL}/api/delivery-estimate-simple", params={
            "pincode": "10001",
            "country": "United States"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "international"
        print(f"✓ International delivery: {data['estimate']}")


class TestTaxAPI:
    """Tax endpoints - extracted to tax_engine.py"""
    
    def test_admin_tax_rates_requires_auth(self):
        """Test /api/admin/tax-rates requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/tax-rates")
        assert response.status_code in [401, 403]  # 403 is also valid for missing auth
        print("✓ Admin tax rates: requires authentication")
    
    def test_tax_preview_requires_auth(self):
        """Test /api/tax/preview requires authentication"""
        response = requests.post(f"{BASE_URL}/api/tax/preview", json={
            "base_price": 100,
            "listing_type": "dive"
        })
        assert response.status_code in [401, 403]  # 403 is also valid for missing auth
        print("✓ Tax preview: requires authentication")


class TestSecurityHeaders:
    """Security headers verification"""
    
    def test_security_headers_present(self):
        """Test security headers are present in response"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        headers = response.headers
        
        # Check required security headers
        assert "x-content-type-options" in headers
        assert headers["x-content-type-options"] == "nosniff"
        print("✓ X-Content-Type-Options: nosniff")
        
        assert "x-frame-options" in headers
        assert headers["x-frame-options"] == "DENY"
        print("✓ X-Frame-Options: DENY")
        
        assert "content-security-policy" in headers
        assert "default-src" in headers["content-security-policy"]
        print("✓ Content-Security-Policy: present")
        
        assert "strict-transport-security" in headers
        assert "max-age" in headers["strict-transport-security"]
        print("✓ Strict-Transport-Security: present")
        
        assert "x-xss-protection" in headers
        print("✓ X-XSS-Protection: present")


class TestPublicEndpoints:
    """Public endpoints that don't require auth"""
    
    def test_stats_public(self):
        """Test /api/stats/public returns data"""
        response = requests.get(f"{BASE_URL}/api/stats/public")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Public stats: returned successfully")
    
    def test_exchange_rates(self):
        """Test /api/exchange-rates returns data"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200
        data = response.json()
        assert "rates" in data or "base" in data
        print(f"✓ Exchange rates: returned successfully")
    
    def test_site_content_public(self):
        """Test /api/site-content/public returns data"""
        response = requests.get(f"{BASE_URL}/api/site-content/public")
        assert response.status_code == 200
        print(f"✓ Site content public: returned successfully")
    
    def test_waitlist_count(self):
        """Test /api/waitlist/count returns data"""
        response = requests.get(f"{BASE_URL}/api/waitlist/count")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        print(f"✓ Waitlist count: {data['count']}")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        # Send OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        # Verify OTP
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        if response.status_code == 200:
            return response.json().get("verification_token")
        return None
    
    def test_auth_me_requires_token(self):
        """Test /api/auth/me requires valid token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403]  # 403 is also valid for missing auth
        print("✓ Auth me: requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
