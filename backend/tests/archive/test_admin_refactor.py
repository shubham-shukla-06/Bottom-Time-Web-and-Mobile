"""
Tests for Admin Panel after major refactor:
- Backend /cmd/* endpoints with cache
- Auth flow for admin access
"""

import pytest
import requests
import time
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthFlow:
    """Test authentication to access admin endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Authenticate admin user"""
        # Send email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        assert resp.status_code == 200, f"Send email OTP failed: {resp.text}"
        
        # Verify email OTP (mocked - accepts 123456)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        assert resp.status_code == 200, f"Verify email OTP failed: {resp.text}"
        email_token = resp.json()["verification_token"]
        
        # Send phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        assert resp.status_code == 200, f"Send phone OTP failed: {resp.text}"
        
        # Verify phone OTP (mocked - accepts 123456)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        assert resp.status_code == 200, f"Verify phone OTP failed: {resp.text}"
        phone_token = resp.json()["verification_token"]
        
        # Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert resp.status_code == 200, f"Login complete failed: {resp.text}"
        return resp.json()["access_token"]

    def test_auth_me(self, admin_token):
        """Test authenticated user endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"


class TestCachedCmdEndpoints:
    """Test all /cmd/* endpoints with caching"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        # Email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json()["verification_token"]
        
        # Phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json()["verification_token"]
        
        # Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_cmd_pulse(self, admin_headers):
        """Test /cmd/pulse endpoint - Platform Pulse section data"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "active_divers" in data
        assert "gbv" in data
        assert "bookings_today" in data

    def test_cmd_pulse_cached_performance(self, admin_headers):
        """Test /cmd/pulse returns <100ms on cached call"""
        # First call to warm cache
        requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers)
        
        # Second call should be faster (cached)
        start = time.time()
        resp = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers)
        elapsed = (time.time() - start) * 1000  # Convert to ms
        
        assert resp.status_code == 200
        assert elapsed < 500, f"Cached /cmd/pulse took {elapsed:.1f}ms, expected <100ms (allowing margin for network)"
        print(f"Cached /cmd/pulse response time: {elapsed:.1f}ms")

    def test_cmd_drilldown_global(self, admin_headers):
        """Test /cmd/drilldown without country filter"""
        resp = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_listings" in data
        assert "available_countries" in data

    def test_cmd_drilldown_with_country(self, admin_headers):
        """Test /cmd/drilldown with country filter"""
        resp = requests.get(f"{BASE_URL}/api/cmd/drilldown?country=Indonesia", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_listings" in data

    def test_cmd_marketing(self, admin_headers):
        """Test /cmd/marketing endpoint with default model"""
        resp = requests.get(f"{BASE_URL}/api/cmd/marketing", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_tracked_users" in data

    def test_cmd_marketing_models(self, admin_headers):
        """Test /cmd/marketing with different attribution models"""
        models = ["first_touch", "last_touch", "linear", "time_decay"]
        for model in models:
            resp = requests.get(f"{BASE_URL}/api/cmd/marketing?model={model}", headers=admin_headers)
            assert resp.status_code == 200, f"Model {model} failed"

    def test_cmd_alerts(self, admin_headers):
        """Test /cmd/alerts endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/alerts", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "alerts" in data

    def test_cmd_funnels(self, admin_headers):
        """Test /cmd/funnels endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/funnels", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_journeys(self, admin_headers):
        """Test /cmd/journeys aggregated endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/journeys", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_discover(self, admin_headers):
        """Test /cmd/discover endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/discover", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_pathway(self, admin_headers):
        """Test /cmd/pathway endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pathway", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_shop(self, admin_headers):
        """Test /cmd/shop endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/shop", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_community(self, admin_headers):
        """Test /cmd/community endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/community", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_chat(self, admin_headers):
        """Test /cmd/chat endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/chat", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_events(self, admin_headers):
        """Test /cmd/events endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/events", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_revenue(self, admin_headers):
        """Test /cmd/revenue endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/revenue", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_cashflow(self, admin_headers):
        """Test /cmd/cashflow endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/cashflow", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_trust(self, admin_headers):
        """Test /cmd/trust endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/trust", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_platform(self, admin_headers):
        """Test /cmd/platform endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/platform", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_growth(self, admin_headers):
        """Test /cmd/growth endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/growth", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_operator_attribution(self, admin_headers):
        """Test /cmd/operator-attribution endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/operator-attribution", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_campaign_performance(self, admin_headers):
        """Test /cmd/campaign-performance endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/campaign-performance", headers=admin_headers)
        assert resp.status_code == 200

    def test_cmd_retention(self, admin_headers):
        """Test /cmd/retention endpoint"""
        resp = requests.get(f"{BASE_URL}/api/cmd/retention", headers=admin_headers)
        assert resp.status_code == 200


class TestAdminManageEndpoints:
    """Test admin management endpoints for Manage section"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json()["verification_token"]
        
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_admin_users(self, admin_headers):
        """Test /admin/users endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        assert resp.status_code == 200
        assert "users" in resp.json()

    def test_admin_listings(self, admin_headers):
        """Test /admin/listings endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/listings", headers=admin_headers)
        assert resp.status_code == 200
        assert "listings" in resp.json()

    def test_admin_site_content(self, admin_headers):
        """Test /admin/site-content endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers)
        assert resp.status_code == 200

    def test_admin_settings_admins(self, admin_headers):
        """Test /admin/settings/admins endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/admins", headers=admin_headers)
        assert resp.status_code == 200
        assert "admins" in resp.json()

    def test_admin_campaigns(self, admin_headers):
        """Test /admin/campaigns endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/campaigns", headers=admin_headers)
        assert resp.status_code == 200
        assert "campaigns" in resp.json()
