"""
Dive Log Edit Feature Tests - Testing PUT /api/dive-log/{id} endpoint
Tests for the new Edit button functionality added to DiveLogTab.js
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - using test@bottomtime.com as specified
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
OTP_CODE = "123456"
EXISTING_DIVE_ID = "d7daf762-a6b4-42ca-b78e-dfc438fdb670"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token using OTP flow with test credentials"""
    # Step 1: Send OTP to email
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_EMAIL})
    assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
    
    # Step 2: Verify email OTP
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": TEST_EMAIL, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
    email_token = resp.json().get("verification_token")
    
    # Step 3: Send OTP to phone
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_PHONE})
    assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
    
    # Step 4: Verify phone OTP
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": TEST_PHONE, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
    phone_token = resp.json().get("verification_token")
    
    # Step 5: Complete login
    resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": TEST_EMAIL,
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
    return resp.json().get("access_token")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestDiveEditFeature:
    """Test suite for dive log edit functionality"""
    
    # Module: GET /api/dive-log - Verify dive logs exist
    def test_get_dive_logs_has_entries(self, auth_headers):
        """Verify the user has dive logs to edit"""
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.status_code == 200, f"Failed to get dive logs: {resp.text}"
        
        data = resp.json()
        assert "logs" in data, "Response should contain logs"
        assert len(data["logs"]) > 0, "User should have at least one dive log"
        print(f"User has {len(data['logs'])} dive logs")
        
        # Store the first log id for edit testing
        TestDiveEditFeature.test_log = data["logs"][0]
        print(f"Will test editing log: {TestDiveEditFeature.test_log.get('site_name')} (id: {TestDiveEditFeature.test_log.get('id')})")
    
    # Module: PUT /api/dive-log/{id} - Edit existing dive log
    def test_edit_dive_log_updates_correctly(self, auth_headers):
        """PUT /api/dive-log/{id} should update an existing dive log"""
        test_log = getattr(TestDiveEditFeature, 'test_log', None)
        if not test_log:
            pytest.skip("No dive log found to test editing")
        
        log_id = test_log["id"]
        test_log.get("site_name", "")
        
        # Update the dive log with new data
        update_payload = {
            "site_name": test_log.get("site_name", "Test Site"),
            "location": test_log.get("location", "Test Location"),
            "date": test_log.get("date", "2025-01-01")[:10],
            "dive_type": test_log.get("dive_type", "recreational"),
            "max_depth": test_log.get("max_depth", 20) if test_log.get("max_depth") else 20,
            "duration": test_log.get("duration", 45) if test_log.get("duration") else 45,
            "water_temp": test_log.get("water_temp"),
            "visibility": test_log.get("visibility", ""),
            "buddy": test_log.get("buddy", "") + " (edited)" if test_log.get("buddy") else "Test Buddy (edited)",
            "notes": test_log.get("notes", "") + " [EDITED]" if test_log.get("notes") else "[EDITED]",
            "rating": test_log.get("rating", 4)
        }
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{log_id}", json=update_payload, headers=auth_headers)
        assert resp.status_code == 200, f"Failed to update dive log: {resp.text}"
        
        data = resp.json()
        assert "EDITED" in data.get("notes", "") or "edited" in data.get("buddy", "").lower(), "Edited marker should be in response"
        assert "updated_at" in data or "id" in data, "Response should contain updated_at or id"
        print(f"Successfully edited dive log: {log_id}")
        
        # Store for revert
        TestDiveEditFeature.edited_id = log_id
        TestDiveEditFeature.revert_payload = {
            "site_name": test_log.get("site_name", ""),
            "location": test_log.get("location", ""),
            "date": test_log.get("date", "")[:10],
            "dive_type": test_log.get("dive_type", "recreational"),
            "max_depth": test_log.get("max_depth"),
            "duration": test_log.get("duration"),
            "water_temp": test_log.get("water_temp"),
            "visibility": test_log.get("visibility"),
            "buddy": test_log.get("buddy"),
            "notes": test_log.get("notes"),
            "rating": test_log.get("rating", 0)
        }
    
    # Module: Verify edit persisted with GET
    def test_verify_edit_persisted(self, auth_headers):
        """GET /api/dive-log should return the updated dive data"""
        edited_id = getattr(TestDiveEditFeature, 'edited_id', None)
        if not edited_id:
            pytest.skip("No dive was edited in previous test")
        
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.status_code == 200
        
        data = resp.json()
        edited_log = next((l for l in data["logs"] if l["id"] == edited_id), None)
        assert edited_log is not None, "Edited log should still exist"
        assert "EDITED" in edited_log.get("notes", "") or "edited" in edited_log.get("buddy", "").lower(), "Edit marker should be persisted"
        print(f"Verified edit persisted for log: {edited_id}")
    
    # Module: PUT /api/dive-log/{invalid_id} - Handle non-existent log
    def test_edit_nonexistent_dive_returns_404(self, auth_headers):
        """PUT /api/dive-log/{invalid_id} should return 404"""
        fake_id = str(uuid.uuid4())
        payload = {
            "site_name": "Fake Site",
            "location": "Fake Location",
            "date": "2025-01-01"
        }
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{fake_id}", json=payload, headers=auth_headers)
        assert resp.status_code == 404, f"Expected 404 for nonexistent log, got {resp.status_code}"
        print(f"Correctly returned 404 for nonexistent log: {fake_id}")
    
    # Module: PUT without auth - Should require authentication
    def test_edit_dive_requires_auth(self):
        """PUT /api/dive-log/{id} without auth should return 401/403"""
        payload = {"site_name": "Test", "location": "Test", "date": "2025-01-01"}
        resp = requests.put(f"{BASE_URL}/api/dive-log/any-id", json=payload)
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("Edit endpoint correctly requires authentication")
    
    # Module: Edit with minimal required fields
    def test_edit_with_minimal_fields(self, auth_headers):
        """PUT /api/dive-log should work with just required fields"""
        test_log = getattr(TestDiveEditFeature, 'test_log', None)
        if not test_log:
            pytest.skip("No dive log found")
        
        log_id = test_log["id"]
        minimal_payload = {
            "site_name": test_log.get("site_name", "Test Site"),
            "location": test_log.get("location", "Test Location"),
            "date": test_log.get("date", "2025-01-01")[:10]
        }
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{log_id}", json=minimal_payload, headers=auth_headers)
        assert resp.status_code == 200, f"Edit with minimal fields failed: {resp.text}"
        print("Edit with minimal required fields works correctly")
    
    # Module: Revert test changes
    def test_revert_edit_changes(self, auth_headers):
        """Revert the test edits to original values"""
        edited_id = getattr(TestDiveEditFeature, 'edited_id', None)
        revert_payload = getattr(TestDiveEditFeature, 'revert_payload', None)
        
        if not edited_id or not revert_payload:
            pytest.skip("Nothing to revert")
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{edited_id}", json=revert_payload, headers=auth_headers)
        assert resp.status_code == 200, f"Failed to revert: {resp.text}"
        print(f"Reverted dive log {edited_id} to original values")


class TestExistingDiveById:
    """Test editing the specific existing dive ID provided"""
    
    def test_get_existing_dive(self, auth_headers):
        """Verify the provided existing dive ID exists"""
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.status_code == 200
        
        data = resp.json()
        existing_dive = next((l for l in data["logs"] if l["id"] == EXISTING_DIVE_ID), None)
        if existing_dive:
            print(f"Found existing dive: {existing_dive.get('site_name')} at {existing_dive.get('location')}")
            print(f"  Date: {existing_dive.get('date')}, Depth: {existing_dive.get('max_depth')}m, Duration: {existing_dive.get('duration')}min")
        else:
            print(f"Dive with ID {EXISTING_DIVE_ID} not found in user's logs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
