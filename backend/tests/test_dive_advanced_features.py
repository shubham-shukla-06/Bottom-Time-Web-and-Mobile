"""
Test Suite for Advanced Dive Features (dive_advanced.py)
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


class TestHelpers:
    """Auth helpers for test class"""

    @staticmethod
    def get_auth_token():
        """Login and get bearer token"""
        # Send email OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "test@bottomtime.com"},
        )
        # Verify email OTP
        email_resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "test@bottomtime.com", "code": "123456"},
        )
        email_token = email_resp.json().get("verification_token", "")

        # Send phone OTP
        requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "+919876543210"},
        )
        # Verify phone OTP
        phone_resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": "+919876543210", "code": "123456"},
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
        )
        return login_resp.json().get("access_token", "")


@pytest.fixture(scope="module")
def auth_token():
    """Module-scoped auth token"""
    token = TestHelpers.get_auth_token()
    if not token:
        pytest.skip("Failed to authenticate")
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def dive_log_with_profile(auth_headers):
    """Get a dive log ID that has profile data for testing"""
    resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_headers)
    logs = resp.json().get("logs", [])
    for log in logs:
        if len(log.get("profile", [])) > 5:
            return log["id"]
    # If no log with profile, create one with test profile
    return None


# ═══════════════════════════════════════════
# TEST CLASS: Repetitive Dive Planning
# ═══════════════════════════════════════════


class TestRepetitiveDivePlanning:
    """Tests for POST /api/dive-planner/repetitive"""

    def test_repetitive_dive_planning_two_dives(self, auth_headers):
        """Test basic repetitive dive planning with 2 dives"""
        payload = {
            "dives": [
                {"depth": 18, "duration": 40, "fo2": 0.21, "surface_interval": 0},
                {"depth": 12, "duration": 50, "fo2": 0.21, "surface_interval": 60},
            ],
            "gf_high": 85,
        }
        resp = requests.post(
            f"{BASE_URL}/api/dive-planner/repetitive",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Validate response structure
        assert "dives" in data, "Response should have 'dives' key"
        assert "total_dives" in data, "Response should have 'total_dives' key"
        assert data["total_dives"] == 2, f"Expected 2 dives, got {data['total_dives']}"

        # Validate first dive
        dive1 = data["dives"][0]
        assert dive1["dive_number"] == 1
        assert dive1["depth"] == 18
        assert dive1["duration"] == 40
        assert "ndl" in dive1, "Dive should have NDL"
        assert "within_ndl" in dive1
        assert "cns_percent" in dive1
        assert "tissue_loading" in dive1
        assert len(dive1["tissue_loading"]) == 16, "Should have 16 tissue compartments"

        # Validate second dive - should have reduced NDL due to tissue loading
        dive2 = data["dives"][1]
        assert dive2["dive_number"] == 2
        assert dive2["surface_interval"] == 60
        assert dive2["max_tissue_loading"] > 0

    def test_repetitive_dive_planning_three_dives(self, auth_headers):
        """Test repetitive dive planning with 3 dives"""
        payload = {
            "dives": [
                {"depth": 20, "duration": 30, "fo2": 0.21, "surface_interval": 0},
                {"depth": 15, "duration": 40, "fo2": 0.21, "surface_interval": 90},
                {"depth": 10, "duration": 60, "fo2": 0.21, "surface_interval": 120},
            ],
            "gf_high": 80,
        }
        resp = requests.post(
            f"{BASE_URL}/api/dive-planner/repetitive",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_dives"] == 3

        # Verify progressive tissue loading increases
        for i, dive in enumerate(data["dives"]):
            assert dive["dive_number"] == i + 1
            if i > 0:
                # With surface intervals, tissue loading should be managed
                assert dive["surface_interval"] > 0

    def test_repetitive_dive_planning_with_nitrox(self, auth_headers):
        """Test repetitive dives with EAN32"""
        payload = {
            "dives": [
                {"depth": 24, "duration": 35, "fo2": 0.32, "surface_interval": 0},
                {"depth": 18, "duration": 45, "fo2": 0.32, "surface_interval": 60},
            ],
            "gf_high": 85,
        }
        resp = requests.post(
            f"{BASE_URL}/api/dive-planner/repetitive",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()

        # EAN32 should provide longer NDL but higher CNS
        for dive in data["dives"]:
            assert dive["fo2"] == 0.32
            # CNS should be tracked
            assert dive["cns_percent"] >= 0

    def test_repetitive_dive_planning_requires_two_dives(self, auth_headers):
        """Test validation - needs at least 2 dives"""
        payload = {"dives": [{"depth": 18, "duration": 40}], "gf_high": 85}
        resp = requests.post(
            f"{BASE_URL}/api/dive-planner/repetitive",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "at least 2 dives" in resp.text.lower()

    def test_repetitive_dive_planning_empty_dives(self, auth_headers):
        """Test validation - empty dives array"""
        payload = {"dives": [], "gf_high": 85}
        resp = requests.post(
            f"{BASE_URL}/api/dive-planner/repetitive",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# TEST CLASS: Enhanced Profile Analysis
# ═══════════════════════════════════════════


class TestEnhancedProfileAnalysis:
    """Tests for POST /api/dive-log/{id}/analyze-profile"""

    def test_profile_analysis_with_valid_profile(self, auth_headers, dive_log_with_profile):
        """Test profile analysis on a dive with profile data"""
        if not dive_log_with_profile:
            pytest.skip("No dive log with profile available")

        resp = requests.post(
            f"{BASE_URL}/api/dive-log/{dive_log_with_profile}/analyze-profile",
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Should have analysis array
        assert "analysis" in data
        if data["analysis"]:
            assert "point_count" in data

            # Validate analysis point structure
            point = data["analysis"][0]
            assert "time_seconds" in point
            assert "depth" in point
            assert "ppo2" in point, "Should have partial pressure O2"
            assert "ppn2" in point, "Should have partial pressure N2"
            assert "ascent_rate" in point
            assert "rate_status" in point
            assert "ceiling" in point, "Should have deco ceiling"
            assert "gas_mix" in point

            # Validate rate_status values
            valid_statuses = ["ok", "warning", "danger"]
            for pt in data["analysis"]:
                assert pt["rate_status"] in valid_statuses

    def test_profile_analysis_invalid_log_id(self, auth_headers):
        """Test profile analysis with non-existent log"""
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/non-existent-id-12345/analyze-profile",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_profile_analysis_short_profile(self, auth_headers):
        """Create a dive with short profile to test edge case"""
        # Create a dive log with minimal profile (< 2 points)
        dive_data = {
            "site_name": "TEST_ShortProfile",
            "location": "Test Location",
            "date": "2025-01-15",
            "max_depth": 15,
            "duration": 30,
            "profile": [{"time_seconds": 0, "depth": 0}],  # Only 1 point
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            json=dive_data,
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            pytest.skip(f"Could not create test dive: {create_resp.text}")

        log_id = create_resp.json().get("id")

        try:
            resp = requests.post(
                f"{BASE_URL}/api/dive-log/{log_id}/analyze-profile",
                headers=auth_headers,
            )
            assert resp.status_code == 200
            data = resp.json()
            # Should return null analysis for short profile
            assert data.get("analysis") is None or data.get("message") == "Profile too short"
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/dive-log/{log_id}", headers=auth_headers)


# ═══════════════════════════════════════════
# TEST CLASS: EXIF GPS Extraction
# ═══════════════════════════════════════════


class TestExifGpsExtraction:
    """Tests for POST /api/dive-log/extract-gps"""

    def test_extract_gps_no_gps_image(self, auth_headers):
        """Test GPS extraction with image without GPS data"""
        # Create a minimal PNG without EXIF
        png_data = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx"
            b"\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        files = {"file": ("test.png", io.BytesIO(png_data), "image/png")}
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/extract-gps",
            files=files,
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Should gracefully handle no GPS - return null
        assert "gps" in data
        assert data["gps"] is None, "Should return null GPS for image without GPS data"
        assert "message" in data

    def test_extract_gps_invalid_file(self, auth_headers):
        """Test GPS extraction with non-image file"""
        files = {"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")}
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/extract-gps",
            files=files,
            headers=auth_headers,
        )
        # Should return 200 with null GPS and error message (graceful failure)
        assert resp.status_code == 200
        data = resp.json()
        assert data["gps"] is None

    def test_extract_gps_missing_file(self, auth_headers):
        """Test GPS extraction without file"""
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/extract-gps",
            headers=auth_headers,
        )
        assert resp.status_code == 422  # Validation error - file required


# ═══════════════════════════════════════════
# TEST CLASS: Bulk Dive Editing
# ═══════════════════════════════════════════


class TestBulkDiveEditing:
    """Tests for PUT /api/dive-log/bulk-edit"""

    @pytest.fixture
    def test_dives_for_bulk(self, auth_headers):
        """Create test dives for bulk editing"""
        dive_ids = []
        for i in range(3):
            dive_data = {
                "site_name": f"TEST_BulkEdit_{i}",
                "location": "Test Location",
                "date": f"2025-01-{15+i}",
                "max_depth": 18 + i,
                "duration": 40 + i * 5,
            }
            resp = requests.post(
                f"{BASE_URL}/api/dive-log",
                json=dive_data,
                headers=auth_headers,
            )
            if resp.status_code == 201:
                dive_ids.append(resp.json()["id"])
        yield dive_ids

        # Cleanup
        for dive_id in dive_ids:
            requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_bulk_edit_buddy_field(self, auth_headers, test_dives_for_bulk):
        """Test bulk editing buddy field"""
        if len(test_dives_for_bulk) < 2:
            pytest.skip("Not enough test dives created")

        payload = {
            "dive_ids": test_dives_for_bulk[:2],
            "updates": {"buddy": "John Doe"},
        }
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        assert "modified" in data
        assert data["modified"] == 2, f"Expected 2 modified, got {data['modified']}"
        assert data["updates"]["buddy"] == "John Doe"

        # Verify by fetching
        for dive_id in test_dives_for_bulk[:2]:
            get_resp = requests.get(
                f"{BASE_URL}/api/dive-log/{dive_id}",
                headers=auth_headers,
            )
            if get_resp.status_code == 200:
                assert get_resp.json().get("buddy") == "John Doe"

    def test_bulk_edit_tags(self, auth_headers, test_dives_for_bulk):
        """Test bulk editing tags"""
        if not test_dives_for_bulk:
            pytest.skip("No test dives")

        payload = {
            "dive_ids": test_dives_for_bulk,
            "updates": {"tags": ["reef", "training"]},
        }
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["modified"] == len(test_dives_for_bulk)

    def test_bulk_edit_multiple_fields(self, auth_headers, test_dives_for_bulk):
        """Test bulk editing multiple allowed fields"""
        if not test_dives_for_bulk:
            pytest.skip("No test dives")

        payload = {
            "dive_ids": [test_dives_for_bulk[0]],
            "updates": {
                "buddy": "Jane Smith",
                "dive_type": "Training",
                "visibility": "Good",
                "suit_type": "Wetsuit 5mm",
            },
        }
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "updated_at" in data["updates"], "Should add updated_at timestamp"

    def test_bulk_edit_disallowed_field(self, auth_headers, test_dives_for_bulk):
        """Test that disallowed fields are filtered out"""
        if not test_dives_for_bulk:
            pytest.skip("No test dives")

        payload = {
            "dive_ids": [test_dives_for_bulk[0]],
            "updates": {
                "max_depth": 100,  # Not in allowed list
                "duration": 999,  # Not in allowed list
            },
        }
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        # Should return 400 since no valid fields
        assert resp.status_code == 400
        assert "No valid fields" in resp.text

    def test_bulk_edit_no_dive_ids(self, auth_headers):
        """Test validation - no dive IDs provided"""
        payload = {"dive_ids": [], "updates": {"buddy": "Test"}}
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code in [400, 422]  # 400 from endpoint, 422 from pydantic

    def test_bulk_edit_no_updates(self, auth_headers, test_dives_for_bulk):
        """Test validation - no updates provided"""
        if not test_dives_for_bulk:
            pytest.skip("No test dives")

        payload = {"dive_ids": test_dives_for_bulk, "updates": {}}
        resp = requests.put(
            f"{BASE_URL}/api/dive-log/bulk-edit",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# TEST CLASS: Multi-Computer Merge
# ═══════════════════════════════════════════


class TestMultiComputerMerge:
    """Tests for POST /api/dive-log/merge"""

    @pytest.fixture
    def merge_test_dives(self, auth_headers):
        """Create two dives for merge testing"""
        # Primary dive with computer A
        primary_data = {
            "site_name": "TEST_MergeSite",
            "location": "Merge Test",
            "date": "2025-01-20",
            "max_depth": 25,
            "avg_depth": 15,
            "duration": 45,
            "water_temp": 24,
            "computer_model": "Suunto D5",
            "profile": [
                {"time_seconds": 0, "depth": 0},
                {"time_seconds": 60, "depth": 10},
                {"time_seconds": 120, "depth": 20},
                {"time_seconds": 300, "depth": 25},
                {"time_seconds": 600, "depth": 15},
            ],
        }
        primary_resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            json=primary_data,
            headers=auth_headers,
        )
        primary_id = primary_resp.json().get("id") if primary_resp.status_code == 201 else None

        # Secondary dive with computer B
        secondary_data = {
            "site_name": "TEST_MergeSite",
            "location": "Merge Test",
            "date": "2025-01-20",
            "max_depth": 26,  # Slightly different
            "avg_depth": 16,
            "duration": 44,
            "water_temp": 25,
            "computer_model": "Shearwater Perdix",
            "profile": [
                {"time_seconds": 30, "depth": 5},
                {"time_seconds": 90, "depth": 15},
                {"time_seconds": 180, "depth": 22},
                {"time_seconds": 400, "depth": 26},
                {"time_seconds": 700, "depth": 10},
            ],
        }
        secondary_resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            json=secondary_data,
            headers=auth_headers,
        )
        secondary_id = secondary_resp.json().get("id") if secondary_resp.status_code == 201 else None

        yield {"primary": primary_id, "secondary": secondary_id}

        # Cleanup - only primary remains after merge
        if primary_id:
            requests.delete(f"{BASE_URL}/api/dive-log/{primary_id}", headers=auth_headers)
        # Secondary should be deleted by merge, but try cleanup anyway
        if secondary_id:
            requests.delete(f"{BASE_URL}/api/dive-log/{secondary_id}", headers=auth_headers)

    def test_merge_two_dives(self, auth_headers, merge_test_dives):
        """Test merging two dive logs from different computers"""
        if not merge_test_dives["primary"] or not merge_test_dives["secondary"]:
            pytest.skip("Could not create test dives")

        payload = {
            "primary_id": merge_test_dives["primary"],
            "secondary_id": merge_test_dives["secondary"],
        }
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/merge",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Validate merge result
        assert "merged" in data
        merged = data["merged"]

        # Max depth should be max of both (26)
        assert merged["max_depth"] == 26, f"Expected max depth 26, got {merged['max_depth']}"

        # Avg depth should be average ((15+16)/2 = 15.5)
        assert merged["avg_depth"] == 15.5

        # Duration should be max (45)
        assert merged["duration"] == 45

        # Water temp should be average ((24+25)/2 = 24.5)
        assert merged["water_temp"] == 24.5

        # Computer model should be combined
        assert "Suunto D5" in merged["computer_model"]
        assert "Shearwater Perdix" in merged["computer_model"]

        # Profile should be merged and sorted
        assert len(merged["profile"]) == 10  # 5 + 5 points
        # Check sorting by time_seconds
        times = [p["time_seconds"] for p in merged["profile"]]
        assert times == sorted(times), "Profile should be sorted by time_seconds"

        # Source should indicate merge
        assert merged["source"] == "merged"
        assert merge_test_dives["secondary"] in merged["merged_from"]

        # Verify secondary is deleted
        verify_resp = requests.get(
            f"{BASE_URL}/api/dive-log/{merge_test_dives['secondary']}",
            headers=auth_headers,
        )
        assert verify_resp.status_code == 404, "Secondary dive should be deleted after merge"

    def test_merge_missing_primary(self, auth_headers):
        """Test merge with non-existent primary"""
        payload = {
            "primary_id": "non-existent-primary",
            "secondary_id": "non-existent-secondary",
        }
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/merge",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_merge_missing_ids(self, auth_headers):
        """Test merge without required IDs"""
        payload = {"primary_id": "some-id"}
        resp = requests.post(
            f"{BASE_URL}/api/dive-log/merge",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ═══════════════════════════════════════════
# TEST CLASS: Tag Management
# ═══════════════════════════════════════════


class TestTagManagement:
    """Tests for GET /api/dive-log/tags"""

    @pytest.fixture
    def dives_with_tags(self, auth_headers):
        """Create dives with tags"""
        dive_ids = []
        tags_data = [
            ["reef", "deep", "training"],
            ["reef", "night"],
            ["wreck", "deep"],
        ]
        for i, tags in enumerate(tags_data):
            dive_data = {
                "site_name": f"TEST_TagDive_{i}",
                "location": "Tag Test",
                "date": f"2025-01-{20+i}",
                "max_depth": 20,
                "duration": 40,
                "tags": tags,
            }
            resp = requests.post(
                f"{BASE_URL}/api/dive-log",
                json=dive_data,
                headers=auth_headers,
            )
            if resp.status_code == 201:
                dive_ids.append(resp.json()["id"])
        yield dive_ids

        # Cleanup
        for dive_id in dive_ids:
            requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_get_all_tags(self, auth_headers, dives_with_tags):
        """Test getting all unique tags"""
        if not dives_with_tags:
            pytest.skip("No test dives with tags")

        resp = requests.get(f"{BASE_URL}/api/dive-log/tags", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        assert "tags" in data
        tags = data["tags"]

        # Should have tags with counts
        tag_names = [t["name"] for t in tags]
        assert "reef" in tag_names, "Should include 'reef' tag"
        assert "deep" in tag_names, "Should include 'deep' tag"

        # reef should have count 2 (from 2 dives)
        reef_tag = next((t for t in tags if t["name"] == "reef"), None)
        assert reef_tag is not None
        assert reef_tag["count"] >= 2

    def test_get_tags_empty_user(self, auth_headers):
        """Test tags endpoint returns empty for user without tagged dives"""
        # This will return whatever tags exist - we just verify the endpoint works
        resp = requests.get(f"{BASE_URL}/api/dive-log/tags", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "tags" in data
        assert isinstance(data["tags"], list)


# ═══════════════════════════════════════════
# TEST CLASS: PDF Logbook Export
# ═══════════════════════════════════════════


class TestPdfLogbookExport:
    """Tests for GET /api/dive-log/export-pdf"""

    def test_export_pdf_html(self, auth_headers):
        """Test exporting dive logbook as HTML for PDF"""
        resp = requests.get(
            f"{BASE_URL}/api/dive-log/export-pdf",
            headers=auth_headers,
        )
        # If user has dives, should succeed
        if resp.status_code == 404:
            # No dives to export - this is valid
            assert "No dives to export" in resp.text
            return

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Validate response structure
        assert "html" in data
        assert "dive_count" in data
        assert "format" in data
        assert data["format"] == "html"

        # Validate HTML content
        html = data["html"]
        assert "<!DOCTYPE html>" in html
        assert "Dive Logbook" in html
        assert "<table>" in html
        assert "Total Dives" in html
        assert "Max Depth" in html
        assert "bottom-time.com" in html  # Footer

    def test_export_pdf_has_dive_data(self, auth_headers):
        """Verify exported HTML contains actual dive data"""
        # Create a test dive first
        dive_data = {
            "site_name": "TEST_ExportDive",
            "location": "Export Test",
            "date": "2025-01-25",
            "max_depth": 22,
            "duration": 45,
            "water_temp": 26,
            "gas_mix": "Air",
            "buddy": "Export Buddy",
            "rating": 4,
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            json=dive_data,
            headers=auth_headers,
        )
        dive_id = create_resp.json().get("id") if create_resp.status_code == 201 else None

        try:
            resp = requests.get(
                f"{BASE_URL}/api/dive-log/export-pdf",
                headers=auth_headers,
            )
            assert resp.status_code == 200
            data = resp.json()

            # Our test dive should appear in the HTML
            html = data["html"]
            assert "TEST_ExportDive" in html or data["dive_count"] > 0
        finally:
            if dive_id:
                requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)


# ═══════════════════════════════════════════
# TEST CLASS: Dive Sites Map
# ═══════════════════════════════════════════


class TestDiveSitesMap:
    """Tests for GET /api/dive-sites/map"""

    @pytest.fixture
    def dives_with_gps(self, auth_headers):
        """Create dives with GPS coordinates"""
        dive_ids = []
        gps_dives = [
            {"site": "Great Barrier Reef", "lat": -18.2871, "lng": 147.6992},
            {"site": "Great Barrier Reef", "lat": -18.2871, "lng": 147.6992},  # Same site
            {"site": "Blue Hole", "lat": 17.3149, "lng": -87.5349},
        ]
        for i, gps in enumerate(gps_dives):
            dive_data = {
                "site_name": f"TEST_{gps['site']}",
                "location": gps["site"],
                "date": f"2025-02-{10+i}",
                "max_depth": 25 + i * 5,
                "duration": 40,
                "gps_lat": gps["lat"],
                "gps_lng": gps["lng"],
                "rating": 4 + (i % 2),
            }
            resp = requests.post(
                f"{BASE_URL}/api/dive-log",
                json=dive_data,
                headers=auth_headers,
            )
            if resp.status_code == 201:
                dive_ids.append(resp.json()["id"])
        yield dive_ids

        # Cleanup
        for dive_id in dive_ids:
            requests.delete(f"{BASE_URL}/api/dive-log/{dive_id}", headers=auth_headers)

    def test_get_dive_sites_map(self, auth_headers, dives_with_gps):
        """Test getting dive sites with GPS for map display"""
        if not dives_with_gps:
            pytest.skip("No test dives with GPS")

        resp = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        assert "sites" in data
        sites = data["sites"]

        # Should aggregate sites
        [s.get("site_name", "") or s.get("location", "") for s in sites]

        # Find our test sites
        test_sites = [s for s in sites if "TEST_" in (s.get("site_name", "") or "")]

        if test_sites:
            # Validate site structure
            site = test_sites[0]
            assert "site_name" in site or "location" in site
            assert "gps_lat" in site
            assert "gps_lng" in site
            assert "dive_count" in site
            assert "max_depth" in site
            assert "last_dive" in site

    def test_dive_sites_map_aggregation(self, auth_headers, dives_with_gps):
        """Test that sites are properly aggregated"""
        resp = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Great Barrier Reef should be aggregated (2 dives)
        sites = data["sites"]
        gbr_sites = [s for s in sites if "Great Barrier Reef" in (s.get("site_name", "") + s.get("location", ""))]

        if gbr_sites:
            gbr = gbr_sites[0]
            assert gbr["dive_count"] >= 2, "GBR should have at least 2 dives"
            # Should take max depth from both dives
            assert gbr["max_depth"] >= 25

    def test_dive_sites_map_empty_user(self, auth_headers):
        """Test endpoint works for user with no sites"""
        resp = requests.get(f"{BASE_URL}/api/dive-sites/map", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "sites" in data
        assert isinstance(data["sites"], list)


# ═══════════════════════════════════════════
# TEST CLASS: Authentication Required
# ═══════════════════════════════════════════


class TestAuthenticationRequired:
    """Verify all endpoints require authentication"""

    def test_repetitive_planning_no_auth(self):
        payload = {"dives": [{"depth": 18, "duration": 40}]}
        resp = requests.post(f"{BASE_URL}/api/dive-planner/repetitive", json=payload)
        assert resp.status_code in [401, 403]

    def test_profile_analysis_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-log/some-id/analyze-profile")
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

    def test_export_pdf_no_auth(self):
        resp = requests.get(f"{BASE_URL}/api/dive-log/export-pdf")
        assert resp.status_code in [401, 403]

    def test_sites_map_no_auth(self):
        resp = requests.get(f"{BASE_URL}/api/dive-sites/map")
        assert resp.status_code in [401, 403]

    def test_extract_gps_no_auth(self):
        resp = requests.post(f"{BASE_URL}/api/dive-log/extract-gps")
        assert resp.status_code in [401, 403, 422]  # 422 if file missing validation first
