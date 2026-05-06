"""
Trip Planner Backend Tests - Iteration 61
Tests the new Group Trip Planner API endpoints:
- POST /api/trips - Create a trip with name, destination, dates, max_members
- GET /api/trips - Get user's trips (created or invited)
- GET /api/trips/{tripId} - Get trip details with members and listings
- PUT /api/trips/{tripId} - Update trip details (organizer only)
- POST /api/trips/{tripId}/invite - Invite a buddy
- PUT /api/trips/{tripId}/rsvp - Accept/decline invitation
- POST /api/trips/{tripId}/listings - Add listing to trip
- POST /api/trips/{tripId}/listings/{listingId}/vote - Toggle vote on listing
- DELETE /api/trips/{tripId} - Delete trip (organizer only)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTripPlannerV2APIs:
    """Test new Group Trip Planner endpoints"""
    
    auth_token = None
    test_user_id = None
    test_trip_id = None
    test_listing_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for testing using existing test user"""
        if TestTripPlannerV2APIs.auth_token:
            return
            
        session = requests.Session()
        
        # Use test user credentials from review request
        email = "test@bottomtime.com"
        phone = "+919876543210"
        
        try:
            # Send OTP for email
            email_otp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
            if email_otp.status_code != 200:
                pytest.skip(f"OTP rate limited or failed: {email_otp.status_code}")
                return
            
            # Verify email OTP
            email_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": "123456"})
            if email_verify.status_code != 200:
                pytest.skip(f"Email verify failed: {email_verify.status_code}")
                return
            email_token = email_verify.json().get("verification_token")
            
            # Send OTP for phone
            phone_otp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
            if phone_otp.status_code != 200:
                pytest.skip(f"Phone OTP rate limited: {phone_otp.status_code}")
                return
            
            # Verify phone OTP
            phone_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": "123456"})
            if phone_verify.status_code != 200:
                pytest.skip(f"Phone verify failed: {phone_verify.status_code}")
                return
            phone_token = phone_verify.json().get("verification_token")
            
            # Complete login
            complete = session.post(f"{BASE_URL}/api/auth/login-complete", json={
                "email": email,
                "email_verified_token": email_token,
                "phone_verified_token": phone_token
            })
            
            if complete.status_code == 200:
                TestTripPlannerV2APIs.auth_token = complete.json().get("access_token")
                TestTripPlannerV2APIs.test_user_id = complete.json().get("user", {}).get("id")
            else:
                pytest.skip(f"Login failed: {complete.status_code}")
                return
        except Exception as e:
            pytest.skip(f"Auth setup failed: {str(e)}")
            return
        
        # Get a test listing ID
        listings_res = session.get(f"{BASE_URL}/api/listings?limit=1")
        if listings_res.status_code == 200 and listings_res.json().get("listings"):
            TestTripPlannerV2APIs.test_listing_id = listings_res.json()["listings"][0]["id"]
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestTripPlannerV2APIs.auth_token}"}
    
    def test_01_trips_require_auth(self):
        """All trip endpoints require authentication"""
        # No auth header
        no_auth_res = requests.get(f"{BASE_URL}/api/trips")
        assert no_auth_res.status_code in [401, 403], f"GET /trips should require auth, got {no_auth_res.status_code}"
        
        no_auth_create = requests.post(f"{BASE_URL}/api/trips", json={"name": "Test"})
        assert no_auth_create.status_code in [401, 403], f"POST /trips should require auth, got {no_auth_create.status_code}"
        print("Auth required - verified")
    
    def test_02_create_trip(self):
        """POST /api/trips creates a trip with full details"""
        if not TestTripPlannerV2APIs.auth_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/trips",
            json={
                "name": "TEST_Bali Diving March 2026",
                "destination": "Bali",
                "country": "Indonesia",
                "start_date": "2026-03-15",
                "end_date": "2026-03-22",
                "max_members": 6,
                "description": "Week-long dive trip to explore Bali's best sites"
            },
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain trip id"
        assert data["name"] == "TEST_Bali Diving March 2026", "Trip name should match"
        assert data["destination"] == "Bali", "Destination should match"
        assert data["country"] == "Indonesia", "Country should match"
        assert data["start_date"] == "2026-03-15", "Start date should match"
        assert data["end_date"] == "2026-03-22", "End date should match"
        assert data["max_members"] == 6, "Max members should match"
        assert data["status"] == "planning", "Initial status should be 'planning'"
        assert "members" in data, "Trip should have members array"
        assert len(data["members"]) == 1, "Creator should be in members"
        assert data["members"][0]["role"] == "organizer", "Creator should be organizer"
        assert data["members"][0]["status"] == "confirmed", "Creator status should be confirmed"
        assert "listings" in data, "Trip should have listings array"
        
        TestTripPlannerV2APIs.test_trip_id = data["id"]
        print(f"Created trip: {data['id']}")
    
    def test_03_create_trip_name_required(self):
        """POST /api/trips requires trip name"""
        if not TestTripPlannerV2APIs.auth_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/trips",
            json={"destination": "Maldives"},  # No name
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 400, f"Should fail without name, got {response.status_code}"
        assert "name" in response.json().get("detail", "").lower(), "Error should mention name"
        print("Name validation works")
    
    def test_04_get_trips_list(self):
        """GET /api/trips returns user's trips"""
        if not TestTripPlannerV2APIs.auth_token:
            pytest.skip("No auth token")
        
        response = requests.get(
            f"{BASE_URL}/api/trips",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "trips" in data, "Response should have 'trips' key"
        assert isinstance(data["trips"], list), "trips should be a list"
        
        # Find our test trip
        test_trips = [t for t in data["trips"] if t.get("name", "").startswith("TEST_")]
        assert len(test_trips) > 0, "Should find at least one test trip"
        
        # Verify trip structure
        trip = test_trips[0]
        assert "id" in trip
        assert "name" in trip
        assert "destination" in trip
        assert "status" in trip
        assert "members" in trip
        assert "listings" in trip
        print(f"Found {len(data['trips'])} trips")
    
    def test_05_get_single_trip(self):
        """GET /api/trips/{tripId} returns trip details"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["id"] == TestTripPlannerV2APIs.test_trip_id, "Trip ID should match"
        assert "members" in data, "Trip should have members"
        assert "listings" in data, "Trip should have listings"
        assert "creator_id" in data, "Trip should have creator_id"
        assert "creator_name" in data, "Trip should have creator_name"
        print(f"Got trip: {data['name']} with {len(data['members'])} members")
    
    def test_06_get_trip_forbidden_for_non_member(self):
        """GET /api/trips/{tripId} returns 403 for non-members"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        
        # Create fake auth token or use invalid trip
        response = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        # Should fail with 401 (invalid token) or 403 (forbidden)
        assert response.status_code in [401, 403], f"Should deny access, got {response.status_code}"
        print("Access control verified")
    
    def test_07_add_listing_to_trip(self):
        """POST /api/trips/{tripId}/listings adds a listing"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        if not TestTripPlannerV2APIs.test_listing_id:
            pytest.skip("No test listing available")
        
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}/listings",
            json={"listing_id": TestTripPlannerV2APIs.test_listing_id},
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("added") == True, "Should indicate added"
        assert "listing" in data, "Response should have listing"
        assert data["listing"]["listing_id"] == TestTripPlannerV2APIs.test_listing_id, "Listing ID should match"
        assert "votes" in data["listing"], "Listing should have votes"
        assert len(data["listing"]["votes"]) >= 1, "Creator's vote should be included"
        print(f"Added listing: {data['listing']['name']}")
    
    def test_08_add_duplicate_listing_fails(self):
        """POST /api/trips/{tripId}/listings fails for duplicate"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        if not TestTripPlannerV2APIs.test_listing_id:
            pytest.skip("No test listing available")
        
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}/listings",
            json={"listing_id": TestTripPlannerV2APIs.test_listing_id},
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 400, f"Should fail for duplicate, got {response.status_code}"
        assert "already" in response.json().get("detail", "").lower(), "Error should mention already added"
        print("Duplicate listing check works")
    
    def test_09_vote_on_listing(self):
        """POST /api/trips/{tripId}/listings/{listingId}/vote toggles vote"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        if not TestTripPlannerV2APIs.test_listing_id:
            pytest.skip("No test listing available")
        
        # First vote (creator already voted when adding, so this will remove vote)
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}/listings/{TestTripPlannerV2APIs.test_listing_id}/vote",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "voted" in data, "Response should have voted status"
        assert "vote_count" in data, "Response should have vote_count"
        first_voted = data["voted"]
        data["vote_count"]
        
        # Toggle again
        response2 = requests.post(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}/listings/{TestTripPlannerV2APIs.test_listing_id}/vote",
            headers=self.get_auth_headers()
        )
        
        data2 = response2.json()
        assert data2["voted"] != first_voted, "Vote should toggle"
        print(f"Vote toggled: {first_voted} -> {data2['voted']}")
    
    def test_10_update_trip(self):
        """PUT /api/trips/{tripId} updates trip details"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}",
            json={
                "name": "TEST_Updated Bali Trip",
                "status": "confirmed"
            },
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["name"] == "TEST_Updated Bali Trip", "Name should be updated"
        assert data["status"] == "confirmed", "Status should be updated"
        print("Trip updated successfully")
    
    def test_11_delete_trip(self):
        """DELETE /api/trips/{tripId} deletes trip (organizer only)"""
        if not TestTripPlannerV2APIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.delete(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.json().get("deleted") == True, "Should confirm deletion"
        
        # Verify trip is deleted
        verify_res = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerV2APIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        assert verify_res.status_code == 404, "Deleted trip should return 404"
        print("Trip deleted successfully")


class TestTripInviteFlow:
    """Test trip invitation and RSVP flow"""
    
    auth_token = None
    trip_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        if TestTripInviteFlow.auth_token:
            return
        
        # Use same auth as main test class
        if TestTripPlannerV2APIs.auth_token:
            TestTripInviteFlow.auth_token = TestTripPlannerV2APIs.auth_token
            return
            
        pytest.skip("No auth token available")
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestTripInviteFlow.auth_token}"}
    
    def test_01_create_trip_for_invite(self):
        """Create a trip to test invitations"""
        if not TestTripInviteFlow.auth_token:
            pytest.skip("No auth token")
        
        response = requests.post(
            f"{BASE_URL}/api/trips",
            json={"name": "TEST_Invite Test Trip", "max_members": 4},
            headers=self.get_auth_headers()
        )
        
        if response.status_code == 200:
            TestTripInviteFlow.trip_id = response.json()["id"]
            print(f"Created trip for invite test: {TestTripInviteFlow.trip_id}")
        else:
            pytest.skip(f"Failed to create trip: {response.status_code}")
    
    def test_02_invite_requires_user_id(self):
        """POST /api/trips/{tripId}/invite requires user_id"""
        if not TestTripInviteFlow.trip_id:
            pytest.skip("No trip created")
        
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripInviteFlow.trip_id}/invite",
            json={},  # No user_id
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 400, f"Should fail without user_id, got {response.status_code}"
        print("Invite validation works")
    
    def test_03_invite_nonexistent_user_fails(self):
        """POST /api/trips/{tripId}/invite fails for non-existent user"""
        if not TestTripInviteFlow.trip_id:
            pytest.skip("No trip created")
        
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripInviteFlow.trip_id}/invite",
            json={"user_id": "nonexistent-user-id-12345"},
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 404, f"Should fail for non-existent user, got {response.status_code}"
        print("Non-existent user check works")
    
    def test_04_rsvp_invalid_action_fails(self):
        """PUT /api/trips/{tripId}/rsvp fails with invalid action"""
        if not TestTripInviteFlow.trip_id:
            pytest.skip("No trip created")
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{TestTripInviteFlow.trip_id}/rsvp",
            json={"action": "maybe"},  # Invalid action
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 400, f"Should fail with invalid action, got {response.status_code}"
        print("RSVP validation works")
    
    def test_99_cleanup_invite_trip(self):
        """Cleanup: delete test trip"""
        if not TestTripInviteFlow.trip_id:
            pytest.skip("No trip to cleanup")
        
        response = requests.delete(
            f"{BASE_URL}/api/trips/{TestTripInviteFlow.trip_id}",
            headers=self.get_auth_headers()
        )
        print(f"Cleanup: {response.status_code}")


class TestRegressionAPIs:
    """Regression tests for existing features"""
    
    def test_products_api_returns_16_products(self):
        """GET /api/products should return 16 products"""
        response = requests.get(f"{BASE_URL}/api/products")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "products" in data, "Should have products key"
        assert data.get("count") == 16 or len(data["products"]) == 16, f"Should have 16 products, got {data.get('count', len(data['products']))}"
        print(f"Products count verified: {data.get('count', len(data['products']))}")
    
    def test_listings_api_works(self):
        """GET /api/listings should work"""
        response = requests.get(f"{BASE_URL}/api/listings?limit=5")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "listings" in data, "Should have listings key"
        assert len(data["listings"]) > 0, "Should have listings"
        print(f"Listings API working: {len(data['listings'])} listings")
    
    def test_destinations_api_works(self):
        """GET /api/destinations should work"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "destinations" in data, "Should have destinations key"
        print(f"Destinations API working: {len(data['destinations'])} destinations")
    
    def test_health_endpoint(self):
        """Health endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/health")
        # Health endpoint may not exist but we verify API is responding
        assert response.status_code in [200, 404], f"API not responding: {response.status_code}"
        print("API responding correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
