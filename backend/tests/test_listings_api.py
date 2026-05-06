"""
Listings API Tests for Bottom Time - Discover Feature
Tests all CRUD operations and filters for listings endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestListingsEndpoints:
    """Test listings API endpoints"""

    def test_get_all_listings(self):
        """GET /api/listings - returns all listings with count"""
        response = requests.get(f"{BASE_URL}/api/listings")
        assert response.status_code == 200
        
        data = response.json()
        assert "count" in data
        assert "listings" in data
        assert isinstance(data["listings"], list)
        assert data["count"] == len(data["listings"])
        assert data["count"] >= 1, "Expected at least 1 seeded listing"
        
        # Validate listing structure
        if data["listings"]:
            listing = data["listings"][0]
            assert "id" in listing
            assert "name" in listing
            assert "type" in listing
            assert "location" in listing
            assert "country" in listing
            assert "image_url" in listing

    def test_filter_by_type_course(self):
        """GET /api/listings?type=course - filter by type"""
        response = requests.get(f"{BASE_URL}/api/listings?type=course")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["type"] == "course", f"Expected type 'course', got '{listing['type']}'"

    def test_filter_by_type_dive_center(self):
        """GET /api/listings?type=dive_center - filter by dive_center type"""
        response = requests.get(f"{BASE_URL}/api/listings?type=dive_center")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["type"] == "dive_center"

    def test_filter_by_country_indonesia(self):
        """GET /api/listings?country=Indonesia - filter by country"""
        response = requests.get(f"{BASE_URL}/api/listings?country=Indonesia")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["country"].lower() == "indonesia", f"Expected 'Indonesia', got '{listing['country']}'"

    def test_filter_by_difficulty_beginner(self):
        """GET /api/listings?difficulty=beginner - filter by difficulty"""
        response = requests.get(f"{BASE_URL}/api/listings?difficulty=beginner")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["difficulty"] == "beginner", f"Expected 'beginner', got '{listing['difficulty']}'"

    def test_filter_by_difficulty_advanced(self):
        """GET /api/listings?difficulty=advanced - filter by advanced level"""
        response = requests.get(f"{BASE_URL}/api/listings?difficulty=advanced")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["difficulty"] == "advanced"

    def test_filter_by_price_range(self):
        """GET /api/listings?min_price=100&max_price=500 - filter by price range"""
        response = requests.get(f"{BASE_URL}/api/listings?min_price=100&max_price=500")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1
        for listing in data["listings"]:
            assert listing["price"] is not None, "Price should not be None in filtered results"
            assert 100 <= listing["price"] <= 500, f"Price {listing['price']} out of range 100-500"

    def test_filter_by_min_price_only(self):
        """GET /api/listings?min_price=1000 - filter by minimum price"""
        response = requests.get(f"{BASE_URL}/api/listings?min_price=1000")
        assert response.status_code == 200
        
        data = response.json()
        for listing in data["listings"]:
            assert listing["price"] >= 1000, f"Price {listing['price']} should be >= 1000"

    def test_search_by_name(self):
        """GET /api/listings?search=reef - search by name"""
        response = requests.get(f"{BASE_URL}/api/listings?search=reef")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] >= 1, "Expected at least 1 result for 'reef' search"
        # Verify search matches name or description
        for listing in data["listings"]:
            name_match = "reef" in listing["name"].lower()
            desc_match = "reef" in listing["description"].lower()
            assert name_match or desc_match, f"Listing '{listing['name']}' doesn't match 'reef'"

    def test_search_no_results(self):
        """GET /api/listings?search=nonexistentsearchterm123 - search with no results"""
        response = requests.get(f"{BASE_URL}/api/listings?search=nonexistentsearchterm123")
        assert response.status_code == 200
        
        data = response.json()
        assert data["count"] == 0
        assert data["listings"] == []


class TestSingleListingEndpoint:
    """Test single listing detail endpoint"""
    
    @pytest.fixture
    def valid_listing_id(self):
        """Get a valid listing ID from the list"""
        response = requests.get(f"{BASE_URL}/api/listings")
        data = response.json()
        if data["listings"]:
            return data["listings"][0]["id"]
        pytest.skip("No listings available for testing")

    def test_get_single_listing(self, valid_listing_id):
        """GET /api/listings/{id} - get single listing detail"""
        response = requests.get(f"{BASE_URL}/api/listings/{valid_listing_id}")
        assert response.status_code == 200
        
        listing = response.json()
        assert listing["id"] == valid_listing_id
        assert "name" in listing
        assert "type" in listing
        assert "description" in listing
        assert "location" in listing
        assert "country" in listing
        assert "image_url" in listing
        assert "price" in listing
        assert "rating" in listing
        assert "review_count" in listing
        assert "highlights" in listing
        assert isinstance(listing["highlights"], list)

    def test_get_single_listing_not_found(self):
        """GET /api/listings/{id} - returns 404 for non-existent listing"""
        response = requests.get(f"{BASE_URL}/api/listings/non-existent-uuid-id")
        assert response.status_code == 404
        
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()


class TestPopularLocationsEndpoint:
    """Test popular locations endpoint (route ordering important)"""

    def test_get_popular_locations(self):
        """GET /api/listings/locations/popular - get popular locations (must not be caught by {listing_id} route)"""
        response = requests.get(f"{BASE_URL}/api/listings/locations/popular")
        assert response.status_code == 200
        
        data = response.json()
        assert "countries" in data
        assert isinstance(data["countries"], list)
        assert len(data["countries"]) >= 1, "Expected at least 1 popular location"
        
        # Verify structure
        if data["countries"]:
            country_item = data["countries"][0]
            assert "country" in country_item
            assert "count" in country_item
            assert isinstance(country_item["count"], int)

    def test_popular_locations_sorted_by_count(self):
        """Verify popular locations are sorted by count descending"""
        response = requests.get(f"{BASE_URL}/api/listings/locations/popular")
        assert response.status_code == 200
        
        data = response.json()
        countries = data["countries"]
        if len(countries) > 1:
            for i in range(len(countries) - 1):
                assert countries[i]["count"] >= countries[i+1]["count"], \
                    f"Countries not sorted: {countries[i]['count']} < {countries[i+1]['count']}"


class TestCombinedFilters:
    """Test combined filter functionality"""

    def test_type_and_difficulty_combined(self):
        """Test filtering by both type and difficulty"""
        response = requests.get(f"{BASE_URL}/api/listings?type=course&difficulty=beginner")
        assert response.status_code == 200
        
        data = response.json()
        for listing in data["listings"]:
            assert listing["type"] == "course"
            assert listing["difficulty"] == "beginner"

    def test_country_and_price_combined(self):
        """Test filtering by country and price range"""
        response = requests.get(f"{BASE_URL}/api/listings?country=Indonesia&max_price=200")
        assert response.status_code == 200
        
        data = response.json()
        for listing in data["listings"]:
            assert "indonesia" in listing["country"].lower()
            assert listing["price"] <= 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
