"""
Trip Planner Backend Tests - Iteration 18
Tests the new Trip Planner CRUD API endpoints:
- POST /api/trips - Create a trip
- GET /api/trips - Get user's trips
- GET /api/trips/{id} - Get single trip with enriched items
- POST /api/trips/{id}/items - Add listing to trip
- DELETE /api/trips/{id}/items/{listing_id} - Remove item from trip
- DELETE /api/trips/{id} - Delete entire trip
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTripPlannerAPIs:
    """Test Trip Planner CRUD endpoints"""
    
    auth_token = None
    test_trip_id = None
    test_listing_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for testing"""
        if TestTripPlannerAPIs.auth_token:
            return
            
        # Create test diver user or login existing
        session = requests.Session()
        
        # Login flow for diver
        email = "test_trip_diver@bottomtime.com"
        phone = "+15551234567"
        
        # Try login first
        login_res = session.post(f"{BASE_URL}/api/auth/login-init", json={"email": email})
        
        if login_res.status_code == 404:
            # Signup new user
            session.post(f"{BASE_URL}/api/auth/signup-init", json={"email": email, "name": "Trip Tester", "role": "diver"})
            session.post(f"{BASE_URL}/api/auth/store-signup-data", json={"email": email, "name": "Trip Tester", "role": "diver"})
            
            # Verify email
            session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
            email_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": "123456"})
            email_token = email_verify.json().get("verification_token")
            
            # Verify phone
            session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
            phone_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": "123456"})
            phone_token = phone_verify.json().get("verification_token")
            
            # Complete signup
            complete = session.post(f"{BASE_URL}/api/auth/signup-complete", json={
                "email": email,
                "phone": phone,
                "email_verified_token": email_token,
                "phone_verified_token": phone_token
            })
            TestTripPlannerAPIs.auth_token = complete.json().get("access_token")
        else:
            # Login existing
            session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
            email_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": "123456"})
            email_token = email_verify.json().get("verification_token")
            
            session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
            phone_verify = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": "123456"})
            phone_token = phone_verify.json().get("verification_token")
            
            complete = session.post(f"{BASE_URL}/api/auth/login-complete", json={
                "email": email,
                "email_verified_token": email_token,
                "phone_verified_token": phone_token
            })
            TestTripPlannerAPIs.auth_token = complete.json().get("access_token")
        
        # Get a test listing ID
        listings_res = session.get(f"{BASE_URL}/api/listings?limit=1")
        if listings_res.status_code == 200 and listings_res.json().get("listings"):
            TestTripPlannerAPIs.test_listing_id = listings_res.json()["listings"][0]["id"]
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestTripPlannerAPIs.auth_token}"}
    
    def test_01_create_trip(self):
        """POST /api/trips creates a trip"""
        response = requests.post(
            f"{BASE_URL}/api/trips",
            json={"name": "TEST_My Bali Trip"},
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain trip id"
        assert data["name"] == "TEST_My Bali Trip", "Trip name should match"
        assert "items" in data, "Trip should have items array"
        assert data["items"] == [], "New trip should have empty items"
        assert "user_id" in data, "Trip should have user_id"
        assert "created_at" in data, "Trip should have created_at"
        
        TestTripPlannerAPIs.test_trip_id = data["id"]
        print(f"Created trip: {data['id']}")
    
    def test_02_get_trips_list(self):
        """GET /api/trips returns user's trips"""
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
        print(f"Found {len(data['trips'])} trips")
    
    def test_03_get_single_trip(self):
        """GET /api/trips/{id} returns trip with enriched items"""
        if not TestTripPlannerAPIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["id"] == TestTripPlannerAPIs.test_trip_id, "Trip ID should match"
        assert "items" in data, "Trip should have items array"
        assert "name" in data, "Trip should have name"
        print(f"Got trip: {data['name']}")
    
    def test_04_add_item_to_trip(self):
        """POST /api/trips/{id}/items adds listing to trip"""
        if not TestTripPlannerAPIs.test_trip_id:
            pytest.skip("No test trip created")
        if not TestTripPlannerAPIs.test_listing_id:
            pytest.skip("No test listing available")
        
        response = requests.post(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}/items",
            json={"listing_id": TestTripPlannerAPIs.test_listing_id},
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data, "Response should have message"
        assert "item" in data, "Response should have item"
        assert data["item"]["listing_id"] == TestTripPlannerAPIs.test_listing_id, "Item listing_id should match"
        print(f"Added item: {data['item']}")
    
    def test_05_verify_trip_has_enriched_items(self):
        """GET /api/trips/{id} returns enriched listing data in items"""
        if not TestTripPlannerAPIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["items"]) > 0, "Trip should have items"
        
        item = data["items"][0]
        assert "listing_id" in item, "Item should have listing_id"
        assert "listing" in item, "Item should have enriched listing data"
        
        if item["listing"]:
            assert "name" in item["listing"], "Enriched listing should have name"
            assert "price" in item["listing"], "Enriched listing should have price"
            print(f"Enriched item: {item['listing']['name']}")
    
    def test_06_remove_item_from_trip(self):
        """DELETE /api/trips/{id}/items/{listing_id} removes item from trip"""
        if not TestTripPlannerAPIs.test_trip_id:
            pytest.skip("No test trip created")
        if not TestTripPlannerAPIs.test_listing_id:
            pytest.skip("No test listing available")
        
        response = requests.delete(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}/items/{TestTripPlannerAPIs.test_listing_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify item is removed
        verify_res = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        trip_data = verify_res.json()
        item_ids = [i["listing_id"] for i in trip_data["items"]]
        assert TestTripPlannerAPIs.test_listing_id not in item_ids, "Item should be removed"
        print("Item removed successfully")
    
    def test_07_delete_trip(self):
        """DELETE /api/trips/{id} deletes entire trip"""
        if not TestTripPlannerAPIs.test_trip_id:
            pytest.skip("No test trip created")
        
        response = requests.delete(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify trip is deleted
        verify_res = requests.get(
            f"{BASE_URL}/api/trips/{TestTripPlannerAPIs.test_trip_id}",
            headers=self.get_auth_headers()
        )
        assert verify_res.status_code == 404, "Deleted trip should return 404"
        print("Trip deleted successfully")
    
    def test_08_trips_require_auth(self):
        """All trip endpoints require authentication"""
        # No auth header
        no_auth_res = requests.get(f"{BASE_URL}/api/trips")
        assert no_auth_res.status_code in [401, 403], f"GET /trips should require auth, got {no_auth_res.status_code}"
        
        no_auth_create = requests.post(f"{BASE_URL}/api/trips", json={"name": "Test"})
        assert no_auth_create.status_code in [401, 403], f"POST /trips should require auth, got {no_auth_create.status_code}"
        print("Auth required - verified")


class TestDestinationsRedirect:
    """Test that /destinations redirects to /discover"""
    
    def test_destinations_page_loads(self):
        """Verify destinations data endpoint works"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "destinations" in data, "Response should have destinations"
        assert isinstance(data["destinations"], list), "destinations should be a list"
        
        if len(data["destinations"]) > 0:
            dest = data["destinations"][0]
            assert "country" in dest, "Destination should have country"
            assert "listing_count" in dest, "Destination should have listing_count"
        print(f"Found {len(data['destinations'])} destinations")


class TestDiscoverFilters:
    """Test Discover page filter endpoints"""
    
    def test_listings_type_filter(self):
        """Filter pills for type work"""
        for type_val in ["courses", "dives", "day_trips", "liveaboards", "snorkeling"]:
            response = requests.get(f"{BASE_URL}/api/listings?type={type_val}")
            assert response.status_code == 200, f"Type filter {type_val} failed"
        print("Type filters work")
    
    def test_listings_difficulty_filter(self):
        """Difficulty dropdown filter works"""
        for diff in ["beginner", "intermediate", "advanced"]:
            response = requests.get(f"{BASE_URL}/api/listings?difficulty={diff}")
            assert response.status_code == 200, f"Difficulty filter {diff} failed"
        print("Difficulty filters work")
    
    def test_listings_max_price_filter(self):
        """Max price input filter works"""
        response = requests.get(f"{BASE_URL}/api/listings?max_price=500")
        assert response.status_code == 200
        
        data = response.json()
        for listing in data["listings"]:
            if listing.get("price"):
                assert listing["price"] <= 500, f"Listing price {listing['price']} exceeds max"
        print("Max price filter works")
    
    def test_listings_country_filter(self):
        """Country filter works (clicking destination card)"""
        # Get a country from destinations
        dest_res = requests.get(f"{BASE_URL}/api/destinations")
        if dest_res.status_code == 200 and dest_res.json().get("destinations"):
            country = dest_res.json()["destinations"][0]["country"]
            
            response = requests.get(f"{BASE_URL}/api/listings?country={country}")
            assert response.status_code == 200
            
            # All returned listings should be from that country
            for listing in response.json()["listings"]:
                assert listing["country"].lower() == country.lower(), f"Listing country {listing['country']} doesn't match filter {country}"
            print(f"Country filter works for {country}")
    
    def test_listings_sort_options(self):
        """Sort dropdown works"""
        sort_options = ["rating", "price_asc", "price_desc", "reviews", "newest"]
        for sort_by in sort_options:
            response = requests.get(f"{BASE_URL}/api/listings?sort_by={sort_by}")
            assert response.status_code == 200, f"Sort {sort_by} failed"
        print("All sort options work")
    
    def test_listings_date_filter(self):
        """Dates filter (calendar picker) params accepted"""
        # Single date
        response = requests.get(f"{BASE_URL}/api/listings?available_date=2026-03-15")
        assert response.status_code == 200, "available_date param should be accepted"
        
        # Date range
        response = requests.get(f"{BASE_URL}/api/listings?available_from=2026-03-01&available_to=2026-03-15")
        assert response.status_code == 200, "available_from/to params should be accepted"
        print("Date filter params work")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
