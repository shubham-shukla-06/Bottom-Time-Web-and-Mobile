"""
Test Wishlist & Enhanced Reviews Features (Iteration 14)

Wishlist Tests:
- POST /api/wishlist/{listing_id} - Toggle wishlist on/off
- GET /api/wishlist - Get saved listings with full details
- GET /api/wishlist/ids - Get just listing IDs (for UI heart state)

Reviews Tests (Enhanced):
- GET /api/reviews/{listing_id} - Returns reviews + stats with distribution
- POST /api/reviews - Create review with verified_booking badge
- POST /api/reviews/{review_id}/helpful - Toggle helpful vote
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
OTP_CODE = "123456"

# Test user credentials from the request
TEST_USER_EMAIL = "alex@test.com"
TEST_USER_PHONE = "+12025551234"


class TestAuth:
    """Get auth token for testing protected endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate test user using 2FA flow"""
        # Step 1: Send OTP to email
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_USER_EMAIL})
        assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
        
        # Step 2: Verify email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_EMAIL,
            "code": OTP_CODE
        })
        assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
        email_token = resp.json()["verification_token"]
        
        # Step 3: Send OTP to phone
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_USER_PHONE})
        assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
        
        # Step 4: Verify phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_PHONE,
            "code": OTP_CODE
        })
        assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
        phone_token = resp.json()["verification_token"]
        
        # Step 5: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_USER_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
        return resp.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}


class TestWishlistAPI(TestAuth):
    """Wishlist feature tests"""
    
    @pytest.fixture(scope="class")
    def test_listing_id(self, auth_headers):
        """Get a listing ID to use for wishlist tests"""
        resp = requests.get(f"{BASE_URL}/api/listings?limit=1")
        assert resp.status_code == 200
        listings = resp.json()["listings"]
        assert len(listings) > 0, "No listings found in DB for testing"
        return listings[0]["id"]
    
    def test_wishlist_toggle_add(self, auth_headers, test_listing_id):
        """Test adding item to wishlist - POST /api/wishlist/{listing_id}"""
        # First clear any existing wishlist entry
        requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        # Ensure it's removed first
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        ids = resp.json().get("listing_ids", [])
        if test_listing_id in ids:
            requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        
        # Now add to wishlist
        resp = requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        assert resp.status_code == 200, f"Failed to add to wishlist: {resp.text}"
        data = resp.json()
        assert "wishlisted" in data
        assert data["wishlisted"] == True, "Expected wishlisted=True after adding"
        
    def test_wishlist_toggle_remove(self, auth_headers, test_listing_id):
        """Test removing item from wishlist by toggling again"""
        # First ensure it's in the wishlist
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        ids = resp.json().get("listing_ids", [])
        if test_listing_id not in ids:
            requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        
        # Now toggle to remove
        resp = requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "wishlisted" in data
        assert data["wishlisted"] == False, "Expected wishlisted=False after removing"
    
    def test_wishlist_get_ids(self, auth_headers, test_listing_id):
        """Test GET /api/wishlist/ids returns listing IDs"""
        # Add item first
        requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        ids = resp.json().get("listing_ids", [])
        if test_listing_id not in ids:
            requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "listing_ids" in data
        assert isinstance(data["listing_ids"], list)
        assert test_listing_id in data["listing_ids"], "Test listing not in wishlist IDs"
        
    def test_wishlist_get_full(self, auth_headers, test_listing_id):
        """Test GET /api/wishlist returns full listing details"""
        # Ensure item is in wishlist
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        ids = resp.json().get("listing_ids", [])
        if test_listing_id not in ids:
            requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        
        resp = requests.get(f"{BASE_URL}/api/wishlist", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "listings" in data
        assert "listing_ids" in data
        assert isinstance(data["listings"], list)
        
        # Find our test listing
        found = False
        for listing in data["listings"]:
            if listing["id"] == test_listing_id:
                found = True
                # Verify full listing details are returned
                assert "name" in listing
                assert "location" in listing
                assert "rating" in listing
                assert "image_url" in listing
                break
        assert found, "Test listing not found in wishlist full response"
    
    def test_wishlist_404_invalid_listing(self, auth_headers):
        """Test wishlist toggle with invalid listing returns 404"""
        resp = requests.post(f"{BASE_URL}/api/wishlist/invalid-listing-id-12345", headers=auth_headers)
        assert resp.status_code == 404
        
    def test_wishlist_401_unauthenticated(self):
        """Test wishlist endpoints require authentication"""
        resp = requests.get(f"{BASE_URL}/api/wishlist")
        assert resp.status_code in [401, 403]
        
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids")
        assert resp.status_code in [401, 403]
        
        resp = requests.post(f"{BASE_URL}/api/wishlist/some-id")
        assert resp.status_code in [401, 403]


class TestReviewsAPI(TestAuth):
    """Enhanced Reviews feature tests"""
    
    @pytest.fixture(scope="class")
    def test_listing_id(self, auth_headers):
        """Get a listing ID for review tests"""
        resp = requests.get(f"{BASE_URL}/api/listings?limit=5")
        assert resp.status_code == 200
        listings = resp.json()["listings"]
        assert len(listings) > 0, "No listings found in DB for testing"
        # Use second listing to avoid conflicts with wishlist tests
        return listings[min(1, len(listings)-1)]["id"]
    
    def test_reviews_get_with_stats(self, test_listing_id):
        """Test GET /api/reviews/{listing_id} returns reviews with stats and distribution"""
        resp = requests.get(f"{BASE_URL}/api/reviews/{test_listing_id}")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "reviews" in data
        assert "stats" in data
        assert isinstance(data["reviews"], list)
        
        # Verify stats structure
        stats = data["stats"]
        assert "total" in stats
        assert "average" in stats
        assert "distribution" in stats
        
        # Verify distribution has all 5 star ratings
        dist = stats["distribution"]
        for rating in [1, 2, 3, 4, 5]:
            # Accept both int keys and string keys
            assert rating in dist or str(rating) in dist, f"Missing {rating}-star in distribution"
    
    def test_reviews_create(self, auth_headers, test_listing_id):
        """Test POST /api/reviews creates review with metadata"""
        review_data = {
            "listing_id": test_listing_id,
            "rating": 5,
            "comment": "TEST_REVIEW - Excellent dive experience! Great instructor and beautiful marine life."
        }
        
        resp = requests.post(f"{BASE_URL}/api/reviews", json=review_data, headers=auth_headers)
        
        # If already reviewed, that's OK - check the error
        if resp.status_code == 400 and "already reviewed" in resp.text.lower():
            print("User already reviewed this listing - test passes")
            return
        
        assert resp.status_code == 200, f"Failed to create review: {resp.text}"
        data = resp.json()
        
        # Verify review structure
        assert "id" in data
        assert "rating" in data
        assert data["rating"] == 5
        assert "comment" in data
        assert "user_name" in data
        assert "verified_booking" in data  # New field for verified booking badge
        assert "helpful_count" in data
        assert data["helpful_count"] == 0
        assert "created_at" in data
        
    def test_reviews_rating_validation(self, auth_headers, test_listing_id):
        """Test review rating must be 1-5"""
        # Test rating < 1
        resp = requests.post(f"{BASE_URL}/api/reviews", json={
            "listing_id": test_listing_id,
            "rating": 0,
            "comment": "Invalid rating test"
        }, headers=auth_headers)
        assert resp.status_code == 400, "Should reject rating 0"
        
        # Test rating > 5
        resp = requests.post(f"{BASE_URL}/api/reviews", json={
            "listing_id": test_listing_id,
            "rating": 6,
            "comment": "Invalid rating test"
        }, headers=auth_headers)
        assert resp.status_code == 400, "Should reject rating 6"
    
    def test_reviews_helpful_toggle(self, auth_headers, test_listing_id):
        """Test POST /api/reviews/{review_id}/helpful toggles helpful vote"""
        # First get a review to vote on
        resp = requests.get(f"{BASE_URL}/api/reviews/{test_listing_id}")
        assert resp.status_code == 200
        reviews = resp.json()["reviews"]
        
        if len(reviews) == 0:
            pytest.skip("No reviews found to test helpful toggle")
        
        review_id = reviews[0]["id"]
        reviews[0].get("helpful_count", 0)
        
        # Toggle helpful
        resp = requests.post(f"{BASE_URL}/api/reviews/{review_id}/helpful", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "helpful" in data
        
        # Toggle again should reverse
        resp = requests.post(f"{BASE_URL}/api/reviews/{review_id}/helpful", headers=auth_headers)
        assert resp.status_code == 200
        
    def test_reviews_helpful_404(self, auth_headers):
        """Test helpful on non-existent review returns 404"""
        resp = requests.post(f"{BASE_URL}/api/reviews/invalid-review-id/helpful", headers=auth_headers)
        assert resp.status_code == 404
        
    def test_reviews_helpful_requires_auth(self):
        """Test helpful endpoint requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/reviews/some-id/helpful")
        assert resp.status_code in [401, 403]
    
    def test_reviews_distribution_calculation(self, test_listing_id):
        """Verify rating distribution is correctly calculated"""
        resp = requests.get(f"{BASE_URL}/api/reviews/{test_listing_id}")
        assert resp.status_code == 200
        data = resp.json()
        
        reviews = data["reviews"]
        stats = data["stats"]
        
        # Manually calculate distribution
        calc_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for r in reviews:
            calc_dist[r["rating"]] = calc_dist.get(r["rating"], 0) + 1
        
        # Compare with API distribution
        api_dist = stats["distribution"]
        for rating in [1, 2, 3, 4, 5]:
            key = rating if rating in api_dist else str(rating)
            if key in api_dist:
                assert api_dist[key] == calc_dist[rating], f"Distribution mismatch for {rating}-star"
        
        # Verify total matches
        assert stats["total"] == len(reviews), "Total count mismatch"


class TestWishlistReviewsIntegration(TestAuth):
    """Integration tests combining wishlist and reviews"""
    
    @pytest.fixture(scope="class")
    def test_listing_id(self, auth_headers):
        """Get a listing for integration tests"""
        resp = requests.get(f"{BASE_URL}/api/listings?limit=1")
        assert resp.status_code == 200
        listings = resp.json()["listings"]
        assert len(listings) > 0
        return listings[0]["id"]
    
    def test_listing_detail_with_reviews(self, test_listing_id):
        """Test that listing detail endpoint still works"""
        resp = requests.get(f"{BASE_URL}/api/listings/{test_listing_id}")
        assert resp.status_code == 200
        listing = resp.json()
        
        # Verify listing has rating info that gets updated by reviews
        assert "rating" in listing
        assert "review_count" in listing
        
    def test_wishlist_then_review_flow(self, auth_headers, test_listing_id):
        """Test typical user flow: save to wishlist, then review"""
        # 1. Add to wishlist
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        ids = resp.json().get("listing_ids", [])
        if test_listing_id not in ids:
            requests.post(f"{BASE_URL}/api/wishlist/{test_listing_id}", headers=auth_headers)
        
        # 2. Verify in wishlist
        resp = requests.get(f"{BASE_URL}/api/wishlist/ids", headers=auth_headers)
        assert resp.status_code == 200
        
        # 3. Get reviews for the listing
        resp = requests.get(f"{BASE_URL}/api/reviews/{test_listing_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "stats" in data
        assert "reviews" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
