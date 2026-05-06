"""
Admin Dashboard API Tests - Bottom Time Admin Panel
Tests admin authentication, stats, analytics, users, listings, bookings, and settings endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admin@bottomtime.com"
ADMIN_PHONE = "+12025559999"
OTP_CODE = "123456"

@pytest.fixture(scope="module")
def admin_token():
    """Authenticate as admin and get token using 2-step OTP flow"""
    # Step 1: Send email OTP
    resp1 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_EMAIL})
    if resp1.status_code != 200:
        pytest.skip(f"Failed to send email OTP: {resp1.text}")
    
    # Step 2: Verify email OTP
    resp2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": ADMIN_EMAIL, "code": OTP_CODE})
    if resp2.status_code != 200:
        pytest.skip(f"Failed to verify email OTP: {resp2.text}")
    email_token = resp2.json().get("verification_token")
    
    # Step 3: Send phone OTP
    resp3 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_PHONE})
    if resp3.status_code != 200:
        pytest.skip(f"Failed to send phone OTP: {resp3.text}")
    
    # Step 4: Verify phone OTP
    resp4 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": ADMIN_PHONE, "code": OTP_CODE})
    if resp4.status_code != 200:
        pytest.skip(f"Failed to verify phone OTP: {resp4.text}")
    phone_token = resp4.json().get("verification_token")
    
    # Step 5: Complete login
    resp5 = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": ADMIN_EMAIL,
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    if resp5.status_code != 200:
        pytest.skip(f"Failed to complete login: {resp5.text}")
    
    data = resp5.json()
    assert "access_token" in data, "No access_token in login response"
    assert "user" in data, "No user in login response"
    assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
    
    return data["access_token"]

@pytest.fixture
def auth_headers(admin_token):
    """Get authorization headers for admin requests"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestAdminAuth:
    """Test admin authentication flow"""
    
    def test_admin_login_complete_returns_token_and_user(self, admin_token):
        """Verify admin login returns valid token"""
        assert admin_token is not None
        assert len(admin_token) > 50  # JWT should be reasonably long
        print(f"✓ Admin token obtained: {admin_token[:50]}...")

    def test_admin_me_endpoint(self, auth_headers):
        """Verify /api/auth/me returns admin user"""
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        user = resp.json()
        assert user["email"] == ADMIN_EMAIL
        assert user["role"] == "admin"
        print(f"✓ Admin user: {user['name']} ({user['email']})")


class TestAdminStats:
    """Test /api/admin/stats endpoint"""
    
    def test_admin_stats_returns_comprehensive_data(self, auth_headers):
        """Verify /api/admin/stats returns 20+ fields"""
        resp = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert resp.status_code == 200
        stats = resp.json()
        
        # Check required fields (20+ fields)
        expected_fields = [
            "total_users", "total_divers", "active_operators", "suspended_users",
            "pending_users", "new_users_7d", "new_users_30d", "onboarded_users",
            "total_listings", "active_listings", "pending_listings",
            "total_bookings", "bookings_7d", "confirmed_bookings",
            "total_connections", "total_messages", "total_reviews",
            "total_wishlists", "total_dive_logs", "total_events_rsvp",
            "total_page_views", "total_searches", "total_listing_clicks",
            "total_shares", "total_revenue"
        ]
        
        for field in expected_fields:
            assert field in stats, f"Missing field: {field}"
            print(f"  {field}: {stats[field]}")
        
        print(f"✓ Admin stats: {len(stats)} fields returned")
        assert len(stats) >= 20, f"Expected 20+ fields, got {len(stats)}"

    def test_admin_stats_requires_auth(self):
        """Verify /api/admin/stats requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code in [401, 403]


class TestAdminAnalyticsGrowth:
    """Test /api/admin/analytics/growth endpoint"""
    
    def test_growth_analytics_returns_required_data(self, auth_headers):
        """Verify growth analytics returns daily_signups, role_distribution, etc"""
        resp = requests.get(f"{BASE_URL}/api/admin/analytics/growth", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Required fields
        assert "daily_signups" in data, "Missing daily_signups"
        assert "role_distribution" in data, "Missing role_distribution"
        assert "onboarding_funnel" in data, "Missing onboarding_funnel"
        assert "country_distribution" in data, "Missing country_distribution"
        
        # Validate structure
        assert isinstance(data["daily_signups"], list), "daily_signups should be list"
        assert isinstance(data["role_distribution"], list), "role_distribution should be list"
        assert isinstance(data["onboarding_funnel"], dict), "onboarding_funnel should be dict"
        
        # Onboarding funnel should have specific keys
        funnel = data["onboarding_funnel"]
        assert "signed_up" in funnel
        assert "onboarded" in funnel
        assert "has_booking" in funnel
        
        print(f"✓ Growth analytics: daily_signups={len(data['daily_signups'])}, roles={len(data['role_distribution'])}")
        print(f"  Funnel: signed_up={funnel['signed_up']}, onboarded={funnel['onboarded']}, has_booking={funnel['has_booking']}")


class TestAdminAnalyticsEngagement:
    """Test /api/admin/analytics/engagement endpoint"""
    
    def test_engagement_analytics_returns_required_data(self, auth_headers):
        """Verify engagement analytics returns top_wishlisted, top_booked, etc"""
        resp = requests.get(f"{BASE_URL}/api/admin/analytics/engagement", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Required fields
        assert "top_wishlisted" in data, "Missing top_wishlisted"
        assert "top_booked" in data, "Missing top_booked"
        assert "top_reviewed" in data, "Missing top_reviewed"
        assert "top_clicked" in data, "Missing top_clicked"
        assert "top_searches" in data, "Missing top_searches"
        
        # All should be lists
        assert isinstance(data["top_wishlisted"], list)
        assert isinstance(data["top_booked"], list)
        assert isinstance(data["top_reviewed"], list)
        assert isinstance(data["top_clicked"], list)
        assert isinstance(data["top_searches"], list)
        
        print(f"✓ Engagement analytics:")
        print(f"  top_wishlisted: {len(data['top_wishlisted'])} items")
        print(f"  top_booked: {len(data['top_booked'])} items")
        print(f"  top_reviewed: {len(data['top_reviewed'])} items")
        print(f"  top_clicked: {len(data['top_clicked'])} items")
        print(f"  top_searches: {len(data['top_searches'])} items")


class TestAdminAnalyticsBookings:
    """Test /api/admin/analytics/bookings endpoint"""
    
    def test_bookings_analytics_returns_list_and_status(self, auth_headers):
        """Verify bookings analytics returns bookings list and status_distribution"""
        resp = requests.get(f"{BASE_URL}/api/admin/analytics/bookings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "bookings" in data, "Missing bookings list"
        assert "status_distribution" in data, "Missing status_distribution"
        
        assert isinstance(data["bookings"], list)
        assert isinstance(data["status_distribution"], list)
        
        # Each booking should have user_name, listing_name
        if data["bookings"]:
            booking = data["bookings"][0]
            assert "user_name" in booking or "user_id" in booking
            assert "listing_name" in booking or "listing_id" in booking
            assert "status" in booking
        
        print(f"✓ Bookings analytics: {len(data['bookings'])} bookings")
        print(f"  Status distribution: {data['status_distribution']}")


class TestAdminSettings:
    """Test /api/admin/settings/admins endpoint"""
    
    def test_admin_settings_returns_admin_list(self, auth_headers):
        """Verify settings returns admins list and super_admins"""
        resp = requests.get(f"{BASE_URL}/api/admin/settings/admins", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "admins" in data, "Missing admins list"
        assert "super_admins" in data, "Missing super_admins list"
        assert "is_super_admin" in data, "Missing is_super_admin flag"
        
        assert isinstance(data["admins"], list)
        assert isinstance(data["super_admins"], list)
        
        # Super admins should include hardcoded emails
        assert "admin@bottomtime.com" in data["super_admins"] or "shubham@bottom-time.com" in data["super_admins"]
        
        print(f"✓ Admin settings: {len(data['admins'])} admins, {len(data['super_admins'])} super admins")
        print(f"  Super admins: {data['super_admins']}")
        print(f"  Is super admin: {data['is_super_admin']}")


class TestAdminUsers:
    """Test /api/admin/users endpoint"""
    
    def test_admin_users_returns_user_list(self, auth_headers):
        """Verify /api/admin/users returns user list with search/filter"""
        resp = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "users" in data
        assert isinstance(data["users"], list)
        
        # Each user should have key fields
        if data["users"]:
            user = data["users"][0]
            assert "id" in user
            assert "name" in user or "email" in user
            assert "role" in user
            assert "status" in user
        
        print(f"✓ Admin users: {len(data['users'])} users returned")

    def test_admin_users_filter_by_role(self, auth_headers):
        """Test role filter on users endpoint"""
        resp = requests.get(f"{BASE_URL}/api/admin/users?role=diver", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # All returned users should be divers
        for user in data["users"]:
            assert user["role"] == "diver", f"Expected diver, got {user['role']}"
        
        print(f"✓ Filtered by role=diver: {len(data['users'])} divers")


class TestAdminListings:
    """Test /api/admin/listings endpoint"""
    
    def test_admin_listings_returns_listing_list(self, auth_headers):
        """Verify /api/admin/listings returns listings with status/search"""
        resp = requests.get(f"{BASE_URL}/api/admin/listings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "listings" in data
        assert isinstance(data["listings"], list)
        
        if data["listings"]:
            listing = data["listings"][0]
            assert "id" in listing
            assert "name" in listing
            assert "status" in listing
        
        print(f"✓ Admin listings: {len(data['listings'])} listings returned")


class TestEventTracking:
    """Test event tracking endpoints"""
    
    def test_track_event_authenticated(self, auth_headers):
        """Test POST /api/track for authenticated user"""
        resp = requests.post(f"{BASE_URL}/api/track", 
            headers=auth_headers,
            json={
                "event_type": "page_view",
                "data": {"page": "/admin", "test": True}
            })
        assert resp.status_code == 200
        assert resp.json().get("ok") == True
        print("✓ Authenticated track event: page_view logged")

    def test_track_event_anonymous(self):
        """Test POST /api/track/anon for anonymous user"""
        resp = requests.post(f"{BASE_URL}/api/track/anon", 
            json={
                "event_type": "listing_click",
                "data": {"listing_id": "test-123", "test": True}
            })
        assert resp.status_code == 200
        assert resp.json().get("ok") == True
        print("✓ Anonymous track event: listing_click logged")

    def test_track_search_event(self, auth_headers):
        """Test tracking search event"""
        resp = requests.post(f"{BASE_URL}/api/track",
            headers=auth_headers,
            json={
                "event_type": "search",
                "data": {"query": "Bali diving", "test": True}
            })
        assert resp.status_code == 200
        print("✓ Search event tracked")

    def test_track_share_event(self):
        """Test tracking share event anonymously"""
        resp = requests.post(f"{BASE_URL}/api/track/anon",
            json={
                "event_type": "share",
                "data": {"listing_id": "test-456", "platform": "copy_link", "test": True}
            })
        assert resp.status_code == 200
        print("✓ Share event tracked (anonymous)")


class TestAdminRecentActivity:
    """Test /api/admin/recent-activity endpoint"""
    
    def test_recent_activity_returns_data(self, auth_headers):
        """Verify recent-activity returns users, bookings, reviews, events"""
        resp = requests.get(f"{BASE_URL}/api/admin/recent-activity", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "recent_users" in data
        assert "recent_bookings" in data
        assert "recent_reviews" in data
        assert "recent_events" in data
        
        print(f"✓ Recent activity:")
        print(f"  Users: {len(data['recent_users'])}")
        print(f"  Bookings: {len(data['recent_bookings'])}")
        print(f"  Reviews: {len(data['recent_reviews'])}")
        print(f"  Events: {len(data['recent_events'])}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
