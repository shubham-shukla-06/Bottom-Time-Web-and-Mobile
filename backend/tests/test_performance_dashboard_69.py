"""
Test suite for Performance Monitoring Dashboard feature - Iteration 69
Tests:
1. /api/cmd/perf endpoint - returns correct performance metrics structure
2. /api/cmd/perf/cache-report endpoint - accepts cache stats reports
3. Existing API endpoints still work (regression)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def get_admin_token():
    """Helper to get admin access token via 2FA flow"""
    # Step 1: Send email OTP
    r1 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
    if r1.status_code != 200:
        print(f"Step 1 failed: {r1.text}")
        return None
    
    # Step 2: Verify email OTP (uses 'code' field, returns 'verification_token')
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
    if r2.status_code != 200:
        print(f"Step 2 failed: {r2.text}")
        return None
    email_token = r2.json().get("verification_token")
    
    # Step 3: Send phone OTP
    r3 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
    if r3.status_code != 200:
        print(f"Step 3 failed: {r3.text}")
        return None
    
    # Step 4: Verify phone OTP
    r4 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
    if r4.status_code != 200:
        print(f"Step 4 failed: {r4.text}")
        return None
    phone_token = r4.json().get("verification_token")
    
    # Step 5: Login complete (uses email_verified_token and phone_verified_token field names)
    r5 = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": "admin@bottomtime.com",
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    if r5.status_code != 200:
        print(f"Step 5 failed: {r5.text}")
        return None
    return r5.json().get("access_token")


def get_test_user_token():
    """Helper to get test user token (non-admin)"""
    r1 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "test@bottomtime.com"})
    if r1.status_code != 200:
        return None
    
    r2 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "test@bottomtime.com", "code": "123456"})
    if r2.status_code != 200:
        return None
    email_token = r2.json().get("verification_token")
    
    r3 = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+919876543210"})
    if r3.status_code != 200:
        return None
    
    r4 = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+919876543210", "code": "123456"})
    if r4.status_code != 200:
        return None
    phone_token = r4.json().get("verification_token")
    
    r5 = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": "test@bottomtime.com",
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    if r5.status_code != 200:
        return None
    return r5.json().get("access_token")


class TestAuthFlow:
    """2FA Auth flow - email OTP + phone OTP"""
    
    def test_admin_token_obtained(self):
        """Verify admin token was obtained successfully"""
        token = get_admin_token()
        assert token is not None, "Could not obtain admin token"
        assert len(token) > 20, "Token seems too short"


class TestPerfEndpoint:
    """Tests for /api/cmd/perf endpoint"""
    
    def test_perf_endpoint_requires_auth(self):
        """Perf endpoint should require authentication (returns 401 or 403)"""
        r = requests.get(f"{BASE_URL}/api/cmd/perf")
        assert r.status_code in [401, 403], f"Expected 401/403, got {r.status_code}"
    
    def test_perf_endpoint_returns_correct_structure(self):
        """Verify /cmd/perf returns all expected fields"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        
        # Check top-level keys
        required_keys = ["summary", "compression", "cache", "distribution", "status_codes", "timeline", "endpoints", "indexes"]
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
        
        # Verify summary structure
        summary = data["summary"]
        summary_keys = ["total_requests_60s", "rps", "avg_ms", "p50_ms", "p95_ms", "p99_ms", "error_rate"]
        for key in summary_keys:
            assert key in summary, f"Missing summary key: {key}"
        
        # Verify compression structure
        compression = data["compression"]
        compression_keys = ["total_requests", "compressed", "ratio"]
        for key in compression_keys:
            assert key in compression, f"Missing compression key: {key}"
        
        # Verify cache structure
        cache = data["cache"]
        cache_keys = ["hits", "misses", "hit_rate"]
        for key in cache_keys:
            assert key in cache, f"Missing cache key: {key}"
        
        # Verify indexes structure (MongoDB)
        indexes = data["indexes"]
        assert "total" in indexes, "Missing indexes.total"
        assert "collections" in indexes, "Missing indexes.collections"
        assert indexes["total"] >= 0, "indexes.total should be non-negative"
        assert indexes["collections"] >= 0, "indexes.collections should be non-negative"
        
        # Verify distribution is a list
        assert isinstance(data["distribution"], list), "distribution should be a list"
        
        # Verify timeline is a list
        assert isinstance(data["timeline"], list), "timeline should be a list"
        
        # Verify endpoints is a list
        assert isinstance(data["endpoints"], list), "endpoints should be a list"
        
        # Verify status_codes is a list
        assert isinstance(data["status_codes"], list), "status_codes should be a list"
    
    def test_perf_endpoint_distribution_buckets(self):
        """Verify distribution has correct time buckets"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r.status_code == 200
        
        distribution = r.json()["distribution"]
        expected_buckets = ["<50ms", "50-100ms", "100-300ms", "300-1000ms", ">1s"]
        actual_buckets = [d["bucket"] for d in distribution]
        
        for bucket in expected_buckets:
            assert bucket in actual_buckets, f"Missing bucket: {bucket}"
    
    def test_perf_endpoint_timeline_structure(self):
        """Verify timeline has proper time entries"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r.status_code == 200
        
        timeline = r.json()["timeline"]
        assert len(timeline) == 12, f"Expected 12 timeline entries, got {len(timeline)}"
        
        for entry in timeline:
            assert "time" in entry, "Timeline entry missing 'time'"
            assert "requests" in entry, "Timeline entry missing 'requests'"
            assert "avg_ms" in entry, "Timeline entry missing 'avg_ms'"


class TestCacheReportEndpoint:
    """Tests for /api/cmd/perf/cache-report endpoint"""
    
    def test_cache_report_accepts_valid_data(self):
        """Verify cache-report accepts hits/misses and returns ok"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"hits": 100, "misses": 25}
        
        r = requests.post(f"{BASE_URL}/api/cmd/perf/cache-report", json=payload, headers=headers)
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "ok" in data, "Response should contain 'ok' key"
        assert data["ok"] == True, "Response should be {'ok': true}"
    
    def test_cache_report_updates_cache_stats(self):
        """Verify cache stats are updated after reporting"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get initial cache stats
        r1 = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r1.status_code == 200
        initial_hits = r1.json()["cache"]["hits"]
        initial_misses = r1.json()["cache"]["misses"]
        
        # Report additional cache stats
        payload = {"hits": 50, "misses": 10}
        r2 = requests.post(f"{BASE_URL}/api/cmd/perf/cache-report", json=payload, headers=headers)
        assert r2.status_code == 200
        
        # Verify cache stats increased
        r3 = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r3.status_code == 200
        new_hits = r3.json()["cache"]["hits"]
        new_misses = r3.json()["cache"]["misses"]
        
        assert new_hits >= initial_hits + 50, f"Hits should increase by at least 50. Was {initial_hits}, now {new_hits}"
        assert new_misses >= initial_misses + 10, f"Misses should increase by at least 10. Was {initial_misses}, now {new_misses}"


class TestExistingAPIsRegression:
    """Regression tests - ensure existing APIs still work"""
    
    def test_products_endpoint(self):
        """Verify /api/products still works"""
        r = requests.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "products" in data, "Missing 'products' key"
        assert isinstance(data["products"], list), "products should be a list"
    
    def test_listings_endpoint(self):
        """Verify /api/listings still works"""
        r = requests.get(f"{BASE_URL}/api/listings")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "listings" in data, "Missing 'listings' key"
        assert isinstance(data["listings"], list), "listings should be a list"
    
    def test_exchange_rates_endpoint(self):
        """Verify /api/exchange-rates still works"""
        r = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "rates" in data, "Missing 'rates' key"


class TestPerfMiddlewareTracking:
    """Tests to verify PerfMiddleware is tracking requests"""
    
    def test_middleware_tracks_api_requests(self):
        """Verify middleware tracks requests after making some API calls"""
        token = get_admin_token()
        if not token:
            pytest.skip("Could not obtain admin token")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get initial request count
        r1 = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r1.status_code == 200
        initial_compression_requests = r1.json()["compression"]["total_requests"]
        
        # Make several API requests
        for _ in range(5):
            requests.get(f"{BASE_URL}/api/products")
            requests.get(f"{BASE_URL}/api/listings")
        
        # Get new stats
        r2 = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        assert r2.status_code == 200
        new_compression_requests = r2.json()["compression"]["total_requests"]
        
        # Should have tracked more requests (at least 10 new ones plus the perf calls)
        assert new_compression_requests > initial_compression_requests, \
            f"Compression requests should increase. Was {initial_compression_requests}, now {new_compression_requests}"


class TestNonAdminAccess:
    """Tests to verify non-admin users cannot access perf endpoint"""
    
    def test_non_admin_cannot_access_perf(self):
        """Non-admin users should get 403 when accessing /cmd/perf"""
        token = get_test_user_token()
        if not token:
            pytest.skip("Could not obtain test user token")
        
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE_URL}/api/cmd/perf", headers=headers)
        
        # Should return 403 Forbidden for non-admin
        assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}"
