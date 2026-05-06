"""
Admin Dashboard V2 Tests
Testing new features: Reports System, Site Content CMS, Admin Listing CRUD
Iteration 22 tests
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminAuthentication:
    """Admin login tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Authenticate as admin and return token"""
        # Step 1: Send OTP to email
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
        
        # Step 2: Verify email OTP (hardcoded 123456)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
        email_token = resp.json().get("verification_token")
        
        # Step 3: Send OTP to phone
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
        
        # Step 4: Verify phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
        phone_token = resp.json().get("verification_token")
        
        # Step 5: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
        token = resp.json().get("access_token")
        assert token, "No access token returned"
        return token
    
    def test_admin_login_success(self, admin_token):
        """Verify admin login returns valid token"""
        assert admin_token is not None
        print(f"Admin login successful, token received")


class TestAdminOverview:
    """Admin Overview Tab tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_admin_stats(self, admin_token):
        """Test /api/admin/stats returns all KPI data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert resp.status_code == 200, f"Failed to get admin stats: {resp.text}"
        data = resp.json()
        
        # Check 12 KPI fields exist
        required_fields = ["total_users", "active_listings", "total_bookings", "total_revenue",
                          "total_wishlists", "total_reviews", "total_messages", "total_page_views",
                          "total_searches", "total_listing_clicks", "total_shares", "total_dive_logs"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        print(f"Admin stats returned {len(data)} fields")

    def test_admin_growth_analytics(self, admin_token):
        """Test /api/admin/analytics/growth for charts data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/analytics/growth", headers=headers)
        assert resp.status_code == 200, f"Failed to get growth analytics: {resp.text}"
        data = resp.json()
        
        # Charts data
        assert "daily_signups" in data, "Missing daily_signups"
        assert "role_distribution" in data, "Missing role_distribution"
        assert "onboarding_funnel" in data, "Missing onboarding_funnel"
        assert "country_distribution" in data, "Missing country_distribution"
        print(f"Growth analytics: {len(data.get('daily_signups', []))} signup days, {len(data.get('role_distribution', []))} roles")


class TestReportsSystem:
    """Reports System tests - POST /api/reports, GET/PUT /api/admin/reports"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def test_user_id(self, admin_token):
        """Get a non-admin user id for reporting"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/users?role=diver", headers=headers)
        if resp.status_code == 200 and resp.json().get("users"):
            return resp.json()["users"][0]["id"]
        return None
    
    def test_create_report(self, admin_token, test_user_id):
        """Test POST /api/reports creates a report"""
        if not test_user_id:
            pytest.skip("No test user available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        report_data = {
            "reported_id": test_user_id,
            "reason": "Spam",
            "details": "TEST_REPORT: Test report for iteration 22",
            "context_type": "profile"
        }
        resp = requests.post(f"{BASE_URL}/api/reports", headers=headers, json=report_data)
        assert resp.status_code == 200, f"Failed to create report: {resp.text}"
        data = resp.json()
        assert "id" in data, "No report ID returned"
        assert data.get("message") == "Report submitted"
        print(f"Report created: {data.get('id')}")
    
    def test_get_admin_reports(self, admin_token):
        """Test GET /api/admin/reports returns reports list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/reports", headers=headers)
        assert resp.status_code == 200, f"Failed to get reports: {resp.text}"
        data = resp.json()
        assert "reports" in data, "Missing reports field"
        assert "reasons" in data, "Missing reasons field"
        print(f"Admin reports: {len(data.get('reports', []))} reports, {len(data.get('reasons', []))} reasons")
    
    def test_get_reports_by_status(self, admin_token):
        """Test GET /api/admin/reports?status=pending"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/reports?status=pending", headers=headers)
        assert resp.status_code == 200, f"Failed to filter reports: {resp.text}"
        data = resp.json()
        for r in data.get("reports", []):
            assert r.get("status") == "pending", f"Report has wrong status: {r.get('status')}"
        print(f"Pending reports: {len(data.get('reports', []))}")
    
    def test_dismiss_report(self, admin_token):
        """Test PUT /api/admin/reports/{id}?action=dismiss"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a pending report
        resp = requests.get(f"{BASE_URL}/api/admin/reports?status=pending", headers=headers)
        reports = resp.json().get("reports", [])
        if not reports:
            pytest.skip("No pending reports to dismiss")
        
        report_id = reports[0]["id"]
        resp = requests.put(f"{BASE_URL}/api/admin/reports/{report_id}?action=dismiss&notes=Test%20dismiss", headers=headers)
        assert resp.status_code == 200, f"Failed to dismiss report: {resp.text}"
        print(f"Dismissed report: {report_id}")


class TestSiteContentCMS:
    """Site Content CMS tests - GET/PUT /api/admin/site-content, GET /api/site-content/public"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_get_public_site_content(self):
        """Test GET /api/site-content/public (no auth required)"""
        resp = requests.get(f"{BASE_URL}/api/site-content/public")
        assert resp.status_code == 200, f"Failed to get public site content: {resp.text}"
        data = resp.json()
        
        # Verify hero fields
        assert "hero_image" in data, "Missing hero_image"
        assert "hero_title" in data, "Missing hero_title"
        assert "hero_subtitle" in data, "Missing hero_subtitle"
        assert "hero_description" in data, "Missing hero_description"
        
        # Verify section images
        assert "section_images" in data, "Missing section_images"
        sections = data.get("section_images", {})
        for key in ["about", "curious", "operator", "community", "group"]:
            assert key in sections, f"Missing section image: {key}"
        print(f"Public site content loaded: hero_title='{data.get('hero_title')}'")
    
    def test_get_admin_site_content(self, admin_token):
        """Test GET /api/admin/site-content (admin only)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert resp.status_code == 200, f"Failed to get admin site content: {resp.text}"
        data = resp.json()
        assert "hero_image" in data, "Missing hero_image"
        print(f"Admin site content loaded")
    
    def test_update_site_content(self, admin_token):
        """Test PUT /api/admin/site-content updates content"""
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        
        # First get current content
        resp = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        current = resp.json()
        
        # Update with minor change (add test marker)
        updated_content = {
            "hero_image": current.get("hero_image", ""),
            "hero_title": current.get("hero_title", "The ocean is calling."),
            "hero_subtitle": current.get("hero_subtitle", "Find your next dive."),
            "hero_description": current.get("hero_description", ""),
            "section_images": current.get("section_images", {})
        }
        
        resp = requests.put(f"{BASE_URL}/api/admin/site-content", headers=headers, json=updated_content)
        assert resp.status_code == 200, f"Failed to update site content: {resp.text}"
        assert resp.json().get("message") == "Site content updated"
        print("Site content updated successfully")


class TestAdminListingsCRUD:
    """Admin Listings CRUD tests - POST /api/admin/listings, PUT /api/admin/listings/{id}/edit"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_admin_create_listing(self, admin_token):
        """Test POST /api/admin/listings creates a listing"""
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        listing_data = {
            "name": "TEST_LISTING: Admin Created Dive",
            "type": "dives",
            "description": "Test listing created by admin for iteration 22",
            "location": "Test City",
            "country": "Test Country",
            "price": 100.0,
            "currency": "USD",
            "difficulty": "beginner",
            "duration": "2 hours",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
            "highlights": ["Test", "Admin created"]
        }
        resp = requests.post(f"{BASE_URL}/api/admin/listings", headers=headers, json=listing_data)
        assert resp.status_code == 200, f"Failed to create listing: {resp.text}"
        data = resp.json()
        assert "id" in data, "No listing ID returned"
        assert data.get("status") == "active", f"Expected status 'active', got '{data.get('status')}'"
        print(f"Admin created listing: {data.get('id')}")
        return data.get("id")
    
    def test_admin_edit_listing(self, admin_token):
        """Test PUT /api/admin/listings/{id}/edit updates a listing"""
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        
        # Get an existing listing
        resp = requests.get(f"{BASE_URL}/api/admin/listings", headers=headers)
        listings = resp.json().get("listings", [])
        if not listings:
            pytest.skip("No listings to edit")
        
        listing_id = listings[0]["id"]
        update_data = {
            "name": listings[0].get("name", "Updated Listing"),
            "price": (listings[0].get("price") or 100) + 10  # Increment price by 10
        }
        
        resp = requests.put(f"{BASE_URL}/api/admin/listings/{listing_id}/edit", headers=headers, json=update_data)
        assert resp.status_code == 200, f"Failed to edit listing: {resp.text}"
        data = resp.json()
        assert data.get("id") == listing_id, "Listing ID mismatch"
        print(f"Admin edited listing: {listing_id}")


class TestAdminUsersTab:
    """Admin Users Tab tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_get_all_users(self, admin_token):
        """Test GET /api/admin/users returns user list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert resp.status_code == 200, f"Failed to get users: {resp.text}"
        data = resp.json()
        assert "users" in data, "Missing users field"
        print(f"Total users: {len(data.get('users', []))}")
    
    def test_filter_users_by_role(self, admin_token):
        """Test GET /api/admin/users?role=diver filters correctly"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/users?role=diver", headers=headers)
        assert resp.status_code == 200, f"Failed to filter by role: {resp.text}"
        data = resp.json()
        for u in data.get("users", []):
            assert u.get("role") == "diver", f"User has wrong role: {u.get('role')}"
        print(f"Divers count: {len(data.get('users', []))}")


class TestAdminBookingsTab:
    """Admin Bookings Tab tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_get_all_bookings(self, admin_token):
        """Test GET /api/admin/analytics/bookings returns bookings data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/analytics/bookings", headers=headers)
        assert resp.status_code == 200, f"Failed to get bookings: {resp.text}"
        data = resp.json()
        assert "bookings" in data, "Missing bookings field"
        assert "status_distribution" in data, "Missing status_distribution"
        print(f"Total bookings: {len(data.get('bookings', []))}, Status distribution: {data.get('status_distribution')}")


class TestAdminSettingsTab:
    """Admin Settings Tab tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_get_admin_list(self, admin_token):
        """Test GET /api/admin/settings/admins returns admin management data"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/settings/admins", headers=headers)
        assert resp.status_code == 200, f"Failed to get admin settings: {resp.text}"
        data = resp.json()
        assert "admins" in data, "Missing admins field"
        assert "super_admins" in data, "Missing super_admins field"
        assert "is_super_admin" in data, "Missing is_super_admin field"
        print(f"Admins: {len(data.get('admins', []))}, Super admins: {data.get('super_admins')}")


class TestNavbarForAdmin:
    """Test admin sees all nav links including Admin"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        email_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        phone_token = resp.json().get("verification_token")
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={"email": "admin@bottomtime.com", "email_verified_token": email_token, "phone_verified_token": phone_token})
        return resp.json().get("access_token")
    
    def test_admin_user_role(self, admin_token):
        """Verify admin@bottomtime.com has role=admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200, f"Failed to get user info: {resp.text}"
        user = resp.json()
        assert user.get("role") == "admin", f"Expected role 'admin', got '{user.get('role')}'"
        assert user.get("email") == "admin@bottomtime.com"
        print(f"Admin user verified: {user.get('email')}, role={user.get('role')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
