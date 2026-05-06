"""
Marine Life Pokédex Feature Tests - Iteration 72
Tests for species CRUD, collection tracking, regional exploration, and toggle seen functionality.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from the review_request
TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"


class TestMarineLifeAuth:
    """Get authentication token for protected endpoints."""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate using email+phone OTP flow."""
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
        
        return token


class TestMarineLifeSpecies(TestMarineLifeAuth):
    """Test GET /api/marine-life/species - all species retrieval with filters."""
    
    def test_get_all_species(self, auth_token):
        """Test retrieving all 53 species."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Get species failed: {resp.text}"
        
        data = resp.json()
        assert "species" in data, "Missing 'species' in response"
        assert "total_species" in data, "Missing 'total_species' in response"
        assert "seen_count" in data, "Missing 'seen_count' in response"
        assert "progress" in data, "Missing 'progress' in response"
        assert "categories" in data, "Missing 'categories' in response"
        
        # Verify we have 53 species
        assert data["total_species"] == 53, f"Expected 53 species, got {data['total_species']}"
        assert len(data["species"]) == 53, f"Expected 53 species in list, got {len(data['species'])}"
        
        # Verify categories are returned
        assert len(data["categories"]) == 8, f"Expected 8 categories, got {len(data['categories'])}"
        
        # Verify species structure
        sample_species = data["species"][0]
        required_fields = ["id", "name", "scientific_name", "category", "description", 
                          "habitat", "conservation", "rarity", "regions", "seen"]
        for field in required_fields:
            assert field in sample_species, f"Missing field '{field}' in species"
        
        print(f"SUCCESS: Retrieved {len(data['species'])} species with {data['seen_count']} seen ({data['progress']}%)")
    
    def test_filter_species_by_category(self, auth_token):
        """Test filtering species by category (e.g., 'fish')."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species?category=fish",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Filter by category failed: {resp.text}"
        
        data = resp.json()
        species = data["species"]
        
        # All returned species should be in the 'fish' category
        for sp in species:
            assert sp["category"] == "fish", f"Species {sp['name']} has wrong category {sp['category']}"
        
        # Fish category should have ~14 species
        assert len(species) > 0, "No fish species returned"
        print(f"SUCCESS: Filtered to {len(species)} fish species")
    
    def test_filter_species_by_search_shark(self, auth_token):
        """Test searching species by 'shark' term."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species?search=shark",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Search failed: {resp.text}"
        
        data = resp.json()
        species = data["species"]
        
        # Should return species with 'shark' in name
        assert len(species) >= 1, "No shark species found"
        for sp in species:
            name_lower = sp["name"].lower()
            sci_lower = sp.get("scientific_name", "").lower()
            cat_lower = sp.get("category", "").lower()
            assert "shark" in name_lower or "shark" in sci_lower or "shark" in cat_lower, \
                f"Species {sp['name']} doesn't match 'shark' search"
        
        print(f"SUCCESS: Search 'shark' returned {len(species)} species")
    
    def test_filter_species_by_region(self, auth_token):
        """Test filtering species by region (e.g., 'maldives')."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species?region=maldives",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Filter by region failed: {resp.text}"
        
        data = resp.json()
        species = data["species"]
        
        # All returned species should have 'maldives' in regions
        for sp in species:
            assert "maldives" in sp.get("regions", []), f"Species {sp['name']} not in Maldives"
        
        assert len(species) > 0, "No species found in Maldives region"
        print(f"SUCCESS: Filtered to {len(species)} species in Maldives")


class TestMarineLifeSpeciesDetail(TestMarineLifeAuth):
    """Test GET /api/marine-life/species/{id} - single species detail."""
    
    def test_get_species_detail_whale_shark(self, auth_token):
        """Test getting detail for whale-shark species."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species/whale-shark",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Get species detail failed: {resp.text}"
        
        data = resp.json()
        assert data["id"] == "whale-shark", f"Wrong species ID: {data.get('id')}"
        assert data["name"] == "Whale Shark", f"Wrong species name: {data.get('name')}"
        assert "seen" in data, "Missing 'seen' field"
        assert "region_details" in data, "Missing 'region_details' field"
        assert "sighting_logs" in data, "Missing 'sighting_logs' field"
        assert data.get("rarity") == "rare", f"Expected rare rarity, got {data.get('rarity')}"
        assert data.get("conservation") == "Endangered", f"Expected Endangered, got {data.get('conservation')}"
        
        print(f"SUCCESS: Got detail for {data['name']} (seen={data['seen']})")
    
    def test_get_species_detail_nonexistent(self, auth_token):
        """Test 404 for nonexistent species."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species/nonexistent-fish",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("SUCCESS: 404 returned for nonexistent species")


class TestMarineLifeToggleSeen(TestMarineLifeAuth):
    """Test POST /api/marine-life/species/{id}/toggle-seen - mark/unmark seen."""
    
    def test_toggle_seen_species(self, auth_token):
        """Test toggling a species as seen."""
        # First check current status of clownfish
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species/clownfish",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        initial_seen = resp.json().get("seen", False)
        
        # Toggle it
        resp = requests.post(
            f"{BASE_URL}/api/marine-life/species/clownfish/toggle-seen",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Toggle failed: {resp.text}"
        
        data = resp.json()
        assert "seen" in data, "Missing 'seen' in response"
        assert "species_id" in data, "Missing 'species_id' in response"
        assert data["species_id"] == "clownfish", "Wrong species_id returned"
        assert data["seen"] == (not initial_seen), f"Toggle didn't flip seen status"
        
        # Verify persistence with GET
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species/clownfish",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200
        assert resp.json()["seen"] == data["seen"], "Seen status not persisted"
        
        # Toggle back to original state
        requests.post(
            f"{BASE_URL}/api/marine-life/species/clownfish/toggle-seen",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        print(f"SUCCESS: Toggled clownfish seen status from {initial_seen} to {data['seen']}")
    
    def test_toggle_seen_nonexistent(self, auth_token):
        """Test 404 when toggling nonexistent species."""
        resp = requests.post(
            f"{BASE_URL}/api/marine-life/species/fake-fish/toggle-seen",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("SUCCESS: 404 returned for nonexistent species toggle")


class TestMarineLifeCollection(TestMarineLifeAuth):
    """Test GET /api/marine-life/collection - user collection stats."""
    
    def test_get_collection_stats(self, auth_token):
        """Test getting collection progress and stats."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/collection",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Get collection failed: {resp.text}"
        
        data = resp.json()
        assert "total_species" in data, "Missing 'total_species'"
        assert "seen_count" in data, "Missing 'seen_count'"
        assert "progress" in data, "Missing 'progress'"
        assert "category_stats" in data, "Missing 'category_stats'"
        assert "rarity_stats" in data, "Missing 'rarity_stats'"
        
        # Verify 53 total species
        assert data["total_species"] == 53, f"Expected 53, got {data['total_species']}"
        
        # Verify category_stats has all 8 categories
        assert len(data["category_stats"]) == 8, f"Expected 8 categories, got {len(data['category_stats'])}"
        
        # Verify rarity_stats has 3 rarities
        assert "common" in data["rarity_stats"], "Missing common rarity"
        assert "uncommon" in data["rarity_stats"], "Missing uncommon rarity"
        assert "rare" in data["rarity_stats"], "Missing rare rarity"
        
        print(f"SUCCESS: Collection stats - {data['seen_count']}/{data['total_species']} ({data['progress']}%)")


class TestMarineLifeRegions(TestMarineLifeAuth):
    """Test regions endpoints."""
    
    def test_get_regions_no_auth(self):
        """Test GET /api/marine-life/regions without auth (should work per spec)."""
        resp = requests.get(f"{BASE_URL}/api/marine-life/regions")
        assert resp.status_code == 200, f"Get regions failed: {resp.text}"
        
        data = resp.json()
        assert "regions" in data, "Missing 'regions' in response"
        regions = data["regions"]
        
        # Should have 10 regions
        assert len(regions) == 10, f"Expected 10 regions, got {len(regions)}"
        
        # Verify region structure
        for region in regions:
            assert "id" in region, "Missing 'id' in region"
            assert "label" in region, "Missing 'label' in region"
            assert "species_count" in region, "Missing 'species_count' in region"
            assert "top_species" in region, "Missing 'top_species' in region"
        
        print(f"SUCCESS: Retrieved {len(regions)} regions")
    
    def test_get_region_species(self, auth_token):
        """Test GET /api/marine-life/region/{region_id} - species in a region."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/region/caribbean",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Get region species failed: {resp.text}"
        
        data = resp.json()
        assert "region" in data, "Missing 'region' in response"
        assert "species" in data, "Missing 'species' in response"
        assert data["region"]["id"] == "caribbean", "Wrong region returned"
        
        # All species should have 'caribbean' in their regions
        for sp in data["species"]:
            assert "caribbean" in sp.get("regions", []), f"Species {sp['name']} not in Caribbean"
            assert "seen" in sp, f"Species {sp['name']} missing 'seen' field"
        
        print(f"SUCCESS: Caribbean has {len(data['species'])} species")
    
    def test_get_region_nonexistent(self, auth_token):
        """Test 404 for nonexistent region."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/region/atlantis",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("SUCCESS: 404 returned for nonexistent region")


class TestMarineLifeIdentify(TestMarineLifeAuth):
    """Test POST /api/marine-life/identify - AI species identification (may fail if API key issue)."""
    
    def test_identify_no_file(self, auth_token):
        """Test error when no file uploaded."""
        resp = requests.post(
            f"{BASE_URL}/api/marine-life/identify",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Should fail with 422 (missing file) or 400
        assert resp.status_code in [400, 422], f"Expected 400/422, got {resp.status_code}"
        print("SUCCESS: Proper error for missing file upload")


# ═══════════════════════════════════════════
# OBIS INTEGRATION TESTS - Iteration 73
# ═══════════════════════════════════════════

class TestOBISSearch(TestMarineLifeAuth):
    """Test GET /api/marine-life/obis/search - Live OBIS species search."""
    
    def test_obis_search_amphiprion(self, auth_token):
        """Test OBIS search returns species results for Amphiprion (clownfish genus)."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/obis/search?q=Amphiprion",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"OBIS search failed: {resp.text}"
        
        data = resp.json()
        assert "results" in data, "Missing 'results' in OBIS search response"
        assert "total" in data, "Missing 'total' in OBIS search response"
        assert "source" in data, "Missing 'source' in OBIS search response"
        assert data["source"] == "OBIS", "Source should be OBIS"
        
        # Should return species results
        assert len(data["results"]) > 0, "No OBIS results for Amphiprion"
        
        # Verify result structure
        sample = data["results"][0]
        required_fields = ["taxon_id", "scientific_name", "family", "records"]
        for field in required_fields:
            assert field in sample, f"Missing '{field}' in OBIS result"
        
        print(f"SUCCESS: OBIS search returned {len(data['results'])} species (total={data['total']})")
    
    def test_obis_search_short_query(self, auth_token):
        """Test OBIS search with query <2 chars returns empty results."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/obis/search?q=A",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"OBIS search failed: {resp.text}"
        
        data = resp.json()
        assert data["results"] == [], "Expected empty results for short query"
        print("SUCCESS: Short query returns empty results as expected")


class TestOBISSpeciesDetail(TestMarineLifeAuth):
    """Test GET /api/marine-life/obis/species/{taxon_id} - OBIS species detail."""
    
    def test_obis_species_detail_whale_shark(self, auth_token):
        """Test OBIS species detail for whale shark (taxon_id=105847)."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/obis/species/105847",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"OBIS species detail failed: {resp.text}"
        
        data = resp.json()
        assert data["taxon_id"] == 105847, "Wrong taxon_id"
        assert data["scientific_name"] == "Rhincodon typus", f"Wrong scientific name: {data.get('scientific_name')}"
        
        # Check taxonomy structure
        assert "taxonomy" in data, "Missing taxonomy"
        assert data["taxonomy"]["kingdom"] == "Animalia", "Wrong kingdom"
        assert data["taxonomy"]["family"] == "Rhincodontidae", "Wrong family"
        
        # Check OBIS stats
        assert "obis_stats" in data, "Missing obis_stats"
        stats = data["obis_stats"]
        assert "total_records" in stats, "Missing total_records in obis_stats"
        assert "datasets" in stats, "Missing datasets in obis_stats"
        assert "year_range" in stats, "Missing year_range in obis_stats"
        assert stats["total_records"] > 0, "Expected some OBIS records for whale shark"
        
        # Check curated data mapping
        assert "curated" in data, "Missing curated data"
        assert data["curated"]["id"] == "whale-shark", "Wrong curated species ID"
        assert data["curated"]["name"] == "Whale Shark", "Wrong curated name"
        
        print(f"SUCCESS: OBIS detail for whale shark - {stats['total_records']} records, {stats['datasets']} datasets")


class TestOBISDistribution(TestMarineLifeAuth):
    """Test GET /api/marine-life/obis/distribution/{taxon_id} - GeoJSON distribution."""
    
    def test_obis_distribution_whale_shark(self, auth_token):
        """Test OBIS distribution GeoJSON for whale shark."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/obis/distribution/105847",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"OBIS distribution failed: {resp.text}"
        
        data = resp.json()
        assert data["taxon_id"] == 105847, "Wrong taxon_id"
        assert "total_cells" in data, "Missing total_cells"
        assert "geojson" in data, "Missing geojson"
        assert data["source"] == "OBIS", "Wrong source"
        
        # Verify GeoJSON structure
        geojson = data["geojson"]
        assert geojson["type"] == "FeatureCollection", "Invalid GeoJSON type"
        assert "features" in geojson, "Missing features in GeoJSON"
        assert data["total_cells"] > 0, "Expected distribution data for whale shark"
        
        print(f"SUCCESS: OBIS distribution returned {data['total_cells']} grid cells")


class TestOBISEnrichmentInCuratedSpecies(TestMarineLifeAuth):
    """Test that curated species detail includes OBIS enrichment."""
    
    def test_whale_shark_has_obis_enrichment(self, auth_token):
        """Test GET /api/marine-life/species/whale-shark includes OBIS live stats."""
        resp = requests.get(
            f"{BASE_URL}/api/marine-life/species/whale-shark",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert resp.status_code == 200, f"Get species detail failed: {resp.text}"
        
        data = resp.json()
        assert data["id"] == "whale-shark", "Wrong species"
        
        # OBIS enrichment should be present
        assert "obis" in data, "Missing 'obis' field in curated species detail"
        obis = data["obis"]
        assert "aphia_id" in obis, "Missing 'aphia_id' in obis"
        assert obis["aphia_id"] == 105847, f"Wrong aphia_id: {obis.get('aphia_id')}"
        assert "total_records" in obis, "Missing 'total_records' in obis"
        assert "datasets" in obis, "Missing 'datasets' in obis"
        assert "year_range" in obis, "Missing 'year_range' in obis"
        
        # Verify OBIS data is live (has actual records)
        assert obis["total_records"] > 0, "Expected OBIS records for whale shark"
        assert obis["datasets"] > 0, "Expected OBIS datasets for whale shark"
        assert len(obis["year_range"]) == 2, "year_range should have 2 elements [start, end]"
        
        print(f"SUCCESS: Whale shark enriched with OBIS - {obis['total_records']} records, {obis['datasets']} datasets, years {obis['year_range']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
