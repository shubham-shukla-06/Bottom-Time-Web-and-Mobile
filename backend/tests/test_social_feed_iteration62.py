"""
Test Social Feed, Species Sightings, Bucket List, Dive Photos, Group Checkout
Tests for iteration 62 - Instagram for Divers social layer
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"
TEST_USER_ID = "0c4b55e1-6c18-4155-887f-1ad4b7167e69"


class TestPublicEndpoints:
    """Test public endpoints that don't require auth"""
    
    def test_species_common_returns_30_species(self):
        """GET /api/species/common should return 30 common marine species"""
        response = requests.get(f"{BASE_URL}/api/species/common")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "species" in data, "Response should have 'species' field"
        assert len(data["species"]) == 30, f"Expected 30 species, got {len(data['species'])}"
        # Verify some expected species
        expected_species = ["Manta Ray", "Whale Shark", "Sea Turtle", "Clownfish", "Octopus"]
        for species in expected_species:
            assert species in data["species"], f"Expected {species} in species list"
    
    def test_user_species_log_public(self):
        """GET /api/species/user/{userId} should be public"""
        response = requests.get(f"{BASE_URL}/api/species/user/{TEST_USER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "species" in data, "Response should have 'species' field"
        assert "unique_count" in data, "Response should have 'unique_count' field"
    
    def test_user_bucket_list_public(self):
        """GET /api/bucket-list/user/{userId} should be public"""
        response = requests.get(f"{BASE_URL}/api/bucket-list/user/{TEST_USER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "items" in data, "Response should have 'items' field"


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
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
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    # =====================
    # ACTIVITY FEED TESTS
    # =====================
    
    def test_get_activity_feed(self, auth_headers):
        """GET /api/feed should return feed items"""
        response = requests.get(f"{BASE_URL}/api/feed", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "items" in data, "Response should have 'items' field"
        assert "has_more" in data, "Response should have 'has_more' field"
        assert isinstance(data["items"], list), "Items should be a list"
    
    def test_get_feed_with_pagination(self, auth_headers):
        """GET /api/feed should support skip/limit pagination"""
        response = requests.get(f"{BASE_URL}/api/feed?skip=0&limit=5", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 5, "Should respect limit parameter"
    
    def test_feed_requires_auth(self):
        """GET /api/feed should require authentication"""
        response = requests.get(f"{BASE_URL}/api/feed")
        assert response.status_code == 401 or response.status_code == 403, "Feed should require auth"
    
    # =====================
    # BUCKET LIST TESTS
    # =====================
    
    def test_create_bucket_list_item(self, auth_headers):
        """POST /api/bucket-list should create a bucket list item"""
        payload = {
            "site_name": f"TEST_Great_Barrier_Reef_{uuid.uuid4().hex[:6]}",
            "location": "Queensland",
            "country": "Australia",
            "why": "Want to see the corals before climate change"
        }
        response = requests.post(f"{BASE_URL}/api/bucket-list", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Response should have 'id'"
        assert data["site_name"] == payload["site_name"], "Site name should match"
        assert data["completed"] == False, "New item should not be completed"
    
    def test_get_bucket_list(self, auth_headers):
        """GET /api/bucket-list should return user's bucket list"""
        response = requests.get(f"{BASE_URL}/api/bucket-list", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data, "Response should have 'items' field"
        assert isinstance(data["items"], list)
    
    def test_update_bucket_list_item(self, auth_headers):
        """PUT /api/bucket-list/{id} should update item"""
        # First create an item
        create_payload = {
            "site_name": f"TEST_Sipadan_{uuid.uuid4().hex[:6]}",
            "location": "Sabah",
            "country": "Malaysia"
        }
        create_response = requests.post(f"{BASE_URL}/api/bucket-list", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        item_id = create_response.json()["id"]
        
        # Update the item
        update_payload = {"completed": True}
        update_response = requests.put(f"{BASE_URL}/api/bucket-list/{item_id}", json=update_payload, headers=auth_headers)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        data = update_response.json()
        assert data["completed"] == True, "Item should be marked as completed"
        assert data["completed_date"] is not None, "Completed date should be set"
    
    def test_bucket_list_requires_site_name(self, auth_headers):
        """POST /api/bucket-list should require site_name"""
        response = requests.post(f"{BASE_URL}/api/bucket-list", json={}, headers=auth_headers)
        assert response.status_code == 400, "Should reject missing site_name"
    
    def test_delete_bucket_list_item(self, auth_headers):
        """DELETE /api/bucket-list/{id} should delete item"""
        # First create an item
        create_payload = {"site_name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}"}
        create_response = requests.post(f"{BASE_URL}/api/bucket-list", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        item_id = create_response.json()["id"]
        
        # Delete the item
        delete_response = requests.delete(f"{BASE_URL}/api/bucket-list/{item_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        assert delete_response.json().get("deleted") == True
    
    # =====================
    # MY SPECIES LOG TESTS
    # =====================
    
    def test_get_my_species_log(self, auth_headers):
        """GET /api/species/my-log should return user's species sightings"""
        response = requests.get(f"{BASE_URL}/api/species/my-log", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "species" in data, "Response should have 'species' field"
        assert "unique_count" in data, "Response should have 'unique_count' field"
    
    # =====================
    # FEED REACTIONS TESTS
    # =====================
    
    def test_reaction_validation(self, auth_headers):
        """POST /api/feed/{itemId}/react should validate reaction type"""
        fake_item_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/feed/{fake_item_id}/react",
            json={"reaction": "invalid_reaction"},
            headers=auth_headers
        )
        assert response.status_code == 400, "Should reject invalid reaction type"
    
    def test_valid_reaction_types(self, auth_headers):
        """Valid reaction types should be heart, stoke, epic, fire, jealous"""
        valid_reactions = ["heart", "stoke", "epic", "fire", "jealous"]
        fake_item_id = str(uuid.uuid4())
        
        for reaction in valid_reactions:
            # This may return 200 (item not found is handled gracefully) or 404
            response = requests.post(
                f"{BASE_URL}/api/feed/{fake_item_id}/react",
                json={"reaction": reaction},
                headers=auth_headers
            )
            # Should not be 400 for valid reaction types
            assert response.status_code != 400 or "must be one of" not in response.text, \
                f"Reaction '{reaction}' should be valid"


class TestProductsRegression:
    """Regression test for products API"""
    
    def test_products_returns_16_items(self):
        """GET /api/products should return 16 products"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert len(data["products"]) == 16, f"Expected 16 products, got {len(data['products'])}"


class TestDiveLogSightings:
    """Test adding sightings to dive logs"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token using email/phone OTP login flow"""
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_EMAIL,
            "code": TEST_OTP
        })
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_PHONE,
            "code": TEST_OTP
        })
        login_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_EMAIL,
            "email_verified_token": email_verify.json().get("verification_token"),
            "phone_verified_token": phone_verify.json().get("verification_token")
        })
        if login_response.status_code != 200:
            pytest.skip("Auth failed")
        return login_response.json().get("access_token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_add_sightings_requires_dive(self, auth_headers):
        """POST /api/dive-log/{diveId}/sightings should require valid dive"""
        fake_dive_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/dive-log/{fake_dive_id}/sightings",
            json={"species": [{"name": "Manta Ray", "count": 1}]},
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent dive"
    
    def test_add_sightings_requires_species(self, auth_headers):
        """POST /api/dive-log/{diveId}/sightings should require at least one species"""
        fake_dive_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/dive-log/{fake_dive_id}/sightings",
            json={"species": []},
            headers=auth_headers
        )
        assert response.status_code == 400, "Should reject empty species list"


class TestGroupCheckout:
    """Test group checkout functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token using email/phone OTP login flow"""
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_EMAIL,
            "code": TEST_OTP
        })
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_PHONE,
            "code": TEST_OTP
        })
        login_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_EMAIL,
            "email_verified_token": email_verify.json().get("verification_token"),
            "phone_verified_token": phone_verify.json().get("verification_token")
        })
        if login_response.status_code != 200:
            pytest.skip("Auth failed")
        return login_response.json().get("access_token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_group_book_requires_trip(self, auth_headers):
        """POST /api/trips/{tripId}/group-book should require valid trip"""
        fake_trip_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/trips/{fake_trip_id}/group-book",
            json={"listing_id": "some-listing", "date": "2025-06-01"},
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent trip"
    
    def test_group_book_requires_listing_and_date(self, auth_headers):
        """POST /api/trips/{tripId}/group-book should require listing_id and date"""
        # First create a trip
        trip_response = requests.post(
            f"{BASE_URL}/api/trips",
            json={"name": f"TEST_GroupBook_{uuid.uuid4().hex[:6]}", "destination": "Maldives"},
            headers=auth_headers
        )
        if trip_response.status_code != 200:
            pytest.skip("Could not create trip")
        trip_id = trip_response.json()["id"]
        
        # Try to group book without required fields
        response = requests.post(
            f"{BASE_URL}/api/trips/{trip_id}/group-book",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 400, "Should require listing_id and date"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/trips/{trip_id}", headers=auth_headers)


class TestDivePhotoUpload:
    """Test dive photo upload functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token using email/phone OTP login flow"""
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_EMAIL,
            "code": TEST_OTP
        })
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_PHONE,
            "code": TEST_OTP
        })
        login_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_EMAIL,
            "email_verified_token": email_verify.json().get("verification_token"),
            "phone_verified_token": phone_verify.json().get("verification_token")
        })
        if login_response.status_code != 200:
            pytest.skip("Auth failed")
        return login_response.json().get("access_token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_photo_upload_requires_valid_dive(self, auth_headers):
        """POST /api/dive-log/{diveId}/photos should require valid dive"""
        fake_dive_id = str(uuid.uuid4())
        # Create a simple test image (1x1 pixel PNG)
        import base64
        # Minimal PNG image
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test.png", png_data, "image/png")}
        # Remove Content-Type header for multipart
        headers = {"Authorization": auth_headers["Authorization"]}
        response = requests.post(
            f"{BASE_URL}/api/dive-log/{fake_dive_id}/photos",
            files=files,
            headers=headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent dive"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
