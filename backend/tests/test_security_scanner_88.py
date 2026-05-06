"""
Test Security Scanner APIs - Iteration 88
Tests for the automated security scanning feature:
- POST /api/admin/security/scan (admin-only)
- GET /api/admin/security/latest
- GET /api/admin/security/history
- GET /api/admin/security/findings/{scan_id}
- Non-admin 403 enforcement
- Startup scan verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "shubham@bottom-time.com"
REGULAR_USER_EMAIL = "test@bottomtime.com"
OTP_CODE = "123456"


class TestSecurityScannerAuth:
    """Test authentication and authorization for security endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        # Step 1: Send OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_EMAIL})
        assert resp.status_code == 200, f"Failed to send OTP: {resp.text}"
        
        # Step 2: Verify OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": ADMIN_EMAIL,
            "code": OTP_CODE
        })
        assert resp.status_code == 200, f"Failed to verify OTP: {resp.text}"
        data = resp.json()
        verification_token = data.get("verification_token")
        assert verification_token, "No verification token returned"
        
        # Step 3: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": ADMIN_EMAIL,
            "email_verified_token": verification_token
        })
        assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
        token = resp.json().get("access_token")
        assert token, "No access token returned"
        return token
    
    @pytest.fixture(scope="class")
    def regular_user_token(self):
        """Get regular user authentication token"""
        # Step 1: Send OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": REGULAR_USER_EMAIL})
        assert resp.status_code == 200, f"Failed to send OTP: {resp.text}"
        
        # Step 2: Verify OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": REGULAR_USER_EMAIL,
            "code": OTP_CODE
        })
        assert resp.status_code == 200, f"Failed to verify OTP: {resp.text}"
        data = resp.json()
        verification_token = data.get("verification_token")
        assert verification_token, "No verification token returned"
        
        # Step 3: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": REGULAR_USER_EMAIL,
            "email_verified_token": verification_token
        })
        assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
        token = resp.json().get("access_token")
        assert token, "No access token returned"
        return token
    
    def test_unauthenticated_scan_returns_403(self):
        """Unauthenticated request to scan endpoint should return 403"""
        resp = requests.post(f"{BASE_URL}/api/admin/security/scan")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Unauthenticated scan request returns 403")
    
    def test_unauthenticated_latest_returns_403(self):
        """Unauthenticated request to latest endpoint should return 403"""
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Unauthenticated latest request returns 403")
    
    def test_unauthenticated_history_returns_403(self):
        """Unauthenticated request to history endpoint should return 403"""
        resp = requests.get(f"{BASE_URL}/api/admin/security/history")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Unauthenticated history request returns 403")
    
    def test_regular_user_scan_returns_403(self, regular_user_token):
        """Regular user should get 403 on scan endpoint"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        resp = requests.post(f"{BASE_URL}/api/admin/security/scan", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Regular user scan request returns 403")
    
    def test_regular_user_latest_returns_403(self, regular_user_token):
        """Regular user should get 403 on latest endpoint"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Regular user latest request returns 403")
    
    def test_regular_user_history_returns_403(self, regular_user_token):
        """Regular user should get 403 on history endpoint"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/history", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Regular user history request returns 403")


class TestSecurityScannerAdmin:
    """Test security scanner functionality for admin users"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        # Step 1: Send OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_EMAIL})
        assert resp.status_code == 200, f"Failed to send OTP: {resp.text}"
        
        # Step 2: Verify OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": ADMIN_EMAIL,
            "code": OTP_CODE
        })
        assert resp.status_code == 200, f"Failed to verify OTP: {resp.text}"
        data = resp.json()
        verification_token = data.get("verification_token")
        assert verification_token, "No verification token returned"
        
        # Step 3: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": ADMIN_EMAIL,
            "email_verified_token": verification_token
        })
        assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
        token = resp.json().get("access_token")
        assert token, "No access token returned"
        return token
    
    def test_startup_scan_exists(self, admin_token):
        """Verify startup scan ran and data exists in DB"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        # Either we have a scan or a message saying no scans yet
        if data.get("scan"):
            assert "scan_id" in data["scan"], "Scan should have scan_id"
            assert "score" in data["scan"], "Scan should have score"
            print(f"PASS: Startup scan exists with score {data['scan']['score']}")
        else:
            print("INFO: No startup scan found yet (may need to wait)")
    
    def test_run_security_scan(self, admin_token):
        """Admin can run a security scan"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{BASE_URL}/api/admin/security/scan", headers=headers, timeout=120)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Validate response structure
        assert "scan_id" in data, "Response should have scan_id"
        assert "score" in data, "Response should have score"
        assert "total_findings" in data, "Response should have total_findings"
        assert "severity_counts" in data, "Response should have severity_counts"
        assert "scan_results" in data, "Response should have scan_results"
        assert "findings" in data, "Response should have findings"
        assert "checks_passed" in data, "Response should have checks_passed"
        assert "checks_total" in data, "Response should have checks_total"
        
        # Validate score is 0-100
        assert 0 <= data["score"] <= 100, f"Score should be 0-100, got {data['score']}"
        
        # Validate scan_results has expected categories
        expected_categories = ["secrets", "dangerous_patterns", "auth_coverage", "env_config", 
                              "mongodb", "rate_limiting", "dependencies", "frontend", "file_uploads"]
        for cat in expected_categories:
            assert cat in data["scan_results"], f"Missing category: {cat}"
        
        print(f"PASS: Security scan completed - Score: {data['score']}, Findings: {data['total_findings']}")
        return data["scan_id"]
    
    def test_get_latest_scan(self, admin_token):
        """Admin can get latest scan results"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "scan" in data, "Response should have scan"
        assert "findings" in data, "Response should have findings"
        
        if data["scan"]:
            assert "scan_id" in data["scan"], "Scan should have scan_id"
            assert "score" in data["scan"], "Scan should have score"
            assert "started_at" in data["scan"], "Scan should have started_at"
            assert "finished_at" in data["scan"], "Scan should have finished_at"
            print(f"PASS: Latest scan retrieved - Score: {data['scan']['score']}")
        else:
            print("INFO: No scans found")
    
    def test_get_scan_history(self, admin_token):
        """Admin can get scan history"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/history", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "scans" in data, "Response should have scans"
        assert isinstance(data["scans"], list), "Scans should be a list"
        
        if len(data["scans"]) > 0:
            scan = data["scans"][0]
            assert "scan_id" in scan, "Scan should have scan_id"
            assert "score" in scan, "Scan should have score"
            print(f"PASS: Scan history retrieved - {len(data['scans'])} scans found")
        else:
            print("INFO: No scan history found")
    
    def test_get_scan_history_with_limit(self, admin_token):
        """Admin can get scan history with limit parameter"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/history?limit=5", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "scans" in data, "Response should have scans"
        assert len(data["scans"]) <= 5, "Should respect limit parameter"
        print(f"PASS: Scan history with limit - {len(data['scans'])} scans returned")
    
    def test_get_findings_by_scan_id(self, admin_token):
        """Admin can get findings for a specific scan"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get latest scan to get scan_id
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        if not data.get("scan"):
            pytest.skip("No scans available to test findings endpoint")
        
        scan_id = data["scan"]["scan_id"]
        
        # Get findings for this scan
        resp = requests.get(f"{BASE_URL}/api/admin/security/findings/{scan_id}", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "scan_id" in data, "Response should have scan_id"
        assert "findings" in data, "Response should have findings"
        assert "count" in data, "Response should have count"
        assert data["scan_id"] == scan_id, "scan_id should match"
        
        print(f"PASS: Findings retrieved for scan {scan_id} - {data['count']} findings")
    
    def test_filter_findings_by_severity(self, admin_token):
        """Admin can filter findings by severity"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get latest scan
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        if not data.get("scan"):
            pytest.skip("No scans available to test findings filter")
        
        scan_id = data["scan"]["scan_id"]
        
        # Test filtering by high severity
        resp = requests.get(f"{BASE_URL}/api/admin/security/findings/{scan_id}?severity=high", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        # All findings should be high severity
        for finding in data["findings"]:
            assert finding["severity"] == "high", f"Expected high severity, got {finding['severity']}"
        
        print(f"PASS: Severity filter works - {data['count']} high severity findings")
    
    def test_filter_findings_by_type(self, admin_token):
        """Admin can filter findings by type"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get latest scan
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        if not data.get("scan"):
            pytest.skip("No scans available to test findings filter")
        
        scan_id = data["scan"]["scan_id"]
        
        # Test filtering by config type
        resp = requests.get(f"{BASE_URL}/api/admin/security/findings/{scan_id}?finding_type=config", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        # All findings should be config type
        for finding in data["findings"]:
            assert finding["type"] == "config", f"Expected config type, got {finding['type']}"
        
        print(f"PASS: Type filter works - {data['count']} config findings")


class TestSecurityScannerDataValidation:
    """Test data validation and response structure"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": ADMIN_EMAIL})
        assert resp.status_code == 200
        
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": ADMIN_EMAIL,
            "code": OTP_CODE
        })
        assert resp.status_code == 200
        verification_token = resp.json().get("verification_token")
        
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": ADMIN_EMAIL,
            "email_verified_token": verification_token
        })
        assert resp.status_code == 200
        return resp.json().get("access_token")
    
    def test_scan_results_structure(self, admin_token):
        """Validate scan results have correct structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        
        data = resp.json()
        if not data.get("scan"):
            pytest.skip("No scans available")
        
        scan = data["scan"]
        
        # Check all required fields
        required_fields = ["scan_id", "started_at", "finished_at", "duration_ms", 
                          "total_findings", "severity_counts", "checks_passed", 
                          "checks_total", "score", "scan_results"]
        for field in required_fields:
            assert field in scan, f"Missing required field: {field}"
        
        # Validate types
        assert isinstance(scan["score"], int), "Score should be int"
        assert isinstance(scan["total_findings"], int), "total_findings should be int"
        assert isinstance(scan["checks_passed"], int), "checks_passed should be int"
        assert isinstance(scan["checks_total"], int), "checks_total should be int"
        assert isinstance(scan["duration_ms"], int), "duration_ms should be int"
        
        print("PASS: Scan results structure is valid")
    
    def test_findings_structure(self, admin_token):
        """Validate findings have correct structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        
        data = resp.json()
        findings = data.get("findings", [])
        
        if len(findings) == 0:
            print("INFO: No findings to validate structure")
            return
        
        # Check first finding structure
        finding = findings[0]
        required_fields = ["type", "severity", "file", "line", "description", "recommendation"]
        for field in required_fields:
            assert field in finding, f"Finding missing required field: {field}"
        
        # Validate severity is valid
        valid_severities = ["critical", "high", "medium", "low", "info"]
        assert finding["severity"] in valid_severities, f"Invalid severity: {finding['severity']}"
        
        print("PASS: Findings structure is valid")
    
    def test_no_mongodb_id_leak(self, admin_token):
        """Ensure MongoDB _id is not leaked in responses"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Check latest scan
        resp = requests.get(f"{BASE_URL}/api/admin/security/latest", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        if data.get("scan"):
            assert "_id" not in data["scan"], "MongoDB _id should not be in scan response"
        
        for finding in data.get("findings", []):
            assert "_id" not in finding, "MongoDB _id should not be in findings response"
        
        # Check history
        resp = requests.get(f"{BASE_URL}/api/admin/security/history", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        for scan in data.get("scans", []):
            assert "_id" not in scan, "MongoDB _id should not be in history response"
        
        print("PASS: No MongoDB _id leak detected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
