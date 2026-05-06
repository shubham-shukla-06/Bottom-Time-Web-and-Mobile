"""
Backend Refactoring Validation Tests
Tests all API endpoints to verify functionality after splitting server.py into modules.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestPublicEndpoints:
    """Test all public endpoints that don't require authentication"""
    
    def test_stats_public(self):
        """GET /api/stats/public - Returns platform stats"""
        response = requests.get(f"{BASE_URL}/api/stats/public")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "divers" in data
        assert "bookings" in data
        assert "reviews" in data
        assert "countries" in data
        assert "avg_rating" in data
        print(f"Public stats: {data}")
    
    def test_site_content_public(self):
        """GET /api/site-content/public - Returns CMS content"""
        response = requests.get(f"{BASE_URL}/api/site-content/public")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "hero_title" in data or "hero_image" in data
        print(f"Site content keys: {list(data.keys())}")
    
    def test_listings_get(self):
        """GET /api/listings - Returns listings with filters"""
        response = requests.get(f"{BASE_URL}/api/listings", params={"limit": 5})
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "listings" in data
        assert "count" in data
        assert isinstance(data["listings"], list)
        if data["listings"]:
            listing = data["listings"][0]
            assert "id" in listing
            assert "name" in listing
            assert "type" in listing
        print(f"Found {data['count']} listings")
    
    def test_listings_with_type_filter(self):
        """GET /api/listings?type=dives - Filter by type"""
        response = requests.get(f"{BASE_URL}/api/listings", params={"type": "dives"})
        assert response.status_code == 200
        data = response.json()
        for listing in data.get("listings", []):
            assert listing["type"] == "dives"
        print(f"Found {data['count']} dive listings")
    
    def test_listings_with_country_filter(self):
        """GET /api/listings?country=Indonesia - Filter by country"""
        response = requests.get(f"{BASE_URL}/api/listings", params={"country": "Indonesia"})
        assert response.status_code == 200
        data = response.json()
        print(f"Found {data['count']} Indonesia listings")
    
    def test_products_get(self):
        """GET /api/products - Returns products"""
        response = requests.get(f"{BASE_URL}/api/products", params={"limit": 10})
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "products" in data
        assert "count" in data
        if data["products"]:
            product = data["products"][0]
            assert "id" in product
            assert "name" in product
            assert "price" in product
        print(f"Found {data['count']} products")
    
    def test_events_get(self):
        """GET /api/events - Returns events"""
        response = requests.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "events" in data
        if data["events"]:
            event = data["events"][0]
            assert "id" in event
            assert "title" in event
        print(f"Found {len(data['events'])} events")
    
    def test_destinations_get(self):
        """GET /api/destinations - Returns destinations aggregated data"""
        response = requests.get(f"{BASE_URL}/api/destinations")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "destinations" in data
        if data["destinations"]:
            dest = data["destinations"][0]
            assert "country" in dest
            assert "listing_count" in dest
        print(f"Found {len(data['destinations'])} destinations")
    
    def test_exchange_rates(self):
        """GET /api/exchange-rates - Returns exchange rates"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "rates" in data
        assert "USD" in data["rates"]
        print(f"Exchange rates: {list(data['rates'].keys())}")
    
    def test_popular_locations(self):
        """GET /api/listings/locations/popular - Returns popular locations"""
        response = requests.get(f"{BASE_URL}/api/listings/locations/popular")
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "countries" in data
        print(f"Popular locations: {len(data['countries'])} countries")


class TestAnonymousTracking:
    """Test anonymous tracking endpoint"""
    
    def test_track_anon_event(self):
        """POST /api/track/anon - Anonymous event tracking"""
        payload = {
            "event_type": "page_view",
            "data": {"page": "/discover", "test": True}
        }
        response = requests.post(f"{BASE_URL}/api/track/anon", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert data.get("ok") == True
        print("Anonymous tracking works")


class TestAuthFlow:
    """Test authentication endpoints"""
    
    def test_send_otp_email(self):
        """POST /api/auth/send-otp - Send OTP to email"""
        payload = {"identifier": f"test_refactor_{uuid.uuid4().hex[:8]}@example.com"}
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert data["channel"] == "email"
        assert "expires_at" in data
        print("Send OTP to email works")
    
    def test_send_otp_phone(self):
        """POST /api/auth/send-otp - Send OTP to phone"""
        payload = {"identifier": "+19998887766"}
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert data["channel"] == "phone"
        print("Send OTP to phone works")
    
    def test_send_otp_invalid(self):
        """POST /api/auth/send-otp - Invalid identifier"""
        payload = {"identifier": "invalid"}
        response = requests.post(f"{BASE_URL}/api/auth/send-otp", json=payload)
        assert response.status_code == 400
        print("Invalid identifier correctly rejected")
    
    def test_verify_otp(self):
        """POST /api/auth/verify-otp - Verify OTP with hardcoded 123456"""
        email = f"test_verify_{uuid.uuid4().hex[:8]}@example.com"
        # First send OTP
        send_resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        assert send_resp.status_code == 200
        
        # Verify with hardcoded OTP
        payload = {"identifier": email, "code": "123456"}
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert data["verified"] == True
        assert "verification_token" in data
        print("OTP verification works with 123456")
    
    def test_verify_otp_wrong_code(self):
        """POST /api/auth/verify-otp - Wrong OTP code"""
        email = f"test_wrong_{uuid.uuid4().hex[:8]}@example.com"
        send_resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        assert send_resp.status_code == 200
        
        payload = {"identifier": email, "code": "000000"}
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json=payload)
        assert response.status_code == 400
        print("Wrong OTP correctly rejected")
    
    def test_signup_init(self):
        """POST /api/auth/signup-init - Check if email available"""
        email = f"test_signup_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"email": email, "name": "Test User", "role": "diver"}
        response = requests.post(f"{BASE_URL}/api/auth/signup-init", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "email" in data
        print("Signup init works")
    
    def test_store_signup_data(self):
        """POST /api/auth/store-signup-data - Store temp signup data"""
        email = f"test_store_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"email": email, "name": "Test User", "role": "diver"}
        response = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json=payload)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        print("Store signup data works")


class TestFullSignupFlow:
    """Test complete signup flow - signup-init → store-signup-data → send-otp (email) → verify-otp → send-otp (phone) → verify-otp → signup-complete"""
    
    def test_complete_signup_flow(self):
        """Test full authentication flow"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"test_flow_{unique_id}@example.com"
        phone = f"+1555{unique_id[:7]}"
        name = f"Test Flow {unique_id}"
        
        # Step 1: Signup init
        resp = requests.post(f"{BASE_URL}/api/auth/signup-init", json={
            "email": email, "name": name, "role": "diver"
        })
        assert resp.status_code == 200, f"signup-init failed: {resp.text}"
        print("Step 1: signup-init OK")
        
        # Step 2: Store signup data
        resp = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": name, "role": "diver"
        })
        assert resp.status_code == 200, f"store-signup-data failed: {resp.text}"
        print("Step 2: store-signup-data OK")
        
        # Step 3: Send email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        assert resp.status_code == 200, f"send-otp email failed: {resp.text}"
        print("Step 3: send-otp (email) OK")
        
        # Step 4: Verify email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        assert resp.status_code == 200, f"verify-otp email failed: {resp.text}"
        email_token = resp.json()["verification_token"]
        print("Step 4: verify-otp (email) OK")
        
        # Step 5: Send phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        assert resp.status_code == 200, f"send-otp phone failed: {resp.text}"
        print("Step 5: send-otp (phone) OK")
        
        # Step 6: Verify phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        assert resp.status_code == 200, f"verify-otp phone failed: {resp.text}"
        phone_token = resp.json()["verification_token"]
        print("Step 6: verify-otp (phone) OK")
        
        # Step 7: Complete signup
        resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert resp.status_code == 200, f"signup-complete failed: {resp.text}"
        data = resp.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "diver"
        print(f"Step 7: signup-complete OK - User created: {data['user']['id']}")
        
        return data["access_token"]


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token by completing signup flow"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"test_auth_{unique_id}@example.com"
        phone = f"+1666{unique_id[:7]}"
        
        # Store signup data
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "Test Auth User", "role": "diver"
        })
        
        # Send and verify email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = resp.json()["verification_token"]
        
        # Send and verify phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = resp.json()["verification_token"]
        
        # Complete signup
        resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        return resp.json()["access_token"]
    
    def test_get_me(self, auth_token):
        """GET /api/auth/me - Get current user"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert "role" in data
        print(f"Current user: {data['email']}")
    
    def test_get_me_no_auth(self):
        """GET /api/auth/me - Without auth returns 403"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 403
        print("Unauthenticated request correctly rejected")
    
    def test_get_bookings(self, auth_token):
        """GET /api/bookings - Get user bookings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/bookings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "bookings" in data
        print(f"User has {len(data['bookings'])} bookings")
    
    def test_get_wishlist(self, auth_token):
        """GET /api/wishlist - Get user wishlist"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/wishlist", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        print(f"User has {len(data['listings'])} wishlist items")
    
    def test_get_notifications(self, auth_token):
        """GET /api/notifications - Get user notifications"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        print(f"User has {data['unread_count']} unread notifications")
    
    def test_get_dive_logs(self, auth_token):
        """GET /api/dive-log - Get user dive logs"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dive-log", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "logs" in data
        assert "stats" in data
        print(f"User has {len(data['logs'])} dive logs")
    
    def test_get_trips(self, auth_token):
        """GET /api/trips - Get user trips"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "trips" in data
        print(f"User has {len(data['trips'])} trips")
    
    def test_get_cart(self, auth_token):
        """GET /api/cart - Get user cart"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/cart", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        print(f"Cart has {len(data['items'])} items, total: ${data['total']}")
    
    def test_download_user_data(self, auth_token):
        """GET /api/user/download-data - Download all user data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/user/download-data", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "export_info" in data
        assert "profile" in data
        assert "bookings" in data
        assert "dive_logs" in data
        print("User data download works")


class TestListingDetails:
    """Test listing detail endpoints"""
    
    @pytest.fixture(scope="class")
    def listing_id(self):
        """Get a valid listing ID"""
        resp = requests.get(f"{BASE_URL}/api/listings", params={"limit": 1})
        listings = resp.json().get("listings", [])
        if listings:
            return listings[0]["id"]
        pytest.skip("No listings available")
    
    def test_get_listing_detail(self, listing_id):
        """GET /api/listings/{id} - Get listing details"""
        response = requests.get(f"{BASE_URL}/api/listings/{listing_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == listing_id
        assert "name" in data
        assert "description" in data
        print(f"Listing: {data['name']}")
    
    def test_get_listing_availability(self, listing_id):
        """GET /api/listings/{id}/availability - Get listing availability"""
        response = requests.get(f"{BASE_URL}/api/listings/{listing_id}/availability")
        assert response.status_code == 200
        data = response.json()
        assert "available_dates" in data
        print(f"Listing has {len(data['available_dates'])} available dates")
    
    def test_get_listing_reviews(self, listing_id):
        """GET /api/reviews/{id} - Get listing reviews"""
        response = requests.get(f"{BASE_URL}/api/reviews/{listing_id}")
        assert response.status_code == 200
        data = response.json()
        assert "reviews" in data
        assert "stats" in data
        print(f"Listing has {data['stats']['total']} reviews, avg: {data['stats']['average']}")
    
    def test_get_listing_not_found(self):
        """GET /api/listings/{id} - Non-existent listing"""
        response = requests.get(f"{BASE_URL}/api/listings/non-existent-id")
        assert response.status_code == 404
        print("Non-existent listing correctly returns 404")


class TestMessageThreads:
    """Test messaging endpoints"""
    
    def test_get_threads_unauthenticated(self):
        """GET /api/messages/threads - Without auth returns 403"""
        response = requests.get(f"{BASE_URL}/api/messages/threads")
        assert response.status_code == 403
        print("Unauthenticated message threads request rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
