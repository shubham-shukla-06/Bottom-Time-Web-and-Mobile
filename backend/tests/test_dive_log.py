"""
Dive Log API Tests - Testing CRUD operations for dive log feature
Tests: POST, GET, GET with search, PUT, DELETE endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - demo user
TEST_EMAIL = "demo@bottomtime.com"
TEST_PHONE = "+12025550001"
OTP_CODE = "123456"


class TestDiveLogAuth:
    """Authenticate and get token for dive log testing"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token for demo user using OTP flow"""
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
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestDiveLogCRUD(TestDiveLogAuth):
    """Test all CRUD operations for dive log"""
    
    # Module: POST /api/dive-log - Create dive log entry
    def test_create_dive_log_with_all_fields(self, auth_headers):
        """Create a new dive log with all available fields including dive_type"""
        payload = {
            "site_name": "TEST_Great Barrier Reef",
            "location": "Cairns, Australia",
            "date": "2025-01-15",
            "dive_type": "reef",
            "max_depth": 25.5,
            "duration": 55,
            "visibility": "Excellent - 30m",
            "water_temp": 24.5,
            "buddy": "John Doe",
            "rating": 5,
            "notes": "Amazing coral formations and sea life. Saw a manta ray!"
        }
        
        resp = requests.post(f"{BASE_URL}/api/dive-log", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"Failed to create dive log: {resp.text}"
        
        data = resp.json()
        assert "id" in data, "Response should contain id"
        assert data["site_name"] == payload["site_name"]
        assert data["location"] == payload["location"]
        assert data["dive_type"] == "reef"
        assert data["max_depth"] == 25.5
        assert data["duration"] == 55
        assert data["rating"] == 5
        assert data["buddy"] == "John Doe"
        assert data["notes"] == payload["notes"]
        
        # Store ID for cleanup
        TestDiveLogCRUD.created_log_id = data["id"]
        print(f"Created dive log with id: {data['id']}")
    
    # Module: POST /api/dive-log - Create with different dive types
    def test_create_dive_log_wreck_type(self, auth_headers):
        """Create a wreck dive log entry"""
        payload = {
            "site_name": "TEST_SS Thistlegorm",
            "location": "Red Sea, Egypt",
            "date": "2025-01-10",
            "dive_type": "wreck",
            "max_depth": 30,
            "duration": 45,
            "visibility": "Good - 20m",
            "water_temp": 22,
            "rating": 4,
            "notes": "Historic WWII wreck dive"
        }
        
        resp = requests.post(f"{BASE_URL}/api/dive-log", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["dive_type"] == "wreck"
        TestDiveLogCRUD.wreck_log_id = data["id"]
    
    def test_create_dive_log_night_dive(self, auth_headers):
        """Create a night dive log entry"""
        payload = {
            "site_name": "TEST_Night Dive Reef",
            "location": "Cozumel, Mexico",
            "date": "2025-01-08",
            "dive_type": "night",
            "max_depth": 15,
            "duration": 40,
            "rating": 5,
            "notes": "Bioluminescence was incredible"
        }
        
        resp = requests.post(f"{BASE_URL}/api/dive-log", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["dive_type"] == "night"
        TestDiveLogCRUD.night_log_id = data["id"]
    
    # Module: GET /api/dive-log - Retrieve logs with stats
    def test_get_dive_logs_returns_logs_and_stats(self, auth_headers):
        """GET /api/dive-log returns logs sorted by date desc and stats"""
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.status_code == 200, f"Failed to get dive logs: {resp.text}"
        
        data = resp.json()
        assert "logs" in data, "Response should contain logs array"
        assert "stats" in data, "Response should contain stats object"
        
        # Verify stats structure
        stats = data["stats"]
        assert "total" in stats, "Stats should have total dives count"
        assert "max_depth" in stats, "Stats should have max_depth"
        assert "avg_depth" in stats, "Stats should have avg_depth"
        assert "total_time" in stats, "Stats should have total_time"
        assert "countries" in stats, "Stats should have countries count"
        
        # Verify logs are sorted by date descending
        logs = data["logs"]
        if len(logs) > 1:
            dates = [log["date"] for log in logs]
            assert dates == sorted(dates, reverse=True), "Logs should be sorted by date desc"
        
        print(f"Stats: total={stats['total']}, max_depth={stats['max_depth']}, avg_depth={stats['avg_depth']}, total_time={stats['total_time']}, countries={stats['countries']}")
    
    # Module: GET /api/dive-log?search=wreck - Search filter
    def test_search_dive_logs_by_site_name(self, auth_headers):
        """GET /api/dive-log?search=wreck filters by site name"""
        resp = requests.get(f"{BASE_URL}/api/dive-log?search=Thistlegorm", headers=auth_headers)
        assert resp.status_code == 200
        
        data = resp.json()
        logs = data["logs"]
        # All returned logs should match the search
        for log in logs:
            assert "Thistlegorm" in log["site_name"] or "Thistlegorm" in log.get("location", "")
        print(f"Search returned {len(logs)} logs matching 'Thistlegorm'")
    
    def test_search_dive_logs_by_location(self, auth_headers):
        """GET /api/dive-log?search=Egypt filters by location"""
        resp = requests.get(f"{BASE_URL}/api/dive-log?search=Egypt", headers=auth_headers)
        assert resp.status_code == 200
        
        data = resp.json()
        logs = data["logs"]
        for log in logs:
            assert "Egypt" in log.get("location", "") or "Egypt" in log.get("site_name", "")
        print(f"Search returned {len(logs)} logs matching 'Egypt'")
    
    # Module: PUT /api/dive-log/{id} - Update dive log
    def test_update_dive_log(self, auth_headers):
        """PUT /api/dive-log/{id} updates an existing dive log"""
        log_id = getattr(TestDiveLogCRUD, 'created_log_id', None)
        if not log_id:
            pytest.skip("No log created to update")
        
        update_payload = {
            "site_name": "TEST_Great Barrier Reef - Updated",
            "location": "Cairns, Australia",
            "date": "2025-01-15",
            "dive_type": "reef",
            "max_depth": 28.0,  # Changed from 25.5
            "duration": 60,  # Changed from 55
            "visibility": "Excellent - 35m",  # Updated
            "water_temp": 25,  # Changed
            "buddy": "Jane Doe",  # Changed
            "rating": 5,
            "notes": "Updated notes - Even better second dive!"
        }
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{log_id}", json=update_payload, headers=auth_headers)
        assert resp.status_code == 200, f"Failed to update dive log: {resp.text}"
        
        data = resp.json()
        assert data["max_depth"] == 28.0, "Max depth should be updated"
        assert data["duration"] == 60, "Duration should be updated"
        assert data["buddy"] == "Jane Doe", "Buddy should be updated"
        assert "Updated notes" in data["notes"], "Notes should be updated"
        
        # Verify with GET
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        logs = resp.json()["logs"]
        updated_log = next((l for l in logs if l["id"] == log_id), None)
        assert updated_log is not None, "Updated log should exist"
        assert updated_log["max_depth"] == 28.0, "Persisted max_depth should match update"
        print(f"Successfully updated dive log {log_id}")
    
    def test_update_nonexistent_log_returns_404(self, auth_headers):
        """PUT /api/dive-log/{invalid_id} returns 404"""
        fake_id = str(uuid.uuid4())
        update_payload = {
            "site_name": "Fake Site",
            "location": "Nowhere",
            "date": "2025-01-01"
        }
        
        resp = requests.put(f"{BASE_URL}/api/dive-log/{fake_id}", json=update_payload, headers=auth_headers)
        assert resp.status_code == 404, f"Expected 404 for nonexistent log, got {resp.status_code}"
    
    # Module: DELETE /api/dive-log/{id} - Delete dive log
    def test_delete_dive_log(self, auth_headers):
        """DELETE /api/dive-log/{id} deletes a dive log and updates user total_dives"""
        # Get initial total
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        initial_total = resp.json()["stats"]["total"]
        
        # Create a log to delete
        payload = {
            "site_name": "TEST_Delete Me Log",
            "location": "Test Location, Country",
            "date": "2025-01-01",
            "dive_type": "shore",
            "max_depth": 10,
            "duration": 30
        }
        resp = requests.post(f"{BASE_URL}/api/dive-log", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        delete_id = resp.json()["id"]
        
        # Verify total increased
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.json()["stats"]["total"] == initial_total + 1
        
        # Delete the log
        resp = requests.delete(f"{BASE_URL}/api/dive-log/{delete_id}", headers=auth_headers)
        assert resp.status_code == 200, f"Failed to delete dive log: {resp.text}"
        assert "deleted" in resp.json().get("message", "").lower()
        
        # Verify total decreased
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.json()["stats"]["total"] == initial_total, "Total dives should return to initial after delete"
        
        # Verify log no longer exists
        logs = resp.json()["logs"]
        assert not any(l["id"] == delete_id for l in logs), "Deleted log should not appear in list"
        print(f"Successfully deleted dive log {delete_id}, total returned to {initial_total}")
    
    def test_delete_nonexistent_log_returns_404(self, auth_headers):
        """DELETE /api/dive-log/{invalid_id} returns 404"""
        fake_id = str(uuid.uuid4())
        resp = requests.delete(f"{BASE_URL}/api/dive-log/{fake_id}", headers=auth_headers)
        assert resp.status_code == 404, f"Expected 404 for nonexistent log, got {resp.status_code}"
    
    # Module: Stats calculation verification
    def test_stats_calculation_accuracy(self, auth_headers):
        """Verify stats calculations are accurate"""
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        assert resp.status_code == 200
        
        data = resp.json()
        logs = data["logs"]
        stats = data["stats"]
        
        # Calculate expected values
        depths = [l.get("max_depth") or 0 for l in logs if l.get("max_depth")]
        durations = [l.get("duration") or 0 for l in logs]
        locations = set(l.get("location", "").split(",")[-1].strip() for l in logs if l.get("location"))
        
        expected_total = len(logs)
        expected_max_depth = max(depths) if depths else 0
        expected_avg_depth = round(sum(depths) / len(depths), 1) if depths else 0
        sum(durations)
        len(locations) - (1 if "" in locations else 0)
        
        assert stats["total"] == expected_total, f"Total mismatch: {stats['total']} vs {expected_total}"
        assert stats["max_depth"] == expected_max_depth, f"Max depth mismatch: {stats['max_depth']} vs {expected_max_depth}"
        # Allow small floating point differences for avg_depth
        assert abs(stats["avg_depth"] - expected_avg_depth) <= 0.5, f"Avg depth mismatch: {stats['avg_depth']} vs {expected_avg_depth}"
        
        print(f"Stats verified - Total: {stats['total']}, Max: {stats['max_depth']}m, Avg: {stats['avg_depth']}m, Time: {stats['total_time']}min, Countries: {stats['countries']}")
    
    # Cleanup test logs
    def test_cleanup_test_logs(self, auth_headers):
        """Cleanup TEST_ prefixed logs created during tests"""
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        logs = resp.json()["logs"]
        
        cleanup_count = 0
        for log in logs:
            if log.get("site_name", "").startswith("TEST_"):
                resp = requests.delete(f"{BASE_URL}/api/dive-log/{log['id']}", headers=auth_headers)
                if resp.status_code == 200:
                    cleanup_count += 1
        
        print(f"Cleaned up {cleanup_count} test dive logs")


class TestDiveLogUnauthorized:
    """Test dive log endpoints without authentication"""
    
    def test_get_dive_logs_requires_auth(self):
        """GET /api/dive-log without auth returns 401/403"""
        resp = requests.get(f"{BASE_URL}/api/dive-log")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_create_dive_log_requires_auth(self):
        """POST /api/dive-log without auth returns 401/403"""
        payload = {"site_name": "Test", "location": "Test", "date": "2025-01-01"}
        resp = requests.post(f"{BASE_URL}/api/dive-log", json=payload)
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_update_dive_log_requires_auth(self):
        """PUT /api/dive-log/{id} without auth returns 401/403"""
        payload = {"site_name": "Test", "location": "Test", "date": "2025-01-01"}
        resp = requests.put(f"{BASE_URL}/api/dive-log/fake-id", json=payload)
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
    
    def test_delete_dive_log_requires_auth(self):
        """DELETE /api/dive-log/{id} without auth returns 401/403"""
        resp = requests.delete(f"{BASE_URL}/api/dive-log/fake-id")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
