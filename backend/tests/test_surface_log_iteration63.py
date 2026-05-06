"""
Surface Log API Tests - Iteration 63
Tests for Surface Log (Dive Day Journals) feature:
- GET /api/surface-log - User's own surface logs (auth)
- GET /api/surface-log/feed - Surface logs from connections (auth)
- POST /api/surface-log/generate - Auto-generate log from dive date (auth)
- GET /api/surface-log/{logId} - Single log (public)
- POST /api/surface-log/{logId}/react - Toggle reaction (auth)
- GET /api/surface-log/{logId}/comments - Get comments (public)
- POST /api/surface-log/{logId}/comment - Add comment (auth)
- GET /api/surface-log/dates/available - Dates with dives but no log (auth)
- GET /api/surface-log/user/{userId} - User's public logs for profile
- Regression: Products API returns 16 products
- Regression: Species common endpoint returns 30 species
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"
TEST_USER_ID = "0c4b55e1-6c18-4155-887f-1ad4b7167e69"


class TestSurfaceLogAPIs:
    """Surface Log endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token using email/phone OTP login flow"""
        # Verify email OTP
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_EMAIL,
            "code": TEST_OTP
        })
        if email_verify.status_code != 200:
            pytest.skip(f"Email OTP verification failed: {email_verify.status_code}")
        email_token = email_verify.json().get("verification_token")
        
        # Verify phone OTP
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_PHONE,
            "code": TEST_OTP
        })
        if phone_verify.status_code != 200:
            pytest.skip(f"Phone OTP verification failed: {phone_verify.status_code}")
        phone_token = phone_verify.json().get("verification_token")
        
        # Complete login
        login_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No token received from login")
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Auth headers for requests"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    # ====== SURFACE LOG - GET MY LOGS ======
    def test_get_my_surface_logs_requires_auth(self):
        """GET /api/surface-log requires authentication"""
        r = requests.get(f"{BASE_URL}/api/surface-log")
        assert r.status_code == 401 or r.status_code == 403
    
    def test_get_my_surface_logs(self, auth_headers):
        """GET /api/surface-log returns user's surface logs"""
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data
        assert isinstance(data["logs"], list)
        print(f"User has {len(data['logs'])} surface logs")
    
    # ====== SURFACE LOG - GET FEED ======
    def test_get_surface_log_feed_requires_auth(self):
        """GET /api/surface-log/feed requires authentication"""
        r = requests.get(f"{BASE_URL}/api/surface-log/feed")
        assert r.status_code == 401 or r.status_code == 403
    
    def test_get_surface_log_feed(self, auth_headers):
        """GET /api/surface-log/feed returns logs from connections"""
        r = requests.get(f"{BASE_URL}/api/surface-log/feed", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data
        assert isinstance(data["logs"], list)
        assert "has_more" in data
        print(f"Feed has {len(data['logs'])} surface logs")
    
    # ====== SURFACE LOG - GET AVAILABLE DATES ======
    def test_get_available_dates_requires_auth(self):
        """GET /api/surface-log/dates/available requires authentication"""
        r = requests.get(f"{BASE_URL}/api/surface-log/dates/available")
        assert r.status_code == 401 or r.status_code == 403
    
    def test_get_available_dates(self, auth_headers):
        """GET /api/surface-log/dates/available returns dates with dives but no log"""
        r = requests.get(f"{BASE_URL}/api/surface-log/dates/available", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "dates" in data
        assert isinstance(data["dates"], list)
        print(f"Available dates for surface log: {len(data['dates'])}")
        if data["dates"]:
            # Validate date structure
            date_item = data["dates"][0]
            assert "date" in date_item
            assert "dive_count" in date_item
            print(f"First available date: {date_item['date']} with {date_item['dive_count']} dive(s)")
        
    
    # ====== SURFACE LOG - GENERATE ======
    def test_generate_surface_log_requires_auth(self):
        """POST /api/surface-log/generate requires authentication"""
        r = requests.post(f"{BASE_URL}/api/surface-log/generate", json={"date": "2024-01-15"})
        assert r.status_code == 401 or r.status_code == 403
    
    def test_generate_surface_log_requires_date(self, auth_headers):
        """POST /api/surface-log/generate requires date parameter"""
        r = requests.post(f"{BASE_URL}/api/surface-log/generate", json={}, headers=auth_headers)
        assert r.status_code == 400
        assert "Date required" in r.text or "date" in r.text.lower()
    
    def test_generate_surface_log_invalid_date(self, auth_headers):
        """POST /api/surface-log/generate returns 404 for date with no dives"""
        r = requests.post(f"{BASE_URL}/api/surface-log/generate", 
                         json={"date": "1990-01-01"}, headers=auth_headers)
        assert r.status_code == 404
        assert "No dives found" in r.text
    
    def test_generate_surface_log(self, auth_headers):
        """POST /api/surface-log/generate creates a surface log from dive date"""
        # First get available dates
        r = requests.get(f"{BASE_URL}/api/surface-log/dates/available", headers=auth_headers)
        dates = r.json().get("dates", [])
        
        if not dates:
            pytest.skip("No available dates for surface log generation")
        
        test_date = dates[0]["date"]
        print(f"Generating surface log for date: {test_date}")
        
        r = requests.post(f"{BASE_URL}/api/surface-log/generate", 
                         json={
                             "date": test_date,
                             "mood": "stoked",
                             "highlight": "Test highlight from pytest",
                             "caption": "Test caption from automated testing"
                         }, headers=auth_headers)
        assert r.status_code == 200, f"Generate failed: {r.text}"
        
        data = r.json()
        assert "id" in data
        assert data["date"] == test_date
        assert data["user_id"] == TEST_USER_ID
        assert "dive_count" in data
        assert "max_depth" in data
        assert "total_time" in data
        assert "sites" in data
        assert "species" in data
        assert "profiles" in data
        assert data["mood"] == "stoked"
        assert data["highlight"] == "Test highlight from pytest"
        assert data["caption"] == "Test caption from automated testing"
        print(f"Generated surface log: {data['id']} with {data['dive_count']} dives, max depth {data['max_depth']}m")
        
        
    
    # ====== SURFACE LOG - GET SINGLE LOG ======
    def test_get_single_surface_log_not_found(self):
        """GET /api/surface-log/{logId} returns 404 for invalid ID"""
        r = requests.get(f"{BASE_URL}/api/surface-log/invalid-id-12345")
        assert r.status_code == 404
    
    def test_get_single_surface_log(self, auth_headers):
        """GET /api/surface-log/{logId} returns a single log (public)"""
        # First get user's logs
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to fetch")
        
        log_id = logs[0]["id"]
        
        # Fetch without auth (public endpoint)
        r = requests.get(f"{BASE_URL}/api/surface-log/{log_id}")
        assert r.status_code == 200
        
        data = r.json()
        assert data["id"] == log_id
        assert "user_id" in data
        assert "date" in data
        assert "dive_count" in data
        print(f"Fetched surface log: {data['date']} with {data['dive_count']} dives")
    
    # ====== SURFACE LOG - REACTIONS ======
    def test_react_to_surface_log_requires_auth(self):
        """POST /api/surface-log/{logId}/react requires authentication"""
        r = requests.post(f"{BASE_URL}/api/surface-log/some-id/react", json={"reaction": "stoke"})
        assert r.status_code == 401 or r.status_code == 403
    
    def test_react_to_surface_log_invalid_reaction(self, auth_headers):
        """POST /api/surface-log/{logId}/react rejects invalid reaction"""
        # First get a log
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to react to")
        
        log_id = logs[0]["id"]
        r = requests.post(f"{BASE_URL}/api/surface-log/{log_id}/react", 
                         json={"reaction": "invalid"}, headers=auth_headers)
        assert r.status_code == 400
    
    def test_react_to_surface_log(self, auth_headers):
        """POST /api/surface-log/{logId}/react toggles reaction"""
        # First get a log
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to react to")
        
        log_id = logs[0]["id"]
        
        # React with "stoke"
        r = requests.post(f"{BASE_URL}/api/surface-log/{log_id}/react", 
                         json={"reaction": "stoke"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "reacted" in data
        
        if data["reacted"]:
            assert data.get("reaction") == "stoke"
            print("Added stoke reaction")
        else:
            print("Removed stoke reaction (toggle)")
    
    # ====== SURFACE LOG - COMMENTS ======
    def test_get_comments_public(self, auth_headers):
        """GET /api/surface-log/{logId}/comments is public"""
        # First get a log
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to get comments from")
        
        log_id = logs[0]["id"]
        
        # Fetch comments without auth
        r = requests.get(f"{BASE_URL}/api/surface-log/{log_id}/comments")
        assert r.status_code == 200
        data = r.json()
        assert "comments" in data
        assert isinstance(data["comments"], list)
        print(f"Log has {len(data['comments'])} comments")
    
    def test_add_comment_requires_auth(self):
        """POST /api/surface-log/{logId}/comment requires authentication"""
        r = requests.post(f"{BASE_URL}/api/surface-log/some-id/comment", json={"text": "test"})
        assert r.status_code == 401 or r.status_code == 403
    
    def test_add_comment_requires_text(self, auth_headers):
        """POST /api/surface-log/{logId}/comment requires text"""
        # First get a log
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to comment on")
        
        log_id = logs[0]["id"]
        
        r = requests.post(f"{BASE_URL}/api/surface-log/{log_id}/comment", 
                         json={"text": ""}, headers=auth_headers)
        assert r.status_code == 400
    
    def test_add_comment_to_surface_log(self, auth_headers):
        """POST /api/surface-log/{logId}/comment adds a comment"""
        # First get a log
        r = requests.get(f"{BASE_URL}/api/surface-log", headers=auth_headers)
        logs = r.json().get("logs", [])
        
        if not logs:
            pytest.skip("No surface logs to comment on")
        
        log_id = logs[0]["id"]
        
        r = requests.post(f"{BASE_URL}/api/surface-log/{log_id}/comment", 
                         json={"text": "Test comment from pytest"}, headers=auth_headers)
        assert r.status_code == 200
        
        data = r.json()
        assert "id" in data
        assert data["text"] == "Test comment from pytest"
        assert data["log_id"] == log_id
        assert "user_name" in data
        print(f"Added comment: {data['id']}")
    
    # ====== SURFACE LOG - USER PROFILE ======
    def test_get_user_surface_logs_public(self):
        """GET /api/surface-log/user/{userId} returns public logs for profile"""
        r = requests.get(f"{BASE_URL}/api/surface-log/user/{TEST_USER_ID}")
        assert r.status_code == 200
        data = r.json()
        assert "logs" in data
        assert isinstance(data["logs"], list)
        print(f"User profile has {len(data['logs'])} public surface logs")
    
    # ====== REGRESSION - PRODUCTS ======
    def test_regression_products_api(self):
        """Regression: Products API returns 16 products"""
        r = requests.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        data = r.json()
        products = data.get("products", [])
        assert len(products) == 16, f"Expected 16 products, got {len(products)}"
        print(f"Regression passed: {len(products)} products returned")
    
    # ====== REGRESSION - SPECIES ======
    def test_regression_species_common(self):
        """Regression: Species common endpoint returns 30 species"""
        r = requests.get(f"{BASE_URL}/api/species/common")
        assert r.status_code == 200
        data = r.json()
        species = data.get("species", [])
        assert len(species) == 30, f"Expected 30 species, got {len(species)}"
        print(f"Regression passed: {len(species)} common species returned")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
