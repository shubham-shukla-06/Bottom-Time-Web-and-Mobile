"""
Comprehensive Test Suite for Advanced Dive Features (dive_advanced.py)
Testing 8 NEW endpoints for Subsurface-like features:
1. POST /api/dive-planner/repetitive - Repetitive dive planning  
2. POST /api/dive-log/{id}/analyze-profile - Enhanced profile analysis
3. POST /api/dive-log/extract-gps - EXIF GPS extraction
4. PUT /api/dive-log/bulk-edit - Bulk dive editing
5. POST /api/dive-log/merge - Multi-computer merge
6. GET /api/dive-log/tags - Tag management
7. GET /api/dive-log/export-pdf - PDF logbook export
8. GET /api/dive-sites/map - Dive sites with GPS for map
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def get_auth_token():
    """Login and get bearer token"""
    try:
        # Send email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "test@bottomtime.com"}, timeout=10)
        # Verify email OTP
        email_resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "test@bottomtime.com", "code": "123456"},
            timeout=10
        )
        email_token = email_resp.json().get("verification_token", "")

        # Send phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+919876543210"}, timeout=10)
        # Verify phone OTP
        phone_resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "+919876543210", "code": "123456"},
            timeout=10
        )
        phone_token = phone_resp.json().get("verification_token", "")

        # Complete login
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login-complete",
            json={
                "email": "test@bottomtime.com",
                "email_verified_token": email_token,
                "phone_verified_token": phone_token,
            },
            timeout=10
        )
        return login_resp.json().get("access_token", "")
    except Exception as e:
        print(f"Auth error: {e}")
        return None


@pytest.fixture(scope="session")
def auth_headers():
    """Session-scoped auth headers"""
    token = get_auth_token()
    if not token:
        pytest.skip("Authentication failed")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ═══════════════════════════════════════════
# REPETITIVE DIVE PLANNING TESTS
# ═══════════════════════════════════════════

class TestRepetitiveDivePlanning:
    """POST /api/dive-planner/repetitive tests"""

    def test_repetitive_two_dives_basic(self, auth_headers):
        """Test basic repetitive dive planning with 2 dives"""
        payload = {
            "dives": [
                {"depth": 18, "duration": 40, "fo2": 0.21, "surface_interval": 0},
                {"depth": 12, "duration": 50, "fo2": 0.21, "surface_interval": 60},
            ],
            "gf_high": 85,
        }
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload, headers=auth_headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert "dives" in data
        assert data["total_dives"] == 2
        
        # First dive validation
        dive1 = data["dives"][0]
        assert dive1["dive_number"] == 1
        assert dive1["depth"] == 18
        assert dive1["duration"] == 40
        assert "ndl" in dive1
        assert "within_ndl" in dive1
        assert "cns_percent" in dive1
        assert "tissue_loading" in dive1
        assert len(dive1["tissue_loading"]) == 16
        
        # Second dive should have tissue loading info
        dive2 = data["dives"][1]
        assert dive2["dive_number"] == 2
        assert dive2["surface_interval"] == 60
        assert dive2["max_tissue_loading"] > 0

    def test_repetitive_three_dives(self, auth_headers):
        """Test 3 dive repetitive planning"""
        payload = {
            "dives": [
                {"depth": 20, "duration": 30, "fo2": 0.21, "surface_interval": 0},
                {"depth": 15, "duration": 40, "fo2": 0.21, "surface_interval": 90},
                {"depth": 10, "duration": 60, "fo2": 0.21, "surface_interval": 120},
            ],
            "gf_high": 80,
        }
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload, headers=auth_headers)
        
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_dives"] == 3

    def test_repetitive_with_ean32(self, auth_headers):
        """Test repetitive dives with EAN32"""
        payload = {
            "dives": [
                {"depth": 24, "duration": 35, "fo2": 0.32, "surface_interval": 0},
                {"depth": 18, "duration": 45, "fo2": 0.32, "surface_interval": 60},
            ],
            "gf_high": 85,
        }
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload, headers=auth_headers)
        
        assert resp.status_code == 200
        data = resp.json()
        for dive in data["dives"]:
            assert dive["fo2"] == 0.32
            assert dive["cns_percent"] >= 0

    def test_repetitive_requires_two_dives(self, auth_headers):
        """Validation: needs at least 2 dives"""
        payload = {"dives": [{"depth": 18, "duration": 40}], "gf_high": 85}
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload, headers=auth_headers)
        
        assert resp.status_code == 400
        assert "at least 2 dives" in resp.text.lower()

    def test_repetitive_empty_dives(self, auth_headers):
        """Validation: empty dives array"""
        payload = {"dives": [], "gf_high": 85}
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload, headers=auth_headers)
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# ENHANCED PROFILE ANALYSIS TESTS
# ═══════════════════════════════════════════

class TestEnhancedProfileAnalysis:
    """POST /api/dive-log/{id}/analyze-profile tests"""

    def test_profile_analysis_with_profile_data(self, auth_headers):
        """Test profile analysis on existing dive with profile"""
        # Get logs with profiles
        logs_resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
        if logs_resp.status_code != 200:
            pytest.skip("Could not get dive logs")
            
        logs = logs_resp.json().get("logs", [])
        log_with_profile = None
        for log in logs:
            if len(log.get("profile", [])) > 5:
                log_with_profile = log["id"]
                break
        
        if not log_with_profile:
            pytest.skip("No dive log with profile data")
        
        resp = requests.post(f"{BASE_URL}/api/dive-log/{log_with_profile}/analyze-profile", headers=auth_headers)
        
        assert resp.status_code == 200
        data = resp.json()
        assert "analysis" in data
        
        if data["analysis"]:
            assert "point_count" in data
            point = data["analysis"][0]
            assert "time_seconds" in point
            assert "depth" in point
            assert "ppo2" in point
            assert "ppn2" in point
            assert "ascent_rate" in point
            assert "rate_status" in point
            assert "ceiling" in point
            assert point["rate_status"] in ["ok", "warning", "danger"]

    def test_profile_analysis_invalid_id(self, auth_headers):
        """Profile analysis with non-existent log"""
        resp = requests.post(f"{BASE_URL}/api/dive-log/invalid-id-12345/analyze-profile", headers=auth_headers)
        assert resp.status_code == 404


# ═══════════════════════════════════════════
# EXIF GPS EXTRACTION TESTS
# ═══════════════════════════════════════════

class TestExifGpsExtraction:
    """POST /api/dive-log/extract-gps tests"""

    def test_extract_gps_no_exif(self, auth_headers):
        """Test GPS extraction with image without EXIF"""
        # Minimal PNG without EXIF
        png_data = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx"
            b"\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        headers = {"Authorization": auth_headers["Authorization"]}
        files = {"file": ("test.png", io.BytesIO(png_data), "image/png")}
        resp = requests.post(f"{BASE_URL}/api/dive-log/extract-gps", files=files, headers=headers)
        
        assert resp.status_code == 200
        data = resp.json()
        assert "gps" in data
        assert data["gps"] is None  # No GPS in this image

    def test_extract_gps_invalid_file(self, auth_headers):
        """Test GPS extraction with non-image file"""
        headers = {"Authorization": auth_headers["Authorization"]}
        files = {"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")}
        resp = requests.post(f"{BASE_URL}/api/dive-log/extract-gps", files=files, headers=headers)
        
        assert resp.status_code == 200
        data = resp.json()
        assert data["gps"] is None

    def test_extract_gps_no_file(self, auth_headers):
        """Test GPS extraction without file"""
        resp = requests.post(f"{BASE_URL}/api/dive-log/extract-gps", headers=auth_headers)
        assert resp.status_code == 422


# ═══════════════════════════════════════════
# BULK DIVE EDITING TESTS
# ═══════════════════════════════════════════

class TestBulkDiveEditing:
    """PUT /api/dive-log/bulk-edit tests"""

    def test_bulk_edit_single_dive(self, auth_headers):
        """Test bulk editing a single dive"""
        # Create test dive
        dive_data = {
            "site_name": "TEST_BulkSingle",
            "location": "Test Loc",
            "date": "2025-01-15",
            "max_depth": 18,
            "duration": 40
        }
        create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
        if create_resp.status_code != 201:
            pytest.skip(f"Could not create test dive: {create_resp.text}")
        
        dive_id = create_resp.json()["id"]
        
        try:
            # Bulk edit
            payload = {"dive_ids": [dive_id], "updates": {"buddy": "Test Buddy"}}
            resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json=payload, headers=auth_headers)
            
            assert resp.status_code == 200, f"Expected 200: {resp.text}"
            data = resp.json()
            assert data["modified"] == 1
            assert data["updates"]["buddy"] == "Test Buddy"
            
            # Verify
            get_resp = requests.get(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)
            assert get_resp.json().get("buddy") == "Test Buddy"
        finally:
            requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_bulk_edit_multiple_dives(self, auth_headers):
        """Test bulk editing multiple dives"""
        dive_ids = []
        for i in range(3):
            dive_data = {
                "site_name": f"TEST_BulkMulti_{i}",
                "location": "Test",
                "date": f"2025-01-{15+i}",
                "max_depth": 18 + i,
                "duration": 40
            }
            create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
            if create_resp.status_code == 201:
                dive_ids.append(create_resp.json()["id"])
        
        if len(dive_ids) < 2:
            pytest.skip("Could not create enough test dives")
        
        try:
            payload = {
                "dive_ids": dive_ids,
                "updates": {"tags": ["bulk", "test"], "visibility": "Good"}
            }
            resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json=payload, headers=auth_headers)
            
            assert resp.status_code == 200
            data = resp.json()
            assert data["modified"] == len(dive_ids)
        finally:
            for dive_id in dive_ids:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_bulk_edit_disallowed_fields(self, auth_headers):
        """Test that disallowed fields are rejected"""
        dive_data = {"site_name": "TEST_BulkDisallow", "location": "Test", "date": "2025-01-15"}
        create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
        if create_resp.status_code != 201:
            pytest.skip("Could not create test dive")
        
        dive_id = create_resp.json()["id"]
        
        try:
            payload = {"dive_ids": [dive_id], "updates": {"max_depth": 100, "duration": 999}}
            resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json=payload, headers=auth_headers)
            
            assert resp.status_code == 400
            assert "No valid fields" in resp.text
        finally:
            requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_bulk_edit_empty_dive_ids(self, auth_headers):
        """Validation: empty dive_ids"""
        payload = {"dive_ids": [], "updates": {"buddy": "Test"}}
        resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json=payload, headers=auth_headers)
        assert resp.status_code in [400, 422]

    def test_bulk_edit_no_updates(self, auth_headers):
        """Validation: empty updates"""
        payload = {"dive_ids": ["some-id"], "updates": {}}
        resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json=payload, headers=auth_headers)
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# MULTI-COMPUTER MERGE TESTS
# ═══════════════════════════════════════════

class TestMultiComputerMerge:
    """POST /api/dive-log/merge tests"""

    def test_merge_two_dives(self, auth_headers):
        """Test merging two dive logs"""
        # Create primary dive
        primary = {
            "site_name": "TEST_MergePrimary",
            "location": "Merge Test",
            "date": "2025-01-20",
            "max_depth": 25,
            "avg_depth": 15,
            "duration": 45,
            "water_temp": 24,
            "computer_model": "Suunto D5",
            "profile": [{"time_seconds": 0, "depth": 0}, {"time_seconds": 60, "depth": 10}, {"time_seconds": 300, "depth": 25}]
        }
        primary_resp = requests.post(f"{BASE_URL}/api/dive-log", json=primary, headers=auth_headers)
        if primary_resp.status_code != 201:
            pytest.skip("Could not create primary dive")
        primary_id = primary_resp.json()["id"]
        
        # Create secondary dive
        secondary = {
            "site_name": "TEST_MergeSecondary",
            "location": "Merge Test",
            "date": "2025-01-20",
            "max_depth": 26,
            "avg_depth": 16,
            "duration": 44,
            "water_temp": 25,
            "computer_model": "Shearwater Perdix",
            "profile": [{"time_seconds": 30, "depth": 5}, {"time_seconds": 90, "depth": 15}, {"time_seconds": 400, "depth": 26}]
        }
        secondary_resp = requests.post(f"{BASE_URL}/api/dive-log", json=secondary, headers=auth_headers)
        if secondary_resp.status_code != 201:
            requests.delete(f"{BASE_URL}/api/dive-log/{primary_id}", headers=auth_headers)
            pytest.skip("Could not create secondary dive")
        secondary_id = secondary_resp.json()["id"]
        
        try:
            # Merge
            payload = {"primary_id": primary_id, "secondary_id": secondary_id}
            resp = requests.post(f"{BASE_URL}/api/dive-log/merge", json=payload, headers=auth_headers)
            
            assert resp.status_code == 200, f"Expected 200: {resp.text}"
            data = resp.json()
            merged = data["merged"]
            
            # Validate merged values
            assert merged["max_depth"] == 26  # max of 25, 26
            assert merged["avg_depth"] == 15.5  # avg of 15, 16
            assert merged["duration"] == 45  # max of 45, 44
            assert merged["water_temp"] == 24.5  # avg of 24, 25
            assert "Suunto D5" in merged["computer_model"]
            assert "Shearwater Perdix" in merged["computer_model"]
            assert len(merged["profile"]) == 6  # 3 + 3 points
            assert merged["source"] == "merged"
            assert secondary_id in merged["merged_from"]
            
            # Verify secondary is deleted
            verify_resp = requests.get(f"{BASE_URL}/api/dive-log/{secondary_id}", headers=auth_headers)
            assert verify_resp.status_code == 404
        finally:
            requests.delete(f"{BASE_URL}/api/dive-log/{primary_id}", headers=auth_headers)

    def test_merge_invalid_ids(self, auth_headers):
        """Test merge with invalid IDs"""
        payload = {"primary_id": "invalid1", "secondary_id": "invalid2"}
        resp = requests.post(f"{BASE_URL}/api/dive-log/merge", json=payload, headers=auth_headers)
        assert resp.status_code == 404

    def test_merge_missing_ids(self, auth_headers):
        """Validation: missing IDs"""
        payload = {"primary_id": "some-id"}
        resp = requests.post(f"{BASE_URL}/api/dive-log/merge", json=payload, headers=auth_headers)
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# TAG MANAGEMENT TESTS
# ═══════════════════════════════════════════

class TestTagManagement:
    """GET /api/dive-log/tags tests"""

    def test_get_all_tags(self, auth_headers):
        """Test getting all unique tags"""
        # Create dive with tags
        dive_data = {
            "site_name": "TEST_Tags",
            "location": "Tag Test",
            "date": "2025-01-20",
            "tags": ["tagtest1", "tagtest2"]
        }
        create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
        dive_id = create_resp.json().get("id") if create_resp.status_code == 201 else None
        
        try:
            resp = requests.get(f"{BASE_URL}/api/dive-log/tags", headers=auth_headers)
            
            assert resp.status_code == 200
            data = resp.json()
            assert "tags" in data
            assert isinstance(data["tags"], list)
            
            # Check structure
            if data["tags"]:
                tag = data["tags"][0]
                assert "name" in tag
                assert "count" in tag
        finally:
            if dive_id:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_tags_empty_response(self, auth_headers):
        """Test tags endpoint works even with no tags"""
        resp = requests.get(f"{BASE_URL}/api/dive-log/tags", headers=auth_headers)
        assert resp.status_code == 200
        assert "tags" in resp.json()


# ═══════════════════════════════════════════
# PDF EXPORT TESTS
# ═══════════════════════════════════════════

class TestPdfLogbookExport:
    """GET /api/dive-log/export-pdf tests"""

    def test_export_pdf_html(self, auth_headers):
        """Test exporting dive logbook as HTML"""
        resp = requests.get(f"{BASE_URL}/api/dive-log/export-pdf", headers=auth_headers)
        
        if resp.status_code == 404:
            # No dives to export - acceptable
            assert "No dives" in resp.text
            return
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert "html" in data
        assert "dive_count" in data
        assert "format" in data
        assert data["format"] == "html"
        
        # Validate HTML content
        html = data["html"]
        assert "<!DOCTYPE html>" in html
        assert "Dive Logbook" in html
        assert "<table>" in html

    def test_export_pdf_with_dive(self, auth_headers):
        """Test export with actual dive data"""
        # Create a test dive
        dive_data = {
            "site_name": "TEST_Export",
            "location": "Export Test",
            "date": "2025-01-25",
            "max_depth": 22,
            "duration": 45,
            "rating": 4
        }
        create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
        dive_id = create_resp.json().get("id") if create_resp.status_code == 201 else None
        
        try:
            resp = requests.get(f"{BASE_URL}/api/dive-log/export-pdf", headers=auth_headers)
            assert resp.status_code == 200
            assert resp.json()["dive_count"] > 0
        finally:
            if dive_id:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)


# ═══════════════════════════════════════════
# DIVE SITES MAP TESTS
# ═══════════════════════════════════════════

class TestDiveSitesMap:
    """GET /api/dive-sites/map tests"""

    def test_get_dive_sites_map(self, auth_headers):
        """Test getting dive sites with GPS"""
        # Create dive with GPS
        dive_data = {
            "site_name": "TEST_MapSite",
            "location": "Map Test",
            "date": "2025-02-10",
            "max_depth": 25,
            "gps_lat": -18.2871,
            "gps_lng": 147.6992,
            "rating": 5
        }
        create_resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
        dive_id = create_resp.json().get("id") if create_resp.status_code == 201 else None
        
        try:
            resp = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=auth_headers)
            
            assert resp.status_code == 200
            data = resp.json()
            assert "sites" in data
            assert isinstance(data["sites"], list)
            
            # Check site structure
            if data["sites"]:
                site = data["sites"][0]
                assert "site_name" in site or "location" in site
                assert "dive_count" in site
                assert "max_depth" in site
        finally:
            if dive_id:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_sites_map_aggregation(self, auth_headers):
        """Test that sites are properly aggregated"""
        # Create multiple dives at same site
        dive_ids = []
        for i in range(2):
            dive_data = {
                "site_name": "TEST_AggSite",
                "location": "Aggregation Test",
                "date": f"2025-02-{10+i}",
                "max_depth": 20 + i * 5,
                "rating": 4
            }
            resp = requests.post(f"{BASE_URL}/api/dive-log", json=dive_data, headers=auth_headers)
            if resp.status_code == 201:
                dive_ids.append(resp.json()["id"])
        
        try:
            resp = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=auth_headers)
            assert resp.status_code == 200
            
            # Find our test site
            sites = resp.json()["sites"]
            test_site = next((s for s in sites if "TEST_AggSite" in (s.get("site_name", "") or "")), None)
            if test_site:
                assert test_site["dive_count"] >= 2
        finally:
            for dive_id in dive_ids:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)


# ═══════════════════════════════════════════
# AUTHENTICATION TESTS
# ═══════════════════════════════════════════

class TestAuthRequired:
    """Verify all endpoints require authentication"""

    def test_repetitive_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json={"dives": []})
        assert resp.status_code in [401, 403]

    def test_profile_analysis_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-log/test-id/analyze-profile")
        assert resp.status_code in [401, 403]

    def test_bulk_edit_no_auth(self):
        resp = requests.put(f"{BASE_URL}/api/dive-log/bulk-edit", json={})
        assert resp.status_code in [401, 403]

    def test_merge_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-log/merge", json={})
        assert resp.status_code in [401, 403]

    def test_tags_no_auth(self):
        resp = requests.get(f"{BASE_URL}/api/dive-log/tags")
        assert resp.status_code in [401, 403]

    def test_export_no_auth(self):
        resp = requests.get(f"{BASE_URL}/api/dive-log/export-pdf")
        assert resp.status_code in [401, 403]

    def test_sites_map_no_auth(self):
        resp = requests.get(f"{BASE_URL}/api/dive-sites/map")
        assert resp.status_code in [401, 403]

    def test_extract_gps_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-log/extract-gps")
        assert resp.status_code in [401, 403, 422]
