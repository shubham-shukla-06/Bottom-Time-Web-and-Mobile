"""
Test Privacy & Data Features - P0 and P1 Implementation
Tests for:
- GET /api/user/download-data - Download user data (GDPR/CCPA/DPDPA compliance)
- DELETE /api/user/delete-account - Delete user account and all data
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPrivacyDataFeatures:
    """Test Privacy & Data endpoints for GDPR/CCPA/DPDPA compliance"""
    
    @pytest.fixture(scope="class")
    def test_user_credentials(self):
        """Generate unique test user credentials"""
        unique_id = uuid.uuid4().hex[:8]
        return {
            "email": f"test_privacy_{unique_id}@test.com",
            "phone": f"+1555{unique_id[:7]}",
            "name": f"Privacy Test User {unique_id}"
        }
    
    @pytest.fixture(scope="class")
    def auth_token(self, test_user_credentials):
        """Create a test user and get auth token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Step 1: Store signup data
        store_resp = session.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": test_user_credentials["email"],
            "name": test_user_credentials["name"],
            "role": "diver"
        })
        assert store_resp.status_code == 200, f"Store signup data failed: {store_resp.text}"
        
        # Step 2: Send OTP to email (mocked - always 123456)
        email_otp_resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": test_user_credentials["email"]
        })
        assert email_otp_resp.status_code == 200, f"Send email OTP failed: {email_otp_resp.text}"
        
        # Step 3: Verify email OTP
        email_verify_resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": test_user_credentials["email"],
            "code": "123456"
        })
        assert email_verify_resp.status_code == 200, f"Verify email OTP failed: {email_verify_resp.text}"
        email_token = email_verify_resp.json()["verification_token"]
        
        # Step 4: Send OTP to phone
        phone_otp_resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": test_user_credentials["phone"]
        })
        assert phone_otp_resp.status_code == 200, f"Send phone OTP failed: {phone_otp_resp.text}"
        
        # Step 5: Verify phone OTP
        phone_verify_resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": test_user_credentials["phone"],
            "code": "123456"
        })
        assert phone_verify_resp.status_code == 200, f"Verify phone OTP failed: {phone_verify_resp.text}"
        phone_token = phone_verify_resp.json()["verification_token"]
        
        # Step 6: Complete signup
        signup_resp = session.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": test_user_credentials["email"],
            "phone": test_user_credentials["phone"],
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert signup_resp.status_code == 200, f"Signup complete failed: {signup_resp.text}"
        
        return signup_resp.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def authenticated_session(self, auth_token):
        """Create authenticated session"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_download_data_requires_auth(self):
        """Test that download-data endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/user/download-data")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: /api/user/download-data requires authentication")
    
    def test_delete_account_requires_auth(self):
        """Test that delete-account endpoint requires authentication"""
        response = requests.delete(f"{BASE_URL}/api/user/delete-account")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: /api/user/delete-account requires authentication")
    
    def test_download_data_returns_user_data(self, authenticated_session, test_user_credentials):
        """Test that download-data returns comprehensive user data"""
        response = authenticated_session.get(f"{BASE_URL}/api/user/download-data")
        assert response.status_code == 200, f"Download data failed: {response.text}"
        
        data = response.json()
        
        # Verify export_info section
        assert "export_info" in data, "Missing export_info section"
        assert "exported_at" in data["export_info"], "Missing exported_at timestamp"
        assert "user_id" in data["export_info"], "Missing user_id in export_info"
        assert "format_version" in data["export_info"], "Missing format_version"
        
        # Verify profile section
        assert "profile" in data, "Missing profile section"
        assert data["profile"]["email"] == test_user_credentials["email"], "Email mismatch in profile"
        assert data["profile"]["name"] == test_user_credentials["name"], "Name mismatch in profile"
        
        # Verify other data sections exist (may be empty for new user)
        expected_sections = ["bookings", "dive_logs", "reviews", "wishlists", "connections", "messages_sent", "notifications", "event_rsvps"]
        for section in expected_sections:
            assert section in data, f"Missing {section} section in downloaded data"
        
        print(f"SUCCESS: Download data returned {len(data)} sections")
        print(f"  - Profile: {data['profile']['email']}")
        print(f"  - Bookings: {len(data.get('bookings', []))} items")
        print(f"  - Dive logs: {len(data.get('dive_logs', []))} items")
        print(f"  - Reviews: {len(data.get('reviews', []))} items")
        print(f"  - Wishlists: {len(data.get('wishlists', []))} items")
        print(f"  - Connections: {len(data.get('connections', []))} items")
        print(f"  - Messages sent: {len(data.get('messages_sent', []))} items")
        print(f"  - Notifications: {len(data.get('notifications', []))} items")
        print(f"  - Event RSVPs: {len(data.get('event_rsvps', []))} items")
    
    def test_download_data_format(self, authenticated_session):
        """Test that downloaded data is in proper JSON format"""
        response = authenticated_session.get(f"{BASE_URL}/api/user/download-data")
        assert response.status_code == 200
        
        # Verify it's valid JSON
        data = response.json()
        assert isinstance(data, dict), "Response should be a JSON object"
        
        # Verify export timestamp is ISO format
        exported_at = data["export_info"]["exported_at"]
        try:
            datetime.fromisoformat(exported_at.replace('Z', '+00:00'))
            print(f"SUCCESS: Export timestamp is valid ISO format: {exported_at}")
        except ValueError:
            pytest.fail(f"Invalid timestamp format: {exported_at}")


class TestDeleteAccountFlow:
    """Test account deletion flow - creates and deletes a separate test user"""
    
    def test_delete_account_flow(self):
        """Test complete account deletion flow"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Create a unique test user for deletion
        unique_id = uuid.uuid4().hex[:8]
        test_email = f"test_delete_{unique_id}@test.com"
        test_phone = f"+1666{unique_id[:7]}"
        test_name = f"Delete Test User {unique_id}"
        
        # Step 1: Store signup data
        store_resp = session.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": test_email,
            "name": test_name,
            "role": "diver"
        })
        assert store_resp.status_code == 200, f"Store signup data failed: {store_resp.text}"
        
        # Step 2: Send and verify email OTP
        session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": test_email})
        email_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": test_email, "code": "123456"
        })
        email_token = email_verify.json()["verification_token"]
        
        # Step 3: Send and verify phone OTP
        session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": test_phone})
        phone_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": test_phone, "code": "123456"
        })
        phone_token = phone_verify.json()["verification_token"]
        
        # Step 4: Complete signup
        signup_resp = session.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": test_email,
            "phone": test_phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert signup_resp.status_code == 200, f"Signup failed: {signup_resp.text}"
        auth_token = signup_resp.json()["access_token"]
        user_id = signup_resp.json()["user"]["id"]
        
        print(f"SUCCESS: Created test user {test_email} with ID {user_id}")
        
        # Step 5: Verify user exists
        session.headers.update({"Authorization": f"Bearer {auth_token}"})
        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200, f"Get me failed: {me_resp.text}"
        assert me_resp.json()["email"] == test_email
        print(f"SUCCESS: Verified user exists via /api/auth/me")
        
        # Step 6: Delete account
        delete_resp = session.delete(f"{BASE_URL}/api/user/delete-account")
        assert delete_resp.status_code == 200, f"Delete account failed: {delete_resp.text}"
        
        delete_data = delete_resp.json()
        assert "message" in delete_data, "Missing message in delete response"
        assert "deleted" in delete_data["message"].lower(), f"Unexpected message: {delete_data['message']}"
        print(f"SUCCESS: Account deleted - {delete_data['message']}")
        
        # Step 7: Verify user no longer exists (token should be invalid)
        me_resp_after = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp_after.status_code == 401, f"Expected 401 after deletion, got {me_resp_after.status_code}"
        print(f"SUCCESS: User no longer accessible after deletion (401 returned)")


class TestPrivacyPolicyContent:
    """Test Privacy Policy page content via API (if available) or verify structure"""
    
    def test_api_health(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/listings?limit=1")
        assert response.status_code == 200, f"API not accessible: {response.status_code}"
        print("SUCCESS: API is accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
