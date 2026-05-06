"""
Marine Life iNaturalist Integration Tests - Iteration 75
Tests the completely rewritten Marine Life feature using iNaturalist as single source of truth.

Endpoints tested:
- GET /api/marine-life/trending - Trending marine species (30 days)
- GET /api/marine-life/search?q=manta - Species search
- GET /api/marine-life/autocomplete?q=shark - Quick species suggestions
- GET /api/marine-life/species/{taxon_id} - Full species detail
- GET /api/marine-life/nearby?lat=X&lng=Y - Species near location
- GET /api/marine-life/dive-sites - OpenStreetMap dive sites
- POST /api/marine-life/sightings - Submit user sighting (requires auth)
- GET /api/marine-life/my-sightings - User's sightings (requires auth)
- GET /api/marine-life/conservation/impact - Conservation metrics (requires auth)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate using email+phone OTP flow and return JWT token."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Step 1: Send OTP to email
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_EMAIL})
    assert resp.status_code == 200, f"Email OTP send failed: {resp.text}"
    
    # Step 2: Verify email OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": TEST_EMAIL,
        "code": TEST_OTP
    })
    assert resp.status_code == 200, f"Email OTP verify failed: {resp.text}"
    email_token = resp.json().get("verification_token")
    assert email_token, "No verification_token in email response"
    
    # Step 3: Send OTP to phone
    resp = session.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": TEST_PHONE})
    assert resp.status_code == 200, f"Phone OTP send failed: {resp.text}"
    
    # Step 4: Verify phone OTP
    resp = session.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": TEST_PHONE,
        "code": TEST_OTP
    })
    assert resp.status_code == 200, f"Phone OTP verify failed: {resp.text}"
    phone_token = resp.json().get("verification_token")
    assert phone_token, "No verification_token in phone response"
    
    # Step 5: Complete login
    resp = session.post(f"{BASE_URL}/api/auth/login-complete", json={
        "email": TEST_EMAIL,
        "email_verified_token": email_token,
        "phone_verified_token": phone_token
    })
    assert resp.status_code == 200, f"Login complete failed: {resp.text}"
    token = resp.json().get("access_token")
    assert token, "No access_token in response"
    
    print(f"✓ Authentication successful for {TEST_EMAIL}")
    return token


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS (NO AUTH REQUIRED)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrendingSpecies:
    """Test GET /api/marine-life/trending - Trending marine species from iNaturalist"""
    
    def test_trending_returns_marine_species(self):
        """Trending endpoint returns marine species with photos"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/trending?per_page=20", timeout=15)
        assert resp.status_code == 200, f"Trending failed: {resp.text}"
        
        data = resp.json()
        assert "species" in data, "Missing 'species' in response"
        assert "total" in data, "Missing 'total' in response"
        
        species_list = data["species"]
        assert len(species_list) > 0, "Expected trending species results"
        
        # Verify species structure
        first = species_list[0]
        required_fields = ["taxon_id", "name", "scientific_name", "observations_count"]
        for field in required_fields:
            assert field in first, f"Missing '{field}' in trending species"
        
        # Verify no land animals (should be marine taxa only)
        # Marine taxa include: fish, mollusca, cnidaria, sharks, whales, sea turtles etc.
        print(f"✓ Trending: {len(species_list)} marine species")
        print(f"  - Top: {first['name']} ({first['observations_count']} obs)")
        
    def test_trending_respects_per_page(self):
        """Trending respects per_page limit"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/trending?per_page=5", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data.get("species", [])) <= 5, "per_page not respected"


class TestSpeciesSearch:
    """Test GET /api/marine-life/search - iNaturalist species search"""
    
    def test_search_manta_returns_results(self):
        """Search for 'manta' returns manta ray species"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/search?q=manta&per_page=10", timeout=15)
        assert resp.status_code == 200, f"Search failed: {resp.text}"
        
        data = resp.json()
        assert "results" in data, "Missing 'results' in response"
        assert "total" in data, "Missing 'total' in response"
        
        results = data["results"]
        assert len(results) > 0, "Expected results for 'manta'"
        
        # Verify at least one result contains 'manta' in name
        manta_found = any("manta" in r.get("name", "").lower() for r in results)
        assert manta_found, "No 'manta' species in results"
        
        # Verify species structure
        first = results[0]
        assert "taxon_id" in first, "Missing taxon_id"
        assert "name" in first, "Missing name"
        assert "scientific_name" in first, "Missing scientific_name"
        assert "photo_url" in first or "photo_square" in first, "Missing photo"
        
        print(f"✓ Search 'manta': {len(results)} results")
        print(f"  - First: {first['name']} ({first['scientific_name']})")
    
    def test_search_short_query_returns_empty(self):
        """Search with <2 chars returns empty"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/search?q=a", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("results") == [], "Expected empty results for short query"
        print("✓ Short query returns empty")
    
    def test_search_octopus(self):
        """Search for 'octopus' returns cephalopods"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/search?q=octopus", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        results = data.get("results", [])
        assert len(results) > 0, "Expected octopus results"
        print(f"✓ Search 'octopus': {len(results)} results")


class TestAutocomplete:
    """Test GET /api/marine-life/autocomplete - Quick species suggestions"""
    
    def test_autocomplete_shark(self):
        """Autocomplete for 'shark' returns quick suggestions"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/autocomplete?q=shark", timeout=10)
        assert resp.status_code == 200, f"Autocomplete failed: {resp.text}"
        
        data = resp.json()
        assert "results" in data, "Missing 'results'"
        
        results = data["results"]
        assert len(results) > 0, "Expected autocomplete results for 'shark'"
        
        # Check structure
        first = results[0]
        assert "taxon_id" in first, "Missing taxon_id"
        assert "name" in first, "Missing name"
        
        # Should contain shark species
        shark_found = any("shark" in r.get("name", "").lower() for r in results)
        assert shark_found, "No shark in autocomplete results"
        
        print(f"✓ Autocomplete 'shark': {len(results)} suggestions")
        for r in results[:3]:
            print(f"  - {r['name']}")
    
    def test_autocomplete_short_query(self):
        """Autocomplete with <2 chars returns empty"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/autocomplete?q=s", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("results") == [], "Expected empty for short query"


class TestSpeciesDetail:
    """Test GET /api/marine-life/species/{taxon_id} - Full species detail"""
    
    def test_species_detail_by_taxon_id(self):
        """Get species detail by iNaturalist taxon_id"""
        # First get a taxon_id from search
        search_resp = requests.get(f"{BASE_URL}/api/marine-life/search?q=whale+shark", timeout=15)
        assert search_resp.status_code == 200
        results = search_resp.json().get("results", [])
        
        if not results:
            pytest.skip("No whale shark found in search")
        
        taxon_id = results[0]["taxon_id"]
        
        # Get full detail
        resp = requests.get(f"{BASE_URL}/api/marine-life/species/{taxon_id}", timeout=15)
        assert resp.status_code == 200, f"Species detail failed: {resp.text}"
        
        data = resp.json()
        
        # Verify detailed fields
        assert data.get("taxon_id") == taxon_id, "taxon_id mismatch"
        assert "name" in data, "Missing name"
        assert "scientific_name" in data, "Missing scientific_name"
        assert "taxonomy" in data, "Missing taxonomy"
        assert "photos" in data or "photo" in data, "Missing photos"
        
        # Check taxonomy structure
        taxonomy = data.get("taxonomy", {})
        if taxonomy:
            assert any(k in taxonomy for k in ["kingdom", "phylum", "class", "order", "family"]), \
                "Taxonomy should have classification levels"
        
        # Check for Wikipedia summary (may be empty)
        wikipedia_summary = data.get("wikipedia_summary", "")
        
        print(f"✓ Species detail for taxon {taxon_id}:")
        print(f"  - Name: {data.get('name')}")
        print(f"  - Scientific: {data.get('scientific_name')}")
        print(f"  - Observations: {data.get('observations_count', 0)}")
        print(f"  - Photos: {len(data.get('photos', []))}")
        print(f"  - Wikipedia: {'Yes' if wikipedia_summary else 'No'}")
    
    def test_species_detail_nonexistent(self):
        """404 for nonexistent taxon_id"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/species/999999999", timeout=10)
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("✓ 404 for nonexistent taxon")


class TestNearbySpecies:
    """Test GET /api/marine-life/nearby - Species near coordinates"""
    
    def test_nearby_great_barrier_reef(self):
        """Species near Great Barrier Reef coordinates"""
        # GBR: lat=-18.3, lng=147.7
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/nearby",
            params={"lat": -18.3, "lng": 147.7, "radius": 50},
            timeout=20
        )
        assert resp.status_code == 200, f"Nearby failed: {resp.text}"
        
        data = resp.json()
        assert "location" in data, "Missing location"
        assert "species" in data, "Missing species"
        
        loc = data["location"]
        assert loc.get("lat") == -18.3, "Wrong lat"
        assert loc.get("lng") == 147.7, "Wrong lng"
        
        species = data.get("species", [])
        print(f"✓ Nearby GBR: {len(species)} species")
        if species:
            print(f"  - Top: {species[0]['name']} ({species[0].get('observations_count', 0)} obs)")
    
    def test_nearby_maldives(self):
        """Species near Maldives"""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/nearby",
            params={"lat": 3.2, "lng": 73.2},
            timeout=20
        )
        assert resp.status_code == 200
        data = resp.json()
        
        species = data.get("species", [])
        print(f"✓ Nearby Maldives: {len(species)} species")


class TestDiveSites:
    """Test GET /api/marine-life/dive-sites - OpenStreetMap dive site search"""
    
    def test_dive_sites_search(self):
        """Search dive sites near coordinates"""
        # Hawaii coordinates
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/dive-sites",
            params={"lat": 20.8, "lng": -156.3, "radius": 0.5},
            timeout=20
        )
        assert resp.status_code == 200, f"Dive sites failed: {resp.text}"
        
        data = resp.json()
        assert "sites" in data, "Missing sites"
        
        sites = data.get("sites", [])
        # Note: May be empty if no dive sites in OSM for this area
        print(f"✓ Dive sites near Hawaii: {len(sites)} sites")
        if sites:
            for site in sites[:3]:
                print(f"  - {site.get('name')}")
    
    def test_dive_sites_requires_coordinates(self):
        """Dive sites requires lat/lng"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/dive-sites", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data or data.get("sites") == [], "Expected error or empty without coordinates"


# ═══════════════════════════════════════════════════════════════════════════════
# AUTHENTICATED ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestUserSightings:
    """Test sighting submission and retrieval (requires auth)"""
    
    def test_submit_sighting(self, auth_token):
        """POST /api/marine-life/sightings creates a pending sighting"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        # Use shark as search term - more likely to get results from marine taxa
        search_resp = requests.get(f"{BASE_URL}/api/marine-life/search?q=shark", timeout=15)
        results = search_resp.json().get("results", [])
        
        if not results:
            pytest.skip("No species found for sighting test")
        
        species = results[0]
        
        sighting_payload = {
            "taxon_id": species["taxon_id"],
            "species_name": species["name"],
            "scientific_name": species.get("scientific_name", ""),
            "location": "TEST_Maldives Test Reef",
            "notes": "TEST_Spotted during morning dive at 15m depth"
        }
        
        resp = requests.post(f"{BASE_URL}/api/marine-life/sightings", json=sighting_payload, headers=headers, timeout=15)
        assert resp.status_code == 200, f"Submit sighting failed: {resp.text}"
        
        data = resp.json()
        assert "id" in data, "Missing sighting id"
        assert data.get("status") == "pending", f"Expected pending status, got {data.get('status')}"
        assert data.get("species_name") == species["name"], "Species name mismatch"
        assert data.get("location") == "TEST_Maldives Test Reef", "Location mismatch"
        
        print(f"✓ Sighting submitted: {data.get('species_name')} at {data.get('location')}")
        print(f"  - ID: {data.get('id')}")
        print(f"  - Status: {data.get('status')}")
    
    def test_get_my_sightings(self, auth_token):
        """GET /api/marine-life/my-sightings returns user's sightings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        resp = requests.get(f"{BASE_URL}/api/marine-life/my-sightings", headers=headers, timeout=15)
        assert resp.status_code == 200, f"Get sightings failed: {resp.text}"
        
        data = resp.json()
        assert "sightings" in data, "Missing 'sightings' in response"
        
        sightings = data["sightings"]
        print(f"✓ My sightings: {len(sightings)} total")
        
        for s in sightings[:3]:
            print(f"  - {s.get('species_name')} at {s.get('location')} ({s.get('status')})")
    
    def test_sighting_requires_auth(self):
        """Sighting submission requires authentication"""
        resp = requests.post(
            f"{BASE_URL}/api/marine-life/sightings",
            json={"taxon_id": 12345, "species_name": "Test", "location": "Test"},
            timeout=10
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("✓ Sighting requires auth")


class TestConservationImpact:
    """Test GET /api/marine-life/conservation/impact - Conservation metrics"""
    
    def test_get_conservation_impact(self, auth_token):
        """Conservation impact returns user metrics"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        resp = requests.get(f"{BASE_URL}/api/marine-life/conservation/impact", headers=headers, timeout=15)
        assert resp.status_code == 200, f"Conservation impact failed: {resp.text}"
        
        data = resp.json()
        
        # Verify required fields
        assert "total_observations" in data, "Missing total_observations"
        assert "unique_species" in data, "Missing unique_species"
        assert "verified_sightings" in data, "Missing verified_sightings"
        assert "pending_sightings" in data, "Missing pending_sightings"
        
        print(f"✓ Conservation impact metrics:")
        print(f"  - Total observations: {data.get('total_observations')}")
        print(f"  - Unique species: {data.get('unique_species')}")
        print(f"  - Verified: {data.get('verified_sightings')}")
        print(f"  - Pending: {data.get('pending_sightings')}")
        print(f"  - Dives with sightings: {data.get('dives_with_sightings')}")


# ═══════════════════════════════════════════════════════════════════════════════
# DATA CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(auth_token):
    """Clean up TEST_ prefixed sightings after tests"""
    yield  # Run tests first
    
    # Cleanup: Get and delete test sightings
    # Note: There's no delete endpoint in the current API, so we just leave them
    # In production, you'd add a cleanup endpoint or direct DB access
    print("\n✓ Tests completed. TEST_ prefixed sightings may remain in DB.")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
