"""
Test Operator Dashboard APIs - Listing CRUD, Operator Stats, Authorization
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OPERATOR_EMAIL = "operator@bottomtime.com"
OPERATOR_PHONE = "+12025558888"
INSTRUCTOR_EMAIL = "instructor@bottomtime.com"
INSTRUCTOR_PHONE = "+12025557777"
DIVER_EMAIL = "demo@bottomtime.com"
DIVER_PHONE = "+12025550001"
OTP_CODE = "123456"


def get_auth_token(email, phone):
    """Complete the full 2FA login flow and return access token"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Step 1: Send OTP to email
    r = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
    if r.status_code != 200:
        print(f"Failed to send email OTP: {r.status_code} - {r.text}")
        return None
    
    # Step 2: Verify email OTP
    r = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": OTP_CODE})
    if r.status_code != 200:
        print(f"Failed to verify email OTP: {r.status_code} - {r.text}")
        return None
    email_token = r.json().get("verification_token")
    
    # Step 3: Send OTP to phone
    r = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
    if r.status_code != 200:
        print(f"Failed to send phone OTP: {r.status_code} - {r.text}")
        return None
    
    # Step 4: Verify phone OTP
    r = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": OTP_CODE})
    if r.status_code != 200:
        print(f"Failed to verify phone OTP: {r.status_code} - {r.text}")
        return None
    phone_token = r.json().get("verification_token")
    
    # Step 5: Complete login
    r = session.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": email,
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    if r.status_code != 200:
        print(f"Failed to complete login: {r.status_code} - {r.text}")
        return None
    
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def operator_token():
    """Get operator auth token"""
    token = get_auth_token(OPERATOR_EMAIL, OPERATOR_PHONE)
    if not token:
        pytest.skip("Failed to authenticate operator")
    return token


@pytest.fixture(scope="module")
def instructor_token():
    """Get instructor auth token"""
    token = get_auth_token(INSTRUCTOR_EMAIL, INSTRUCTOR_PHONE)
    if not token:
        pytest.skip("Failed to authenticate instructor")
    return token


@pytest.fixture(scope="module")
def diver_token():
    """Get diver auth token"""
    token = get_auth_token(DIVER_EMAIL, DIVER_PHONE)
    if not token:
        pytest.skip("Failed to authenticate diver")
    return token


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestOperatorStats:
    """Test GET /api/operator/stats endpoint"""
    
    def test_operator_stats_returns_7_metrics(self, api_client, operator_token):
        """GET /api/operator/stats returns all 7 expected metrics"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/stats")
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        
        # Verify all 7 metrics are present
        expected_metrics = [
            "total_listings", "active_listings", "pending_listings",
            "total_bookings", "pending_bookings", "confirmed_bookings",
            "total_reviews"
        ]
        for metric in expected_metrics:
            assert metric in data, f"Missing metric: {metric}"
            assert isinstance(data[metric], int), f"{metric} should be an integer"
        
        print(f"Operator stats: {data}")
    
    def test_instructor_can_access_stats(self, api_client, instructor_token):
        """Instructors can also access /api/operator/stats"""
        api_client.headers.update({"Authorization": f"Bearer {instructor_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/stats")
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "total_listings" in data
    
    def test_diver_gets_403_on_stats(self, api_client, diver_token):
        """Non-operator users get 403 on operator endpoints"""
        api_client.headers.update({"Authorization": f"Bearer {diver_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/stats")
        
        assert r.status_code == 403, f"Expected 403 for diver, got {r.status_code}"


class TestOperatorListings:
    """Test GET /api/operator/listings endpoint"""
    
    def test_operator_gets_own_listings(self, api_client, operator_token):
        """GET /api/operator/listings returns only operator's listings"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/listings")
        
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "listings" in data
        assert isinstance(data["listings"], list)
        
        print(f"Operator has {len(data['listings'])} listings")
    
    def test_instructor_gets_own_listings(self, api_client, instructor_token):
        """Instructors can get their own listings"""
        api_client.headers.update({"Authorization": f"Bearer {instructor_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/listings")
        
        assert r.status_code == 200
        data = r.json()
        assert "listings" in data
    
    def test_diver_gets_403_on_listings(self, api_client, diver_token):
        """Divers get 403 on operator listings endpoint"""
        api_client.headers.update({"Authorization": f"Bearer {diver_token}"})
        r = api_client.get(f"{BASE_URL}/api/operator/listings")
        
        assert r.status_code == 403


class TestListingCRUD:
    """Test POST, PUT, DELETE on /api/listings"""
    
    def test_operator_creates_listing_with_pending_status(self, api_client, operator_token):
        """POST /api/listings creates a new listing with pending status"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        listing_data = {
            "name": f"TEST_Operator_Listing_{uuid.uuid4().hex[:8]}",
            "type": "dive_center",
            "description": "Test listing created by operator for testing",
            "location": "Test City, Test Region",
            "country": "Thailand",
            "price": 150.0,
            "currency": "USD",
            "difficulty": "intermediate",
            "duration": "Half day",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
            "highlights": ["Test highlight 1", "Test highlight 2"]
        }
        
        r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        
        data = r.json()
        assert "id" in data, "Response should contain listing id"
        assert "message" in data
        assert "pending" in data["message"].lower(), "New listings should be pending"
        
        # Verify listing was created by fetching it
        listing_id = data["id"]
        verify = api_client.get(f"{BASE_URL}/api/listings/{listing_id}")
        assert verify.status_code == 200
        listing = verify.json()
        assert listing["status"] == "pending", f"Expected 'pending', got {listing['status']}"
        assert listing["name"] == listing_data["name"]
        
        print(f"Created listing: {listing_id} with status: {listing['status']}")
        
        # Cleanup: delete the test listing
        api_client.delete(f"{BASE_URL}/api/listings/{listing_id}")
        return listing_id
    
    def test_instructor_creates_listing(self, api_client, instructor_token):
        """Instructors can also create listings"""
        api_client.headers.update({"Authorization": f"Bearer {instructor_token}"})
        
        listing_data = {
            "name": f"TEST_Instructor_Listing_{uuid.uuid4().hex[:8]}",
            "type": "instructor",
            "description": "Test instructor listing",
            "location": "Bali, Indonesia",
            "country": "Indonesia",
            "price": 80.0,
            "currency": "USD",
            "difficulty": "beginner",
            "duration": "Flexible",
            "image_url": "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800",
            "highlights": ["Expert instructor"]
        }
        
        r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
        assert r.status_code == 200
        
        listing_id = r.json()["id"]
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/listings/{listing_id}")
    
    def test_diver_gets_403_on_create(self, api_client, diver_token):
        """Divers cannot create listings"""
        api_client.headers.update({"Authorization": f"Bearer {diver_token}"})
        
        listing_data = {
            "name": "TEST_Diver_Listing",
            "type": "dive_center",
            "description": "This should fail",
            "location": "Test City",
            "country": "Test Country",
            "image_url": "https://example.com/image.jpg"
        }
        
        r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
        assert r.status_code == 403, f"Expected 403 for diver, got {r.status_code}"
    
    def test_operator_updates_own_listing(self, api_client, operator_token):
        """PUT /api/listings/{id} updates listing owned by operator"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        # First create a listing
        listing_data = {
            "name": f"TEST_Update_Listing_{uuid.uuid4().hex[:8]}",
            "type": "course",
            "description": "Original description",
            "location": "Original City",
            "country": "Thailand",
            "price": 100.0,
            "currency": "USD",
            "difficulty": "beginner",
            "duration": "2 days",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
            "highlights": ["Original highlight"]
        }
        
        create_r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
        assert create_r.status_code == 200
        listing_id = create_r.json()["id"]
        
        # Update the listing
        updated_data = {
            **listing_data,
            "name": f"TEST_Updated_Listing_{uuid.uuid4().hex[:8]}",
            "description": "Updated description",
            "price": 200.0,
        }
        
        update_r = api_client.put(f"{BASE_URL}/api/listings/{listing_id}", json=updated_data)
        assert update_r.status_code == 200, f"Expected 200, got {update_r.status_code}: {update_r.text}"
        
        # Verify the update
        updated = update_r.json()
        assert updated["description"] == "Updated description"
        assert updated["price"] == 200.0
        
        print(f"Updated listing: {listing_id}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/listings/{listing_id}")
    
    def test_operator_deletes_own_listing(self, api_client, operator_token):
        """DELETE /api/listings/{id} deletes listing owned by operator"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        # First create a listing
        listing_data = {
            "name": f"TEST_Delete_Listing_{uuid.uuid4().hex[:8]}",
            "type": "dive_center",
            "description": "This will be deleted",
            "location": "Delete City",
            "country": "Test",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
        }
        
        create_r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
        assert create_r.status_code == 200
        listing_id = create_r.json()["id"]
        
        # Delete the listing
        delete_r = api_client.delete(f"{BASE_URL}/api/listings/{listing_id}")
        assert delete_r.status_code == 200, f"Expected 200, got {delete_r.status_code}"
        
        # Verify deletion
        verify = api_client.get(f"{BASE_URL}/api/listings/{listing_id}")
        assert verify.status_code == 404, "Deleted listing should return 404"
        
        print(f"Deleted listing: {listing_id}")
    
    def test_update_nonexistent_listing_returns_404(self, api_client, operator_token):
        """PUT on non-existent listing returns 404"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        fake_id = str(uuid.uuid4())
        listing_data = {
            "name": "Test",
            "type": "dive_center",
            "description": "Test",
            "location": "Test",
            "country": "Test",
            "image_url": "https://example.com/image.jpg"
        }
        
        r = api_client.put(f"{BASE_URL}/api/listings/{fake_id}", json=listing_data)
        assert r.status_code == 404
    
    def test_delete_nonexistent_listing_returns_404(self, api_client, operator_token):
        """DELETE on non-existent listing returns 404"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        fake_id = str(uuid.uuid4())
        r = api_client.delete(f"{BASE_URL}/api/listings/{fake_id}")
        assert r.status_code == 404


class TestListingValidation:
    """Test listing creation validation"""
    
    def test_create_listing_without_required_fields_fails(self, api_client, operator_token):
        """Creating listing without required fields should fail"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        # Missing name, description, location, country, image_url
        incomplete_data = {
            "type": "dive_center"
        }
        
        r = api_client.post(f"{BASE_URL}/api/listings", json=incomplete_data)
        # FastAPI should return 422 for validation errors
        assert r.status_code == 422, f"Expected 422 for validation error, got {r.status_code}"


class TestOperatorBookings:
    """Test GET /api/bookings/operator endpoint"""
    
    def test_operator_gets_bookings(self, api_client, operator_token):
        """GET /api/bookings/operator returns operator's bookings"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        r = api_client.get(f"{BASE_URL}/api/bookings/operator")
        
        assert r.status_code == 200
        data = r.json()
        assert "bookings" in data
        assert isinstance(data["bookings"], list)
        
        print(f"Operator has {len(data['bookings'])} bookings")
    
    def test_diver_gets_403_on_operator_bookings(self, api_client, diver_token):
        """Divers cannot access operator bookings endpoint"""
        api_client.headers.update({"Authorization": f"Bearer {diver_token}"})
        r = api_client.get(f"{BASE_URL}/api/bookings/operator")
        
        assert r.status_code == 403


class TestListingTypes:
    """Test listing type options work correctly"""
    
    def test_all_listing_types_valid(self, api_client, operator_token):
        """All 4 listing types should be valid: dive_center, instructor, liveaboard, course"""
        api_client.headers.update({"Authorization": f"Bearer {operator_token}"})
        
        types = ["dive_center", "instructor", "liveaboard", "course"]
        created_ids = []
        
        for listing_type in types:
            listing_data = {
                "name": f"TEST_{listing_type}_{uuid.uuid4().hex[:8]}",
                "type": listing_type,
                "description": f"Test {listing_type} listing",
                "location": "Test City",
                "country": "Thailand",
                "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800"
            }
            
            r = api_client.post(f"{BASE_URL}/api/listings", json=listing_data)
            assert r.status_code == 200, f"Failed to create listing type '{listing_type}': {r.text}"
            created_ids.append(r.json()["id"])
            print(f"Created listing type: {listing_type}")
        
        # Cleanup
        for lid in created_ids:
            api_client.delete(f"{BASE_URL}/api/listings/{lid}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
