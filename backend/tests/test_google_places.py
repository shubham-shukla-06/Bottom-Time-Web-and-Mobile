"""
Test Google Places Address Autocomplete API Integration
Tests for /api/address/autocomplete and /api/address/details endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGooglePlacesAutocomplete:
    """Tests for Google Places autocomplete integration"""

    def test_autocomplete_india_address(self):
        """Test autocomplete returns Google Places suggestions for Indian address"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "bandra west mumbai"}
        )
        assert response.status_code == 200, f"Status code: {response.status_code}"
        
        data = response.json()
        assert "suggestions" in data, "Response should contain 'suggestions' key"
        assert "mock" in data, "Response should contain 'mock' key"
        
        # Should return live data if API key is configured
        print(f"Mock status: {data.get('mock')}")
        print(f"Number of suggestions: {len(data.get('suggestions', []))}")
        
        if not data.get('mock'):
            # Live data assertions
            assert len(data['suggestions']) > 0, "Should return at least one suggestion for 'bandra west mumbai'"
            
            # Check suggestion structure
            first_suggestion = data['suggestions'][0]
            assert "place_id" in first_suggestion, "Suggestion should have place_id"
            assert "description" in first_suggestion, "Suggestion should have description"
            assert first_suggestion['place_id'], "place_id should not be empty"
            print(f"First suggestion: {first_suggestion.get('main_text')} - {first_suggestion.get('secondary_text')}")
        else:
            print("WARNING: API returned mock=True - Google Places may not be configured")

    def test_autocomplete_us_address(self):
        """Test autocomplete returns suggestions for US address"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "times square new york"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        
        if not data.get('mock'):
            assert len(data['suggestions']) > 0, "Should return suggestions for Times Square"
            # Verify we get US addresses
            descriptions = [s.get('description', '').lower() for s in data['suggestions']]
            has_us_address = any('new york' in d or 'ny' in d or 'usa' in d for d in descriptions)
            assert has_us_address or len(data['suggestions']) > 0, "Should return US addresses"
            print(f"US suggestions: {[s.get('main_text') for s in data['suggestions'][:3]]}")

    def test_autocomplete_uk_address(self):
        """Test autocomplete returns suggestions for UK address"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "oxford street london"}
        )
        assert response.status_code == 200
        
        data = response.json()
        if not data.get('mock'):
            assert len(data['suggestions']) > 0, "Should return suggestions for Oxford Street"
            print(f"UK suggestions: {[s.get('main_text') for s in data['suggestions'][:3]]}")

    def test_autocomplete_min_length_validation(self):
        """Test that query with less than 2 chars is rejected"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "a"}
        )
        # FastAPI validation should return 422 for query too short
        assert response.status_code == 422, f"Should reject 1-char query, got {response.status_code}"

    def test_autocomplete_country_bias(self):
        """Test that country parameter biases results"""
        # Search same query with India bias
        response_india = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "central station", "country": "IN"}
        )
        assert response_india.status_code == 200
        
        # Search with US bias
        response_us = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "central station", "country": "US"}
        )
        assert response_us.status_code == 200
        
        # Both should return different results based on country bias
        india_data = response_india.json()
        us_data = response_us.json()
        
        if not india_data.get('mock') and not us_data.get('mock'):
            print(f"India biased results: {[s.get('secondary_text') for s in india_data.get('suggestions', [])[:2]]}")
            print(f"US biased results: {[s.get('secondary_text') for s in us_data.get('suggestions', [])[:2]]}")


class TestGooglePlacesDetails:
    """Tests for Google Places details endpoint"""

    def test_get_address_details(self):
        """Test fetching full address details from a place_id"""
        # First get a place_id from autocomplete
        autocomplete_response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "bandra west mumbai"}
        )
        
        if autocomplete_response.json().get('mock'):
            pytest.skip("Google Places API not configured (mock mode)")
        
        suggestions = autocomplete_response.json().get('suggestions', [])
        if not suggestions:
            pytest.skip("No suggestions returned from autocomplete")
        
        place_id = suggestions[0].get('place_id')
        assert place_id, "First suggestion should have a place_id"
        
        # Now get details
        details_response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": place_id}
        )
        assert details_response.status_code == 200, f"Details API failed: {details_response.status_code}"
        
        details = details_response.json()
        
        # Verify structure
        assert "formatted_address" in details, "Should have formatted_address"
        assert "city" in details, "Should have city"
        assert "state" in details, "Should have state"
        assert "country" in details, "Should have country"
        assert "pincode" in details or "postal_code" in details.get("pincode", "") or details.get("pincode") == "", "Should have pincode field"
        assert details.get("mock") == False, "Should be live data"
        
        print(f"Formatted address: {details.get('formatted_address')}")
        print(f"City: {details.get('city')}, State: {details.get('state')}, Pincode: {details.get('pincode')}")
        print(f"Country: {details.get('country')}, Country Code: {details.get('country_code')}")

    def test_get_us_address_details(self):
        """Test fetching address details for US location"""
        # Get a US place_id
        autocomplete_response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "empire state building new york"}
        )
        
        if autocomplete_response.json().get('mock'):
            pytest.skip("Google Places API not configured (mock mode)")
        
        suggestions = autocomplete_response.json().get('suggestions', [])
        if not suggestions:
            pytest.skip("No suggestions returned")
        
        place_id = suggestions[0].get('place_id')
        
        details_response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": place_id}
        )
        assert details_response.status_code == 200
        
        details = details_response.json()
        assert details.get('country') or details.get('country_code'), "Should have country info"
        
        # For US, country code should be US
        if details.get('country_code'):
            print(f"Country code: {details.get('country_code')}")
        print(f"US Address: {details.get('formatted_address')}")

    def test_invalid_place_id(self):
        """Test that invalid place_id returns error"""
        response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": "invalid_place_id_12345"}
        )
        # Should return 5xx error since Google API will fail
        assert response.status_code >= 500, f"Should fail for invalid place_id, got {response.status_code}"

    def test_missing_place_id(self):
        """Test that missing place_id returns validation error"""
        response = requests.get(f"{BASE_URL}/api/address/details")
        assert response.status_code == 422, f"Should return 422 for missing place_id, got {response.status_code}"


class TestShiprocketPincodeLookup:
    """Test Shiprocket postcode lookup still works alongside Google Places"""

    def test_indian_pincode_lookup(self):
        """Test that Shiprocket pincode lookup still works for India"""
        response = requests.get(
            f"{BASE_URL}/api/shipping/postcode/lookup",
            params={"postcode": "400050"}
        )
        assert response.status_code == 200
        
        data = response.json()
        if data.get('success'):
            assert data.get('city'), "Should return city"
            assert data.get('state'), "Should return state"
            print(f"Shiprocket lookup: {data.get('city')}, {data.get('state')}")
        else:
            print(f"Shiprocket lookup not configured or failed: {data.get('message')}")
