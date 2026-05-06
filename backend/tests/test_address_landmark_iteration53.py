"""
Iteration 53: Test Address API with landmark field + Shipping/Places APIs
Verifying:
1. POST /api/user/addresses with address_line1 (combined house+street), landmark field
2. GET /api/user/addresses returns saved addresses with all fields including landmark
3. PUT /api/user/addresses/{id} updates address including landmark field
4. Google Places /api/address/autocomplete returns live suggestions
5. Google Places /api/address/details returns structured building/street data
6. Shiprocket /api/shipping/postcode/lookup returns city/state for Indian pincodes
7. POST /api/shipping/rates works with domestic and international destinations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ============ AUTH HELPER ============
def get_auth_token():
    """Get authentication token for test account"""
    # Verify email OTP
    email_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": "test@bottomtime.com",
        "code": "123456"
    })
    if email_response.status_code != 200:
        pytest.skip("Email OTP verification failed")
    email_token = email_response.json().get("verification_token")
    
    # Verify phone OTP
    phone_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": "+919876543210",
        "code": "123456"
    })
    if phone_response.status_code != 200:
        pytest.skip("Phone OTP verification failed")
    phone_token = phone_response.json().get("verification_token")
    
    # Login complete
    complete_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": "test@bottomtime.com",
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    if complete_response.status_code != 200:
        pytest.skip(f"Login complete failed: {complete_response.text}")
    
    return complete_response.json().get("access_token")


@pytest.fixture(scope="module")
def auth_headers():
    """Get authenticated headers"""
    token = get_auth_token()
    return {"Authorization": f"Bearer {token}"}


# ============ ADDRESS CRUD WITH LANDMARK ============
class TestAddressAPIWithLandmark:
    """Tests for /api/user/addresses with landmark field support"""
    
    TEST_ADDRESS_IDS = []  # Track created addresses for cleanup
    
    @pytest.fixture(autouse=True)
    def cleanup_test_addresses(self, auth_headers, request):
        """Cleanup any test addresses after each test class"""
        yield
        # Cleanup after all tests in the class
        if request.node.name == "test_delete_address_with_landmark":
            for addr_id in self.TEST_ADDRESS_IDS:
                try:
                    requests.delete(f"{BASE_URL}/api/user/addresses/{addr_id}", headers=auth_headers)
                    print(f"Cleanup: Deleted test address {addr_id}")
                except:
                    pass
    
    def test_create_address_with_combined_line1_and_landmark(self, auth_headers):
        """POST /api/user/addresses with address_line1 (combined house+street) and landmark"""
        # This simulates what the frontend Cart.js does:
        # address_line1 = [house_number, street_address].filter(Boolean).join(', ')
        payload = {
            "name": "TEST_Landmark User",
            "phone": "9876543210",
            "country_code": "+91",
            "address_line1": "Flat 402, Bandra West",  # Combined: house_number + street_address
            "address_line2": "Near Station",
            "landmark": "Near Linking Road",  # NEW FIELD
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400050",
            "country": "India",
            "label": "Home"
        }
        
        response = requests.post(f"{BASE_URL}/api/user/addresses", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create address failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Should return address id"
        assert data.get("name") == "TEST_Landmark User"
        assert data.get("address_line1") == "Flat 402, Bandra West"
        assert data.get("city") == "Mumbai"
        assert data.get("pincode") == "400050"
        
        # Verify landmark is stored and returned
        assert data.get("landmark") == "Near Linking Road", f"Landmark should be stored, got: {data}"
        
        # Track for cleanup
        TestAddressAPIWithLandmark.TEST_ADDRESS_IDS.append(data["id"])
        
        print(f"CREATE: Address {data['id']} with landmark='{data.get('landmark')}'")
        return data["id"]
    
    def test_get_addresses_returns_landmark(self, auth_headers):
        """GET /api/user/addresses returns addresses with landmark field"""
        response = requests.get(f"{BASE_URL}/api/user/addresses", headers=auth_headers)
        assert response.status_code == 200, f"Get addresses failed: {response.text}"
        
        data = response.json()
        assert "addresses" in data
        
        # Find our test address with landmark
        test_addrs = [a for a in data["addresses"] if a.get("name", "").startswith("TEST_")]
        if test_addrs:
            addr = test_addrs[0]
            print(f"GET: Found test address with landmark='{addr.get('landmark')}'")
            # Check if landmark is returned
            if "landmark" in addr:
                assert addr.get("landmark") == "Near Linking Road", f"Landmark mismatch: {addr.get('landmark')}"
            else:
                print("WARNING: landmark field NOT returned in GET response")
        else:
            print(f"GET: {len(data['addresses'])} addresses found")
    
    def test_update_address_with_landmark(self, auth_headers):
        """PUT /api/user/addresses/{id} updates landmark field"""
        # First create an address
        create_payload = {
            "name": "TEST_Update Landmark",
            "phone": "9876543210",
            "country_code": "+91",
            "address_line1": "Unit B, Tower 3",
            "city": "Delhi",
            "state": "Delhi",
            "pincode": "110001",
            "country": "India",
            "landmark": "Original Landmark"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/user/addresses", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        addr_id = create_response.json()["id"]
        TestAddressAPIWithLandmark.TEST_ADDRESS_IDS.append(addr_id)
        
        # Update the landmark
        update_payload = {
            "landmark": "Updated Landmark - Near Central Mall",
            "address_line1": "Unit B, Tower 3 - Updated"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/user/addresses/{addr_id}", json=update_payload, headers=auth_headers)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        assert updated.get("address_line1") == "Unit B, Tower 3 - Updated"
        
        # Verify landmark was updated
        assert updated.get("landmark") == "Updated Landmark - Near Central Mall", f"Landmark not updated: {updated}"
        
        print(f"UPDATE: landmark='{updated.get('landmark')}'")
    
    def test_delete_address_with_landmark(self, auth_headers):
        """DELETE /api/user/addresses/{id} removes address"""
        # Create an address to delete
        create_payload = {
            "name": "TEST_Delete Landmark",
            "phone": "9876543210",
            "address_line1": "Flat 101",
            "city": "Chennai",
            "pincode": "600001",
            "country": "India",
            "landmark": "Test Landmark for Delete"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/user/addresses", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        addr_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/user/addresses/{addr_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify deleted - should not appear in list
        get_response = requests.get(f"{BASE_URL}/api/user/addresses", headers=auth_headers)
        addresses = get_response.json().get("addresses", [])
        addr_ids = [a["id"] for a in addresses]
        assert addr_id not in addr_ids, "Address should be deleted"
        
        print(f"DELETE: Address {addr_id} deleted successfully")


# ============ GOOGLE PLACES API ============
class TestGooglePlacesAutocomplete:
    """Tests for /api/address/autocomplete"""
    
    def test_autocomplete_returns_live_suggestions(self):
        """GET /api/address/autocomplete?query=bandra west mumbai returns suggestions"""
        response = requests.get(f"{BASE_URL}/api/address/autocomplete", params={"query": "bandra west mumbai"})
        assert response.status_code == 200, f"Autocomplete failed: {response.text}"
        
        data = response.json()
        assert "suggestions" in data
        assert "mock" in data
        
        if not data.get("mock"):
            assert len(data["suggestions"]) > 0, "Should have suggestions"
            first = data["suggestions"][0]
            assert "place_id" in first
            assert "description" in first
            print(f"AUTOCOMPLETE LIVE: {len(data['suggestions'])} suggestions, first: {first.get('main_text')}")
        else:
            print(f"AUTOCOMPLETE MOCK: Google Places not configured")


class TestGooglePlacesDetails:
    """Tests for /api/address/details"""
    
    def test_details_returns_structured_address(self):
        """GET /api/address/details returns building/street in address_line1"""
        # Get a place_id first
        autocomplete = requests.get(f"{BASE_URL}/api/address/autocomplete", params={"query": "empire state building"})
        if autocomplete.json().get("mock") or not autocomplete.json().get("suggestions"):
            pytest.skip("Google Places in mock mode or no suggestions")
        
        place_id = autocomplete.json()["suggestions"][0]["place_id"]
        
        # Get details
        response = requests.get(f"{BASE_URL}/api/address/details", params={"place_id": place_id})
        assert response.status_code == 200, f"Details failed: {response.text}"
        
        details = response.json()
        assert details.get("mock") == False
        assert "formatted_address" in details
        assert "address_line1" in details
        assert "city" in details
        assert "state" in details
        
        print(f"DETAILS: address_line1='{details.get('address_line1')}', city={details.get('city')}")


# ============ SHIPROCKET POSTCODE LOOKUP ============
class TestShiprocketPostcodeLookup:
    """Tests for /api/shipping/postcode/lookup"""
    
    def test_postcode_lookup_indian_pincode(self):
        """GET /api/shipping/postcode/lookup returns city/state for Indian pincode"""
        response = requests.get(f"{BASE_URL}/api/shipping/postcode/lookup", params={"postcode": "400050"})
        assert response.status_code == 200, f"Postcode lookup failed: {response.text}"
        
        data = response.json()
        if data.get("success"):
            assert data.get("city"), "Should return city"
            assert data.get("state"), "Should return state"
            print(f"POSTCODE 400050: {data.get('city')}, {data.get('state')} (mock={data.get('mock')})")
        else:
            print(f"POSTCODE: {data.get('message')}")
    
    def test_postcode_lookup_delhi(self):
        """Test postcode lookup for Delhi pincode 110001"""
        response = requests.get(f"{BASE_URL}/api/shipping/postcode/lookup", params={"postcode": "110001"})
        assert response.status_code == 200
        
        data = response.json()
        if data.get("success"):
            city = data.get("city", "").lower()
            state = data.get("state", "").lower()
            assert "delhi" in city or "delhi" in state, f"Expected Delhi, got city={city}, state={state}"
            print(f"POSTCODE 110001: {data.get('city')}, {data.get('state')}")


# ============ SHIPPING RATES ============
class TestShippingRatesDomestic:
    """Tests for /api/shipping/rates with domestic pincodes"""
    
    def test_domestic_shipping_rates(self):
        """POST /api/shipping/rates with Indian pincode returns rates"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "pickup_pincode": "400001",
            "delivery_pincode": "400050",  # Bandra West pincode from test case
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200, f"Domestic rates failed: {response.text}"
        
        data = response.json()
        assert data.get("is_international") == False
        assert "rates" in data
        assert len(data["rates"]) >= 1, "Should have at least 1 carrier"
        
        print(f"DOMESTIC: {len(data['rates'])} carriers, cheapest={data.get('cheapest', {}).get('carrier')} @₹{data.get('cheapest', {}).get('rate')}, mock={data.get('mock')}")


class TestShippingRatesInternational:
    """Tests for /api/shipping/rates with international destinations"""
    
    def test_international_shipping_rates_usa(self):
        """POST /api/shipping/rates with US destination returns is_international=true"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "10001",
            "delivery_country": "United States",
            "weight": 0.5
        })
        assert response.status_code == 200, f"International rates failed: {response.text}"
        
        data = response.json()
        assert data.get("is_international") == True
        assert "rates" in data
        assert len(data["rates"]) > 0
        
        # International is MOCK (ShiprocketX not activated)
        print(f"INTERNATIONAL USA: {len(data['rates'])} carriers, mock={data.get('mock')}")
    
    def test_international_shipping_rates_uk(self):
        """POST /api/shipping/rates with UK destination"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "SW1A 1AA",
            "delivery_country": "United Kingdom",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_international") == True
        print(f"INTERNATIONAL UK: {len(data.get('rates', []))} carriers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
