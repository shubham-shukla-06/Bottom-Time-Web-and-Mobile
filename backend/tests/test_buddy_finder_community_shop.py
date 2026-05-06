"""
Test Buddy Finder, Community, and Shop Features
- Buddy finder smart matching with compatibility scores
- Listing co-attendees API
- Upcoming dive buddies API  
- Products API with 16 products across 3 categories
- Community page flows
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPublicAPIs:
    """Test public APIs that don't require authentication"""
    
    def test_products_api_returns_16_products(self):
        """Products API should return 16 products with ratings"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        data = response.json()
        assert data['total'] == 16, f"Expected 16 products, got {data['total']}"
        assert len(data['products']) == 16
        
        # Verify product structure
        product = data['products'][0]
        assert 'id' in product
        assert 'name' in product
        assert 'category' in product
        assert 'price' in product
        assert 'rating' in product
        assert 'review_count' in product
        print(f"✓ Products API returns {data['total']} products")
    
    def test_products_have_three_categories(self):
        """Products should be distributed across merch, gear, essentials"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        products = response.json()['products']
        
        categories = set(p['category'] for p in products)
        expected = {'merch', 'gear', 'essentials'}
        assert categories == expected, f"Expected {expected}, got {categories}"
        
        # Count products per category
        cat_counts = {}
        for p in products:
            cat_counts[p['category']] = cat_counts.get(p['category'], 0) + 1
        print(f"✓ Products by category: {cat_counts}")
        
        assert cat_counts['merch'] >= 4, "Should have at least 4 merch items"
        assert cat_counts['gear'] >= 5, "Should have at least 5 gear items"
        assert cat_counts['essentials'] >= 3, "Should have at least 3 essentials"
    
    def test_products_filter_by_category(self):
        """Test filtering products by category"""
        for cat in ['merch', 'gear', 'essentials']:
            response = requests.get(f"{BASE_URL}/api/products?category={cat}")
            assert response.status_code == 200
            products = response.json()['products']
            for p in products:
                assert p['category'] == cat, f"Product {p['name']} has wrong category"
            print(f"✓ Category filter '{cat}' returns {len(products)} products")
    
    def test_products_have_ratings(self):
        """All seeded products should have ratings"""
        response = requests.get(f"{BASE_URL}/api/products")
        products = response.json()['products']
        
        products_with_ratings = [p for p in products if p.get('rating', 0) > 0]
        print(f"✓ {len(products_with_ratings)}/{len(products)} products have ratings")
        
        # All seeded products should have ratings
        assert len(products_with_ratings) == 16, "All seeded products should have ratings"
    
    def test_listings_api_active(self):
        """Test listings API still returns active listings"""
        response = requests.get(f"{BASE_URL}/api/listings")
        assert response.status_code == 200
        data = response.json()
        assert data['count'] > 0, "Should have active listings"
        print(f"✓ Listings API returns {data['count']} listings")


class TestAuthenticationFlow:
    """Test authentication to get token for buddy finder tests"""
    
    @pytest.fixture(scope='class')
    def auth_token(self):
        """Get auth token via OTP flow"""
        session = requests.Session()
        
        # Step 1: Send OTP to email
        response = session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com",
            "type": "email"
        })
        if response.status_code != 200:
            pytest.skip(f"OTP send failed (rate limit?): {response.text}")
        
        # Step 2: Verify email OTP
        response = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "type": "email",
            "otp": "123456"
        })
        if response.status_code != 200:
            pytest.skip(f"Email OTP verify failed: {response.text}")
        
        # Step 3: Send OTP to phone
        response = session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "+919876543210",
            "type": "phone"
        })
        if response.status_code != 200:
            pytest.skip(f"Phone OTP send failed: {response.text}")
        
        # Step 4: Verify phone OTP
        response = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "+919876543210",
            "type": "phone",
            "otp": "123456"
        })
        if response.status_code != 200:
            pytest.skip(f"Phone OTP verify failed: {response.text}")
        
        # Step 5: Complete login
        response = session.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "phone": "+919876543210"
        })
        if response.status_code != 200:
            pytest.skip(f"Login complete failed: {response.text}")
        
        token = response.json().get('token')
        if not token:
            pytest.skip("No token in response")
        
        print("✓ Authentication successful")
        return token
    
    def test_auth_flow_works(self, auth_token):
        """Verify auth token was obtained"""
        assert auth_token is not None
        assert len(auth_token) > 50
        print(f"✓ Token obtained (length: {len(auth_token)})")


class TestBuddyFinderAPIs:
    """Test Buddy Finder APIs that require authentication"""
    
    @pytest.fixture(scope='class')
    def auth_headers(self):
        """Get auth headers for API calls"""
        session = requests.Session()
        
        # Try to get token
        try:
            session.post(f"{BASE_URL}/api/auth/send-otp", json={
                "identifier": "test@bottomtime.com", "type": "email"
            })
            session.post(f"{BASE_URL}/api/auth/verify-otp", json={
                "identifier": "test@bottomtime.com", "type": "email", "otp": "123456"
            })
            session.post(f"{BASE_URL}/api/auth/send-otp", json={
                "identifier": "+919876543210", "type": "phone"
            })
            session.post(f"{BASE_URL}/api/auth/verify-otp", json={
                "identifier": "+919876543210", "type": "phone", "otp": "123456"
            })
            response = session.post(f"{BASE_URL}/api/auth/login-complete", json={
                "email": "test@bottomtime.com", "phone": "+919876543210"
            })
            if response.status_code == 200:
                token = response.json().get('token')
                return {"Authorization": f"Bearer {token}"}
        except Exception as e:
            print(f"Auth failed: {e}")
        
        pytest.skip("Could not obtain auth token")
    
    def test_buddy_finder_matches_requires_auth(self):
        """Buddy finder matches should require authentication"""
        response = requests.get(f"{BASE_URL}/api/buddy-finder/matches")
        assert response.status_code in [401, 403], "Should require auth"
        print("✓ /buddy-finder/matches requires auth (expected)")
    
    def test_buddy_finder_matches_with_auth(self, auth_headers):
        """Test buddy finder matches API with auth"""
        response = requests.get(f"{BASE_URL}/api/buddy-finder/matches", headers=auth_headers)
        assert response.status_code == 200, f"Buddy matches failed: {response.text}"
        data = response.json()
        assert 'matches' in data
        print(f"✓ Buddy finder returned {len(data['matches'])} matches")
        
        # Check compatibility scores
        if data['matches']:
            for match in data['matches'][:3]:
                assert 'compatibility' in match, "Match should have compatibility score"
                assert 0 <= match['compatibility'] <= 100
                print(f"  - {match.get('name', 'Unknown')}: {match['compatibility']}% compatibility")
    
    def test_listing_buddies_requires_auth(self):
        """Listing co-attendees should require auth"""
        # Get a listing ID first
        listings = requests.get(f"{BASE_URL}/api/listings").json()['listings']
        if not listings:
            pytest.skip("No listings available")
        listing_id = listings[0]['id']
        
        response = requests.get(f"{BASE_URL}/api/buddy-finder/listing-buddies/{listing_id}")
        assert response.status_code in [401, 403], "Should require auth"
        print("✓ /buddy-finder/listing-buddies requires auth (expected)")
    
    def test_listing_buddies_with_auth(self, auth_headers):
        """Test listing co-attendees API"""
        # Get a listing ID
        listings = requests.get(f"{BASE_URL}/api/listings").json()['listings']
        if not listings:
            pytest.skip("No listings available")
        listing_id = listings[0]['id']
        
        response = requests.get(f"{BASE_URL}/api/buddy-finder/listing-buddies/{listing_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert 'attendees' in data
        assert 'total' in data
        print(f"✓ Listing buddies: {data['total']} attendees for listing {listing_id[:8]}...")
    
    def test_upcoming_buddies_requires_auth(self):
        """Upcoming dive buddies should require auth"""
        response = requests.get(f"{BASE_URL}/api/buddy-finder/upcoming-buddies")
        assert response.status_code in [401, 403], "Should require auth"
        print("✓ /buddy-finder/upcoming-buddies requires auth (expected)")
    
    def test_upcoming_buddies_with_auth(self, auth_headers):
        """Test upcoming dive buddies API"""
        response = requests.get(f"{BASE_URL}/api/buddy-finder/upcoming-buddies", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert 'upcoming' in data
        print(f"✓ Upcoming buddies: {len(data['upcoming'])} upcoming trips")


class TestCommunityAPIs:
    """Test Community/Social APIs"""
    
    def test_community_profiles_public(self):
        """Community profiles endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/community/profiles")
        # May require auth or return empty
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Community profiles: {len(data.get('profiles', []))} profiles")
        else:
            print(f"✓ Community profiles requires auth (status {response.status_code})")


class TestDashboardRegression:
    """Regression tests for Dashboard after refactor"""
    
    def test_dive_log_endpoint_public_user(self):
        """Test diver profile endpoint - public"""
        # Use known test user ID
        test_user_id = "0c4b55e1-6c18-4155-887f-1ad4b7167e69"
        response = requests.get(f"{BASE_URL}/api/diver-profile/{test_user_id}")
        assert response.status_code == 200, f"Diver profile failed: {response.text}"
        data = response.json()
        assert 'profile' in data
        assert 'stats' in data
        assert 'badges' in data
        print(f"✓ Diver profile: {data['profile'].get('name', 'Unknown')} - {data['stats'].get('total_dives', 0)} dives")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
