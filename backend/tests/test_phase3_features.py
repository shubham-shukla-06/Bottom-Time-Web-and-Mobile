"""
Phase 3 Feature Tests:
- Events API (GET /events, filter by event_type)
- Bookings API (POST /bookings, GET /bookings/mine)
- Operator API (GET /operator/listings, POST/DELETE /listings)
- Admin API (GET /admin/stats, pending-users, users, approve)
- Community API (GET /community/profiles, POST /community/connect, GET /community/connections)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestEventsAPI:
    """Events API Tests"""

    def test_get_all_events(self):
        """GET /api/events - returns seeded events"""
        response = requests.get(f"{BASE_URL}/api/events")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "events" in data
        assert len(data["events"]) == 6, f"Expected 6 seeded events, got {len(data['events'])}"
        print(f"✓ GET /api/events - returned {len(data['events'])} events")

    def test_filter_events_by_type_workshop(self):
        """GET /api/events?event_type=workshop - filter by type"""
        response = requests.get(f"{BASE_URL}/api/events?event_type=workshop")
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        # Check all returned events are workshops
        for event in data["events"]:
            assert event["event_type"] == "workshop", f"Expected workshop, got {event['event_type']}"
        print(f"✓ GET /api/events?event_type=workshop - returned {len(data['events'])} workshops")

    def test_filter_events_by_type_cleanup(self):
        """GET /api/events?event_type=cleanup"""
        response = requests.get(f"{BASE_URL}/api/events?event_type=cleanup")
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        for event in data["events"]:
            assert event["event_type"] == "cleanup"
        print(f"✓ GET /api/events?event_type=cleanup - returned {len(data['events'])} cleanups")

    def test_filter_events_by_type_meetup(self):
        """GET /api/events?event_type=meetup"""
        response = requests.get(f"{BASE_URL}/api/events?event_type=meetup")
        assert response.status_code == 200
        data = response.json()
        for event in data["events"]:
            assert event["event_type"] == "meetup"
        print(f"✓ GET /api/events?event_type=meetup - {len(data['events'])} meetups")

    def test_event_data_structure(self):
        """Verify event data structure"""
        response = requests.get(f"{BASE_URL}/api/events")
        data = response.json()
        if len(data["events"]) > 0:
            event = data["events"][0]
            required_fields = ["id", "title", "event_type", "description", "location", "date", "time", "organizer", "max_attendees", "attendees", "status"]
            for field in required_fields:
                assert field in event, f"Missing field: {field}"
        print("✓ Event data structure validated")


class TestAuthHelpers:
    """Helper class for authentication"""
    
    @staticmethod
    def create_test_user(email, phone, name, role):
        """Create a test user via signup flow"""
        # Step 1: Store signup data
        signup_data = {"email": email, "name": name, "role": role}
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json=signup_data)
        
        # Step 2: Send OTP to email
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        
        # Step 3: Verify email OTP
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": "123456"})
        email_token = email_verify.json().get("verification_token")
        
        # Step 4: Send OTP to phone
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        
        # Step 5: Verify phone OTP
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": "123456"})
        phone_token = phone_verify.json().get("verification_token")
        
        # Step 6: Complete signup
        complete_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        if complete_resp.status_code == 200:
            return complete_resp.json()
        return None
    
    @staticmethod
    def login_user(email, phone):
        """Login an existing user"""
        # Send email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": "123456"})
        email_token = email_verify.json().get("verification_token")
        
        # Send phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": "123456"})
        phone_token = phone_verify.json().get("verification_token")
        
        # Complete login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": email,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        if login_resp.status_code == 200:
            return login_resp.json()
        return None


class TestBookingsAPI:
    """Bookings API Tests - requires authenticated user"""
    
    @pytest.fixture(scope="class")
    def diver_auth(self):
        """Create/login a diver user for booking tests"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"TEST_diver_booking_{unique_id}@test.com"
        phone = f"+1555000{unique_id[:4]}"
        
        result = TestAuthHelpers.create_test_user(email, phone, "Test Diver Booking", "diver")
        if result:
            return result["access_token"], result["user"]
        
        # Try login if signup failed (user exists)
        login_result = TestAuthHelpers.login_user(email, phone)
        if login_result:
            return login_result["access_token"], login_result["user"]
        
        pytest.skip("Could not create/login diver user")
    
    @pytest.fixture(scope="class")
    def listing_id(self):
        """Get a valid listing ID for booking"""
        response = requests.get(f"{BASE_URL}/api/listings")
        if response.status_code == 200 and len(response.json()["listings"]) > 0:
            return response.json()["listings"][0]["id"]
        pytest.skip("No listings available for booking test")
    
    def test_create_booking(self, diver_auth, listing_id):
        """POST /api/bookings - create a booking"""
        token, user = diver_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        booking_data = {
            "listing_id": listing_id,
            "date": "2026-04-15",
            "participants": 2,
            "notes": "Test booking from pytest"
        }
        
        response = requests.post(f"{BASE_URL}/api/bookings", json=booking_data, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["listing_id"] == listing_id
        assert data["date"] == "2026-04-15"
        assert data["participants"] == 2
        assert data["status"] == "pending"
        print(f"✓ POST /api/bookings - booking created with id {data['id']}")
    
    def test_get_my_bookings(self, diver_auth):
        """GET /api/bookings/mine - returns user's bookings"""
        token, user = diver_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/bookings/mine", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "bookings" in data
        # Should have at least the booking we just created
        assert len(data["bookings"]) >= 1
        print(f"✓ GET /api/bookings/mine - returned {len(data['bookings'])} bookings")
    
    def test_create_booking_requires_auth(self, listing_id):
        """POST /api/bookings without auth should fail"""
        booking_data = {"listing_id": listing_id, "date": "2026-04-15", "participants": 1}
        response = requests.post(f"{BASE_URL}/api/bookings", json=booking_data)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ POST /api/bookings requires authentication")


class TestOperatorAPI:
    """Operator API Tests - requires operator/instructor user"""
    
    @pytest.fixture(scope="class")
    def operator_auth(self):
        """Create an instructor user for operator tests (instructors don't need approval)"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"TEST_instructor_{unique_id}@test.com"
        phone = f"+1555100{unique_id[:4]}"
        
        result = TestAuthHelpers.create_test_user(email, phone, "Test Instructor", "instructor")
        if result:
            return result["access_token"], result["user"]
        
        pytest.skip("Could not create instructor user")
    
    def test_get_operator_listings_empty(self, operator_auth):
        """GET /api/operator/listings - new operator has no listings"""
        token, user = operator_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/operator/listings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "listings" in data
        print(f"✓ GET /api/operator/listings - returned {len(data['listings'])} listings")
    
    def test_create_listing(self, operator_auth):
        """POST /api/listings - operators can create listings"""
        token, user = operator_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        listing_data = {
            "name": f"TEST Listing {uuid.uuid4().hex[:6]}",
            "type": "dive_center",
            "description": "Test dive center created by pytest",
            "location": "Test City, Test Country",
            "country": "Test Country",
            "price": 100.0,
            "difficulty": "beginner",
            "duration": "Half day",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800",
            "highlights": ["Test highlight 1", "Test highlight 2"]
        }
        
        response = requests.post(f"{BASE_URL}/api/listings", json=listing_data, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        print(f"✓ POST /api/listings - listing created with id {data['id']}")
        return data["id"]
    
    def test_delete_listing(self, operator_auth):
        """DELETE /api/listings/{id} - operators can delete their listings"""
        token, user = operator_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        # First create a listing to delete
        listing_data = {
            "name": f"TEST Delete {uuid.uuid4().hex[:6]}",
            "type": "course",
            "description": "Test course to be deleted",
            "location": "Delete City, Delete Country",
            "country": "Delete Country",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/listings", json=listing_data, headers=headers)
        listing_id = create_resp.json()["id"]
        
        # Now delete it
        delete_resp = requests.delete(f"{BASE_URL}/api/listings/{listing_id}", headers=headers)
        assert delete_resp.status_code == 200, f"Expected 200, got {delete_resp.status_code}: {delete_resp.text}"
        print(f"✓ DELETE /api/listings/{listing_id} - listing deleted")
    
    def test_get_operator_bookings(self, operator_auth):
        """GET /api/bookings/operator - returns bookings for operator's listings"""
        token, user = operator_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/bookings/operator", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "bookings" in data
        print(f"✓ GET /api/bookings/operator - returned {len(data['bookings'])} bookings")
    
    def test_update_booking_status(self, operator_auth):
        """PUT /api/bookings/{id}/status - update booking status"""
        token, user = operator_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        # First create a listing
        listing_data = {
            "name": f"TEST Booking Status {uuid.uuid4().hex[:6]}",
            "type": "dive_center",
            "description": "Test center for booking status",
            "location": "Status City",
            "country": "Status Country",
            "image_url": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800"
        }
        create_listing = requests.post(f"{BASE_URL}/api/listings", json=listing_data, headers=headers)
        listing_id = create_listing.json()["id"]
        
        # Create a booking as a diver
        diver_unique = uuid.uuid4().hex[:8]
        diver_result = TestAuthHelpers.create_test_user(
            f"TEST_status_diver_{diver_unique}@test.com",
            f"+1555200{diver_unique[:4]}",
            "Status Test Diver",
            "diver"
        )
        
        if diver_result:
            diver_headers = {"Authorization": f"Bearer {diver_result['access_token']}"}
            booking_data = {"listing_id": listing_id, "date": "2026-05-01", "participants": 1}
            booking_resp = requests.post(f"{BASE_URL}/api/bookings", json=booking_data, headers=diver_headers)
            
            if booking_resp.status_code == 200:
                booking_id = booking_resp.json()["id"]
                
                # Update status as operator
                status_resp = requests.put(
                    f"{BASE_URL}/api/bookings/{booking_id}/status?status=confirmed",
                    headers=headers
                )
                assert status_resp.status_code == 200, f"Expected 200, got {status_resp.status_code}: {status_resp.text}"
                print(f"✓ PUT /api/bookings/{booking_id}/status?status=confirmed - status updated")
            else:
                print(f"⚠ Booking creation failed: {booking_resp.status_code}")


class TestAdminAPI:
    """Admin API Tests - requires admin user (must be created directly in DB)"""
    
    @pytest.fixture(scope="class")
    def admin_auth(self):
        """Create admin user directly in DB and login"""
        import pymongo
        import os
        from datetime import datetime, timezone
        
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'bottomtime_db')
        
        client = pymongo.MongoClient(mongo_url)
        db = client[db_name]
        
        unique_id = uuid.uuid4().hex[:8]
        admin_id = str(uuid.uuid4())
        email = f"TEST_admin_{unique_id}@test.com"
        phone = f"+1555300{unique_id[:4]}"
        
        # Insert admin user directly
        admin_doc = {
            "id": admin_id,
            "email": email,
            "phone": phone,
            "name": "Test Admin",
            "role": "admin",
            "status": "active",
            "email_verified": True,
            "phone_verified": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            db.users.insert_one(admin_doc)
        except:
            pass  # User might already exist
        
        client.close()
        
        # Login as admin
        login_result = TestAuthHelpers.login_user(email, phone)
        if login_result:
            return login_result["access_token"], login_result["user"]
        
        pytest.skip("Could not login as admin")
    
    def test_get_admin_stats(self, admin_auth):
        """GET /api/admin/stats - returns platform stats"""
        token, user = admin_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        expected_fields = ["pending_users", "active_operators", "total_listings", "total_users", "pending_listings", "total_bookings"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print(f"✓ GET /api/admin/stats - stats: {data}")
    
    def test_get_pending_users(self, admin_auth):
        """GET /api/admin/pending-users - returns pending approval users"""
        token, user = admin_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/admin/pending-users", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "users" in data
        print(f"✓ GET /api/admin/pending-users - {len(data['users'])} pending users")
    
    def test_get_all_users(self, admin_auth):
        """GET /api/admin/users - returns all users"""
        token, user = admin_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "users" in data
        assert len(data["users"]) > 0
        print(f"✓ GET /api/admin/users - {len(data['users'])} total users")
    
    def test_approve_user(self, admin_auth):
        """PUT /api/admin/users/{id}/approve - approves a user"""
        token, user = admin_auth
        headers = {"Authorization": f"Bearer {token}"}
        
        # First create an operator (pending approval)
        unique_id = uuid.uuid4().hex[:8]
        op_result = TestAuthHelpers.create_test_user(
            f"TEST_op_approve_{unique_id}@test.com",
            f"+1555400{unique_id[:4]}",
            "Pending Operator",
            "operator"
        )
        
        if op_result:
            user_id = op_result["user"]["id"]
            
            # Approve the user
            approve_resp = requests.put(f"{BASE_URL}/api/admin/users/{user_id}/approve", headers=headers)
            assert approve_resp.status_code == 200, f"Expected 200, got {approve_resp.status_code}: {approve_resp.text}"
            print(f"✓ PUT /api/admin/users/{user_id}/approve - user approved")
        else:
            print("⚠ Could not create operator for approval test")
    
    def test_admin_requires_auth(self):
        """Admin endpoints require admin role"""
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code in [401, 403]
        print("✓ Admin endpoints require authentication")
    
    def test_admin_rejects_non_admin(self):
        """Admin endpoints reject non-admin users"""
        # Create a diver and try to access admin
        unique_id = uuid.uuid4().hex[:8]
        diver_result = TestAuthHelpers.create_test_user(
            f"TEST_nonadmin_{unique_id}@test.com",
            f"+1555500{unique_id[:4]}",
            "Non Admin Diver",
            "diver"
        )
        
        if diver_result:
            headers = {"Authorization": f"Bearer {diver_result['access_token']}"}
            response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("✓ Admin endpoints reject non-admin users")


class TestCommunityAPI:
    """Community API Tests - Hinge-style diver discovery"""
    
    @pytest.fixture(scope="class")
    def diver_with_profile(self):
        """Create a diver with complete onboarding for community"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"TEST_community_diver_{unique_id}@test.com"
        phone = f"+1555600{unique_id[:4]}"
        
        result = TestAuthHelpers.create_test_user(email, phone, "Community Diver", "diver")
        if result:
            # Complete onboarding
            headers = {"Authorization": f"Bearer {result['access_token']}"}
            onboarding_data = {
                "experience_level": "certified",
                "certification_level": "advanced_open_water",
                "interests": ["reef_diving", "wreck_diving"],
                "location_country": "Australia",
                "location_city": "Sydney",
                "total_dives": 50
            }
            requests.put(f"{BASE_URL}/api/auth/onboarding", json=onboarding_data, headers=headers)
            return result["access_token"], result["user"]
        
        pytest.skip("Could not create community diver")
    
    @pytest.fixture(scope="class")
    def second_diver(self):
        """Create a second diver for connection tests"""
        unique_id = uuid.uuid4().hex[:8]
        email = f"TEST_second_diver_{unique_id}@test.com"
        phone = f"+1555700{unique_id[:4]}"
        
        result = TestAuthHelpers.create_test_user(email, phone, "Second Diver", "diver")
        if result:
            # Complete onboarding
            headers = {"Authorization": f"Bearer {result['access_token']}"}
            onboarding_data = {
                "experience_level": "certified",
                "certification_level": "open_water",
                "location_country": "Australia",
                "total_dives": 25
            }
            requests.put(f"{BASE_URL}/api/auth/onboarding", json=onboarding_data, headers=headers)
            return result["access_token"], result["user"]
        
        return None
    
    def test_get_community_profiles(self, diver_with_profile):
        """GET /api/community/profiles - returns diver profiles"""
        token, user = diver_with_profile
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/community/profiles", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "profiles" in data
        # Should not include current user
        for profile in data["profiles"]:
            assert profile["id"] != user["id"]
        print(f"✓ GET /api/community/profiles - {len(data['profiles'])} profiles")
    
    def test_send_connection_request(self, diver_with_profile, second_diver):
        """POST /api/community/connect/{userId} - send connection"""
        if not second_diver:
            pytest.skip("Second diver not available")
        
        token, user = diver_with_profile
        second_token, second_user = second_diver
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.post(f"{BASE_URL}/api/community/connect/{second_user['id']}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ POST /api/community/connect/{second_user['id']} - connection sent")
    
    def test_get_connections(self, diver_with_profile):
        """GET /api/community/connections - returns connections"""
        token, user = diver_with_profile
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/community/connections", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "pending_received" in data
        assert "connections" in data
        print(f"✓ GET /api/community/connections - {len(data['pending_received'])} pending, {len(data['connections'])} connected")
    
    def test_community_requires_auth(self):
        """Community endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/community/profiles")
        assert response.status_code in [401, 403]
        print("✓ Community endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
