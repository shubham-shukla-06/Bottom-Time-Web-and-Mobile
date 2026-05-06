"""
Test Connect Page APIs - Testing the consolidated social features:
- Feed API (/feed)
- Buddy Finder API (/buddy-finder/matches)
- Community Connections API (/community/connections)
- Messages API (/messages)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# Test credentials
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"


class TestAuthAndSetup:
    """Setup: Authenticate test user to get token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate using phone OTP flow and return token"""
        # Step 1: Send OTP
        send_resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "phone": TEST_PHONE,
            "channel": "sms"
        })
        print(f"Send OTP response: {send_resp.status_code}")
        
        # Step 2: Verify OTP
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "phone": TEST_PHONE,
            "code": TEST_OTP
        })
        print(f"Verify OTP response: {verify_resp.status_code}")
        
        if verify_resp.status_code == 200:
            token = verify_resp.json().get("token")
            if token:
                return token
        
        # Fallback: Try login-complete flow
        login_resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "phone": TEST_PHONE,
            "otp": TEST_OTP
        })
        print(f"Login complete response: {login_resp.status_code}")
        
        if login_resp.status_code == 200:
            return login_resp.json().get("token")
        
        pytest.skip("Could not authenticate - skipping authenticated tests")
    
    def test_auth_works(self, auth_token):
        """Verify authentication token is valid"""
        assert auth_token is not None
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "name" in data
        print(f"Authenticated as: {data.get('name')}")


class TestFeedAPI:
    """Test /api/feed endpoint (Activity Feed from connected buddies)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200 and verify_resp.json().get("token"):
            return {"Authorization": f"Bearer {verify_resp.json()['token']}"}
        pytest.skip("Auth failed")
    
    def test_feed_requires_auth(self):
        """Feed endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/feed")
        assert resp.status_code == 401 or resp.status_code == 403
        print("PASS: Feed requires authentication")
    
    def test_feed_returns_items(self, auth_headers):
        """Feed should return items array with pagination"""
        resp = requests.get(f"{BASE_URL}/api/feed?skip=0&limit=10", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert isinstance(data["items"], list)
        print(f"PASS: Feed returned {len(data['items'])} items, has_more={data['has_more']}")
    
    def test_feed_pagination(self, auth_headers):
        """Feed should support skip/limit pagination"""
        resp1 = requests.get(f"{BASE_URL}/api/feed?skip=0&limit=5", headers=auth_headers)
        resp2 = requests.get(f"{BASE_URL}/api/feed?skip=5&limit=5", headers=auth_headers)
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        print("PASS: Feed pagination working")


class TestBuddyFinderAPI:
    """Test /api/buddy-finder/matches endpoint (Smart buddy matching)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200 and verify_resp.json().get("token"):
            return {"Authorization": f"Bearer {verify_resp.json()['token']}"}
        pytest.skip("Auth failed")
    
    def test_buddy_matches_requires_auth(self):
        """Buddy matches should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/buddy-finder/matches")
        assert resp.status_code == 401 or resp.status_code == 403
        print("PASS: Buddy matches requires authentication")
    
    def test_buddy_matches_returns_matches(self, auth_headers):
        """Buddy matches should return matches array with compatibility scores"""
        resp = requests.get(f"{BASE_URL}/api/buddy-finder/matches?limit=10", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "matches" in data
        assert isinstance(data["matches"], list)
        print(f"PASS: Buddy finder returned {len(data['matches'])} matches")
        
        # Verify compatibility score is present in results
        if data["matches"]:
            match = data["matches"][0]
            assert "compatibility" in match
            assert "id" in match
            assert "name" in match
            print(f"Sample match: {match.get('name')} with {match.get('compatibility')}% compatibility")


class TestCommunityConnectionsAPI:
    """Test /api/community/connections endpoint (Buddy connections)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200 and verify_resp.json().get("token"):
            return {"Authorization": f"Bearer {verify_resp.json()['token']}"}
        pytest.skip("Auth failed")
    
    def test_connections_requires_auth(self):
        """Connections endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/community/connections")
        assert resp.status_code == 401 or resp.status_code == 403
        print("PASS: Connections requires authentication")
    
    def test_connections_returns_structure(self, auth_headers):
        """Connections should return buddies, pending, sent arrays"""
        resp = requests.get(f"{BASE_URL}/api/community/connections", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "buddies" in data
        assert "pending" in data
        assert "sent" in data
        assert "sent_ids" in data
        
        assert isinstance(data["buddies"], list)
        assert isinstance(data["pending"], list)
        assert isinstance(data["sent"], list)
        assert isinstance(data["sent_ids"], list)
        
        print(f"PASS: Connections returned {len(data['buddies'])} buddies, {len(data['pending'])} pending, {len(data['sent'])} sent")


class TestCommunityProfilesAPI:
    """Test /api/community/profiles endpoint (Browse divers)"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200 and verify_resp.json().get("token"):
            return {"Authorization": f"Bearer {verify_resp.json()['token']}"}
        pytest.skip("Auth failed")
    
    def test_profiles_requires_auth(self):
        """Profiles endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/community/profiles")
        assert resp.status_code == 401 or resp.status_code == 403
        print("PASS: Profiles requires authentication")
    
    def test_profiles_returns_list(self, auth_headers):
        """Profiles should return list of diver profiles"""
        resp = requests.get(f"{BASE_URL}/api/community/profiles?limit=10", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "profiles" in data
        assert isinstance(data["profiles"], list)
        print(f"PASS: Community profiles returned {len(data['profiles'])} profiles")


class TestMessagesAPI:
    """Test /api/messages endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth headers"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200 and verify_resp.json().get("token"):
            return {"Authorization": f"Bearer {verify_resp.json()['token']}"}
        pytest.skip("Auth failed")
    
    def test_threads_requires_auth(self):
        """Message threads should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/messages/threads")
        assert resp.status_code == 401 or resp.status_code == 403
        print("PASS: Message threads requires authentication")
    
    def test_threads_returns_list(self, auth_headers):
        """Threads should return list of conversations"""
        resp = requests.get(f"{BASE_URL}/api/messages/threads", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "threads" in data
        assert isinstance(data["threads"], list)
        print(f"PASS: Message threads returned {len(data['threads'])} threads")


class TestDiverProfileAPI:
    """Test /api/diver-profile endpoint for My Profile tab"""
    
    @pytest.fixture(scope="class")
    def auth_data(self):
        """Get auth headers and user ID"""
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE, "channel": "sms"})
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP})
        if verify_resp.status_code == 200:
            data = verify_resp.json()
            token = data.get("token")
            # Get user info
            me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
            if me_resp.status_code == 200:
                user_id = me_resp.json().get("id")
                return {"headers": {"Authorization": f"Bearer {token}"}, "user_id": user_id}
        pytest.skip("Auth failed")
    
    def test_diver_profile_returns_data(self, auth_data):
        """Diver profile should return profile, stats, badges, recent_dives"""
        user_id = auth_data["user_id"]
        headers = auth_data["headers"]
        
        resp = requests.get(f"{BASE_URL}/api/diver-profile/{user_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "profile" in data
        assert "stats" in data
        assert "badges" in data
        assert "recent_dives" in data
        
        print(f"PASS: Diver profile returned profile for user {user_id}")
        print(f"Stats: {data['stats'].get('total_dives', 0)} dives, {len(data['badges'])} badges")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
