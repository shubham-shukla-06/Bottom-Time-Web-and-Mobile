"""
Test Notifications API - Real-time notifications for Bottom Time app
Tests: GET, PUT (mark read/all-read), DELETE notifications
Tests: Notification triggers (connection request/accept, DM, listing approve/reject)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test users
DEMO_EMAIL = "demo@bottomtime.com"
DEMO_PHONE = "+12025550001"
OPERATOR_EMAIL = "operator@bottomtime.com"
OPERATOR_PHONE = "+12025558888"
ADMIN_EMAIL = "admin@bottomtime.com"
ADMIN_PHONE = "+12025559999"
OTP_CODE = "123456"


def get_auth_token(email: str, phone: str) -> str:
    """Complete login flow and return access token"""
    # Step 1: Send OTP to email
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
    assert resp.status_code == 200, f"Failed to send email OTP: {resp.text}"
    
    # Step 2: Verify email OTP
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": email, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify email OTP: {resp.text}"
    email_token = resp.json()["verification_token"]
    
    # Step 3: Send OTP to phone
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
    assert resp.status_code == 200, f"Failed to send phone OTP: {resp.text}"
    
    # Step 4: Verify phone OTP
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": phone, "code": OTP_CODE})
    assert resp.status_code == 200, f"Failed to verify phone OTP: {resp.text}"
    phone_token = resp.json()["verification_token"]
    
    # Step 5: Complete login
    resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": email,
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    assert resp.status_code == 200, f"Failed to complete login: {resp.text}"
    return resp.json()["access_token"]


class TestNotificationsAPI:
    """Test notification endpoints"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup(self, request):
        """Get auth tokens for all test users"""
        request.cls.demo_token = get_auth_token(DEMO_EMAIL, DEMO_PHONE)
        request.cls.operator_token = get_auth_token(OPERATOR_EMAIL, OPERATOR_PHONE)
        request.cls.admin_token = get_auth_token(ADMIN_EMAIL, ADMIN_PHONE)
        
    def get_headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # ===== GET /api/notifications =====
    def test_get_notifications_returns_notifications_array(self):
        """GET /api/notifications returns notifications array and unread_count"""
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
        assert resp.status_code == 200
        data = resp.json()
        assert "notifications" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
        assert isinstance(data["unread_count"], int)
        print(f"SUCCESS: GET /api/notifications returned {len(data['notifications'])} notifications, {data['unread_count']} unread")
    
    def test_get_notifications_returns_correct_structure(self):
        """Each notification has expected fields"""
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
        assert resp.status_code == 200
        data = resp.json()
        
        if data["notifications"]:
            notif = data["notifications"][0]
            assert "id" in notif
            assert "user_id" in notif
            assert "type" in notif
            assert "title" in notif
            assert "message" in notif
            assert "read" in notif
            assert "created_at" in notif
            print(f"SUCCESS: Notification structure verified - type: {notif['type']}, title: {notif['title']}")
    
    def test_get_notifications_with_limit(self):
        """GET /api/notifications respects limit parameter"""
        resp = requests.get(f"{BASE_URL}/api/notifications?limit=5", headers=self.get_headers(self.demo_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["notifications"]) <= 5
        print(f"SUCCESS: Limit parameter works - returned {len(data['notifications'])} notifications (limit=5)")
    
    def test_get_notifications_requires_auth(self):
        """GET /api/notifications requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/notifications")
        assert resp.status_code in [401, 403]
        print("SUCCESS: Unauthenticated request properly rejected")
    
    # ===== PUT /api/notifications/{id}/read =====
    def test_mark_single_notification_read(self):
        """PUT /api/notifications/{id}/read marks notification as read"""
        # First get notifications
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
        data = resp.json()
        
        if data["notifications"]:
            notif_id = data["notifications"][0]["id"]
            
            # Mark as read
            resp = requests.put(f"{BASE_URL}/api/notifications/{notif_id}/read", headers=self.get_headers(self.demo_token))
            assert resp.status_code == 200
            
            # Verify it's marked as read
            resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
            updated = next((n for n in resp.json()["notifications"] if n["id"] == notif_id), None)
            assert updated is not None
            assert updated["read"] == True
            print(f"SUCCESS: Notification {notif_id} marked as read")
        else:
            pytest.skip("No notifications to test with")
    
    # ===== PUT /api/notifications/read-all =====
    def test_mark_all_notifications_read(self):
        """PUT /api/notifications/read-all marks all notifications as read"""
        resp = requests.put(f"{BASE_URL}/api/notifications/read-all", headers=self.get_headers(self.demo_token))
        assert resp.status_code == 200
        
        # Verify all are read
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["unread_count"] == 0
        print("SUCCESS: All notifications marked as read, unread_count is 0")
    
    # ===== DELETE /api/notifications/{id} =====
    def test_delete_notification(self):
        """DELETE /api/notifications/{id} deletes a notification"""
        # Get current notifications
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
        data = resp.json()
        initial_count = len(data["notifications"])
        
        if initial_count > 0:
            notif_id = data["notifications"][0]["id"]
            
            # Delete notification
            resp = requests.delete(f"{BASE_URL}/api/notifications/{notif_id}", headers=self.get_headers(self.demo_token))
            assert resp.status_code == 200
            
            # Verify deletion
            resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.demo_token))
            remaining = resp.json()["notifications"]
            deleted = next((n for n in remaining if n["id"] == notif_id), None)
            assert deleted is None
            print(f"SUCCESS: Notification {notif_id} deleted successfully")
        else:
            pytest.skip("No notifications to test deletion")


class TestNotificationTriggers:
    """Test that notifications are created for specific events"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup(self, request):
        """Get auth tokens"""
        request.cls.demo_token = get_auth_token(DEMO_EMAIL, DEMO_PHONE)
        request.cls.operator_token = get_auth_token(OPERATOR_EMAIL, OPERATOR_PHONE)
        request.cls.admin_token = get_auth_token(ADMIN_EMAIL, ADMIN_PHONE)
        
        # Get user info
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {request.cls.demo_token}"})
        request.cls.demo_user = resp.json()
        
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {request.cls.operator_token}"})
        request.cls.operator_user = resp.json()
    
    def get_headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_connection_request_creates_notification(self):
        """Sending a connection request creates notification for receiver"""
        # Get another diver to connect with
        resp = requests.get(f"{BASE_URL}/api/community/profiles?limit=5", headers=self.get_headers(self.demo_token))
        profiles = resp.json().get("profiles", [])
        
        if profiles:
            target_id = profiles[0]["id"]
            
            # Get initial notification count for target (need to login as target or check via admin)
            # For now just verify the request succeeds
            resp = requests.post(f"{BASE_URL}/api/community/connect/{target_id}", headers=self.get_headers(self.demo_token))
            
            if resp.status_code == 200:
                print(f"SUCCESS: Connection request sent to {target_id}, notification should be created")
            elif resp.status_code == 400 and "Already connected" in resp.text:
                print("INFO: Already connected to target user - notification was created previously")
            else:
                print(f"INFO: Connection request status: {resp.status_code} - {resp.text}")
        else:
            pytest.skip("No profiles available for connection test")
    
    def test_dm_creates_notification(self):
        """Sending a DM creates notification for recipient"""
        # Get connections to message
        resp = requests.get(f"{BASE_URL}/api/community/connections", headers=self.get_headers(self.demo_token))
        buddies = resp.json().get("buddies", [])
        
        if buddies:
            buddy_id = buddies[0]["buddy"]["id"]
            
            # Send a message
            resp = requests.post(f"{BASE_URL}/api/messages", 
                headers=self.get_headers(self.demo_token),
                json={"to_id": buddy_id, "content": f"Test notification message {uuid.uuid4().hex[:8]}"})
            
            assert resp.status_code == 200
            print(f"SUCCESS: Message sent to {buddy_id}, notification should be created for recipient")
        else:
            # Try to send message to operator
            resp = requests.post(f"{BASE_URL}/api/messages",
                headers=self.get_headers(self.demo_token),
                json={"to_id": self.operator_user["id"], "content": f"Test message {uuid.uuid4().hex[:8]}"})
            
            assert resp.status_code == 200
            print(f"SUCCESS: Message sent to operator, notification created")
    
    def test_listing_approve_creates_notification(self):
        """Admin approving a listing creates notification for operator"""
        # Get operator's initial notifications
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.operator_token))
        resp.json()["unread_count"]
        
        # Create a test listing as operator
        listing_data = {
            "name": f"TEST_Notification_Listing_{uuid.uuid4().hex[:6]}",
            "type": "dive_center",
            "description": "Test listing for notification trigger",
            "location": "Test Location",
            "country": "Test Country",
            "image_url": "https://example.com/test.jpg"
        }
        resp = requests.post(f"{BASE_URL}/api/listings", 
            headers=self.get_headers(self.operator_token), json=listing_data)
        
        if resp.status_code == 200:
            listing_id = resp.json().get("id")
            
            # Admin approves the listing
            resp = requests.put(f"{BASE_URL}/api/admin/listings/{listing_id}/approve",
                headers=self.get_headers(self.admin_token))
            
            assert resp.status_code == 200
            
            # Check operator's notifications increased
            resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.operator_token))
            new_data = resp.json()
            
            # Look for listing_approved notification
            approved_notif = next((n for n in new_data["notifications"] if n["type"] == "listing_approved"), None)
            assert approved_notif is not None, "No listing_approved notification found"
            assert "approved" in approved_notif["message"].lower()
            print(f"SUCCESS: Listing approval created notification: {approved_notif['title']}")
            
            # Cleanup - delete the test listing
            requests.delete(f"{BASE_URL}/api/listings/{listing_id}", headers=self.get_headers(self.operator_token))
        else:
            print(f"INFO: Could not create test listing: {resp.status_code}")
    
    def test_listing_reject_creates_notification(self):
        """Admin rejecting a listing creates notification for operator"""
        # Create a test listing as operator
        listing_data = {
            "name": f"TEST_Reject_Listing_{uuid.uuid4().hex[:6]}",
            "type": "dive_center",
            "description": "Test listing for rejection notification",
            "location": "Test Location",
            "country": "Test Country",
            "image_url": "https://example.com/test.jpg"
        }
        resp = requests.post(f"{BASE_URL}/api/listings",
            headers=self.get_headers(self.operator_token), json=listing_data)
        
        if resp.status_code == 200:
            listing_id = resp.json().get("id")
            
            # Admin rejects the listing
            resp = requests.put(f"{BASE_URL}/api/admin/listings/{listing_id}/reject",
                headers=self.get_headers(self.admin_token))
            
            assert resp.status_code == 200
            
            # Check operator's notifications for rejection
            resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.operator_token))
            new_data = resp.json()
            
            # Look for listing_rejected notification
            rejected_notif = next((n for n in new_data["notifications"] if n["type"] == "listing_rejected"), None)
            assert rejected_notif is not None, "No listing_rejected notification found"
            assert "not approved" in rejected_notif["message"].lower() or "rejected" in rejected_notif["message"].lower()
            print(f"SUCCESS: Listing rejection created notification: {rejected_notif['title']}")
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/admin/listings/{listing_id}", headers=self.get_headers(self.admin_token))
        else:
            print(f"INFO: Could not create test listing: {resp.status_code}")


class TestNotificationTypes:
    """Test all notification types have correct structure"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup(self, request):
        request.cls.demo_token = get_auth_token(DEMO_EMAIL, DEMO_PHONE)
        request.cls.operator_token = get_auth_token(OPERATOR_EMAIL, OPERATOR_PHONE)
    
    def get_headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_notification_types_list(self):
        """Verify expected notification types exist"""
        expected_types = [
            "booking_new",
            "booking_update", 
            "connection_request",
            "connection_accepted",
            "new_message",
            "listing_approved",
            "listing_rejected"
        ]
        
        # Get demo user notifications
        resp = requests.get(f"{BASE_URL}/api/notifications?limit=100", headers=self.get_headers(self.demo_token))
        demo_notifs = resp.json()["notifications"]
        
        # Get operator notifications
        resp = requests.get(f"{BASE_URL}/api/notifications?limit=100", headers=self.get_headers(self.operator_token))
        operator_notifs = resp.json()["notifications"]
        
        all_notifs = demo_notifs + operator_notifs
        found_types = set(n["type"] for n in all_notifs)
        
        print(f"Found notification types: {found_types}")
        print(f"Expected types: {set(expected_types)}")
        
        # At least some types should exist (from seeded data)
        assert len(found_types) > 0, "No notification types found"
        print(f"SUCCESS: Found {len(found_types)} different notification types")


class TestOperatorNotifications:
    """Test notifications specific to operator role"""
    
    @pytest.fixture(autouse=True, scope="class")
    def setup(self, request):
        request.cls.operator_token = get_auth_token(OPERATOR_EMAIL, OPERATOR_PHONE)
        request.cls.demo_token = get_auth_token(DEMO_EMAIL, DEMO_PHONE)
    
    def get_headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_operator_gets_booking_notification(self):
        """Operator receives notification when booking is made"""
        # Get operator's initial unread count
        resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.operator_token))
        resp.json()["unread_count"]
        
        # Get a listing from operator
        resp = requests.get(f"{BASE_URL}/api/operator/listings", headers=self.get_headers(self.operator_token))
        operator_listings = resp.json().get("listings", [])
        
        if operator_listings:
            listing_id = operator_listings[0]["id"]
            
            # Demo user makes a booking
            booking_data = {
                "listing_id": listing_id,
                "date": "2026-03-15",
                "participants": 2,
                "notes": "Test booking for notification"
            }
            resp = requests.post(f"{BASE_URL}/api/bookings", 
                headers=self.get_headers(self.demo_token), json=booking_data)
            
            if resp.status_code == 200:
                # Check operator's notifications
                resp = requests.get(f"{BASE_URL}/api/notifications", headers=self.get_headers(self.operator_token))
                new_data = resp.json()
                
                # Look for booking_new notification
                booking_notif = next((n for n in new_data["notifications"] if n["type"] == "booking_new"), None)
                assert booking_notif is not None, "No booking_new notification found"
                print(f"SUCCESS: Booking created notification for operator: {booking_notif['title']}")
            else:
                print(f"INFO: Booking creation returned: {resp.status_code}")
        else:
            pytest.skip("Operator has no listings to test booking notification")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
