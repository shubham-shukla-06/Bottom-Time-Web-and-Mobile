"""
Test Diver Profile API - "Instagram for Divers"
Tests: Profile retrieval, likes, comments, badges, stats
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user from seed data
TEST_USER_ID = "0c4b55e1-6c18-4155-887f-1ad4b7167e69"


class TestDiverProfilePublic:
    """Test public diver profile endpoints"""
    
    def test_get_diver_profile_success(self):
        """GET /api/diver-profile/{userId} - should return full profile"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Validate profile structure
        assert "profile" in data
        assert "stats" in data
        assert "badges" in data
        assert "recent_dives" in data
        assert "dive_sites" in data
        assert "connections" in data
        
        # Validate profile fields
        profile = data["profile"]
        assert "id" in profile
        assert profile["id"] == TEST_USER_ID
        assert "name" in profile
        assert "bio" in profile
        assert "member_since" in profile
        
        # Validate stats
        stats = data["stats"]
        assert "total_dives" in stats
        assert "max_depth" in stats
        assert "avg_depth" in stats
        assert "total_time" in stats
        assert "countries" in stats
        assert "unique_sites" in stats
        assert "dive_types" in stats
        
        # Should have badges (based on 97 dives)
        badges = data["badges"]
        badge_keys = [b["key"] for b in badges]
        assert "first_dive" in badge_keys  # Should have first dive badge
        assert "50_dives" in badge_keys  # Has 97 dives > 50
        
        # Each badge has required fields
        for badge in badges:
            assert "key" in badge
            assert "label" in badge
            assert "desc" in badge
        
        print(f"✓ Profile loaded with {stats['total_dives']} dives, {len(badges)} badges")
    
    def test_get_diver_profile_not_found(self):
        """GET /api/diver-profile/{userId} - should 404 for invalid user"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/invalid-user-id-12345")
        assert response.status_code == 404
        print("✓ Correctly returns 404 for non-existent user")
    
    def test_get_diver_profile_with_viewer_id(self):
        """GET /api/diver-profile/{userId}?viewer_id=X - should include viewer_likes"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}?viewer_id={TEST_USER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "viewer_likes" in data
        assert "is_following" in data
        assert isinstance(data["viewer_likes"], list)
        print("✓ Profile with viewer_id includes viewer_likes and is_following")
    
    def test_profile_recent_dives_structure(self):
        """Verify recent_dives have correct structure for UI"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        recent_dives = data["recent_dives"]
        
        # Should have recent dives
        assert len(recent_dives) > 0
        
        # Check dive structure
        dive = recent_dives[0]
        expected_fields = ["id", "date", "dive_type"]
        for field in expected_fields:
            assert field in dive, f"Missing field: {field}"
        
        # Check optional fields that UI uses
        optional_fields = ["site_name", "location", "max_depth", "duration", "water_temp", "profile", "like_count", "comment_count"]
        for field in optional_fields:
            if field in dive:
                print(f"  - {field}: present")
        
        print(f"✓ Recent dives have correct structure ({len(recent_dives)} dives)")
    
    def test_profile_dive_sites_structure(self):
        """Verify dive_sites have correct structure for map"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        dive_sites = data["dive_sites"]
        
        # Check site structure
        if len(dive_sites) > 0:
            site = dive_sites[0]
            assert "site_name" in site
            assert "dive_count" in site
            assert "max_depth" in site
            # GPS fields may be optional
            print(f"✓ Dive sites have correct structure ({len(dive_sites)} sites)")
        else:
            print("✓ No dive sites with location data (expected for test data)")


class TestDiveInteractions:
    """Test like and comment functionality"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token via OTP flow"""
        # Send OTP
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        if response.status_code != 200:
            pytest.skip("OTP rate limited")
        
        # Verify OTP
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("OTP verification failed")
        
        email_token = response.json().get("verification_token")
        
        # Send phone OTP
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "+919876543210"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP rate limited")
        
        # Verify phone OTP
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP verification failed")
        
        phone_token = response.json().get("verification_token")
        
        # Complete login
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if response.status_code != 200:
            pytest.skip("Login complete failed")
        
        return response.json().get("access_token")
    
    @pytest.fixture
    def dive_id(self):
        """Get a dive ID from the test user's profile"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}")
        if response.status_code != 200:
            pytest.skip("Could not fetch profile")
        
        dives = response.json().get("recent_dives", [])
        if not dives:
            pytest.skip("No dives available for testing")
        
        return dives[0]["id"]
    
    def test_toggle_like_requires_auth(self, dive_id):
        """POST /api/diver-profile/dive/{diveId}/like - requires authentication"""
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/like")
        assert response.status_code in [401, 403, 422]
        print("✓ Like endpoint requires authentication")
    
    def test_toggle_like_with_auth(self, auth_token, dive_id):
        """POST /api/diver-profile/dive/{diveId}/like - toggle like with auth"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First toggle - should like
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/like", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "liked" in data
        first_state = data["liked"]
        print(f"✓ Like toggled (liked={first_state})")
        
        # Second toggle - should unlike
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/like", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["liked"] != first_state
        print(f"✓ Like toggled again (liked={data['liked']})")
    
    def test_like_nonexistent_dive(self, auth_token):
        """POST /api/diver-profile/dive/{diveId}/like - 404 for invalid dive"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/invalid-dive-id/like", headers=headers)
        assert response.status_code == 404
        print("✓ Correctly returns 404 for non-existent dive")
    
    def test_get_comments(self, dive_id):
        """GET /api/diver-profile/dive/{diveId}/comments - public endpoint"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/comments")
        assert response.status_code == 200
        
        data = response.json()
        assert "comments" in data
        assert isinstance(data["comments"], list)
        print(f"✓ Got comments for dive ({len(data['comments'])} comments)")
    
    def test_add_comment_requires_auth(self, dive_id):
        """POST /api/diver-profile/dive/{diveId}/comment - requires authentication"""
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/comment", json={
            "text": "Test comment"
        })
        assert response.status_code in [401, 403, 422]
        print("✓ Comment endpoint requires authentication")
    
    def test_add_comment_with_auth(self, auth_token, dive_id):
        """POST /api/diver-profile/dive/{diveId}/comment - add comment with auth"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/comment", 
                                json={"text": "Great dive! 🤿"}, headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert "text" in data
        assert data["text"] == "Great dive! 🤿"
        assert "user_id" in data
        assert "user_name" in data
        assert "created_at" in data
        
        print(f"✓ Comment added (id={data['id']})")
        
        # Verify comment appears in list
        get_response = requests.get(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/comments")
        comments = get_response.json()["comments"]
        comment_ids = [c["id"] for c in comments]
        assert data["id"] in comment_ids
        print("✓ Comment appears in comments list")
    
    def test_add_empty_comment_fails(self, auth_token, dive_id):
        """POST /api/diver-profile/dive/{diveId}/comment - empty comment fails"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.post(f"{BASE_URL}/api/diver-profile/dive/{dive_id}/comment", 
                                json={"text": ""}, headers=headers)
        assert response.status_code == 400
        print("✓ Empty comment correctly rejected")


class TestBadgeLogic:
    """Test badge calculation logic"""
    
    def test_badges_for_test_user(self):
        """Verify badges are correctly calculated for test user"""
        response = requests.get(f"{BASE_URL}/api/diver-profile/{TEST_USER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        stats = data["stats"]
        badges = data["badges"]
        badge_keys = [b["key"] for b in badges]
        
        # Test user has 97 dives, so should have:
        if stats["total_dives"] >= 1:
            assert "first_dive" in badge_keys
        
        if stats["total_dives"] >= 50:
            assert "50_dives" in badge_keys
        
        if stats["max_depth"] >= 30:
            assert "deep_diver" in badge_keys
        
        if stats["max_depth"] >= 40:
            assert "abyss" in badge_keys
        
        if stats["countries"] >= 3:
            assert "globe_trotter" in badge_keys
        
        if stats["total_time"] >= 3000:
            assert "bottom_timer" in badge_keys
        
        print(f"✓ Badge logic verified for {stats['total_dives']} dives, {stats['max_depth']}m max depth")
        print(f"  Badges earned: {badge_keys}")


class TestDiveDashboardAPIs:
    """Test dive dashboard related APIs that feed into the refactored components"""
    
    def test_dive_sites_map_endpoint(self):
        """GET /api/dive-sites/map - for DiveSiteMap component"""
        # First get auth token
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        if response.status_code != 200:
            pytest.skip("OTP rate limited")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("OTP verification failed")
        
        email_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "+919876543210"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP rate limited")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP verification failed")
        
        phone_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if response.status_code != 200:
            pytest.skip("Login complete failed")
        
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "sites" in data
        assert isinstance(data["sites"], list)
        
        if len(data["sites"]) > 0:
            site = data["sites"][0]
            assert "site_name" in site
            assert "dive_count" in site
        
        print(f"✓ Dive sites map endpoint returns {len(data['sites'])} sites")
    
    def test_dive_log_endpoint(self):
        """GET /api/dive-log - for DiveLogTab component"""
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        if response.status_code != 200:
            pytest.skip("OTP rate limited")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("OTP verification failed")
        
        email_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "+919876543210"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP rate limited")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        if response.status_code != 200:
            pytest.skip("Phone OTP verification failed")
        
        phone_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if response.status_code != 200:
            pytest.skip("Login complete failed")
        
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/dive-log", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        assert "stats" in data
        
        # Verify stats structure for OverviewTab
        stats = data["stats"]
        expected_stats = ["total", "max_depth", "avg_depth", "total_time", "unique_sites"]
        for field in expected_stats:
            assert field in stats, f"Missing stat field: {field}"
        
        print(f"✓ Dive log endpoint returns {len(data['logs'])} logs with stats")
    
    def test_dive_planner_calculate(self):
        """POST /api/dive-planner/calculate - for PlannerTab component"""
        response = requests.post(f"{BASE_URL}/api/dive-planner/calculate", json={
            "depth": 18,
            "fo2": 0.21,
            "planned_time": 40,
            "tank_size": 12,
            "sac_rate": 15,
            "gf_low": 30,
            "gf_high": 85
        })
        assert response.status_code == 200
        
        data = response.json()
        # Verify response structure for PlannerTab
        assert "safety" in data
        assert "deco" in data
        assert "gas" in data
        assert "plan" in data
        
        # Safety checks
        assert "all_ok" in data["safety"]
        assert "depth_ok" in data["safety"]
        assert "gas_ok" in data["safety"]
        
        # Deco info
        assert "ndl" in data["deco"]
        assert "within_ndl" in data["deco"]
        
        # Gas info
        assert "ppo2" in data["gas"]
        assert "mod" in data["gas"]
        
        print(f"✓ Dive planner returns calculation (NDL={data['deco']['ndl']}min, safe={data['safety']['all_ok']})")
    
    def test_dive_planner_ndl_table(self):
        """GET /api/dive-planner/ndl-table - for PlannerTab NDL table"""
        response = requests.get(f"{BASE_URL}/api/dive-planner/ndl-table?fo2=0.21&gf=85")
        assert response.status_code == 200
        
        data = response.json()
        assert "table" in data
        assert isinstance(data["table"], list)
        assert len(data["table"]) > 0
        
        # Verify table entry structure
        entry = data["table"][0]
        assert "depth" in entry
        assert "ndl" in entry
        assert "within_mod" in entry
        
        print(f"✓ NDL table returns {len(data['table'])} depth entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
