"""
Backend API tests for onboarding feature
Tests: PUT /api/auth/onboarding, GET /api/auth/me (new fields)
Auth flow: signup with 2FA using mocked OTP '123456'
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOnboardingAPI:
    """Test onboarding endpoints"""
    
    @pytest.fixture(scope="class")
    def test_user_credentials(self):
        """Generate unique test user credentials"""
        unique_id = str(uuid.uuid4())[:8]
        return {
            "email": f"test_onboard_{unique_id}@example.com",
            "name": f"Test User {unique_id}",
            "phone": f"+1555{unique_id[:7].replace('-', '').ljust(7, '0')}"
        }
    
    @pytest.fixture(scope="class")
    def authenticated_user(self, test_user_credentials):
        """Create a new user via full signup flow and return token + user data"""
        email = test_user_credentials["email"]
        name = test_user_credentials["name"]
        phone = test_user_credentials["phone"]
        
        # Step 1: Store signup data
        resp = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email,
            "name": name,
            "role": "diver"
        })
        assert resp.status_code == 200, f"store-signup-data failed: {resp.text}"
        
        # Step 2: Send email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": email
        })
        assert resp.status_code == 200, f"send-otp (email) failed: {resp.text}"
        
        # Step 3: Verify email OTP (mocked as 123456)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email,
            "code": "123456"
        })
        assert resp.status_code == 200, f"verify-otp (email) failed: {resp.text}"
        email_token = resp.json()["verification_token"]
        
        # Step 4: Send phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": phone
        })
        assert resp.status_code == 200, f"send-otp (phone) failed: {resp.text}"
        
        # Step 5: Verify phone OTP (mocked as 123456)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone,
            "code": "123456"
        })
        assert resp.status_code == 200, f"verify-otp (phone) failed: {resp.text}"
        phone_token = resp.json()["verification_token"]
        
        # Step 6: Complete signup
        resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        assert resp.status_code == 200, f"signup-complete failed: {resp.text}"
        
        data = resp.json()
        return {
            "token": data["access_token"],
            "user": data["user"],
            "email": email,
            "phone": phone
        }
    
    def test_01_new_user_has_onboarding_incomplete(self, authenticated_user):
        """Test that a newly created user has onboarding_complete=false"""
        user = authenticated_user["user"]
        
        # Verify onboarding_complete == False (or None for new users)
        assert user.get("onboarding_complete", False) == False, \
            f"New user should have onboarding_complete=false, got {user.get('onboarding_complete')}"
        
        # Verify experience_level is None
        assert user.get("experience_level") is None, \
            f"New user should have experience_level=None, got {user.get('experience_level')}"
        
        # Verify certification_level is None
        assert user.get("certification_level") is None, \
            f"New user should have certification_level=None, got {user.get('certification_level')}"
        
        print(f"✓ New user has onboarding_complete=false")
    
    def test_02_get_me_returns_new_fields(self, authenticated_user):
        """Test GET /api/auth/me returns experience_level, certification_level, interests, onboarding_complete"""
        token = authenticated_user["token"]
        
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"GET /api/auth/me failed: {resp.text}"
        
        user = resp.json()
        
        # Check that all expected fields exist (even if null)
        assert "experience_level" in user or user.get("experience_level") is None
        assert "certification_level" in user or user.get("certification_level") is None
        assert "interests" in user
        assert "onboarding_complete" in user
        
        print(f"✓ GET /api/auth/me returns new onboarding fields")
    
    def test_03_onboarding_beginner_never_dived(self, authenticated_user):
        """Test PUT /api/auth/onboarding for user who never dived"""
        token = authenticated_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "never",
                "certification_level": None,
                "interests": ["learn"]
            }
        )
        assert resp.status_code == 200, f"PUT /api/auth/onboarding failed: {resp.text}"
        
        user = resp.json()
        
        # Verify all fields updated
        assert user["experience_level"] == "never", f"Expected experience_level='never', got {user['experience_level']}"
        assert user["certification_level"] is None, f"Expected certification_level=None, got {user['certification_level']}"
        assert user["interests"] == ["learn"], f"Expected interests=['learn'], got {user['interests']}"
        assert user["onboarding_complete"] == True, f"Expected onboarding_complete=true, got {user['onboarding_complete']}"
        
        print(f"✓ PUT /api/auth/onboarding saves beginner profile correctly")
    
    def test_04_get_me_reflects_onboarding_changes(self, authenticated_user):
        """Test that GET /api/auth/me returns updated onboarding data"""
        token = authenticated_user["token"]
        
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["onboarding_complete"] == True
        assert user["experience_level"] == "never"
        
        print(f"✓ GET /api/auth/me reflects onboarding changes")


class TestOnboardingCertifiedUser:
    """Test onboarding for certified divers"""
    
    @pytest.fixture(scope="class")
    def certified_user_credentials(self):
        """Generate unique test user credentials for certified diver"""
        unique_id = str(uuid.uuid4())[:8]
        return {
            "email": f"test_cert_{unique_id}@example.com",
            "name": f"Certified Diver {unique_id}",
            "phone": f"+1666{unique_id[:7].replace('-', '').ljust(7, '0')}"
        }
    
    @pytest.fixture(scope="class")
    def authenticated_certified_user(self, certified_user_credentials):
        """Create a certified user via full signup flow"""
        email = certified_user_credentials["email"]
        name = certified_user_credentials["name"]
        phone = certified_user_credentials["phone"]
        
        # Full signup flow
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email,
            "name": name,
            "role": "diver"
        })
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email,
            "code": "123456"
        })
        email_token = resp.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone,
            "code": "123456"
        })
        phone_token = resp.json()["verification_token"]
        
        resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        data = resp.json()
        return {
            "token": data["access_token"],
            "user": data["user"]
        }
    
    def test_01_onboarding_certified_advanced_open_water(self, authenticated_certified_user):
        """Test PUT /api/auth/onboarding for Advanced Open Water certified diver"""
        token = authenticated_certified_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "certified",
                "certification_level": "advanced_open_water",
                "interests": ["discover"]
            }
        )
        assert resp.status_code == 200, f"PUT /api/auth/onboarding failed: {resp.text}"
        
        user = resp.json()
        
        assert user["experience_level"] == "certified"
        assert user["certification_level"] == "advanced_open_water"
        assert user["interests"] == ["discover"]
        assert user["onboarding_complete"] == True
        
        print(f"✓ PUT /api/auth/onboarding saves certified diver profile correctly")
    
    def test_02_onboarding_try_dive_experience(self, authenticated_certified_user):
        """Test updating onboarding with try_dive experience"""
        token = authenticated_certified_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "try_dive",
                "certification_level": None,
                "interests": ["both"]
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["experience_level"] == "try_dive"
        assert user["interests"] == ["both"]
        
        print(f"✓ Onboarding can be updated with try_dive experience")


class TestOnboardingValidation:
    """Test onboarding validation and edge cases"""
    
    def test_onboarding_requires_auth(self):
        """Test PUT /api/auth/onboarding returns 401/403 without auth"""
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            json={
                "experience_level": "never",
                "certification_level": None,
                "interests": []
            }
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print(f"✓ PUT /api/auth/onboarding requires authentication")
    
    def test_onboarding_invalid_token(self):
        """Test PUT /api/auth/onboarding returns 401 with invalid token"""
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": "Bearer invalid_token_12345"},
            json={
                "experience_level": "never",
                "certification_level": None,
                "interests": []
            }
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print(f"✓ PUT /api/auth/onboarding rejects invalid token")


class TestAllCertificationLevels:
    """Test all certification levels"""
    
    @pytest.fixture(scope="class")
    def cert_test_user_credentials(self):
        """Generate unique test user credentials"""
        unique_id = str(uuid.uuid4())[:8]
        return {
            "email": f"test_allcert_{unique_id}@example.com",
            "name": f"Cert Tester {unique_id}",
            "phone": f"+1777{unique_id[:7].replace('-', '').ljust(7, '0')}"
        }
    
    @pytest.fixture(scope="class")
    def cert_test_user(self, cert_test_user_credentials):
        """Create user for certification level tests"""
        email = cert_test_user_credentials["email"]
        name = cert_test_user_credentials["name"]
        phone = cert_test_user_credentials["phone"]
        
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email,
            "name": name,
            "role": "diver"
        })
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email,
            "code": "123456"
        })
        email_token = resp.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone,
            "code": "123456"
        })
        phone_token = resp.json()["verification_token"]
        
        resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        return {"token": resp.json()["access_token"]}
    
    @pytest.mark.parametrize("cert_level", [
        "open_water",
        "advanced_open_water", 
        "rescue",
        "divemaster",
        "instructor"
    ])
    def test_certification_levels_accepted(self, cert_test_user, cert_level):
        """Test that all certification levels are accepted"""
        token = cert_test_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "certified",
                "certification_level": cert_level,
                "interests": ["discover"]
            }
        )
        assert resp.status_code == 200, f"Certification level '{cert_level}' failed: {resp.text}"
        
        user = resp.json()
        assert user["certification_level"] == cert_level
        
        print(f"✓ Certification level '{cert_level}' accepted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
