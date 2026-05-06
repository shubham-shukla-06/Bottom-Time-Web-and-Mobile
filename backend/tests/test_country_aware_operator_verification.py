"""
Test Country-Aware Operator Verification System
Tests for:
- POST /api/operator-listings/apply with country-specific fields
- Country validation (required)
- GSTIN mandatory for India
- GET /api/operator-listings/application/status
- Admin review endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "test@bottomtime.com"
OPERATOR_EMAIL = "operator@bottomtime.com"
ADMIN_EMAIL = "shubham@bottom-time.com"
OTP = "123456"


def login_user(session, email):
    """Helper to login and get auth token using the correct auth flow"""
    # Step 1: Send OTP
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
    if resp.status_code != 200:
        return None
    
    # Step 2: Verify OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": OTP})
    if resp.status_code != 200:
        return None
    
    verification_token = resp.json().get("verification_token")
    if not verification_token:
        return None
    
    # Step 3: Complete login
    resp = session.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": email,
        "email_verified_token": verification_token
    })
    if resp.status_code != 200:
        return None
    
    data = resp.json()
    token = data.get("access_token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    return data


class TestOperatorApplicationEndpoints:
    """Test operator application API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ─── Test: Apply endpoint requires authentication ───
    def test_apply_requires_auth(self):
        """POST /api/operator-listings/apply should require authentication"""
        resp = requests.post(f"{BASE_URL}/api/operator-listings/apply", json={
            "country": "India",
            "business_name": "Test Dive Center"
        })
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("PASS: Apply endpoint requires authentication")
    
    # ─── Test: Country is required ───
    def test_apply_country_required(self):
        """POST /api/operator-listings/apply should require country field"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json={
            "business_name": "Test Dive Center",
            "business_type": "dive_center"
        })
        
        # Should fail with 400 because country is missing
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        response_data = resp.json()
        assert "country" in response_data.get("detail", "").lower(), f"Expected country error, got: {response_data}"
        print("PASS: Country is required for operator application")
    
    # ─── Test: GSTIN mandatory for India ───
    def test_apply_india_requires_gstin(self):
        """POST /api/operator-listings/apply should require GSTIN for India"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json={
            "country": "India",
            "business_name": "Test Dive Center India",
            "business_type": "dive_center",
            "city": "Goa"
        })
        
        # Should fail with 400 because GSTIN is missing for India
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        response_data = resp.json()
        assert "gstin" in response_data.get("detail", "").lower(), f"Expected GSTIN error, got: {response_data}"
        print("PASS: GSTIN is mandatory for Indian operators")
    
    # ─── Test: Invalid GSTIN format rejected ───
    def test_apply_india_invalid_gstin_format(self):
        """POST /api/operator-listings/apply should reject invalid GSTIN format"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json={
            "country": "India",
            "business_name": "Test Dive Center India",
            "business_type": "dive_center",
            "city": "Goa",
            "gstin": "INVALID123"  # Invalid format
        })
        
        # Should fail with 400 because GSTIN format is invalid
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        response_data = resp.json()
        assert "gstin" in response_data.get("detail", "").lower() or "invalid" in response_data.get("detail", "").lower(), f"Expected GSTIN format error, got: {response_data}"
        print("PASS: Invalid GSTIN format is rejected")
    
    # ─── Test: Non-India countries don't require GSTIN ───
    def test_apply_non_india_no_gstin_required(self):
        """POST /api/operator-listings/apply should not require GSTIN for non-India countries"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        # Try UK application without GSTIN
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json={
            "country": "United Kingdom",
            "business_name": f"TEST_UK_Dive_Center_{uuid.uuid4().hex[:6]}",
            "business_type": "dive_center",
            "city": "London",
            "registration_number": "12345678"
        })
        
        # Should either succeed (201/200) or fail for other reasons (like duplicate application)
        # but NOT fail because of missing GSTIN
        if resp.status_code == 400:
            response_data = resp.json()
            assert "gstin" not in response_data.get("detail", "").lower(), f"UK should not require GSTIN, got: {response_data}"
        print(f"PASS: Non-India countries don't require GSTIN (status: {resp.status_code})")
    
    # ─── Test: Application status endpoint ───
    def test_application_status_endpoint(self):
        """GET /api/operator-listings/application/status should return application status"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.get(f"{BASE_URL}/api/operator-listings/application/status")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        response_data = resp.json()
        assert "application" in response_data, f"Expected 'application' key in response, got: {response_data.keys()}"
        print(f"PASS: Application status endpoint works (application: {response_data.get('application') is not None})")
    
    # ─── Test: Application status requires auth ───
    def test_application_status_requires_auth(self):
        """GET /api/operator-listings/application/status should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/operator-listings/application/status")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("PASS: Application status endpoint requires authentication")


class TestAdminApplicationReview:
    """Test admin application review endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ─── Test: Admin applications endpoint ───
    def test_admin_get_applications(self):
        """GET /api/operator-listings/admin/applications should return applications for admin"""
        data = login_user(self.session, ADMIN_EMAIL)
        if not data:
            pytest.skip("Could not login as admin")
        
        resp = self.session.get(f"{BASE_URL}/api/operator-listings/admin/applications")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        response_data = resp.json()
        assert "applications" in response_data, f"Expected 'applications' key, got: {response_data.keys()}"
        assert "summary" in response_data, f"Expected 'summary' key, got: {response_data.keys()}"
        
        summary = response_data.get("summary", {})
        assert "total" in summary, f"Expected 'total' in summary"
        assert "pending" in summary, f"Expected 'pending' in summary"
        assert "approved" in summary, f"Expected 'approved' in summary"
        assert "rejected" in summary, f"Expected 'rejected' in summary"
        
        print(f"PASS: Admin applications endpoint works (total: {summary.get('total')}, pending: {summary.get('pending')})")
    
    # ─── Test: Admin applications requires admin role ───
    def test_admin_applications_requires_admin(self):
        """GET /api/operator-listings/admin/applications should require admin role"""
        # Login as regular user
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.get(f"{BASE_URL}/api/operator-listings/admin/applications")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Admin applications endpoint requires admin role")
    
    # ─── Test: Admin filter by status ───
    def test_admin_filter_by_status(self):
        """GET /api/operator-listings/admin/applications?status=pending should filter"""
        data = login_user(self.session, ADMIN_EMAIL)
        if not data:
            pytest.skip("Could not login as admin")
        
        for status in ["pending", "approved", "rejected"]:
            resp = self.session.get(f"{BASE_URL}/api/operator-listings/admin/applications?status={status}")
            assert resp.status_code == 200, f"Expected 200 for status={status}, got {resp.status_code}"
            
            response_data = resp.json()
            apps = response_data.get("applications", [])
            # All returned apps should have the filtered status
            for app in apps:
                assert app.get("status") == status, f"Expected status={status}, got {app.get('status')}"
        
        print("PASS: Admin can filter applications by status")
    
    # ─── Test: Admin review action validation ───
    def test_admin_review_action_validation(self):
        """PUT /api/operator-listings/admin/applications/{id}/review should validate action"""
        data = login_user(self.session, ADMIN_EMAIL)
        if not data:
            pytest.skip("Could not login as admin")
        
        # Try with invalid action
        resp = self.session.put(f"{BASE_URL}/api/operator-listings/admin/applications/fake-id/review", json={
            "action": "invalid_action"
        })
        assert resp.status_code == 400, f"Expected 400 for invalid action, got {resp.status_code}"
        print("PASS: Admin review validates action (approve/reject only)")
    
    # ─── Test: Admin review 404 for nonexistent ───
    def test_admin_review_404_nonexistent(self):
        """PUT /api/operator-listings/admin/applications/{id}/review should return 404 for nonexistent"""
        data = login_user(self.session, ADMIN_EMAIL)
        if not data:
            pytest.skip("Could not login as admin")
        
        resp = self.session.put(f"{BASE_URL}/api/operator-listings/admin/applications/nonexistent-id/review", json={
            "action": "approve"
        })
        assert resp.status_code == 404, f"Expected 404 for nonexistent app, got {resp.status_code}"
        print("PASS: Admin review returns 404 for nonexistent application")


class TestGSTINVerification:
    """Test GSTIN verification endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ─── Test: GSTIN verification requires auth ───
    def test_verify_gstin_requires_auth(self):
        """POST /api/operator-listings/verify-gstin should require authentication"""
        resp = requests.post(f"{BASE_URL}/api/operator-listings/verify-gstin", json={
            "gstin": "22AAAAA0000A1Z5"
        })
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("PASS: GSTIN verification requires authentication")
    
    # ─── Test: GSTIN verification requires gstin field ───
    def test_verify_gstin_requires_field(self):
        """POST /api/operator-listings/verify-gstin should require gstin field"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/verify-gstin", json={})
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("PASS: GSTIN verification requires gstin field")
    
    # ─── Test: GSTIN format validation ───
    def test_verify_gstin_format_validation(self):
        """POST /api/operator-listings/verify-gstin should validate GSTIN format"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        # Test with invalid format
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/verify-gstin", json={
            "gstin": "INVALID"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        response_data = resp.json()
        assert response_data.get("valid") == False, f"Expected valid=False for invalid GSTIN, got: {response_data}"
        print("PASS: GSTIN format validation works")
    
    # ─── Test: Valid GSTIN format returns validation result ───
    def test_verify_gstin_valid_format(self):
        """POST /api/operator-listings/verify-gstin should return validation result for valid format"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        # Test with valid format GSTIN (checksum may or may not pass)
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/verify-gstin", json={
            "gstin": "27AABCU9603R1ZM"  # Valid format Maharashtra GSTIN
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        response_data = resp.json()
        # Should have validation fields
        assert "valid" in response_data or "gstin" in response_data, f"Expected validation result, got: {response_data}"
        print(f"PASS: GSTIN validation returns result (valid: {response_data.get('valid')})")


class TestEmailReviewLinks:
    """Test email-based review links"""
    
    # ─── Test: Invalid token returns expired message ───
    def test_approve_invalid_token(self):
        """GET /api/operator-review/{token}/approve should return expired for invalid token"""
        resp = requests.get(f"{BASE_URL}/api/operator-review/invalid-token/approve")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "expired" in resp.text.lower() or "link" in resp.text.lower(), f"Expected expired message, got: {resp.text[:200]}"
        print("PASS: Invalid approve token returns expired message")
    
    def test_decline_invalid_token(self):
        """GET /api/operator-review/{token}/decline should return expired for invalid token"""
        resp = requests.get(f"{BASE_URL}/api/operator-review/invalid-token/decline")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "expired" in resp.text.lower() or "link" in resp.text.lower(), f"Expected expired message, got: {resp.text[:200]}"
        print("PASS: Invalid decline token returns expired message")


class TestCountrySpecificFields:
    """Test that country-specific fields are accepted"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ─── Test: Application accepts country-specific fields ───
    def test_apply_accepts_country_fields(self):
        """POST /api/operator-listings/apply should accept country-specific fields"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        # Test payload with all country-specific fields
        payload = {
            "country": "Thailand",
            "city": "Phuket",
            "address": "123 Beach Road",
            "business_name": f"TEST_Thai_Dive_{uuid.uuid4().hex[:6]}",
            "business_type": "dive_center",
            "registration_number": "0105512345678",  # Thai DBD format
            "years_in_business": 5,
            "num_employees": 10,
            "certifications": ["PADI", "SSI"],
            "website": "https://example.com",
            "contact_email": "test@example.com",
            "contact_phone": "+66812345678",
            "description": "Test dive center in Thailand"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json=payload)
        
        # Should either succeed or fail for duplicate (not for missing fields)
        if resp.status_code == 400:
            response_data = resp.json()
            # Should not fail for missing country-specific fields
            detail = response_data.get("detail", "").lower()
            assert "already submitted" in detail or "application" in detail, f"Unexpected error: {response_data}"
        
        print(f"PASS: Application accepts country-specific fields (status: {resp.status_code})")
    
    # ─── Test: EU countries accept VAT number ───
    def test_eu_country_accepts_vat(self):
        """POST /api/operator-listings/apply should accept VAT for EU countries"""
        data = login_user(self.session, TEST_USER_EMAIL)
        if not data:
            pytest.skip("Could not login")
        
        payload = {
            "country": "Germany",
            "city": "Berlin",
            "business_name": f"TEST_German_Dive_{uuid.uuid4().hex[:6]}",
            "business_type": "dive_center",
            "registration_number": "DE123456789",  # German VAT format
        }
        
        resp = self.session.post(f"{BASE_URL}/api/operator-listings/apply", json=payload)
        
        # Should either succeed or fail for duplicate
        if resp.status_code == 400:
            response_data = resp.json()
            detail = response_data.get("detail", "").lower()
            # Should not fail for VAT-related issues
            assert "vat" not in detail or "already" in detail, f"Unexpected VAT error: {response_data}"
        
        print(f"PASS: EU countries accept VAT number (status: {resp.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
