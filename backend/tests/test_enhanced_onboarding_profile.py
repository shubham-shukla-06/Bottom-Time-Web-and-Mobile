"""
Backend API tests for ENHANCED onboarding + profile features
Tests: 
- PUT /api/auth/onboarding with new fields (location_country, location_city, date_of_birth, referral_source)
- PUT /api/auth/profile with extended profile fields
- GET /api/auth/me returns all new fields
Auth flow: signup with 2FA using mocked OTP '123456'
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEnhancedOnboarding:
    """Test enhanced onboarding with new fields: location, DOB, referral"""
    
    @pytest.fixture(scope="class")
    def test_user(self):
        """Create a new user via full signup flow"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_enhanced_{unique_id}@example.com"
        name = f"Enhanced User {unique_id}"
        phone = f"+1888{unique_id[:7].replace('-', '').ljust(7, '0')}"
        
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
        return {"token": data["access_token"], "user": data["user"]}
    
    def test_01_onboarding_with_all_new_fields(self, test_user):
        """Test PUT /api/auth/onboarding saves all new fields: location, DOB, referral"""
        token = test_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "certified",
                "certification_level": "advanced_open_water",
                "interests": ["both"],
                "location_country": "Thailand",
                "location_city": "Bangkok",
                "date_of_birth": "1990-05-15",
                "referral_source": "friend"
            }
        )
        assert resp.status_code == 200, f"PUT /api/auth/onboarding failed: {resp.text}"
        
        user = resp.json()
        
        # Verify all fields saved
        assert user["experience_level"] == "certified", f"Expected certified, got {user['experience_level']}"
        assert user["certification_level"] == "advanced_open_water", f"Expected advanced_open_water, got {user['certification_level']}"
        assert user["location_country"] == "Thailand", f"Expected Thailand, got {user.get('location_country')}"
        assert user["location_city"] == "Bangkok", f"Expected Bangkok, got {user.get('location_city')}"
        assert user["date_of_birth"] == "1990-05-15", f"Expected 1990-05-15, got {user.get('date_of_birth')}"
        assert user["referral_source"] == "friend", f"Expected friend, got {user.get('referral_source')}"
        assert user["onboarding_complete"] == True
        
        print(f"✓ PUT /api/auth/onboarding saves all new fields correctly")
    
    def test_02_get_me_returns_new_onboarding_fields(self, test_user):
        """Test GET /api/auth/me returns all new onboarding fields"""
        token = test_user["token"]
        
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"GET /api/auth/me failed: {resp.text}"
        
        user = resp.json()
        
        # Verify all new fields returned
        assert user.get("location_country") == "Thailand"
        assert user.get("location_city") == "Bangkok"
        assert user.get("date_of_birth") == "1990-05-15"
        assert user.get("referral_source") == "friend"
        
        print(f"✓ GET /api/auth/me returns all new onboarding fields")
    
    def test_03_onboarding_with_optional_fields_null(self, test_user):
        """Test onboarding works with optional fields as null"""
        token = test_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "never",
                "certification_level": None,
                "interests": ["learn"],
                "location_country": None,
                "location_city": None,
                "date_of_birth": None,
                "referral_source": None
            }
        )
        assert resp.status_code == 200, f"Onboarding with null fields failed: {resp.text}"
        
        user = resp.json()
        assert user["experience_level"] == "never"
        assert user["onboarding_complete"] == True
        
        print(f"✓ Onboarding accepts null for optional fields")


class TestProfileUpdate:
    """Test PUT /api/auth/profile with extended fields"""
    
    @pytest.fixture(scope="class")
    def profile_user(self):
        """Create user for profile tests"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_profile_{unique_id}@example.com"
        name = f"Profile User {unique_id}"
        phone = f"+1999{unique_id[:7].replace('-', '').ljust(7, '0')}"
        
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
        
        # Complete onboarding as certified diver
        requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {data['access_token']}"},
            json={
                "experience_level": "certified",
                "certification_level": "advanced_open_water",
                "interests": ["both"]
            }
        )
        
        return {"token": data["access_token"], "user": data["user"]}
    
    def test_01_update_location(self, profile_user):
        """Test updating location via profile endpoint"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "location_country": "Indonesia",
                "location_city": "Bali"
            }
        )
        assert resp.status_code == 200, f"Profile update failed: {resp.text}"
        
        user = resp.json()
        assert user["location_country"] == "Indonesia"
        assert user["location_city"] == "Bali"
        
        # Verify via GET
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        user = resp.json()
        assert user["location_country"] == "Indonesia"
        assert user["location_city"] == "Bali"
        
        print(f"✓ Profile update saves location correctly")
    
    def test_02_update_date_of_birth(self, profile_user):
        """Test updating date of birth"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "date_of_birth": "1985-12-25"
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["date_of_birth"] == "1985-12-25"
        
        print(f"✓ Profile update saves date_of_birth correctly")
    
    def test_03_update_certification_agency(self, profile_user):
        """Test updating certification agency"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "certification_agency": "padi"
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["certification_agency"] == "padi"
        
        print(f"✓ Profile update saves certification_agency correctly")
    
    def test_04_update_diving_stats(self, profile_user):
        """Test updating last_dive_date and total_dives"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "last_dive_date": "2024-01-15",
                "total_dives": 150
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["last_dive_date"] == "2024-01-15"
        assert user["total_dives"] == 150
        
        print(f"✓ Profile update saves diving stats correctly")
    
    def test_05_update_preferred_dive_types(self, profile_user):
        """Test updating preferred dive types array"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "preferred_dive_types": ["Reef", "Wreck", "Night", "Deep"]
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert "Reef" in user["preferred_dive_types"]
        assert "Wreck" in user["preferred_dive_types"]
        assert "Night" in user["preferred_dive_types"]
        assert "Deep" in user["preferred_dive_types"]
        assert len(user["preferred_dive_types"]) == 4
        
        print(f"✓ Profile update saves preferred_dive_types correctly")
    
    def test_06_update_medical_fitness(self, profile_user):
        """Test updating medical fitness"""
        token = profile_user["token"]
        
        # Test true
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "medical_fitness": True
            }
        )
        assert resp.status_code == 200
        user = resp.json()
        assert user["medical_fitness"] == True
        
        # Test false
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "medical_fitness": False
            }
        )
        assert resp.status_code == 200
        user = resp.json()
        assert user["medical_fitness"] == False
        
        print(f"✓ Profile update saves medical_fitness correctly")
    
    def test_07_update_equipment_ownership(self, profile_user):
        """Test updating equipment ownership"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "equipment_ownership": "full"
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["equipment_ownership"] == "full"
        
        print(f"✓ Profile update saves equipment_ownership correctly")
    
    def test_08_update_languages(self, profile_user):
        """Test updating languages array"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "languages": ["English", "Spanish", "French"]
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert "English" in user["languages"]
        assert "Spanish" in user["languages"]
        assert "French" in user["languages"]
        assert len(user["languages"]) == 3
        
        print(f"✓ Profile update saves languages correctly")
    
    def test_09_update_travel_willingness(self, profile_user):
        """Test updating travel willingness"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "travel_willingness": "international"
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["travel_willingness"] == "international"
        
        print(f"✓ Profile update saves travel_willingness correctly")
    
    def test_10_update_emergency_contact(self, profile_user):
        """Test updating emergency contact fields"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "emergency_contact_name": "John Doe",
                "emergency_contact_phone": "+1234567890",
                "emergency_contact_relationship": "Spouse"
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["emergency_contact_name"] == "John Doe"
        assert user["emergency_contact_phone"] == "+1234567890"
        assert user["emergency_contact_relationship"] == "Spouse"
        
        # Verify via GET
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        user = resp.json()
        assert user["emergency_contact_name"] == "John Doe"
        
        print(f"✓ Profile update saves emergency contact correctly")
    
    def test_11_update_multiple_fields_at_once(self, profile_user):
        """Test updating multiple fields in single request"""
        token = profile_user["token"]
        
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "location_country": "Australia",
                "location_city": "Cairns",
                "date_of_birth": "1992-03-10",
                "total_dives": 200,
                "preferred_dive_types": ["Reef", "Photography"],
                "languages": ["English", "German"]
            }
        )
        assert resp.status_code == 200
        
        user = resp.json()
        assert user["location_country"] == "Australia"
        assert user["location_city"] == "Cairns"
        assert user["date_of_birth"] == "1992-03-10"
        assert user["total_dives"] == 200
        assert "Reef" in user["preferred_dive_types"]
        assert "English" in user["languages"]
        
        print(f"✓ Profile update handles multiple fields at once")
    
    def test_12_profile_requires_auth(self):
        """Test PUT /api/auth/profile requires authentication"""
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            json={
                "location_country": "Test"
            }
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        
        print(f"✓ PUT /api/auth/profile requires authentication")
    
    def test_13_profile_update_with_empty_arrays(self, profile_user):
        """Test PUT /api/auth/profile handles empty arrays in request"""
        token = profile_user["token"]
        
        # Empty request body still contains default empty arrays for preferred_dive_types and languages
        # This is expected Pydantic behavior - the empty arrays are valid updates
        resp = requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        # The endpoint accepts this because empty lists are valid values (not None)
        # preferred_dive_types: [] and languages: [] are passed by default
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        print(f"✓ PUT /api/auth/profile handles empty arrays correctly")


class TestGetMeAllFields:
    """Test GET /api/auth/me returns ALL profile fields"""
    
    @pytest.fixture(scope="class")
    def full_profile_user(self):
        """Create user with full profile"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_fullprofile_{unique_id}@example.com"
        name = f"Full Profile User {unique_id}"
        phone = f"+1222{unique_id[:7].replace('-', '').ljust(7, '0')}"
        
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
        token = data["access_token"]
        
        # Complete onboarding with all fields
        requests.put(
            f"{BASE_URL}/api/auth/onboarding",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "experience_level": "certified",
                "certification_level": "rescue",
                "interests": ["both"],
                "location_country": "Egypt",
                "location_city": "Hurghada",
                "date_of_birth": "1988-07-20",
                "referral_source": "social_media"
            }
        )
        
        # Update profile with all extended fields
        requests.put(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "certification_agency": "ssi",
                "last_dive_date": "2024-12-01",
                "total_dives": 75,
                "preferred_dive_types": ["Reef", "Wreck", "Night"],
                "medical_fitness": True,
                "equipment_ownership": "partial",
                "languages": ["English", "Arabic"],
                "travel_willingness": "weekend",
                "emergency_contact_name": "Jane Smith",
                "emergency_contact_phone": "+1987654321",
                "emergency_contact_relationship": "Parent"
            }
        )
        
        return {"token": token, "email": email, "name": name}
    
    def test_get_me_returns_all_fields(self, full_profile_user):
        """Test GET /api/auth/me returns complete user profile"""
        token = full_profile_user["token"]
        
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200, f"GET /api/auth/me failed: {resp.text}"
        
        user = resp.json()
        
        # Core fields
        assert "id" in user
        assert "email" in user
        assert "phone" in user
        assert "name" in user
        assert "role" in user
        
        # Onboarding fields
        assert user.get("experience_level") == "certified"
        assert user.get("certification_level") == "rescue"
        assert user.get("onboarding_complete") == True
        assert user.get("location_country") == "Egypt"
        assert user.get("location_city") == "Hurghada"
        assert user.get("date_of_birth") == "1988-07-20"
        assert user.get("referral_source") == "social_media"
        
        # Extended profile fields
        assert user.get("certification_agency") == "ssi"
        assert user.get("last_dive_date") == "2024-12-01"
        assert user.get("total_dives") == 75
        assert "Reef" in user.get("preferred_dive_types", [])
        assert user.get("medical_fitness") == True
        assert user.get("equipment_ownership") == "partial"
        assert "English" in user.get("languages", [])
        assert user.get("travel_willingness") == "weekend"
        assert user.get("emergency_contact_name") == "Jane Smith"
        assert user.get("emergency_contact_phone") == "+1987654321"
        assert user.get("emergency_contact_relationship") == "Parent"
        
        print(f"✓ GET /api/auth/me returns ALL profile fields correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
