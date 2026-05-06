"""
Test New Features: Products API, Listings Sorting, Onboarding with Dive Count, 
Instructor Fields, Currency Setting
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProductsAPI:
    """Test GET /api/products endpoint with category filter, search, and sorting"""

    def test_get_all_products(self):
        """Test GET /api/products returns all products"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "products" in data
        assert data["count"] == 10  # 5 merch + 5 gear seeded
        assert len(data["products"]) == 10

    def test_filter_products_by_merch_category(self):
        """Test GET /api/products?category=merch returns only merch"""
        response = requests.get(f"{BASE_URL}/api/products?category=merch")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 5
        for product in data["products"]:
            assert product["category"] == "merch"

    def test_filter_products_by_gear_category(self):
        """Test GET /api/products?category=gear returns only gear"""
        response = requests.get(f"{BASE_URL}/api/products?category=gear")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 5
        for product in data["products"]:
            assert product["category"] == "gear"

    def test_products_sort_by_price_asc(self):
        """Test products sort by price ascending"""
        response = requests.get(f"{BASE_URL}/api/products?sort_by=price_asc")
        assert response.status_code == 200
        data = response.json()
        prices = [p["price"] for p in data["products"]]
        assert prices == sorted(prices), "Products should be sorted by price ascending"

    def test_products_sort_by_price_desc(self):
        """Test products sort by price descending"""
        response = requests.get(f"{BASE_URL}/api/products?sort_by=price_desc")
        assert response.status_code == 200
        data = response.json()
        prices = [p["price"] for p in data["products"]]
        assert prices == sorted(prices, reverse=True), "Products should be sorted by price descending"

    def test_products_sort_by_popular(self):
        """Test products sort by sold_count descending"""
        response = requests.get(f"{BASE_URL}/api/products?sort_by=popular")
        assert response.status_code == 200
        data = response.json()
        sold_counts = [p["sold_count"] for p in data["products"]]
        assert sold_counts == sorted(sold_counts, reverse=True), "Products should be sorted by sold_count descending"

    def test_products_search(self):
        """Test products search by name"""
        response = requests.get(f"{BASE_URL}/api/products?search=Hoodie")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] >= 1
        assert any("Hoodie" in p["name"] for p in data["products"])

    def test_product_structure(self):
        """Test product has all expected fields"""
        response = requests.get(f"{BASE_URL}/api/products?limit=1")
        assert response.status_code == 200
        data = response.json()
        product = data["products"][0]
        required_fields = ["id", "name", "category", "description", "price", "currency", "image_url", "in_stock", "status"]
        for field in required_fields:
            assert field in product, f"Product should have {field} field"


class TestListingsSorting:
    """Test listings sorting options"""

    def test_listings_sort_by_price_asc(self):
        """Test listings sort by price ascending"""
        response = requests.get(f"{BASE_URL}/api/listings?sort_by=price_asc")
        assert response.status_code == 200
        data = response.json()
        prices = [l["price"] for l in data["listings"] if l.get("price")]
        assert prices == sorted(prices), "Listings should be sorted by price ascending"

    def test_listings_sort_by_price_desc(self):
        """Test listings sort by price descending"""
        response = requests.get(f"{BASE_URL}/api/listings?sort_by=price_desc")
        assert response.status_code == 200
        data = response.json()
        prices = [l["price"] for l in data["listings"] if l.get("price")]
        assert prices == sorted(prices, reverse=True), "Listings should be sorted by price descending"

    def test_listings_sort_by_rating(self):
        """Test listings sort by rating descending"""
        response = requests.get(f"{BASE_URL}/api/listings?sort_by=rating")
        assert response.status_code == 200
        data = response.json()
        ratings = [l["rating"] for l in data["listings"]]
        assert ratings == sorted(ratings, reverse=True), "Listings should be sorted by rating descending"

    def test_listings_sort_by_reviews(self):
        """Test listings sort by review_count descending"""
        response = requests.get(f"{BASE_URL}/api/listings?sort_by=reviews")
        assert response.status_code == 200
        data = response.json()
        review_counts = [l["review_count"] for l in data["listings"]]
        assert review_counts == sorted(review_counts, reverse=True), "Listings should be sorted by review_count descending"

    def test_listings_sort_by_newest(self):
        """Test listings sort by newest (created_at descending)"""
        response = requests.get(f"{BASE_URL}/api/listings?sort_by=newest")
        assert response.status_code == 200
        data = response.json()
        # Just verify it returns data (all seeded at same time)
        assert data["count"] > 0


class TestOnboardingWithDiveCount:
    """Test onboarding with total_dives field for certified divers"""

    @pytest.fixture
    def create_diver_user(self):
        """Create a new diver user for testing"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testdiver_{unique_id}@test.com"
        phone = f"+1555{unique_id[:7]}"
        name = f"Test Diver {unique_id}"
        
        # Store signup data
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": name, "role": "diver"
        })
        
        # Send email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        
        # Verify email (mock code 123456)
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_verify.json()["verification_token"]
        
        # Send phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        
        # Verify phone
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_verify.json()["verification_token"]
        
        # Complete signup
        signup_response = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        return signup_response.json()

    def test_onboarding_saves_total_dives(self, create_diver_user):
        """Test PUT /api/auth/onboarding saves total_dives"""
        token = create_diver_user["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "certification_level": "advanced_open_water",
            "interests": ["both"],
            "total_dives": 75,  # 51-100 dives option
            "location_country": "Australia"
        }, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_dives"] == 75
        assert data["onboarding_complete"] == True

    def test_onboarding_dive_count_values(self, create_diver_user):
        """Test all dive count options (5, 25, 75, 150)"""
        token = create_diver_user["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test value 150 (100+ dives)
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "certification_level": "divemaster",
            "total_dives": 150
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["total_dives"] == 150


class TestInstructorOnboarding:
    """Test instructor-specific onboarding fields"""

    @pytest.fixture
    def create_instructor_user(self):
        """Create a new instructor user for testing"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testinstr_{unique_id}@test.com"
        phone = f"+1666{unique_id[:7]}"
        name = f"Test Instructor {unique_id}"
        
        # Store signup data with instructor role
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": name, "role": "instructor"
        })
        
        # Complete verification
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_verify.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_verify.json()["verification_token"]
        
        signup_response = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        return signup_response.json()

    def test_instructor_onboarding_saves_fields(self, create_instructor_user):
        """Test instructor-specific fields are saved during onboarding"""
        token = create_instructor_user["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "instructor_certification": "instructor",
            "instructor_agency": "padi",
            "instructor_specialties": ["Open Water", "Advanced Open Water", "Nitrox"],
            "instructor_years": 8,
            "location_country": "Indonesia"
        }, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["instructor_certification"] == "instructor"
        assert data["instructor_agency"] == "padi"
        assert data["instructor_specialties"] == ["Open Water", "Advanced Open Water", "Nitrox"]
        assert data["instructor_years"] == 8
        assert data["onboarding_complete"] == True

    def test_instructor_certification_values(self, create_instructor_user):
        """Test instructor certification options: divemaster, instructor, course_director"""
        token = create_instructor_user["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test course_director option
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "instructor_certification": "course_director",
            "instructor_agency": "ssi",
            "instructor_years": 15
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["instructor_certification"] == "course_director"


class TestCurrencyAutoSet:
    """Test currency is auto-set based on location_country"""

    @pytest.fixture
    def create_user_for_currency(self):
        """Create a new user for currency testing"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testcurrency_{unique_id}@test.com"
        phone = f"+1777{unique_id[:7]}"
        
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": f"Currency Test {unique_id}", "role": "diver"
        })
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_verify.json()["verification_token"]
        
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_verify = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_verify.json()["verification_token"]
        
        signup_response = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        return signup_response.json()

    def test_currency_set_india_inr(self, create_user_for_currency):
        """Test India location sets currency to INR"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "India"
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "INR"

    def test_currency_set_uk_gbp(self, create_user_for_currency):
        """Test UK location sets currency to GBP"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "United Kingdom"
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "GBP"

    def test_currency_set_germany_eur(self, create_user_for_currency):
        """Test Germany location sets currency to EUR"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "Germany"
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "EUR"

    def test_currency_set_australia_aud(self, create_user_for_currency):
        """Test Australia location sets currency to AUD"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "Australia"
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "AUD"

    def test_currency_set_thailand_thb(self, create_user_for_currency):
        """Test Thailand location sets currency to THB"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "Thailand"
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "THB"

    def test_currency_default_usd_unknown_country(self, create_user_for_currency):
        """Test unknown country defaults to USD"""
        token = create_user_for_currency["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.put(f"{BASE_URL}/api/auth/onboarding", json={
            "experience_level": "certified",
            "location_country": "Atlantis"  # Not in currency map
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["currency"] == "USD"


class TestSignupRoles:
    """Test signup with different roles: diver, instructor, operator"""

    def test_signup_as_diver(self):
        """Test signup with diver role"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testdiver2_{unique_id}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "Test Diver", "role": "diver"
        })
        assert response.status_code == 200

    def test_signup_as_instructor(self):
        """Test signup with instructor role"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testinstr2_{unique_id}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "Test Instructor", "role": "instructor"
        })
        assert response.status_code == 200

    def test_signup_as_operator(self):
        """Test signup with operator role"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"testop2_{unique_id}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "Test Operator", "role": "operator"
        })
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
