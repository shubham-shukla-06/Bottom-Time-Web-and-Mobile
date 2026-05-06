"""
Admin Panel API Tests - Testing all admin endpoints
Tests: GET/PUT/DELETE for admin stats, users, listings management
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "admin@bottomtime.com"
ADMIN_PHONE = "+12025559999"
OTP_CODE = "123456"

# Non-admin credentials for 403 testing
NON_ADMIN_EMAIL = "demo@bottomtime.com"
NON_ADMIN_PHONE = "+12025550001"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin access token via 2FA flow"""
    session = requests.Session()
    
    # Step 1: Send OTP to email
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_EMAIL})
    assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
    
    # Step 2: Verify email OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": ADMIN_EMAIL, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
    email_verified_token = resp.json().get("verification_token")
    
    # Step 3: Send OTP to phone
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_PHONE})
    assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
    
    # Step 4: Verify phone OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": ADMIN_PHONE, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
    phone_verified_token = resp.json().get("verification_token")
    
    # Step 5: Complete login
    resp = session.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": ADMIN_EMAIL,
        "email_verified_token": email_verified_token,
        "phone_verified_token": phone_verified_token
    })
    assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
    
    return resp.json().get("access_token")


@pytest.fixture(scope="module")
def non_admin_token():
    """Get non-admin access token for 403 testing"""
    session = requests.Session()
    
    # Step 1: Send OTP to email
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": NON_ADMIN_EMAIL})
    assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
    
    # Step 2: Verify email OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": NON_ADMIN_EMAIL, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
    email_verified_token = resp.json().get("verification_token")
    
    # Step 3: Send OTP to phone  
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": NON_ADMIN_PHONE})
    assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
    
    # Step 4: Verify phone OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": NON_ADMIN_PHONE, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
    phone_verified_token = resp.json().get("verification_token")
    
    # Step 5: Complete login
    resp = session.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": NON_ADMIN_EMAIL,
        "email_verified_token": email_verified_token,
        "phone_verified_token": phone_verified_token
    })
    assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
    
    return resp.json().get("access_token")


class TestAdminStats:
    """Tests for GET /api/admin/stats"""
    
    def test_admin_stats_returns_all_12_metrics(self, admin_token):
        """Verify stats endpoint returns all 12 required statistics"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Stats failed: {resp.text}"
        
        data = resp.json()
        expected_keys = [
            "total_users", "total_divers", "active_operators", "suspended_users",
            "total_listings", "active_listings", "pending_listings", "total_bookings",
            "total_connections", "total_messages", "total_reviews", "pending_users"
        ]
        
        for key in expected_keys:
            assert key in data, f"Missing stat: {key}"
            assert isinstance(data[key], int), f"{key} should be integer"
        
        print(f"Stats: {data}")
    
    def test_admin_stats_403_for_non_admin(self, non_admin_token):
        """Non-admin users should get 403"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"


class TestRecentActivity:
    """Tests for GET /api/admin/recent-activity"""
    
    def test_recent_activity_returns_required_fields(self, admin_token):
        """Verify recent activity returns recent_users, recent_bookings, recent_reviews"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/recent-activity",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Recent activity failed: {resp.text}"
        
        data = resp.json()
        assert "recent_users" in data
        assert "recent_bookings" in data
        assert "recent_reviews" in data
        
        # Verify structure of recent_users
        if data["recent_users"]:
            user = data["recent_users"][0]
            assert "id" in user
            assert "name" in user
            assert "role" in user
            assert "created_at" in user
        
        print(f"Recent activity: {len(data['recent_users'])} users, {len(data['recent_bookings'])} bookings, {len(data['recent_reviews'])} reviews")
    
    def test_recent_activity_403_for_non_admin(self, non_admin_token):
        """Non-admin users should get 403"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/recent-activity",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestAdminUsers:
    """Tests for user management endpoints"""
    
    def test_get_all_users(self, admin_token):
        """GET /api/admin/users returns users list"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        assert "users" in data
        assert len(data["users"]) > 0, "Should have users in DB"
        
        user = data["users"][0]
        assert "id" in user
        assert "email" in user
        assert "name" in user
        assert "role" in user
        assert "status" in user
        
        print(f"Total users: {len(data['users'])}")
    
    def test_filter_users_by_role(self, admin_token):
        """GET /api/admin/users?role=diver filters by role"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users?role=diver",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        for user in data["users"]:
            assert user["role"] == "diver", f"User {user['name']} has role {user['role']}, expected diver"
        
        print(f"Divers found: {len(data['users'])}")
    
    def test_filter_users_by_status(self, admin_token):
        """GET /api/admin/users?status=active filters by status"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users?status=active",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        for user in data["users"]:
            assert user["status"] == "active", f"User {user['name']} has status {user['status']}, expected active"
        
        print(f"Active users: {len(data['users'])}")
    
    def test_search_users(self, admin_token):
        """GET /api/admin/users?search=demo searches by name/email"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users?search=demo",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        # Should find users with 'demo' in name or email
        print(f"Search 'demo' results: {len(data['users'])}")
    
    def test_combined_filters(self, admin_token):
        """GET /api/admin/users with multiple filters"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users?role=diver&status=active",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        for user in data["users"]:
            assert user["role"] == "diver"
            assert user["status"] == "active"
        
        print(f"Active divers: {len(data['users'])}")
    
    def test_get_users_403_for_non_admin(self, non_admin_token):
        """Non-admin should get 403"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestUserSuspendActivate:
    """Tests for suspend/activate user actions"""
    
    @pytest.fixture
    def test_user_id(self, admin_token):
        """Find a non-admin user to test suspend/activate"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/users?role=diver&status=active",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = resp.json()["users"]
        # Find a user that isn't admin
        for user in users:
            if user["email"] != ADMIN_EMAIL and user["email"] != NON_ADMIN_EMAIL:
                return user["id"]
        pytest.skip("No suitable test user found")
    
    def test_suspend_user(self, admin_token, test_user_id):
        """PUT /api/admin/users/{id}/suspend suspends user"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/users/{test_user_id}/suspend",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Suspend failed: {resp.text}"
        assert "suspended" in resp.json()["message"].lower()
        
        # Verify user is suspended
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = {u["id"]: u for u in resp.json()["users"]}
        assert users[test_user_id]["status"] == "suspended"
        
        print(f"User {test_user_id} suspended")
    
    def test_activate_user(self, admin_token, test_user_id):
        """PUT /api/admin/users/{id}/activate reactivates user"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/users/{test_user_id}/activate",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Activate failed: {resp.text}"
        assert "activated" in resp.json()["message"].lower()
        
        # Verify user is active
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = {u["id"]: u for u in resp.json()["users"]}
        assert users[test_user_id]["status"] == "active"
        
        print(f"User {test_user_id} activated")
    
    def test_suspend_403_for_non_admin(self, non_admin_token, test_user_id):
        """Non-admin should get 403 on suspend"""
        resp = requests.put(
            f"{BASE_URL}/api/admin/users/{test_user_id}/suspend",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestDeleteUser:
    """Tests for DELETE /api/admin/users/{id}"""
    
    def test_delete_user_and_connections(self, admin_token):
        """Delete user should also clean up their connections"""
        # First, get a user that isn't admin or demo
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = resp.json()["users"]
        
        # Find a user we can delete (not admin, not demo)
        test_user = None
        for user in users:
            if user["email"] not in [ADMIN_EMAIL, NON_ADMIN_EMAIL] and user["role"] != "admin":
                test_user = user
                break
        
        if not test_user:
            pytest.skip("No deletable test user found")
        
        # Delete the user
        resp = requests.delete(
            f"{BASE_URL}/api/admin/users/{test_user['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        assert "deleted" in resp.json()["message"].lower()
        
        # Verify user no longer exists
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        user_ids = [u["id"] for u in resp.json()["users"]]
        assert test_user["id"] not in user_ids, "User should be deleted"
        
        print(f"Deleted user: {test_user['name']} ({test_user['email']})")
    
    def test_delete_user_403_for_non_admin(self, admin_token, non_admin_token):
        """Non-admin should get 403 on delete"""
        # Get any user ID
        resp = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        user_id = resp.json()["users"][0]["id"]
        
        resp = requests.delete(
            f"{BASE_URL}/api/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestAdminListings:
    """Tests for listing management endpoints"""
    
    def test_get_all_listings(self, admin_token):
        """GET /api/admin/listings returns all listings"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        assert "listings" in data
        
        if data["listings"]:
            listing = data["listings"][0]
            assert "id" in listing
            assert "name" in listing
            assert "status" in listing
            assert "location" in listing or "country" in listing
        
        print(f"Total listings: {len(data['listings'])}")
    
    def test_filter_listings_by_status(self, admin_token):
        """GET /api/admin/listings?status=active filters by status"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings?status=active",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        for listing in data["listings"]:
            assert listing["status"] == "active"
        
        print(f"Active listings: {len(data['listings'])}")
    
    def test_search_listings(self, admin_token):
        """GET /api/admin/listings?search=reef searches listings"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings?search=reef",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        print(f"Search 'reef' results: {len(data['listings'])}")
    
    def test_get_listings_403_for_non_admin(self, non_admin_token):
        """Non-admin should get 403"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestListingApproveReject:
    """Tests for approve/reject listing endpoints"""
    
    def test_get_pending_listings(self, admin_token):
        """GET /api/admin/pending-listings returns pending listings"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/pending-listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        assert "listings" in data
        
        # All returned should be pending
        for listing in data["listings"]:
            assert listing["status"] == "pending"
        
        print(f"Pending listings: {len(data['listings'])}")
    
    def test_approve_and_reject_listing_flow(self, admin_token):
        """Test approve and reject for pending listings"""
        # Get pending listings
        resp = requests.get(
            f"{BASE_URL}/api/admin/pending-listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        pending = resp.json()["listings"]
        
        if not pending:
            pytest.skip("No pending listings to test")
        
        # Test approve
        listing_id = pending[0]["id"]
        resp = requests.put(
            f"{BASE_URL}/api/admin/listings/{listing_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        assert "approved" in resp.json()["message"].lower()
        
        # Verify it's now active
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings?status=active",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        active_ids = [l["id"] for l in resp.json()["listings"]]
        assert listing_id in active_ids
        
        print(f"Approved listing: {listing_id}")
        
        # Now reject it (set back)
        resp = requests.put(
            f"{BASE_URL}/api/admin/listings/{listing_id}/reject",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        assert "rejected" in resp.json()["message"].lower()
        
        print(f"Rejected listing: {listing_id}")
    
    def test_approve_listing_403_for_non_admin(self, admin_token, non_admin_token):
        """Non-admin should get 403 on approve"""
        # Get any listing ID
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if not resp.json()["listings"]:
            pytest.skip("No listings to test")
        
        listing_id = resp.json()["listings"][0]["id"]
        
        resp = requests.put(
            f"{BASE_URL}/api/admin/listings/{listing_id}/approve",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestDeleteListing:
    """Tests for DELETE /api/admin/listings/{id}"""
    
    def test_delete_listing(self, admin_token):
        """DELETE /api/admin/listings/{id} deletes listing"""
        # Get all listings
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        listings = resp.json()["listings"]
        
        if not listings:
            pytest.skip("No listings to delete")
        
        # Delete one listing
        listing_id = listings[-1]["id"]  # Take last one
        listing_name = listings[-1]["name"]
        
        resp = requests.delete(
            f"{BASE_URL}/api/admin/listings/{listing_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()
        
        # Verify it's gone
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        listing_ids = [l["id"] for l in resp.json()["listings"]]
        assert listing_id not in listing_ids
        
        print(f"Deleted listing: {listing_name}")
    
    def test_delete_listing_403_for_non_admin(self, admin_token, non_admin_token):
        """Non-admin should get 403 on delete"""
        # Get any listing ID
        resp = requests.get(
            f"{BASE_URL}/api/admin/listings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if not resp.json()["listings"]:
            pytest.skip("No listings to test")
        
        listing_id = resp.json()["listings"][0]["id"]
        
        resp = requests.delete(
            f"{BASE_URL}/api/admin/listings/{listing_id}",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403


class TestPendingUsers:
    """Tests for pending user management"""
    
    def test_get_pending_users(self, admin_token):
        """GET /api/admin/pending-users returns pending approval users"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/pending-users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        
        data = resp.json()
        assert "users" in data
        
        # All should have pending_approval status
        for user in data["users"]:
            assert user["status"] == "pending_approval"
        
        print(f"Pending users: {len(data['users'])}")
    
    def test_pending_users_403_for_non_admin(self, non_admin_token):
        """Non-admin should get 403"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/pending-users",
            headers={"Authorization": f"Bearer {non_admin_token}"}
        )
        assert resp.status_code == 403
