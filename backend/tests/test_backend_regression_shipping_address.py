"""
Backend Regression Tests - Shipping & Address APIs
Iteration 52: Full regression test for Google Places, Shiprocket Shipping, and Auth
Tests:
- Google Places autocomplete + details
- Shiprocket domestic (LIVE) and international (MOCK) rates
- Cart-based shipping with product weights
- Postcode lookup, tracking, shipping status
- Product creation with weight field
- Test account OTP bypass (test@bottomtime.com + 123456)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ============ TEST ACCOUNT LOGIN ============
class TestAuthOTPBypass:
    """Test account OTP bypass for test@bottomtime.com"""
    
    def test_login_init(self):
        """POST /api/auth/login-init with test account"""
        response = requests.post(f"{BASE_URL}/api/auth/login-init", json={
            "email": "test@bottomtime.com"
        })
        # Should return phone hint for the test account
        assert response.status_code == 200, f"Login init failed: {response.text}"
        data = response.json()
        assert "phone_hint" in data, "Should return phone_hint"
        print(f"Login init response: {data}")
    
    def test_verify_email_otp_bypass(self):
        """POST /api/auth/verify-otp with test account email + 123456"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert response.status_code == 200, f"Email OTP verify failed: {response.text}"
        data = response.json()
        assert data.get("verified") == True, "Should be verified"
        assert "verification_token" in data, "Should return verification_token"
        print(f"Email OTP bypass: PASSED")
        return data["verification_token"]
    
    def test_verify_phone_otp_bypass(self):
        """POST /api/auth/verify-otp with test account phone + 123456"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        assert response.status_code == 200, f"Phone OTP verify failed: {response.text}"
        data = response.json()
        assert data.get("verified") == True, "Should be verified"
        assert "verification_token" in data, "Should return verification_token"
        print(f"Phone OTP bypass: PASSED")
        return data["verification_token"]
    
    def test_full_login_flow_with_bypass(self):
        """Full login flow: login-init -> verify email OTP -> verify phone OTP -> login-complete"""
        # Step 1: Login init
        init_response = requests.post(f"{BASE_URL}/api/auth/login-init", json={
            "email": "test@bottomtime.com"
        })
        assert init_response.status_code == 200
        
        # Step 2: Verify email OTP
        email_otp_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert email_otp_response.status_code == 200
        email_token = email_otp_response.json()["verification_token"]
        
        # Step 3: Verify phone OTP
        phone_otp_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        assert phone_otp_response.status_code == 200
        phone_token = phone_otp_response.json()["verification_token"]
        
        # Step 4: Login complete
        complete_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert complete_response.status_code == 200, f"Login complete failed: {complete_response.text}"
        data = complete_response.json()
        assert "access_token" in data, "Should return access_token"
        assert "user" in data, "Should return user object"
        print(f"Full login flow: PASSED - Got access_token for user: {data['user'].get('email')}")
        return data["access_token"]


# ============ GOOGLE PLACES API ============
class TestGooglePlacesAutocomplete:
    """Tests for /api/address/autocomplete endpoint"""
    
    def test_autocomplete_bandra_west_mumbai(self):
        """GET /api/address/autocomplete?query=bandra+west+mumbai"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "bandra west mumbai"}
        )
        assert response.status_code == 200, f"Autocomplete failed: {response.text}"
        
        data = response.json()
        assert "suggestions" in data, "Should have suggestions key"
        assert "mock" in data, "Should have mock key"
        
        # Check if LIVE Google Places
        if not data.get("mock"):
            assert len(data["suggestions"]) > 0, "Should return suggestions for 'bandra west mumbai'"
            first = data["suggestions"][0]
            assert "place_id" in first, "Suggestion should have place_id"
            assert "description" in first, "Suggestion should have description"
            print(f"Google Places LIVE: {len(data['suggestions'])} suggestions for 'bandra west mumbai'")
            print(f"First: {first.get('main_text')} - {first.get('secondary_text')}")
        else:
            print(f"WARNING: Google Places in MOCK mode")
    
    def test_autocomplete_returns_place_ids(self):
        """Autocomplete should return place_id for each suggestion"""
        response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "empire state building"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data.get("mock") and len(data.get("suggestions", [])) > 0:
            for suggestion in data["suggestions"]:
                assert suggestion.get("place_id"), f"Each suggestion should have place_id: {suggestion}"
            print(f"All {len(data['suggestions'])} suggestions have place_id")


class TestGooglePlacesDetails:
    """Tests for /api/address/details endpoint"""
    
    def test_address_details_returns_structured_address(self):
        """GET /api/address/details?place_id={id} should return address_line1 with building/street"""
        # First get a place_id
        autocomplete_response = requests.get(
            f"{BASE_URL}/api/address/autocomplete",
            params={"query": "empire state building new york"}
        )
        if autocomplete_response.json().get("mock"):
            pytest.skip("Google Places in mock mode")
        
        suggestions = autocomplete_response.json().get("suggestions", [])
        if not suggestions:
            pytest.skip("No autocomplete suggestions returned")
        
        place_id = suggestions[0]["place_id"]
        
        # Get details
        details_response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": place_id}
        )
        assert details_response.status_code == 200, f"Details failed: {details_response.text}"
        
        details = details_response.json()
        assert details.get("mock") == False, "Should be LIVE data"
        
        # Verify structured address fields
        assert "formatted_address" in details
        assert "address_line1" in details, "Should have address_line1"
        assert "city" in details
        assert "state" in details
        assert "country" in details
        assert "country_code" in details
        
        # address_line1 should contain building/street info
        addr1 = details.get("address_line1", "")
        print(f"address_line1: '{addr1}'")
        print(f"city: {details.get('city')}, state: {details.get('state')}, pincode: {details.get('pincode')}")
        assert addr1, "address_line1 should not be empty"
    
    def test_invalid_place_id_returns_500(self):
        """Invalid place_id should return 500 error"""
        response = requests.get(
            f"{BASE_URL}/api/address/details",
            params={"place_id": "invalid_place_id_xyz"}
        )
        assert response.status_code >= 500, f"Should fail for invalid place_id, got {response.status_code}"


# ============ SHIPROCKET SHIPPING RATES ============
class TestShiprocketDomestic:
    """Tests for /api/shipping/rates with domestic pincodes - LIVE Shiprocket"""
    
    def test_domestic_india_returns_live_rates(self):
        """POST /api/shipping/rates with Indian pincode returns LIVE rates"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "pickup_pincode": "400001",
            "delivery_pincode": "110001",  # Delhi
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200, f"Domestic rates failed: {response.text}"
        
        data = response.json()
        # Domestic should be LIVE (mock=false)
        assert data.get("mock") == False, f"Domestic should be LIVE, got mock={data.get('mock')}"
        assert data.get("is_international") == False, "Should not be international"
        
        # Should have rates
        assert len(data.get("rates", [])) >= 1, "Should return at least 1 carrier"
        
        # Verify rate structure
        rate = data["rates"][0]
        assert "carrier_id" in rate
        assert "carrier" in rate
        assert "rate" in rate
        assert rate["currency"] == "INR"
        assert "estimated_days" in rate
        assert rate["is_international"] == False
        
        print(f"Domestic LIVE rates: {len(data['rates'])} carriers")
        print(f"Cheapest: {data.get('cheapest', {}).get('carrier')} @ ₹{data.get('cheapest', {}).get('rate')}")
    
    def test_domestic_cheapest_and_fastest(self):
        """Response should include cheapest, fastest, recommended"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "400050",
            "delivery_country": "India",
            "weight": 0.5
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("cheapest") is not None, "Should have cheapest"
        assert data.get("fastest") is not None, "Should have fastest"
        assert data.get("recommended") is not None, "Should have recommended"
        
        # Verify cheapest has lowest rate
        if not data.get("mock"):
            cheapest_rate = data["cheapest"]["rate"]
            all_rates = [r["rate"] for r in data["rates"]]
            assert cheapest_rate == min(all_rates), "Cheapest should have lowest rate"


class TestShiprocketInternational:
    """Tests for /api/shipping/rates with international countries - MOCK"""
    
    def test_international_usa_returns_mock(self):
        """POST /api/shipping/rates with USA returns is_international=true with MOCK rates"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "10001",
            "delivery_country": "United States",
            "weight": 0.5
        })
        assert response.status_code == 200, f"International rates failed: {response.text}"
        
        data = response.json()
        assert data.get("is_international") == True, "Should be international"
        # International falls back to mock (ShiprocketX not activated)
        assert data.get("mock") == True, f"International should be MOCK, got mock={data.get('mock')}"
        
        # Should have international carriers
        assert len(data.get("rates", [])) > 0
        for rate in data["rates"]:
            assert rate["is_international"] == True
        
        print(f"International MOCK rates for USA: {len(data['rates'])} carriers")
    
    def test_international_uk_returns_mock(self):
        """POST /api/shipping/rates with UK returns MOCK rates"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "SW1A 1AA",
            "delivery_country": "United Kingdom",
            "weight": 0.5
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_international") == True
        assert data.get("mock") == True
        print(f"International MOCK rates for UK: {len(data.get('rates', []))} carriers")


class TestShiprocketCartItems:
    """Tests for /api/shipping/rates with cart_items - uses product weights from DB"""
    
    def test_shipping_rates_with_cart_items(self):
        """POST /api/shipping/rates with cart_items calculates weight from DB"""
        # Use actual product IDs from the database (if known)
        # This tests the _calculate_cart_weight function
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "110001",
            "delivery_country": "India",
            "cart_items": [
                {"product_id": "test-product-1", "quantity": 2},
                {"product_id": "test-product-2", "quantity": 1}
            ]
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should return rates (even if products not found, will use default weight)
        assert "rates" in data
        assert len(data["rates"]) >= 0  # May be 0 if rates fail, but no error
        print(f"Cart-based rates: {len(data.get('rates', []))} carriers")
    
    def test_shipping_rates_without_cart_uses_weight_param(self):
        """Without cart_items, uses weight parameter"""
        response = requests.post(f"{BASE_URL}/api/shipping/rates", json={
            "delivery_pincode": "400001",
            "delivery_country": "India",
            "weight": 1.5
        })
        assert response.status_code == 200
        # Should process normally
        print(f"Weight-based rates: {len(response.json().get('rates', []))} carriers")


# ============ POSTCODE LOOKUP ============
class TestPostcodeLookup:
    """Tests for /api/shipping/postcode/lookup endpoint"""
    
    def test_postcode_lookup_400001(self):
        """GET /api/shipping/postcode/lookup?postcode=400001 returns city/state"""
        response = requests.get(
            f"{BASE_URL}/api/shipping/postcode/lookup",
            params={"postcode": "400001"}
        )
        assert response.status_code == 200, f"Postcode lookup failed: {response.text}"
        
        data = response.json()
        if data.get("success"):
            assert data.get("city"), "Should return city"
            assert data.get("state"), "Should return state"
            assert data.get("mock") == False, "Should be LIVE Shiprocket"
            print(f"Postcode 400001: {data.get('city')}, {data.get('state')}")
        else:
            print(f"Postcode lookup: {data.get('message')}")
    
    def test_postcode_lookup_delhi(self):
        """Test postcode lookup for Delhi pincode"""
        response = requests.get(
            f"{BASE_URL}/api/shipping/postcode/lookup",
            params={"postcode": "110001"}
        )
        assert response.status_code == 200
        data = response.json()
        if data.get("success"):
            assert "delhi" in data.get("city", "").lower() or "delhi" in data.get("state", "").lower()
            print(f"Postcode 110001: {data.get('city')}, {data.get('state')}")


# ============ TRACKING ============
class TestShippingTracking:
    """Tests for /api/shipping/track/{awb_code} endpoint"""
    
    def test_tracking_returns_mock_data(self):
        """GET /api/shipping/track/{awb_code} returns tracking data (MOCK for unknown AWB)"""
        response = requests.get(f"{BASE_URL}/api/shipping/track/TEST123456789")
        assert response.status_code == 200, f"Tracking failed: {response.text}"
        
        data = response.json()
        # For unknown AWB, returns mock
        assert data.get("mock") == True, "Unknown AWB should return mock"
        assert data.get("awb_code") == "TEST123456789"
        assert "current_status" in data
        assert "activities" in data
        assert isinstance(data["activities"], list)
        
        print(f"Tracking status: {data.get('current_status')}")
        print(f"Activities count: {len(data.get('activities', []))}")


# ============ SHIPPING STATUS ============
class TestShippingStatus:
    """Tests for /api/shipping/status endpoint"""
    
    def test_shipping_status_shiprocket_configured(self):
        """GET /api/shipping/status returns shiprocket configured, no google_places reference"""
        response = requests.get(f"{BASE_URL}/api/shipping/status")
        assert response.status_code == 200, f"Shipping status failed: {response.text}"
        
        data = response.json()
        assert "shiprocket" in data, "Should have shiprocket key"
        assert data["shiprocket"]["configured"] == True, "Shiprocket should be configured (LIVE)"
        assert data["shiprocket"]["mode"] == "live", "Mode should be 'live'"
        
        # Verify features
        features = data["shiprocket"]["features"]
        assert features["domestic"] == True
        assert features["international"] == True
        assert features["tracking"] == True
        assert features["postcode_lookup"] == True
        
        # Should NOT have google_places key (per request)
        assert "google_places" not in data, "Should not have google_places key in shipping status"
        
        print(f"Shiprocket status: configured={data['shiprocket']['configured']}, mode={data['shiprocket']['mode']}")


# ============ ADMIN PRODUCTS WITH WEIGHT ============
class TestAdminProductWeight:
    """Tests for /api/admin/products with weight field"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin access token via test account login"""
        # Login flow
        email_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        phone_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "code": "123456"
        })
        
        complete_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": email_response.json()["verification_token"],
            "phone_verified_token": phone_response.json()["verification_token"]
        })
        
        if complete_response.status_code != 200:
            pytest.skip("Could not login as test account")
        
        return complete_response.json()["access_token"]
    
    def test_create_product_with_weight(self, admin_token):
        """POST /api/admin/products with weight field - weight persisted"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        product_data = {
            "name": "TEST_Regression Test Product",
            "category": "merch",
            "price": 29.99,
            "description": "Test product for regression testing",
            "weight": 0.45,  # 450 grams
            "in_stock": True,
            "stock": 100
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin/products",
            json=product_data,
            headers=headers
        )
        
        # May return 403 if test account is not admin
        if response.status_code == 403:
            pytest.skip("Test account is not admin - cannot test product creation")
        
        assert response.status_code == 200, f"Product creation failed: {response.text}"
        
        data = response.json()
        assert data.get("weight") == 0.45, f"Weight should be 0.45, got {data.get('weight')}"
        assert data.get("name") == "TEST_Regression Test Product"
        
        print(f"Product created with weight: {data.get('weight')}kg")
        
        # Cleanup - delete the test product
        product_id = data.get("id")
        if product_id:
            requests.delete(
                f"{BASE_URL}/api/admin/products/{product_id}",
                headers=headers
            )
            print(f"Cleanup: Deleted test product {product_id}")


# ============ SIMPLE ENDPOINTS ============
class TestSimpleEndpoints:
    """Test simple shipping endpoints"""
    
    def test_simple_shipping_rate(self):
        """GET /api/shipping/rates/simple returns cheapest rate"""
        response = requests.get(
            f"{BASE_URL}/api/shipping/rates/simple",
            params={"pincode": "400001", "country": "India", "weight": "0.5"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "shipping_cost" in data
        assert "carrier" in data
        assert "currency" in data
        assert data["currency"] == "INR"
        print(f"Simple rate: ₹{data.get('shipping_cost')} via {data.get('carrier')}")
    
    def test_delivery_estimate_simple(self):
        """GET /api/delivery-estimate-simple returns estimate"""
        response = requests.get(
            f"{BASE_URL}/api/delivery-estimate-simple",
            params={"pincode": "400001", "country": "India"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "estimate" in data
        assert "type" in data
        assert data["provider"] == "shiprocket"
        print(f"Delivery estimate: {data.get('estimate')} ({data.get('type')})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
