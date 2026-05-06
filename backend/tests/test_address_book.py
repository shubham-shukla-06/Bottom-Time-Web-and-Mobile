"""
Address Book API Tests - Iteration 43
Tests for address CRUD, delivery estimate, and default address functionality

New Endpoints:
- GET /api/user/addresses - Get all addresses for current user
- POST /api/user/addresses - Create new address with all fields including country_code
- PUT /api/user/addresses/{id} - Update address
- DELETE /api/user/addresses/{id} - Delete address
- PUT /api/user/addresses/{id}/default - Set address as default
- GET /api/delivery-estimate?pincode=X&country=Y - Get delivery estimate
"""

import pytest
import requests
import jwt
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"


def generate_token(user_id):
    """Generate a valid JWT token for testing"""
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_headers():
    """Get authentication headers for admin user"""
    token = generate_token(ADMIN_USER_ID)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def authenticated_client(api_client, auth_headers):
    """Session with auth header"""
    api_client.headers.update(auth_headers)
    return api_client


class TestDeliveryEstimate:
    """Test delivery estimate endpoint - no authentication required"""

    def test_metro_delhi_estimate(self, api_client):
        """Test metro estimate for Delhi pincode (11xxxx)"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=110001&country=India")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "2-4 business days"
        assert data["type"] == "domestic_metro"
        print(f"PASS: Delhi metro estimate: {data}")

    def test_metro_chennai_estimate(self, api_client):
        """Test metro estimate for Chennai pincode (60xxxx)"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=600001&country=India")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "2-4 business days"
        assert data["type"] == "domestic_metro"
        print(f"PASS: Chennai metro estimate: {data}")

    def test_domestic_non_metro_estimate(self, api_client):
        """Test domestic estimate for Guwahati pincode (781xxx)"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=781001&country=India")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "4-7 business days"
        assert data["type"] == "domestic"
        print(f"PASS: Domestic non-metro estimate: {data}")

    def test_international_estimate_usa(self, api_client):
        """Test international estimate for USA"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=12345&country=United%20States")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "10-18 business days"
        assert data["type"] == "international"
        print(f"PASS: International (USA) estimate: {data}")

    def test_apac_estimate_thailand(self, api_client):
        """Test APAC estimate for Thailand"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=10110&country=Thailand")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "7-12 business days"
        assert data["type"] == "apac"
        print(f"PASS: APAC (Thailand) estimate: {data}")

    def test_regional_estimate_nepal(self, api_client):
        """Test regional estimate for Nepal (nearby country)"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=44600&country=Nepal")
        assert response.status_code == 200
        data = response.json()
        assert data["estimate"] == "7-10 business days"
        assert data["type"] == "regional"
        print(f"PASS: Regional (Nepal) estimate: {data}")


class TestAddressBookCRUD:
    """Test address book CRUD operations"""

    @pytest.fixture(autouse=True)
    def cleanup_test_addresses(self, authenticated_client):
        """Cleanup test addresses after tests"""
        yield
        # Teardown: Get all addresses and delete TEST_ prefixed ones
        try:
            response = authenticated_client.get(f"{BASE_URL}/api/user/addresses")
            if response.status_code == 200:
                addresses = response.json().get("addresses", [])
                for addr in addresses:
                    if addr.get("name", "").startswith("TEST_"):
                        authenticated_client.delete(f"{BASE_URL}/api/user/addresses/{addr['id']}")
        except:
            pass

    def test_get_addresses_empty_or_existing(self, authenticated_client):
        """Test GET /api/user/addresses returns addresses list"""
        response = authenticated_client.get(f"{BASE_URL}/api/user/addresses")
        assert response.status_code == 200
        data = response.json()
        assert "addresses" in data
        assert isinstance(data["addresses"], list)
        print(f"PASS: Get addresses returned {len(data['addresses'])} addresses")

    def test_create_address_with_all_fields(self, authenticated_client):
        """Test POST /api/user/addresses creates address with country_code"""
        payload = {
            "name": "TEST_John Doe",
            "phone": "9876543210",
            "country_code": "+91",
            "address_line1": "123 Test Street",
            "address_line2": "Apt 4B",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "country": "India",
            "label": "Home"
        }
        response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all fields are present
        assert data["name"] == payload["name"]
        assert data["phone"] == payload["phone"]
        assert data["country_code"] == payload["country_code"]
        assert data["address_line1"] == payload["address_line1"]
        assert data["address_line2"] == payload["address_line2"]
        assert data["city"] == payload["city"]
        assert data["state"] == payload["state"]
        assert data["pincode"] == payload["pincode"]
        assert data["country"] == payload["country"]
        assert data["label"] == payload["label"]
        assert "id" in data
        print(f"PASS: Created address with id {data['id']}, country_code: {data['country_code']}")
        return data["id"]

    def test_create_address_default_country_code(self, authenticated_client):
        """Test address creation uses +91 as default country_code"""
        payload = {
            "name": "TEST_Jane Smith",
            "phone": "9876543211",
            # No country_code provided
            "address_line1": "456 Test Ave",
            "city": "Delhi",
            "pincode": "110001",
            "country": "India"
        }
        response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["country_code"] == "+91"  # Default value
        print(f"PASS: Default country_code is +91")

    def test_create_address_missing_required_fields(self, authenticated_client):
        """Test address creation fails with missing required fields"""
        payload = {
            "name": "TEST_Incomplete",
            # Missing phone, address_line1, city, pincode, country
        }
        response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=payload)
        assert response.status_code == 400
        print(f"PASS: Missing required fields returns 400")

    def test_first_address_is_default(self, authenticated_client):
        """Test first address is automatically set as default"""
        # First, check existing addresses count
        initial = authenticated_client.get(f"{BASE_URL}/api/user/addresses").json()
        initial_count = len(initial.get("addresses", []))
        
        # Create a new address
        payload = {
            "name": "TEST_First Address",
            "phone": "9876543212",
            "country_code": "+91",
            "address_line1": "First Address Street",
            "city": "Bangalore",
            "pincode": "560001",
            "country": "India"
        }
        create_response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=payload)
        assert create_response.status_code == 200
        new_addr_id = create_response.json()["id"]
        
        # If this was the first address, it should be default
        get_response = authenticated_client.get(f"{BASE_URL}/api/user/addresses")
        data = get_response.json()
        
        if initial_count == 0:
            assert data.get("default_id") == new_addr_id
            print(f"PASS: First address {new_addr_id} is set as default")
        else:
            print(f"PASS: Address created (not first, so default not auto-set)")

    def test_update_address(self, authenticated_client):
        """Test PUT /api/user/addresses/{id} updates address"""
        # Create an address first
        create_payload = {
            "name": "TEST_To Update",
            "phone": "9876543213",
            "country_code": "+91",
            "address_line1": "Original Street",
            "city": "Chennai",
            "pincode": "600001",
            "country": "India"
        }
        create_response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=create_payload)
        assert create_response.status_code == 200
        addr_id = create_response.json()["id"]
        
        # Update the address
        update_payload = {
            "name": "TEST_Updated Name",
            "phone": "9876543214",
            "country_code": "+44",
            "city": "Updated City"
        }
        update_response = authenticated_client.put(f"{BASE_URL}/api/user/addresses/{addr_id}", json=update_payload)
        assert update_response.status_code == 200
        updated_data = update_response.json()
        
        # Verify updates
        assert updated_data["name"] == "TEST_Updated Name"
        assert updated_data["phone"] == "9876543214"
        assert updated_data["country_code"] == "+44"
        assert updated_data["city"] == "Updated City"
        # Original fields should remain
        assert updated_data["address_line1"] == "Original Street"
        print(f"PASS: Address updated successfully")

    def test_delete_address(self, authenticated_client):
        """Test DELETE /api/user/addresses/{id} removes address"""
        # Create an address first
        create_payload = {
            "name": "TEST_To Delete",
            "phone": "9876543215",
            "address_line1": "Delete Me Street",
            "city": "Kolkata",
            "pincode": "700001",
            "country": "India"
        }
        create_response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=create_payload)
        assert create_response.status_code == 200
        addr_id = create_response.json()["id"]
        
        # Delete the address
        delete_response = authenticated_client.delete(f"{BASE_URL}/api/user/addresses/{addr_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Deleted"
        
        # Verify it's gone
        get_response = authenticated_client.get(f"{BASE_URL}/api/user/addresses")
        addresses = get_response.json().get("addresses", [])
        address_ids = [a["id"] for a in addresses]
        assert addr_id not in address_ids
        print(f"PASS: Address {addr_id} deleted successfully")

    def test_set_default_address(self, authenticated_client):
        """Test PUT /api/user/addresses/{id}/default sets default address"""
        # Create two addresses
        addr1_payload = {
            "name": "TEST_Address One",
            "phone": "9876543216",
            "address_line1": "Address One Street",
            "city": "Hyderabad",
            "pincode": "500001",
            "country": "India"
        }
        addr1_response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=addr1_payload)
        assert addr1_response.status_code == 200
        addr1_response.json()["id"]
        
        addr2_payload = {
            "name": "TEST_Address Two",
            "phone": "9876543217",
            "address_line1": "Address Two Street",
            "city": "Ahmedabad",
            "pincode": "380001",
            "country": "India"
        }
        addr2_response = authenticated_client.post(f"{BASE_URL}/api/user/addresses", json=addr2_payload)
        assert addr2_response.status_code == 200
        addr2_id = addr2_response.json()["id"]
        
        # Set second address as default
        default_response = authenticated_client.put(f"{BASE_URL}/api/user/addresses/{addr2_id}/default")
        assert default_response.status_code == 200
        assert default_response.json()["message"] == "Default set"
        
        # Verify default_id changed
        get_response = authenticated_client.get(f"{BASE_URL}/api/user/addresses")
        data = get_response.json()
        assert data.get("default_id") == addr2_id
        print(f"PASS: Address {addr2_id} set as default")

    def test_set_default_nonexistent_address(self, authenticated_client):
        """Test setting default on non-existent address returns 404"""
        response = authenticated_client.put(f"{BASE_URL}/api/user/addresses/nonexistent-id-12345/default")
        assert response.status_code == 404
        print(f"PASS: Non-existent address returns 404")

    def test_update_nonexistent_address(self, authenticated_client):
        """Test updating non-existent address returns 404"""
        response = authenticated_client.put(
            f"{BASE_URL}/api/user/addresses/nonexistent-id-12345",
            json={"name": "Won't work"}
        )
        assert response.status_code == 404
        print(f"PASS: Update non-existent address returns 404")


class TestAddressBookAuthentication:
    """Test address endpoints require authentication"""

    def test_get_addresses_requires_auth(self, api_client):
        """Test GET /api/user/addresses requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/user/addresses")
        assert response.status_code in [401, 403]
        print(f"PASS: Get addresses requires auth (status {response.status_code})")

    def test_create_address_requires_auth(self, api_client):
        """Test POST /api/user/addresses requires authentication"""
        payload = {
            "name": "Unauthorized",
            "phone": "1234567890",
            "address_line1": "Test",
            "city": "Test",
            "pincode": "123456",
            "country": "India"
        }
        response = api_client.post(f"{BASE_URL}/api/user/addresses", json=payload)
        assert response.status_code in [401, 403]
        print(f"PASS: Create address requires auth (status {response.status_code})")

    def test_delivery_estimate_no_auth_required(self, api_client):
        """Test GET /api/delivery-estimate works without auth"""
        response = api_client.get(f"{BASE_URL}/api/delivery-estimate?pincode=110001&country=India")
        assert response.status_code == 200
        print(f"PASS: Delivery estimate works without auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
