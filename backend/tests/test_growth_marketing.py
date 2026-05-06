"""
BT-GROWTH Marketing Attribution System - Backend Tests
Tests for UTM tracking, campaign management, marketing analytics, funnels, operator attribution, and retention.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUTMCapture:
    """UTM capture endpoint - no auth required"""
    
    def test_utm_capture_returns_ok_and_id(self):
        """POST /api/utm/capture captures UTM event without auth and returns ok+id"""
        response = requests.post(f"{BASE_URL}/api/utm/capture", json={
            "visitor_id": "test_visitor_123",
            "utm_source": "google",
            "utm_medium": "paid",
            "utm_campaign": "test_campaign",
            "utm_content": "ad_variant_1",
            "utm_term": "diving keywords",
            "landing_page": "/discover",
            "referrer": "https://google.com",
            "operator_id": ""
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
        assert "id" in data, f"Expected 'id' in response, got {data}"
        assert isinstance(data["id"], str), f"Expected id to be string, got {type(data['id'])}"
        print(f"✅ UTM capture successful, event ID: {data['id']}")
    
    def test_utm_capture_with_user_id(self):
        """UTM capture with user_id set"""
        response = requests.post(f"{BASE_URL}/api/utm/capture", json={
            "visitor_id": "test_visitor_456",
            "user_id": "some_user_id",
            "utm_source": "facebook",
            "utm_medium": "social",
            "utm_campaign": "fb_summer_promo",
            "landing_page": "/events"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        assert "id" in data
        print(f"✅ UTM capture with user_id successful")

    def test_utm_capture_minimal_data(self):
        """UTM capture with minimal required fields"""
        response = requests.post(f"{BASE_URL}/api/utm/capture", json={
            "visitor_id": "min_visitor_001"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        print(f"✅ Minimal UTM capture works")


class TestAdminAuth:
    """Helper to get admin auth token"""
    
    @staticmethod
    def get_admin_token():
        # Send OTP to admin email
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        if resp.status_code != 200:
            pytest.skip("Failed to send OTP to admin")
        
        # Verify email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        if resp.status_code != 200:
            pytest.skip("Failed to verify email OTP")
        email_token = resp.json().get("verification_token")
        
        # Send OTP to admin phone
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        if resp.status_code != 200:
            pytest.skip("Failed to send phone OTP")
        
        # Verify phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        if resp.status_code != 200:
            pytest.skip("Failed to verify phone OTP")
        phone_token = resp.json().get("verification_token")
        
        # Login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if resp.status_code != 200:
            pytest.skip(f"Login failed: {resp.text}")
        
        return resp.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers():
    """Get admin auth headers"""
    token = TestAdminAuth.get_admin_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestMarketingOverview:
    """GET /api/cmd/marketing endpoint tests"""
    
    def test_marketing_returns_channels(self, admin_headers):
        """GET /api/cmd/marketing returns channels with users/bookings/revenue/conversion by first-touch source"""
        response = requests.get(f"{BASE_URL}/api/cmd/marketing", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check required fields
        assert "channels" in data, f"Expected 'channels' in response"
        assert "total_tracked_users" in data, f"Expected 'total_tracked_users'"
        assert "total_utm_events" in data, f"Expected 'total_utm_events'"
        assert "untracked_users" in data, f"Expected 'untracked_users'"
        assert "total_users" in data, f"Expected 'total_users'"
        
        # If there are channels, verify structure
        if data["channels"]:
            channel = data["channels"][0]
            assert "channel" in channel, "Each channel should have 'channel' name"
            assert "users" in channel, "Each channel should have 'users' count"
            assert "bookings" in channel, "Each channel should have 'bookings' count"
            assert "revenue" in channel, "Each channel should have 'revenue'"
            assert "conversion" in channel, "Each channel should have 'conversion' rate"
        
        print(f"✅ Marketing overview: {len(data['channels'])} channels, {data['total_tracked_users']} tracked users")


class TestFunnelAnalytics:
    """GET /api/cmd/funnels endpoint tests"""
    
    def test_funnels_returns_all_funnel_types(self, admin_headers):
        """GET /api/cmd/funnels returns acquisition, events, commerce, chat_to_booking, pathway funnels with steps"""
        response = requests.get(f"{BASE_URL}/api/cmd/funnels", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # All 5 funnel types must exist
        required_funnels = ["acquisition", "events", "commerce", "chat_to_booking", "pathway"]
        for funnel_name in required_funnels:
            assert funnel_name in data, f"Missing funnel: {funnel_name}"
            funnel = data[funnel_name]
            assert "steps" in funnel, f"Funnel '{funnel_name}' should have 'steps'"
            assert isinstance(funnel["steps"], list), f"Funnel '{funnel_name}' steps should be a list"
            
            # Each step should have name and count
            for step in funnel["steps"]:
                assert "name" in step, f"Step in {funnel_name} missing 'name'"
                assert "count" in step, f"Step in {funnel_name} missing 'count'"
        
        # Check acquisition funnel has correct steps
        acq_steps = [s["name"] for s in data["acquisition"]["steps"]]
        assert "Visit" in acq_steps or "Signup" in acq_steps, f"Acquisition funnel missing Visit/Signup steps: {acq_steps}"
        
        print(f"✅ Funnels endpoint returns all 5 funnels with steps")


class TestUserJourneys:
    """GET /api/cmd/journeys endpoint tests"""
    
    def test_journeys_returns_first_actions(self, admin_headers):
        """GET /api/cmd/journeys returns first_actions and sample_size"""
        response = requests.get(f"{BASE_URL}/api/cmd/journeys", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "first_actions" in data, "Expected 'first_actions' in response"
        assert "sample_size" in data, "Expected 'sample_size' in response"
        assert isinstance(data["first_actions"], list), "first_actions should be a list"
        assert isinstance(data["sample_size"], int), "sample_size should be an integer"
        
        if data["first_actions"]:
            action = data["first_actions"][0]
            assert "action" in action, "Each action item should have 'action'"
            assert "count" in action, "Each action item should have 'count'"
        
        print(f"✅ Journeys endpoint: sample_size={data['sample_size']}, {len(data['first_actions'])} unique first actions")


class TestOperatorAttribution:
    """GET /api/cmd/operator-attribution endpoint tests"""
    
    def test_operator_attribution_returns_leaderboard(self, admin_headers):
        """GET /api/cmd/operator-attribution returns leaderboard with operator name/role/bookings/revenue/cancellations"""
        response = requests.get(f"{BASE_URL}/api/cmd/operator-attribution", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "leaderboard" in data, "Expected 'leaderboard' in response"
        assert isinstance(data["leaderboard"], list), "leaderboard should be a list"
        
        if data["leaderboard"]:
            operator = data["leaderboard"][0]
            required_fields = ["id", "name", "role", "bookings", "revenue", "cancellations"]
            for field in required_fields:
                assert field in operator, f"Operator missing field: {field}"
            
            # Check additional fields
            assert "referral_visits" in operator, "Should have referral_visits"
            assert "referred_users" in operator, "Should have referred_users"
            assert "avg_rating" in operator, "Should have avg_rating"
        
        print(f"✅ Operator attribution: {len(data['leaderboard'])} operators in leaderboard")


class TestCampaignPerformance:
    """GET /api/cmd/campaign-performance endpoint tests"""
    
    def test_campaign_performance_returns_campaigns(self, admin_headers):
        """GET /api/cmd/campaign-performance returns campaigns array"""
        response = requests.get(f"{BASE_URL}/api/cmd/campaign-performance", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "campaigns" in data, "Expected 'campaigns' in response"
        assert isinstance(data["campaigns"], list), "campaigns should be a list"
        
        print(f"✅ Campaign performance: {len(data['campaigns'])} campaigns")


class TestRetentionByChannel:
    """GET /api/cmd/retention endpoint tests"""
    
    def test_retention_returns_channels(self, admin_headers):
        """GET /api/cmd/retention returns channels with booking_rate/refund_rate/reviews/connections"""
        response = requests.get(f"{BASE_URL}/api/cmd/retention", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "channels" in data, "Expected 'channels' in response"
        assert isinstance(data["channels"], list), "channels should be a list"
        
        if data["channels"]:
            channel = data["channels"][0]
            required_fields = ["channel", "users", "booking_rate", "refund_rate", "reviews", "connections"]
            for field in required_fields:
                assert field in channel, f"Channel missing field: {field}"
        
        print(f"✅ Retention by channel: {len(data['channels'])} channels")


class TestCampaignCRUD:
    """Campaign create, list, delete tests"""
    
    def test_create_campaign(self, admin_headers):
        """POST /api/admin/campaigns creates campaign and returns it with id"""
        payload = {
            "campaign_name": "TEST_Summer_Promo_2026",
            "source": "google",
            "medium": "paid",
            "content": "ad_variant_a",
            "term": "scuba diving",
            "destination": "/discover",
            "operator_id": "",
            "spend": 500,
            "notes": "Test campaign"
        }
        response = requests.post(f"{BASE_URL}/api/admin/campaigns", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Campaign should have an id"
        assert data.get("campaign_name") == "TEST_Summer_Promo_2026", "Campaign name should match"
        assert data.get("source") == "google", "Source should match"
        assert data.get("medium") == "paid", "Medium should match"
        assert data.get("spend") == 500, "Spend should match"
        
        # Store for later cleanup
        TestCampaignCRUD.created_campaign_id = data["id"]
        print(f"✅ Campaign created: {data['id']}")
    
    def test_list_campaigns(self, admin_headers):
        """GET /api/admin/campaigns lists all campaigns"""
        response = requests.get(f"{BASE_URL}/api/admin/campaigns", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "campaigns" in data, "Expected 'campaigns' in response"
        assert isinstance(data["campaigns"], list), "campaigns should be a list"
        
        # Check our test campaign is in the list
        if hasattr(TestCampaignCRUD, 'created_campaign_id'):
            campaign_ids = [c.get("id") for c in data["campaigns"]]
            assert TestCampaignCRUD.created_campaign_id in campaign_ids, "Created campaign should be in list"
        
        print(f"✅ Listed {len(data['campaigns'])} campaigns")
    
    def test_delete_campaign(self, admin_headers):
        """DELETE /api/admin/campaigns/{id} deletes campaign"""
        if not hasattr(TestCampaignCRUD, 'created_campaign_id'):
            pytest.skip("No campaign to delete")
        
        campaign_id = TestCampaignCRUD.created_campaign_id
        response = requests.delete(f"{BASE_URL}/api/admin/campaigns/{campaign_id}", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
        
        # Verify deletion
        list_resp = requests.get(f"{BASE_URL}/api/admin/campaigns", headers=admin_headers)
        campaign_ids = [c.get("id") for c in list_resp.json().get("campaigns", [])]
        assert campaign_id not in campaign_ids, "Campaign should be deleted"
        
        print(f"✅ Campaign deleted: {campaign_id}")


class TestUTMLinkUser:
    """POST /api/utm/link-user endpoint tests"""
    
    def test_utm_link_user(self, admin_headers):
        """POST /api/utm/link-user links visitor UTM events to user"""
        response = requests.post(f"{BASE_URL}/api/utm/link-user?visitor_id=test_visitor_link&user_id=test_user_link")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
        print(f"✅ UTM link user endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
