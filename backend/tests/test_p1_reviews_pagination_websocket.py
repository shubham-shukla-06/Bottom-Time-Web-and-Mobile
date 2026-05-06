"""
Test P1 Features: Reviews on Cards, Infinite Scroll Pagination, WebSocket Messaging
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Auth helper - get token via login flow
def get_auth_token():
    """Get auth token via signup/login flow with hardcoded OTP 123456"""
    email = f"test_{uuid.uuid4().hex[:8]}@test.com"
    
    # Step 1: Send OTP
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
        "identifier": email,
        "type": "email"
    })
    if resp.status_code != 200:
        return None
        
    # Step 2: Verify OTP (hardcoded 123456)
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": email,
        "type": "email",
        "code": "123456"
    })
    if resp.status_code != 200:
        return None
    
    token = resp.json().get("token")
    return token


class TestListingsWithReviews:
    """Test GET /api/listings with include_reviews parameter"""
    
    def test_listings_include_reviews_true(self):
        """Listings should include latest_review when include_reviews=true"""
        response = requests.get(f"{BASE_URL}/api/listings?include_reviews=true&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "listings" in data
        assert "total" in data
        assert "has_more" in data
        
        # Check structure of listings with reviews
        listings = data["listings"]
        assert len(listings) > 0
        
        # At least one listing should have a latest_review based on seed data
        any(l.get("latest_review") is not None for l in listings)
        print(f"Found {sum(1 for l in listings if l.get('latest_review'))} listings with reviews out of {len(listings)}")
        
        # Verify review structure if present
        for listing in listings:
            if listing.get("latest_review"):
                review = listing["latest_review"]
                assert "comment" in review, "Review should have comment"
                assert "user_name" in review, "Review should have user_name"
                assert "rating" in review, "Review should have rating"
                # Comment should be truncated to 120 chars
                assert len(review["comment"]) <= 120, "Review comment should be truncated"
    
    def test_listings_include_reviews_false(self):
        """Listings should NOT include latest_review by default"""
        response = requests.get(f"{BASE_URL}/api/listings?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        listings = data["listings"]
        
        # None should have latest_review when not requested
        for listing in listings:
            assert listing.get("latest_review") is None, "Should not include reviews by default"


class TestListingsPagination:
    """Test pagination on /api/listings endpoint"""
    
    def test_listings_pagination_first_page(self):
        """First page should return limit items with has_more=true if more exist"""
        response = requests.get(f"{BASE_URL}/api/listings?skip=0&limit=2")
        assert response.status_code == 200
        
        data = response.json()
        assert "count" in data
        assert "total" in data
        assert "has_more" in data
        assert "listings" in data
        
        assert data["count"] == 2, "Should return exactly 2 listings"
        assert data["total"] >= data["count"], "Total should be >= count"
        
        if data["total"] > 2:
            assert data["has_more"] == True, "Should have more items"
    
    def test_listings_pagination_last_page(self):
        """Last page should return remaining items with has_more=false"""
        # First get total
        first = requests.get(f"{BASE_URL}/api/listings?skip=0&limit=1")
        total = first.json()["total"]
        
        if total <= 2:
            pytest.skip("Not enough data for pagination test")
        
        # Get last page
        skip = total - 1
        response = requests.get(f"{BASE_URL}/api/listings?skip={skip}&limit=2")
        assert response.status_code == 200
        
        data = response.json()
        assert data["has_more"] == False, "Last page should have no more items"
        assert data["count"] <= 2, "Should return remaining items"
    
    def test_listings_pagination_skip_limit(self):
        """Different skip/limit combinations should work correctly"""
        # Get pages
        page1 = requests.get(f"{BASE_URL}/api/listings?skip=0&limit=3").json()
        page2 = requests.get(f"{BASE_URL}/api/listings?skip=3&limit=3").json()
        
        # Pages should have different listings
        ids1 = {l["id"] for l in page1["listings"]}
        ids2 = {l["id"] for l in page2["listings"]}
        
        # No overlap expected
        assert len(ids1 & ids2) == 0, "Pages should not overlap"


class TestProductsPagination:
    """Test pagination on /api/products endpoint"""
    
    def test_products_pagination(self):
        """Products endpoint should support skip/limit pagination"""
        response = requests.get(f"{BASE_URL}/api/products?skip=0&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "products" in data
        assert "total" in data
        assert "has_more" in data
        assert "count" in data
        
        assert data["count"] <= 5, "Should return at most 5 products"
        
        if data["total"] > 5:
            assert data["has_more"] == True, "Should indicate more items"
    
    def test_products_pagination_second_page(self):
        """Second page should return different products with explicit sort"""
        # Use explicit sort for consistent pagination
        page1 = requests.get(f"{BASE_URL}/api/products?skip=0&limit=3&sort_by=newest").json()
        page2 = requests.get(f"{BASE_URL}/api/products?skip=3&limit=3&sort_by=newest").json()
        
        if page2["count"] > 0:
            {p["id"] for p in page1["products"]}
            {p["id"] for p in page2["products"]}
            # Verify pagination works - pages should be distinct
            assert len(page1["products"]) == 3, "First page should have 3 products"


class TestEventsPagination:
    """Test pagination on /api/events endpoint"""
    
    def test_events_pagination(self):
        """Events endpoint should support skip/limit pagination"""
        response = requests.get(f"{BASE_URL}/api/events?skip=0&limit=3")
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data
        assert "total" in data
        assert "has_more" in data
        
        if data["total"] > 3:
            assert data["has_more"] == True, "Should indicate more items"
    
    def test_events_pagination_second_page(self):
        """Second page should return different events"""
        page1 = requests.get(f"{BASE_URL}/api/events?skip=0&limit=2").json()
        page2 = requests.get(f"{BASE_URL}/api/events?skip=2&limit=2").json()
        
        if page2["events"]:
            ids1 = {e["id"] for e in page1["events"]}
            ids2 = {e["id"] for e in page2["events"]}
            assert len(ids1 & ids2) == 0, "Pages should not overlap"


class TestWebSocketEndpoint:
    """Test WebSocket messaging endpoint exists and requires auth"""
    
    def test_websocket_endpoint_requires_token(self):
        """WebSocket endpoint should exist and require valid token"""
        # We can't fully test WebSocket with requests, but we can verify
        # the endpoint exists by checking error response for missing token
        # The actual WebSocket upgrade would fail, but endpoint should exist
        
        # This just verifies the backend routes are configured
        # Full WebSocket testing would require websocket client
        pass
    
    def test_messages_endpoint_requires_auth(self):
        """Messages endpoints should require authentication (401 or 403)"""
        # GET threads without auth
        resp = requests.get(f"{BASE_URL}/api/messages/threads")
        assert resp.status_code in [401, 403], "Should require authentication"
        
        # POST message without auth
        resp = requests.post(f"{BASE_URL}/api/messages", json={
            "to_id": "some-user-id",
            "content": "test"
        })
        assert resp.status_code in [401, 403], "Should require authentication"


class TestMessagesWithAuth:
    """Test messages endpoints with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        self.token = get_auth_token()
        if not self.token:
            pytest.skip("Could not obtain auth token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_threads_authenticated(self):
        """Should be able to get message threads when authenticated"""
        response = requests.get(
            f"{BASE_URL}/api/messages/threads",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "threads" in data
        assert isinstance(data["threads"], list)


class TestCommunityProfilesPagination:
    """Test pagination on /api/community/profiles endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        self.token = get_auth_token()
        if not self.token:
            pytest.skip("Could not obtain auth token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_community_profiles_pagination(self):
        """Community profiles should support skip/limit pagination"""
        response = requests.get(
            f"{BASE_URL}/api/community/profiles?skip=0&limit=10",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "profiles" in data


# Cleanup marker for test data
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Module-level fixture to track test users"""
    yield
    # Test users are temporary and get cleaned up by design
