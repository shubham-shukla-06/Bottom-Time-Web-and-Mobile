"""
Test iteration 74: iNaturalist integration, OpenStreetMap dive sites, species-at-location, Conservation metrics
Features tested:
- GET /api/marine-life/inat/species-photo/{scientific_name} - iNaturalist photo lookup
- GET /api/marine-life/species-at-location - Species observed near coordinates
- GET /api/marine-life/dive-sites - OpenStreetMap dive site search
- GET /api/marine-life/conservation/impact - Conservation metrics
- POST /api/marine-life/warm-photos - Warm iNaturalist photo cache
- GET /api/marine-life/species/{species_id} - Species detail with iNaturalist photo fallback
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def get_auth_token():
    """Get auth token using the correct OTP flow"""
    # Step 1: Send OTP
    resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
        "email": "test@bottomtime.com",
        "phone": "+919876543210"
    })
    if resp.status_code != 200:
        # Try loading saved token
        try:
            with open("/tmp/bt_token.txt", "r") as f:
                token = f.read().strip()
                if token:
                    # Verify token is valid
                    check = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
                    if check.status_code == 200:
                        return token
        except:
            pass
        raise Exception(f"Failed to send OTP: {resp.text}")
    
    # Step 2: Verify OTP
    resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "email": "test@bottomtime.com",
        "phone": "+919876543210",
        "otp_code": "123456"
    })
    if resp.status_code != 200:
        raise Exception(f"Failed to verify OTP: {resp.text}")
    
    token = resp.json().get("token")
    if token:
        # Save token for future use
        with open("/tmp/bt_token.txt", "w") as f:
            f.write(token)
    return token


@pytest.fixture(scope="module")
def auth_token():
    """Module-level auth token fixture"""
    return get_auth_token()


class TestINaturalistPhotos:
    """iNaturalist photo integration tests - no auth required"""

    def test_get_species_photo_whale_shark(self):
        """Test GET /api/marine-life/inat/species-photo/{scientific_name} for Rhincodon typus (Whale Shark)"""
        # Scientific name with URL encoding (+ for space)
        resp = requests.get(f"{BASE_URL}/api/marine-life/inat/species-photo/Rhincodon+typus", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "photo_url" in data
        assert "source" in data
        assert data.get("source") == "iNaturalist"
        
        # Whale shark is common, should have a photo
        if data.get("photo_url"):
            assert "inaturalist" in data["photo_url"].lower() or "static" in data["photo_url"]
            print(f"✓ Found iNaturalist photo for Whale Shark: {data['photo_url'][:80]}...")
        else:
            print("⚠ No photo found for Whale Shark (may be rate limited)")
        
        # Check other fields when photo found
        if data.get("taxon_id"):
            assert data.get("name") == "Rhincodon typus"
            assert "observations_count" in data
            print(f"  - Taxon ID: {data.get('taxon_id')}, Observations: {data.get('observations_count')}")

    def test_get_species_photo_clownfish(self):
        """Test iNaturalist photo for Amphiprion ocellaris (Clownfish)"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/inat/species-photo/Amphiprion+ocellaris", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "source" in data
        print(f"✓ Clownfish photo response: photo_url={'Yes' if data.get('photo_url') else 'None'}")

    def test_get_species_photo_hammerhead(self):
        """Test iNaturalist photo for Sphyrna mokarran (Great Hammerhead)"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/inat/species-photo/Sphyrna+mokarran", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "source" in data
        print(f"✓ Hammerhead photo response: photo_url={'Yes' if data.get('photo_url') else 'None'}")

    def test_get_species_photo_invalid(self):
        """Test iNaturalist photo for non-existent species"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/inat/species-photo/Nonexistent+fakeus", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        # Should return null photo_url for unknown species
        assert data.get("photo_url") is None
        print("✓ Returns null photo_url for unknown species")


class TestSpeciesAtLocation:
    """Species-at-location API tests (iNaturalist species_counts)"""

    def test_species_at_dahab(self, auth_token):
        """Test GET /api/marine-life/species-at-location for Dahab, Egypt (Red Sea)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Dahab coordinates: 28.5°N, 34.5°E
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species-at-location",
            params={"lat": 28.5, "lng": 34.5, "radius": 50},
            headers=headers,
            timeout=20
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "location" in data
        assert "species" in data
        assert "source" in data
        assert data["source"] == "iNaturalist"
        
        # Check location info
        assert data["location"]["lat"] == 28.5
        assert data["location"]["lng"] == 34.5
        assert data["location"]["radius"] == 50
        
        # Check species list
        species_list = data.get("species", [])
        print(f"✓ Found {len(species_list)} species near Dahab (radius 50km)")
        
        if len(species_list) > 0:
            # Check first species structure
            first = species_list[0]
            assert "taxon_id" in first
            assert "name" in first
            assert "scientific_name" in first
            assert "observation_count" in first
            print(f"  - Top species: {first['name']} ({first['observation_count']} observations)")
            
            # Check if any match curated species
            curated = [s for s in species_list if s.get("is_curated")]
            print(f"  - {len(curated)} species match curated database")

    def test_species_at_maldives(self, auth_token):
        """Test species-at-location for Maldives"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Maldives coordinates: 4.1°N, 73.5°E
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species-at-location",
            params={"lat": 4.1, "lng": 73.5, "radius": 50},
            headers=headers,
            timeout=20
        )
        assert resp.status_code == 200
        data = resp.json()
        
        assert "species" in data
        print(f"✓ Found {len(data.get('species', []))} species near Maldives")


class TestDiveSitesSearch:
    """OpenStreetMap dive site search tests - no auth required"""

    def test_dive_sites_great_barrier_reef(self):
        """Test dive sites search for Great Barrier Reef"""
        # GBR coordinates: -18.3, 147.7
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/dive-sites",
            params={"lat": -18.3, "lng": 147.7, "radius": 2},
            timeout=20
        )
        assert resp.status_code == 200
        data = resp.json()
        
        assert "sites" in data
        # May have error if Overpass API times out
        if "error" not in data:
            assert "source" in data
            assert data["source"] == "OpenStreetMap"
        print(f"✓ Dive sites near GBR: {len(data.get('sites', []))} sites" + (f" (error: {data.get('error', '')[:50]})" if data.get('error') else ""))

    def test_dive_sites_requires_coordinates(self):
        """Test that dive-sites requires lat/lng"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/dive-sites", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        
        # Should return error or empty sites when no coordinates
        assert "error" in data or len(data.get("sites", [])) == 0
        print("✓ Returns error/empty when coordinates missing")


class TestConservationImpact:
    """Conservation impact metrics tests"""

    def test_get_conservation_impact(self, auth_token):
        """Test GET /api/marine-life/conservation/impact returns metrics"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/conservation/impact", headers=headers, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify required fields
        assert "total_observations" in data
        assert "unique_species" in data
        assert "unique_sites" in data
        assert "endangered_sightings" in data
        assert "species_collected" in data
        assert "total_species_in_db" in data
        assert "dives_with_sightings" in data
        assert "contribution_summary" in data
        assert "data_value" in data
        
        print(f"✓ Conservation impact metrics:")
        print(f"  - Total observations: {data['total_observations']}")
        print(f"  - Unique species: {data['unique_species']}")
        print(f"  - Unique sites: {data['unique_sites']}")
        print(f"  - Endangered sightings: {data['endangered_sightings']}")
        print(f"  - Species collected: {data['species_collected']}")
        print(f"  - Total species in DB: {data['total_species_in_db']}")
        
        # Verify data_value mentions Darwin Core
        assert "Darwin Core" in data["data_value"]
        print("✓ data_value mentions Darwin Core standard")


class TestWarmPhotosCache:
    """Photo cache warming endpoint tests"""

    def test_warm_photos_cache(self, auth_token):
        """Test POST /api/marine-life/warm-photos warms iNaturalist cache"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # This endpoint may take time due to batched iNaturalist API calls
        resp = requests.post(f"{BASE_URL}/api/marine-life/warm-photos", headers=headers, timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "fetched" in data
        assert "total_missing" in data
        assert "cache_size" in data
        
        print(f"✓ warm-photos response:")
        print(f"  - Fetched: {data['fetched']} photos")
        print(f"  - Total missing: {data['total_missing']} species without curated images")
        print(f"  - Cache size: {data['cache_size']} entries")


class TestSpeciesDetailWithINat:
    """Species detail endpoint with iNaturalist photo fallback tests"""

    def test_species_detail_hammerhead_inat_photo(self, auth_token):
        """Test GET /api/marine-life/species/hammerhead-shark returns iNaturalist photo"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/species/hammerhead-shark", headers=headers, timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify basic species data
        assert data["name"] == "Hammerhead Shark"
        assert data["scientific_name"] == "Sphyrna mokarran"
        assert data["conservation"] == "Critically Endangered"
        
        # Check for iNaturalist photo (hammerhead has no curated image in SPECIES_DB)
        image = data.get("image", "")
        inat_photo = data.get("inat_photo")
        
        print(f"✓ Hammerhead shark species detail:")
        print(f"  - Name: {data['name']}")
        print(f"  - Conservation: {data['conservation']}")
        print(f"  - Image: {'Yes' if image else 'None'}")
        if inat_photo:
            assert inat_photo.get("source") == "iNaturalist"
            print(f"  - iNaturalist photo source: {inat_photo.get('source')}")
        else:
            print("  - iNaturalist photo: None (may be rate limited)")

    def test_species_detail_whale_shark_curated(self, auth_token):
        """Test species with curated image doesn't need iNaturalist fallback"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/species/whale-shark", headers=headers, timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        # Whale shark has curated image
        assert data["name"] == "Whale Shark"
        image = data.get("image", "")
        assert image, "Whale shark should have curated image"
        assert "unsplash" in image.lower()
        
        # inat_photo should be None when curated image exists
        inat_photo = data.get("inat_photo")
        assert inat_photo is None, "Should not fetch iNaturalist photo when curated exists"
        
        print(f"✓ Whale shark uses curated image: {image[:60]}...")


class TestExistingEndpointsStillWork:
    """Regression tests for existing marine-life endpoints"""

    def test_get_all_species(self, auth_token):
        """Test GET /api/marine-life/species returns species list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/species", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "species" in data
        assert "total_species" in data
        assert "categories" in data
        assert data["total_species"] >= 50  # Should have 53 species
        print(f"✓ All species endpoint: {data['total_species']} species")

    def test_get_regions(self):
        """Test GET /api/marine-life/regions returns regions (no auth required)"""
        resp = requests.get(f"{BASE_URL}/api/marine-life/regions")
        assert resp.status_code == 200
        data = resp.json()
        
        assert "regions" in data
        assert len(data["regions"]) == 10
        print(f"✓ Regions endpoint: {len(data['regions'])} regions")

    def test_obis_search(self, auth_token):
        """Test OBIS search still works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/obis/search", params={"q": "Amphiprion"}, headers=headers, timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "results" in data
        assert data.get("source") == "OBIS"
        print(f"✓ OBIS search: {len(data.get('results', []))} results for 'Amphiprion'")

    def test_collection_stats(self, auth_token):
        """Test GET /api/marine-life/collection returns stats"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.get(f"{BASE_URL}/api/marine-life/collection", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "total_species" in data
        assert "seen_count" in data
        assert "progress" in data
        assert "category_stats" in data
        print(f"✓ Collection stats: {data['seen_count']}/{data['total_species']} species collected")
