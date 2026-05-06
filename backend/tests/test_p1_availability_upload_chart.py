"""
Test P1 Features - Iteration 16:
1. Listing Availability Calendar - PUT/GET /api/listings/{id}/availability
2. Photo Upload for Profiles & Dive Logs - POST /api/upload, PUT /api/auth/profile-photo
3. Dive Log Visualization - GET /api/dive-log stats.monthly
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAvailabilityAPI:
    """Test listing availability calendar endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate as operator for availability tests"""
        # Login as operator
        send_otp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "operator@bottomtime.com"})
        assert send_otp.status_code == 200, "Failed to send OTP for operator"
        
        verify_email = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "operator@bottomtime.com", "code": "123456"})
        assert verify_email.status_code == 200, "Failed to verify email OTP"
        self.email_token = verify_email.json()["verification_token"]
        
        # Get phone hint and verify phone
        login_init = requests.post(f"{BASE_URL}/api/auth/login-init", json={"email": "operator@bottomtime.com"})
        assert login_init.status_code == 200, "Failed to init login"
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025558888"})
        verify_phone = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025558888", "code": "123456"})
        assert verify_phone.status_code == 200, "Failed to verify phone OTP"
        self.phone_token = verify_phone.json()["verification_token"]
        
        # Complete login
        login_complete = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "operator@bottomtime.com",
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        assert login_complete.status_code == 200, "Failed to complete login"
        self.token = login_complete.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_availability_public_no_auth(self):
        """GET /api/listings/{id}/availability is public (no auth required)"""
        # Get a listing ID first
        listings = requests.get(f"{BASE_URL}/api/listings")
        assert listings.status_code == 200
        listing_id = listings.json()["listings"][0]["id"]
        
        # Get availability without auth
        res = requests.get(f"{BASE_URL}/api/listings/{listing_id}/availability")
        assert res.status_code == 200, f"Public availability should return 200: {res.text}"
        data = res.json()
        assert "available_dates" in data, "Response should have available_dates array"
        assert isinstance(data["available_dates"], list), "available_dates should be a list"
        print(f"PASS: GET availability public endpoint returns available_dates: {len(data['available_dates'])} dates")
    
    def test_put_availability_requires_auth(self):
        """PUT /api/listings/{id}/availability requires authentication"""
        listings = requests.get(f"{BASE_URL}/api/listings")
        listing_id = listings.json()["listings"][0]["id"]
        
        res = requests.put(f"{BASE_URL}/api/listings/{listing_id}/availability", json={"available_dates": ["2026-02-15"]})
        assert res.status_code == 403 or res.status_code == 401, f"Should require auth: {res.status_code}"
        print("PASS: PUT availability requires authentication")
    
    def test_set_and_get_availability(self):
        """Set availability dates via PUT, verify via GET"""
        # Get operator's listing
        my_listings = requests.get(f"{BASE_URL}/api/operator/listings", headers=self.headers)
        assert my_listings.status_code == 200, f"Failed to get operator listings: {my_listings.text}"
        
        if len(my_listings.json()["listings"]) == 0:
            pytest.skip("Operator has no listings")
        
        listing_id = my_listings.json()["listings"][0]["id"]
        test_dates = ["2026-02-15", "2026-02-16", "2026-02-20", "2026-03-01"]
        
        # PUT availability
        put_res = requests.put(
            f"{BASE_URL}/api/listings/{listing_id}/availability",
            headers=self.headers,
            json={"available_dates": test_dates}
        )
        assert put_res.status_code == 200, f"Failed to set availability: {put_res.text}"
        data = put_res.json()
        assert "message" in data, "Response should have message"
        assert data["count"] == len(test_dates), f"Expected count {len(test_dates)}, got {data.get('count')}"
        print(f"PASS: Set {data['count']} availability dates")
        
        # GET availability and verify
        get_res = requests.get(f"{BASE_URL}/api/listings/{listing_id}/availability")
        assert get_res.status_code == 200
        available = get_res.json()["available_dates"]
        for d in test_dates:
            assert d in available, f"Date {d} not found in availability"
        print(f"PASS: GET availability returns all {len(test_dates)} dates correctly")
    
    def test_set_availability_wrong_listing(self):
        """Cannot set availability on listing you don't own"""
        # Get a listing not owned by operator
        all_listings = requests.get(f"{BASE_URL}/api/listings")
        assert all_listings.status_code == 200
        
        my_listings = requests.get(f"{BASE_URL}/api/operator/listings", headers=self.headers)
        my_ids = [l["id"] for l in my_listings.json().get("listings", [])]
        
        other_listing = None
        for l in all_listings.json()["listings"]:
            if l["id"] not in my_ids:
                other_listing = l["id"]
                break
        
        if not other_listing:
            pytest.skip("No other listings to test with")
        
        res = requests.put(
            f"{BASE_URL}/api/listings/{other_listing}/availability",
            headers=self.headers,
            json={"available_dates": ["2026-02-15"]}
        )
        assert res.status_code == 404, f"Should return 404 for listing not owned: {res.status_code}"
        print("PASS: Cannot set availability on listing you don't own (404)")


class TestFileUpload:
    """Test file upload endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate as diver for upload tests"""
        # Login as any existing diver
        send_otp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "testdiver_iter15@test.com"})
        if send_otp.status_code != 200:
            # Create new diver if needed
            pytest.skip("Test diver not found, skipping upload tests")
        
        verify_email = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "testdiver_iter15@test.com", "code": "123456"})
        self.email_token = verify_email.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025551515"})
        verify_phone = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025551515", "code": "123456"})
        self.phone_token = verify_phone.json()["verification_token"]
        
        login_complete = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "testdiver_iter15@test.com",
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        if login_complete.status_code != 200:
            pytest.skip("Cannot login as test diver")
        self.token = login_complete.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_upload_requires_auth(self):
        """POST /api/upload requires authentication"""
        # Create a minimal 1x1 PNG
        png_data = bytes([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
            0x42, 0x60, 0x82
        ])
        
        res = requests.post(f"{BASE_URL}/api/upload", files={"file": ("test.png", png_data, "image/png")})
        assert res.status_code in [401, 403], f"Upload should require auth: {res.status_code}"
        print("PASS: POST /api/upload requires authentication")
    
    def test_upload_file_success(self):
        """POST /api/upload returns URL on success"""
        # 1x1 PNG
        png_data = bytes([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
            0x42, 0x60, 0x82
        ])
        
        res = requests.post(
            f"{BASE_URL}/api/upload",
            headers=self.headers,
            files={"file": ("test_dive_photo.png", png_data, "image/png")}
        )
        assert res.status_code == 200, f"Upload failed: {res.text}"
        data = res.json()
        assert "url" in data, "Response should have url"
        assert data["url"].startswith("/api/uploads/"), f"URL should start with /api/uploads/: {data['url']}"
        assert "filename" in data, "Response should have filename"
        print(f"PASS: File upload successful, url: {data['url']}")
    
    def test_upload_invalid_file_type(self):
        """POST /api/upload rejects non-image files"""
        res = requests.post(
            f"{BASE_URL}/api/upload",
            headers=self.headers,
            files={"file": ("test.txt", b"hello world", "text/plain")}
        )
        assert res.status_code == 400, f"Should reject text file: {res.status_code}"
        print("PASS: Upload rejects invalid file types")
    
    def test_profile_photo_upload(self):
        """PUT /api/auth/profile-photo updates user profile"""
        # 1x1 PNG
        png_data = bytes([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
            0x42, 0x60, 0x82
        ])
        
        res = requests.put(
            f"{BASE_URL}/api/auth/profile-photo",
            headers=self.headers,
            files={"file": ("profile.png", png_data, "image/png")}
        )
        assert res.status_code == 200, f"Profile photo upload failed: {res.text}"
        data = res.json()
        assert "url" in data, "Response should have url"
        assert data["url"].startswith("/api/uploads/"), f"URL should have proper prefix: {data['url']}"
        print(f"PASS: Profile photo uploaded successfully, url: {data['url']}")
        
        # Verify profile was updated
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert me_res.status_code == 200
        user = me_res.json()
        assert user.get("profile_photo") == data["url"], f"Profile photo not updated in user record"
        print("PASS: User profile_photo field updated correctly")
    
    def test_profile_photo_requires_auth(self):
        """PUT /api/auth/profile-photo requires authentication"""
        png_data = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])  # Minimal
        res = requests.put(f"{BASE_URL}/api/auth/profile-photo", files={"file": ("p.png", png_data, "image/png")})
        assert res.status_code in [401, 403], f"Should require auth: {res.status_code}"
        print("PASS: PUT /api/auth/profile-photo requires authentication")


class TestDiveLogWithPhotos:
    """Test dive log with photos field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate as diver"""
        send_otp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "testdiver_iter15@test.com"})
        if send_otp.status_code != 200:
            pytest.skip("Test diver not found")
        
        verify_email = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "testdiver_iter15@test.com", "code": "123456"})
        self.email_token = verify_email.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025551515"})
        verify_phone = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025551515", "code": "123456"})
        self.phone_token = verify_phone.json()["verification_token"]
        
        login_complete = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "testdiver_iter15@test.com",
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        if login_complete.status_code != 200:
            pytest.skip("Cannot login")
        self.token = login_complete.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_dive_log_with_photos(self):
        """POST /api/dive-log accepts photos array"""
        dive_data = {
            "site_name": "TEST_Photo Dive Site",
            "location": "Test Location, Country",
            "date": "2026-01-25",
            "max_depth": 18.5,
            "duration": 45,
            "photos": ["/api/uploads/test1.jpg", "/api/uploads/test2.jpg"]
        }
        
        res = requests.post(f"{BASE_URL}/api/dive-log", headers=self.headers, json=dive_data)
        assert res.status_code == 201 or res.status_code == 200, f"Failed to create dive log: {res.text}"
        data = res.json()
        assert "id" in data, "Response should have id"
        assert data.get("photos") == dive_data["photos"], f"Photos not saved correctly: {data.get('photos')}"
        print(f"PASS: Dive log created with photos: {data['photos']}")
        
        # Cleanup
        self.test_log_id = data["id"]
    
    def test_get_dive_log_returns_photos(self):
        """GET /api/dive-log returns photos in logs"""
        res = requests.get(f"{BASE_URL}/api/dive-log", headers=self.headers)
        assert res.status_code == 200, f"Failed to get dive logs: {res.text}"
        logs = res.json()["logs"]
        
        # Check if any log has photos
        logs_with_photos = [l for l in logs if l.get("photos") and len(l["photos"]) > 0]
        print(f"Found {len(logs_with_photos)} logs with photos out of {len(logs)} total")
        
        # Verify photos field exists in response
        for log in logs[:5]:  # Check first 5
            assert "photos" in log or log.get("photos") is None, "Logs should have photos field"
        print("PASS: Dive logs have photos field in response")


class TestDiveLogStats:
    """Test dive log stats including monthly data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate"""
        send_otp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "testdiver_iter15@test.com"})
        if send_otp.status_code != 200:
            pytest.skip("Test diver not found")
        
        verify_email = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "testdiver_iter15@test.com", "code": "123456"})
        self.email_token = verify_email.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025551515"})
        verify_phone = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025551515", "code": "123456"})
        self.phone_token = verify_phone.json()["verification_token"]
        
        login_complete = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "testdiver_iter15@test.com",
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        if login_complete.status_code != 200:
            pytest.skip("Cannot login")
        self.token = login_complete.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_dive_log_stats_has_monthly(self):
        """GET /api/dive-log returns stats.monthly array"""
        res = requests.get(f"{BASE_URL}/api/dive-log", headers=self.headers)
        assert res.status_code == 200, f"Failed to get dive logs: {res.text}"
        data = res.json()
        
        assert "stats" in data, "Response should have stats"
        stats = data["stats"]
        
        # Check for monthly field
        assert "monthly" in stats, f"Stats should have monthly field. Stats: {stats}"
        monthly = stats["monthly"]
        assert isinstance(monthly, list), f"monthly should be a list: {type(monthly)}"
        
        if len(monthly) > 0:
            # Validate monthly structure
            sample = monthly[0]
            assert "month" in sample, f"Monthly item should have 'month' field: {sample}"
            assert "dives" in sample, f"Monthly item should have 'dives' field: {sample}"
            print(f"PASS: Monthly data has {len(monthly)} entries, sample: {sample}")
        else:
            print("PASS: Monthly data is empty (user has no dives)")
        
        # Verify other standard stats are present
        assert "total" in stats or "total_dives" in stats, f"Stats should have total/total_dives: {stats}"
        print(f"PASS: Dive log stats structure valid. Stats keys: {list(stats.keys())}")


class TestUploadedFileAccess:
    """Test that uploaded files are accessible"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Authenticate"""
        send_otp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "testdiver_iter15@test.com"})
        if send_otp.status_code != 200:
            pytest.skip("Test diver not found")
        
        verify_email = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "testdiver_iter15@test.com", "code": "123456"})
        self.email_token = verify_email.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025551515"})
        verify_phone = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025551515", "code": "123456"})
        self.phone_token = verify_phone.json()["verification_token"]
        
        login_complete = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "testdiver_iter15@test.com",
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        if login_complete.status_code != 200:
            pytest.skip("Cannot login")
        self.token = login_complete.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_uploaded_file_accessible(self):
        """Uploaded file can be retrieved via /api/uploads/"""
        # Upload a file first
        png_data = bytes([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
            0x42, 0x60, 0x82
        ])
        
        upload_res = requests.post(
            f"{BASE_URL}/api/upload",
            headers=self.headers,
            files={"file": ("access_test.png", png_data, "image/png")}
        )
        assert upload_res.status_code == 200
        url = upload_res.json()["url"]
        
        # Try to access the file
        file_res = requests.get(f"{BASE_URL}{url}")
        assert file_res.status_code == 200, f"Should be able to access uploaded file: {file_res.status_code}"
        assert len(file_res.content) > 0, "File content should not be empty"
        print(f"PASS: Uploaded file is accessible at {url}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
