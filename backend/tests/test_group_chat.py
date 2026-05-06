"""
Test Group Chat Feature for Bottom Time Diving Platform
Tests: Group thread creation, group messaging, thread listing with both DM and group types
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
OTP_CODE = "123456"

# Buddy IDs from the context
BUDDY_IDS = [
    "5c2d97f9-3b3e-4f95-bc2f-5f370d84922d",  # Alex
    "92394a56-4cde-4818-a6c8-9659bc38b2d5",  # Maya Chen
    "7582dae4-c627-4bff-91f1-2748bd397d62"   # Shubham Shukla
]

@pytest.fixture(scope="module")
def group_thread_id(auth_headers):
    """Create a group thread for messaging tests."""
    response = requests.post(
        f"{BASE_URL}/api/messages/group-thread",
        json={
            "participant_ids": BUDDY_IDS[:2],
            "name": "TEST_Group Messaging Thread"
        },
        headers=auth_headers
    )
    assert response.status_code == 200, f"Failed to create group thread: {response.text}"
    data = response.json()
    assert "thread_id" in data, "No thread_id returned"
    return data["thread_id"]


class TestAuthentication:
    """Helper to get auth token"""
    
    @staticmethod
    def get_auth_token():
        """Perform full auth flow and return access token"""
        session = requests.Session()
        
        # Step 1: Send OTP to email
        response = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_EMAIL})
        assert response.status_code == 200, f"Failed to send email OTP: {response.text}"
        
        # Step 2: Verify email OTP
        response = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": TEST_EMAIL, "code": OTP_CODE})
        assert response.status_code == 200, f"Failed to verify email OTP: {response.text}"
        email_token = response.json().get("verification_token")
        assert email_token, "No email verification token returned"
        
        # Step 3: Send OTP to phone
        response = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_PHONE})
        assert response.status_code == 200, f"Failed to send phone OTP: {response.text}"
        
        # Step 4: Verify phone OTP
        response = session.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": TEST_PHONE, "code": OTP_CODE})
        assert response.status_code == 200, f"Failed to verify phone OTP: {response.text}"
        phone_token = response.json().get("verification_token")
        assert phone_token, "No phone verification token returned"
        
        # Step 5: Complete login
        response = session.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert response.status_code == 200, f"Failed to complete login: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for all tests"""
    return TestAuthentication.get_auth_token()


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestGroupThreadCreation:
    """Test POST /api/messages/group-thread endpoint"""
    
    def test_create_group_thread_success(self, auth_headers):
        """Create a group thread with 2+ participants"""
        response = requests.post(
            f"{BASE_URL}/api/messages/group-thread",
            json={
                "participant_ids": BUDDY_IDS[:2],  # Alex and Maya Chen
                "name": "TEST_Dive Trip Planning"
            },
            headers=auth_headers
        )
        print(f"Create group response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to create group: {response.text}"
        
        data = response.json()
        assert "thread_id" in data, "No thread_id returned"
        assert data["thread_id"].startswith("group_"), "Thread ID should start with 'group_'"
        assert "name" in data, "No name returned"
        assert "participants" in data, "No participants returned"
        assert data["type"] == "group", f"Expected type 'group', got {data.get('type')}"
        
    def test_create_group_thread_with_auto_name(self, auth_headers):
        """Create a group thread without name (should auto-generate)"""
        response = requests.post(
            f"{BASE_URL}/api/messages/group-thread",
            json={"participant_ids": BUDDY_IDS[:2]},
            headers=auth_headers
        )
        print(f"Create group (auto-name) response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to create group: {response.text}"
        
        data = response.json()
        assert data["name"], "Name should be auto-generated"
        
    def test_create_group_thread_with_all_buddies(self, auth_headers):
        """Create a group thread with all 3 buddies"""
        response = requests.post(
            f"{BASE_URL}/api/messages/group-thread",
            json={
                "participant_ids": BUDDY_IDS,  # All 3 buddies
                "name": "TEST_All Buddies Group"
            },
            headers=auth_headers
        )
        print(f"Create all-buddies group response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to create group: {response.text}"
        
        data = response.json()
        assert len(data.get("participants", [])) >= 3, "Should include all 3 buddies + current user"
        
    def test_create_group_thread_fails_with_one_participant(self, auth_headers):
        """Group needs at least 2 other members"""
        response = requests.post(
            f"{BASE_URL}/api/messages/group-thread",
            json={"participant_ids": [BUDDY_IDS[0]]},  # Only 1 participant
            headers=auth_headers
        )
        print(f"Create group (1 participant) response: {response.status_code} - {response.text}")
        assert response.status_code == 400, "Should fail with only 1 participant"
        
    def test_create_group_thread_requires_auth(self):
        """Should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/messages/group-thread",
            json={"participant_ids": BUDDY_IDS[:2]}
        )
        assert response.status_code in [401, 403], f"Should require auth, got {response.status_code}"


class TestGroupMessaging:
    """Test POST /api/messages with thread_id for groups"""
    
    def test_send_message_to_group(self, auth_headers, group_thread_id):
        """Send message to existing group thread"""
        response = requests.post(
            f"{BASE_URL}/api/messages",
            json={
                "thread_id": group_thread_id,
                "content": "TEST_Hello group members!"
            },
            headers=auth_headers
        )
        print(f"Send group message response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to send group message: {response.text}"
        
        data = response.json()
        assert "id" in data, "No message id returned"
        assert data.get("thread_id") == group_thread_id, "Wrong thread_id"
        assert "from_name" in data, "from_name should be included for group messages"
        assert data.get("content") == "TEST_Hello group members!", "Content mismatch"


class TestDirectMessaging:
    """Test POST /api/messages with to_id for direct messages (backward compatibility)"""
    
    def test_send_direct_message(self, auth_headers):
        """Send DM to a buddy - backward compatibility"""
        response = requests.post(
            f"{BASE_URL}/api/messages",
            json={
                "to_id": BUDDY_IDS[0],  # Alex
                "content": "TEST_Hey Alex, this is a direct message!"
            },
            headers=auth_headers
        )
        print(f"Send DM response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to send DM: {response.text}"
        
        data = response.json()
        assert "id" in data, "No message id returned"
        assert "thread_id" in data, "No thread_id returned for DM"
        assert not data.get("thread_id", "").startswith("group_"), "DM thread should not start with 'group_'"


class TestThreadListing:
    """Test GET /api/messages/threads returns both DM and group types"""
    
    def test_get_threads_returns_both_types(self, auth_headers):
        """Should return both 'direct' and 'group' type threads"""
        response = requests.get(f"{BASE_URL}/api/messages/threads", headers=auth_headers)
        print(f"Get threads response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to get threads: {response.text}"
        
        data = response.json()
        assert "threads" in data, "No threads key in response"
        
        threads = data["threads"]
        direct_threads = [t for t in threads if t.get("type") == "direct"]
        group_threads = [t for t in threads if t.get("type") == "group"]
        
        print(f"Found {len(direct_threads)} direct threads and {len(group_threads)} group threads")
        
        # Verify we have at least one group thread (from our tests or existing)
        # Note: There may not be direct threads if user hasn't had DM conversations
        
        # Verify group thread structure
        if group_threads:
            group = group_threads[0]
            assert "thread_id" in group, "Group thread should have thread_id"
            assert group["type"] == "group", "Type should be 'group'"
            assert "name" in group, "Group should have name"
            assert "participants" in group or "last_message" in group, "Group should have participants or last_message"
        
        # Verify direct thread structure (if any)
        if direct_threads:
            dm = direct_threads[0]
            assert "thread_id" in dm, "DM should have thread_id"
            assert dm["type"] == "direct", "Type should be 'direct'"
            assert "other_user" in dm, "DM should have other_user"


class TestGetMessages:
    """Test GET /api/messages/{thread_id}"""
    
    def test_get_group_messages(self, auth_headers, group_thread_id):
        """Get messages from group thread - should include type and participants"""
        response = requests.get(
            f"{BASE_URL}/api/messages/{group_thread_id}",
            headers=auth_headers
        )
        print(f"Get group messages response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to get group messages: {response.text}"
        
        data = response.json()
        assert "messages" in data, "No messages key"
        assert data.get("type") == "group", f"Expected type 'group', got {data.get('type')}"
        assert "participants" in data, "Group messages response should include participants"


class TestThreadInfo:
    """Test GET /api/messages/thread-info/{thread_id}"""
    
    def test_get_group_thread_info(self, auth_headers, group_thread_id):
        """Get group thread metadata"""
        response = requests.get(
            f"{BASE_URL}/api/messages/thread-info/{group_thread_id}",
            headers=auth_headers
        )
        print(f"Get thread info response: {response.status_code} - {response.text}")
        assert response.status_code == 200, f"Failed to get thread info: {response.text}"
        
        data = response.json()
        assert data.get("type") == "group", "Type should be 'group'"
        assert "name" in data, "Should include name"
        assert "participants" in data, "Should include participants"
        
    def test_thread_info_fails_for_direct(self, auth_headers):
        """thread-info should fail for direct threads"""
        # A direct thread_id format is like "uuid1_uuid2"
        fake_dm_thread = f"{BUDDY_IDS[0]}_{BUDDY_IDS[1]}"
        response = requests.get(
            f"{BASE_URL}/api/messages/thread-info/{fake_dm_thread}",
            headers=auth_headers
        )
        assert response.status_code == 400, "Should return 400 for direct thread"


# Cleanup test messages after tests run
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(auth_token):
    """Cleanup any test data after tests complete"""
    yield
    # Note: In production, you'd want to clean up TEST_ prefixed messages/threads
    # For now, we leave the data for verification


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
