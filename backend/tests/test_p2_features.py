"""
Backend API Tests for P0, P1, P2 Features - Admin Command Centre
P0: SortableTable per-column filters (frontend only)
P1: Drill-down Global→Country navigation (/api/cmd/drilldown)
P2: Alerts system, Attribution models, User journeys

Test admin credentials:
- Email: admin@bottomtime.com
- Phone: +12025559999  
- OTP: 123456 (MOCKED)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthHelper:
    """Helper to get admin authentication token"""
    
    @staticmethod
    def get_admin_token():
        """Complete admin login flow"""
        # Step 1: Send OTP to email
        r1 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        assert r1.status_code == 200, f"Failed to send email OTP: {r1.text}"
        
        # Step 2: Verify email OTP
        r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        assert r2.status_code == 200, f"Failed to verify email OTP: {r2.text}"
        email_token = r2.json().get("verification_token")
        
        # Step 3: Send OTP to phone
        r3 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        assert r3.status_code == 200, f"Failed to send phone OTP: {r3.text}"
        
        # Step 4: Verify phone OTP
        r4 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        assert r4.status_code == 200, f"Failed to verify phone OTP: {r4.text}"
        phone_token = r4.json().get("verification_token")
        
        # Step 5: Complete login
        r5 = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert r5.status_code == 200, f"Failed to complete login: {r5.text}"
        return r5.json().get("access_token")


@pytest.fixture(scope="module")
def auth_token():
    """Get admin auth token for all tests"""
    return TestAuthHelper.get_admin_token()


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


# ============== P2: ALERTS SYSTEM ==============
class TestAlertsBanner:
    """Tests for /api/cmd/alerts endpoint"""
    
    def test_alerts_endpoint_returns_200(self, auth_headers):
        """Alerts endpoint should return 200 with alerts array"""
        response = requests.get(f"{BASE_URL}/api/cmd/alerts", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_alerts_response_structure(self, auth_headers):
        """Alerts response should have alerts array and count"""
        response = requests.get(f"{BASE_URL}/api/cmd/alerts", headers=auth_headers)
        data = response.json()
        
        assert "alerts" in data, "Response should contain 'alerts' field"
        assert "count" in data, "Response should contain 'count' field"
        assert isinstance(data["alerts"], list), "alerts should be a list"
        assert isinstance(data["count"], int), "count should be an integer"
        assert data["count"] == len(data["alerts"]), "count should match alerts length"
    
    def test_alerts_alert_structure(self, auth_headers):
        """Each alert should have required fields"""
        response = requests.get(f"{BASE_URL}/api/cmd/alerts", headers=auth_headers)
        data = response.json()
        
        if data["alerts"]:  # If there are any alerts
            alert = data["alerts"][0]
            required_fields = ["id", "severity", "title", "message", "section"]
            for field in required_fields:
                assert field in alert, f"Alert missing required field: {field}"
            
            # Validate severity
            valid_severities = ["critical", "warning", "info"]
            assert alert["severity"] in valid_severities, f"Invalid severity: {alert['severity']}"
    
    def test_alerts_without_auth_returns_401(self):
        """Alerts endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/cmd/alerts")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


# ============== P1: DRILL-DOWN EXPLORER ==============
class TestDrillDownExplorer:
    """Tests for /api/cmd/drilldown endpoint - Global→Country navigation"""
    
    def test_drilldown_global_returns_200(self, auth_headers):
        """Drilldown at global level should return 200"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_drilldown_global_response_structure(self, auth_headers):
        """Drilldown global response should have required fields"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        data = response.json()
        
        required_fields = ["total_listings", "total_bookings", "total_revenue", "cancel_rate", "available_countries"]
        for field in required_fields:
            assert field in data, f"Global drilldown missing field: {field}"
        
        # Validate available_countries is a list
        assert isinstance(data["available_countries"], list), "available_countries should be a list"
    
    def test_drilldown_global_available_countries_structure(self, auth_headers):
        """Each available country should have country, listings, avg_price"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        data = response.json()
        
        if data["available_countries"]:
            country = data["available_countries"][0]
            assert "country" in country, "Country entry missing 'country' field"
            assert "listings" in country, "Country entry missing 'listings' field"
            assert "avg_price" in country, "Country entry missing 'avg_price' field"
    
    def test_drilldown_with_country_filter(self, auth_headers):
        """Drilldown with country param should filter by country"""
        # First get available countries
        global_resp = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        global_data = global_resp.json()
        
        if global_data["available_countries"]:
            test_country = global_data["available_countries"][0]["country"]
            
            # Now filter by country
            filtered_resp = requests.get(f"{BASE_URL}/api/cmd/drilldown?country={test_country}", headers=auth_headers)
            assert filtered_resp.status_code == 200
            
            filtered_data = filtered_resp.json()
            assert filtered_data.get("country") == test_country, "Response should include queried country"
    
    def test_drilldown_country_has_operators(self, auth_headers):
        """Drilldown by country should include operators list"""
        global_resp = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        global_data = global_resp.json()
        
        if global_data["available_countries"]:
            test_country = global_data["available_countries"][0]["country"]
            filtered_resp = requests.get(f"{BASE_URL}/api/cmd/drilldown?country={test_country}", headers=auth_headers)
            filtered_data = filtered_resp.json()
            
            assert "operators" in filtered_data, "Country drilldown should include operators"
            assert isinstance(filtered_data["operators"], list), "operators should be a list"
    
    def test_drilldown_has_revenue_by_type(self, auth_headers):
        """Drilldown should include revenue_by_type breakdown"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        data = response.json()
        
        assert "revenue_by_type" in data, "Response should include revenue_by_type"
        if data["revenue_by_type"]:
            item = data["revenue_by_type"][0]
            assert "type" in item, "revenue_by_type item missing 'type'"
            assert "bookings" in item, "revenue_by_type item missing 'bookings'"
            assert "revenue" in item, "revenue_by_type item missing 'revenue'"
    
    def test_drilldown_has_top_listings(self, auth_headers):
        """Drilldown should include top_listings"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown", headers=auth_headers)
        data = response.json()
        
        assert "top_listings" in data, "Response should include top_listings"
    
    def test_drilldown_without_auth_returns_401(self):
        """Drilldown endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/cmd/drilldown")
        assert response.status_code in [401, 403]


# ============== P2: ATTRIBUTION MODEL SELECTOR ==============
class TestAttributionModels:
    """Tests for /api/cmd/marketing with model parameter"""
    
    def test_marketing_first_touch_model(self, auth_headers):
        """Marketing endpoint with first_touch model"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing?model=first_touch", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "attribution_model" in data, "Response should include attribution_model field"
        assert data["attribution_model"] == "first_touch", f"Expected first_touch, got {data['attribution_model']}"
    
    def test_marketing_last_touch_model(self, auth_headers):
        """Marketing endpoint with last_touch model"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing?model=last_touch", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["attribution_model"] == "last_touch", f"Expected last_touch, got {data['attribution_model']}"
    
    def test_marketing_linear_model(self, auth_headers):
        """Marketing endpoint with linear model"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing?model=linear", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["attribution_model"] == "linear", f"Expected linear, got {data['attribution_model']}"
    
    def test_marketing_time_decay_model(self, auth_headers):
        """Marketing endpoint with time_decay model"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing?model=time_decay", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["attribution_model"] == "time_decay", f"Expected time_decay, got {data['attribution_model']}"
    
    def test_marketing_default_model(self, auth_headers):
        """Marketing endpoint without model defaults to first_touch"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["attribution_model"] == "first_touch", "Default should be first_touch"
    
    def test_marketing_response_structure(self, auth_headers):
        """Marketing response should have channels, tracked users, etc."""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing?model=first_touch", headers=auth_headers)
        data = response.json()
        
        required_fields = ["channels", "total_tracked_users", "total_utm_events", "untracked_users", "attribution_model"]
        for field in required_fields:
            assert field in data, f"Marketing response missing field: {field}"
        
        assert isinstance(data["channels"], list), "channels should be a list"


# ============== P2: USER JOURNEY MAPPING ==============
class TestUserJourneys:
    """Tests for user journey endpoints"""
    
    def test_aggregated_journeys_endpoint(self, auth_headers):
        """Aggregated journeys endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/cmd/journeys", headers=auth_headers)
        assert response.status_code == 200
    
    def test_aggregated_journeys_structure(self, auth_headers):
        """Aggregated journeys should have first_actions and sample_size"""
        response = requests.get(f"{BASE_URL}/api/cmd/journeys", headers=auth_headers)
        data = response.json()
        
        assert "first_actions" in data, "Response should include first_actions"
        assert "sample_size" in data, "Response should include sample_size"
        assert isinstance(data["first_actions"], list), "first_actions should be a list"
    
    def test_individual_journey_endpoint(self, auth_headers):
        """Individual user journey endpoint test"""
        # First get a user ID
        users_resp = requests.get(f"{BASE_URL}/api/admin/users?search=diver", headers=auth_headers)
        if users_resp.status_code == 200:
            users = users_resp.json().get("users", [])
            if users:
                user_id = users[0]["id"]
                journey_resp = requests.get(f"{BASE_URL}/api/cmd/journey/{user_id}", headers=auth_headers)
                # Should return 200 or 404 (if user has no journey data)
                assert journey_resp.status_code in [200, 404]
                
                if journey_resp.status_code == 200:
                    data = journey_resp.json()
                    assert "user" in data, "Journey should include user"
                    assert "timeline" in data, "Journey should include timeline"
    
    def test_individual_journey_not_found(self, auth_headers):
        """Journey for non-existent user should return 404"""
        response = requests.get(f"{BASE_URL}/api/cmd/journey/nonexistent-user-id", headers=auth_headers)
        assert response.status_code == 404


# ============== EXISTING SECTIONS STILL WORK ==============
class TestExistingSections:
    """Verify all existing 16 sections still load without errors"""
    
    def test_pulse_section(self, auth_headers):
        """Platform Pulse section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "active_divers" in data
    
    def test_marketing_section(self, auth_headers):
        """Marketing section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing", headers=auth_headers)
        assert response.status_code == 200
    
    def test_funnels_section(self, auth_headers):
        """Funnels section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/funnels", headers=auth_headers)
        assert response.status_code == 200
    
    def test_campaign_performance(self, auth_headers):
        """Campaign performance API"""
        response = requests.get(f"{BASE_URL}/api/cmd/campaign-performance", headers=auth_headers)
        assert response.status_code == 200
    
    def test_operator_attribution(self, auth_headers):
        """Operator attribution API"""
        response = requests.get(f"{BASE_URL}/api/cmd/operator-attribution", headers=auth_headers)
        assert response.status_code == 200
    
    def test_discover_section(self, auth_headers):
        """Discover section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/discover", headers=auth_headers)
        assert response.status_code == 200
    
    def test_pathway_section(self, auth_headers):
        """Pathway section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/pathway", headers=auth_headers)
        assert response.status_code == 200
    
    def test_shop_section(self, auth_headers):
        """Shop section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/shop", headers=auth_headers)
        assert response.status_code == 200
    
    def test_community_section(self, auth_headers):
        """Community section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/community", headers=auth_headers)
        assert response.status_code == 200
    
    def test_chat_section(self, auth_headers):
        """Chat section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/chat", headers=auth_headers)
        assert response.status_code == 200
    
    def test_events_section(self, auth_headers):
        """Events section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/events", headers=auth_headers)
        assert response.status_code == 200
    
    def test_revenue_section(self, auth_headers):
        """Revenue section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/revenue", headers=auth_headers)
        assert response.status_code == 200
    
    def test_cashflow_section(self, auth_headers):
        """Cashflow section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/cashflow", headers=auth_headers)
        assert response.status_code == 200
    
    def test_trust_section(self, auth_headers):
        """Trust section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/trust", headers=auth_headers)
        assert response.status_code == 200
    
    def test_platform_section(self, auth_headers):
        """Platform section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/platform", headers=auth_headers)
        assert response.status_code == 200
    
    def test_growth_section(self, auth_headers):
        """Growth section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/growth", headers=auth_headers)
        assert response.status_code == 200
    
    def test_retention_section(self, auth_headers):
        """Retention section API"""
        response = requests.get(f"{BASE_URL}/api/cmd/retention", headers=auth_headers)
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
