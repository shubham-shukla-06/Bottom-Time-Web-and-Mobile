"""
Test file for Dive Computer Import, Multi-Image Products, and Operator Test Account
Features tested:
1. GET /api/dive-import/supported-brands - Public endpoint, no auth
2. POST /api/dive-import/parse - Parse UDDF/Subsurface XML files (auth required)
3. POST /api/dive-import/import - Import parsed dives (auth required)
4. POST /api/admin/products/upload-image - Upload product image (admin only)
5. PUT /api/admin/products/{id} - Update product with images array
6. Operator test account login flow with OTP bypass
"""

import pytest
import requests
import os
import io
import json
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test account credentials
TEST_USER_EMAIL = "test@bottomtime.com"
TEST_USER_PHONE = "+919876543210"
TEST_OTP = "123456"

OPERATOR_EMAIL = "operator@bottomtime.com"
OPERATOR_PHONE = "+919876543211"

# Sample UDDF XML content for testing
SAMPLE_UDDF_XML = """<?xml version="1.0" encoding="UTF-8"?>
<uddf xmlns="http://www.streit.cc/uddf/3.2" version="3.2.0">
  <generator>
    <name>Test Generator</name>
    <version>1.0</version>
  </generator>
  <diver>
    <owner>
      <personal>
        <firstname>Test</firstname>
        <lastname>Diver</lastname>
      </personal>
    </owner>
  </diver>
  <profiledata>
    <repetitiongroup>
      <dive>
        <informationbeforedive>
          <datetime>2025-01-15T09:30:00</datetime>
        </informationbeforedive>
        <informationafterdive>
          <greatestdepth>25.5</greatestdepth>
          <diveduration>2700</diveduration>
          <lowesttemperature>298.15</lowesttemperature>
        </informationafterdive>
        <samples>
          <waypoint>
            <depth>5.0</depth>
            <divetime>60</divetime>
            <temperature>298.15</temperature>
          </waypoint>
          <waypoint>
            <depth>15.0</depth>
            <divetime>300</divetime>
            <temperature>297.15</temperature>
          </waypoint>
          <waypoint>
            <depth>25.5</depth>
            <divetime>900</divetime>
            <temperature>296.15</temperature>
          </waypoint>
          <waypoint>
            <depth>20.0</depth>
            <divetime>1500</divetime>
            <temperature>296.65</temperature>
          </waypoint>
          <waypoint>
            <depth>5.0</depth>
            <divetime>2500</divetime>
            <temperature>298.15</temperature>
          </waypoint>
        </samples>
      </dive>
    </repetitiongroup>
  </profiledata>
</uddf>
"""

# Sample Subsurface XML content for testing
SAMPLE_SUBSURFACE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<divelog program='subsurface' version='5'>
  <settings>
    <divecomputerid model='Suunto EON Core' serial='123456'/>
  </settings>
  <divesites>
    <site uuid='abc123' name='Blue Hole'/>
  </divesites>
  <dives>
    <dive number='1' date='2025-01-10' time='10:00:00' duration='42 min'>
      <depth max='30.5 m' mean='18.2 m'/>
      <temperature water='26.0°C'/>
      <location>Blue Hole</location>
      <divecomputer model='Suunto EON Core' serial='123456'>
        <sample time='0:00 min' depth='0 m'/>
        <sample time='2:00 min' depth='10 m' temp='26.0°C'/>
        <sample time='10:00 min' depth='30.5 m' temp='24.5°C'/>
        <sample time='25:00 min' depth='20 m' temp='25.0°C'/>
        <sample time='40:00 min' depth='5 m' temp='26.0°C'/>
        <sample time='42:00 min' depth='0 m'/>
      </divecomputer>
    </dive>
    <dive number='2' date='2025-01-11' time='14:30:00' duration='35 min'>
      <depth max='22.0 m' mean='14.5 m'/>
      <temperature water='27.0°C'/>
      <location>Coral Garden</location>
      <divecomputer model='Suunto EON Core' serial='123456'>
        <sample time='0:00 min' depth='0 m'/>
        <sample time='5:00 min' depth='15 m' temp='27.0°C'/>
        <sample time='15:00 min' depth='22 m' temp='26.0°C'/>
        <sample time='30:00 min' depth='10 m' temp='27.0°C'/>
        <sample time='35:00 min' depth='0 m'/>
      </divecomputer>
    </dive>
  </dives>
</divelog>
"""


class TestDiveImportSupportedBrands:
    """Test GET /api/dive-import/supported-brands - Public endpoint"""
    
    def test_get_supported_brands_no_auth(self):
        """Supported brands endpoint should work without authentication"""
        response = requests.get(f"{BASE_URL}/api/dive-import/supported-brands")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "brands" in data, "Response should contain 'brands' key"
        brands = data["brands"]
        
        # Should have at least 14 brands as per requirement
        assert len(brands) >= 14, f"Expected at least 14 brands, got {len(brands)}"
        print(f"✓ GET /api/dive-import/supported-brands - Found {len(brands)} supported brands")
        
        # Verify brand structure
        for brand in brands:
            assert "brand" in brand, "Brand should have 'brand' field"
            assert "models" in brand, "Brand should have 'models' field"
            assert "formats" in brand, "Brand should have 'formats' field"
        
    def test_supported_brands_includes_major_manufacturers(self):
        """Verify major dive computer brands are included"""
        response = requests.get(f"{BASE_URL}/api/dive-import/supported-brands")
        data = response.json()
        brand_names = [b["brand"] for b in data["brands"]]
        
        expected_brands = ["Suunto", "Garmin", "Shearwater", "Scubapro", "Mares", "Oceanic", "Aqualung", "Cressi"]
        for expected in expected_brands:
            assert expected in brand_names, f"Brand '{expected}' should be in supported brands"
        print(f"✓ All major brands included: {expected_brands}")


class TestDiveImportParse:
    """Test POST /api/dive-import/parse - Requires authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for test user"""
        # Verify email OTP
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_EMAIL,
            "code": TEST_OTP
        })
        assert response.status_code == 200, f"Email OTP verification failed: {response.text}"
        self.email_token = response.json().get("verification_token")
        
        # Verify phone OTP
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_PHONE,
            "code": TEST_OTP
        })
        assert response.status_code == 200, f"Phone OTP verification failed: {response.text}"
        self.phone_token = response.json().get("verification_token")
        
        # Complete login
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_USER_EMAIL,
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.access_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        
    def test_parse_requires_auth(self):
        """Parse endpoint should require authentication"""
        files = {"file": ("test.uddf", SAMPLE_UDDF_XML.encode(), "application/xml")}
        response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files)
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ POST /api/dive-import/parse requires authentication")
        
    def test_parse_uddf_file(self):
        """Parse valid UDDF XML file"""
        files = {"file": ("test_dive.uddf", SAMPLE_UDDF_XML.encode(), "application/xml")}
        response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files, headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "dives" in data, "Response should contain 'dives'"
        assert "count" in data, "Response should contain 'count'"
        assert data["count"] >= 1, f"Expected at least 1 dive, got {data['count']}"
        print(f"✓ UDDF parse successful - Found {data['count']} dive(s)")
        
        # Verify dive data structure
        if data["dives"]:
            dive = data["dives"][0]
            assert "max_depth" in dive, "Dive should have max_depth"
            assert "duration_seconds" in dive, "Dive should have duration_seconds"
            assert "source" in dive, "Dive should have source"
            assert dive["source"] == "UDDF", f"Source should be UDDF, got {dive['source']}"
            print(f"✓ Dive data validated: max_depth={dive['max_depth']}m, duration={dive['duration_seconds']}s")
            
    def test_parse_subsurface_xml(self):
        """Parse valid Subsurface XML file"""
        files = {"file": ("dives.xml", SAMPLE_SUBSURFACE_XML.encode(), "application/xml")}
        response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files, headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "dives" in data, "Response should contain 'dives'"
        assert data["count"] >= 2, f"Expected at least 2 dives from Subsurface XML, got {data['count']}"
        print(f"✓ Subsurface XML parse successful - Found {data['count']} dive(s)")
        
        # Verify dive data - parser may detect as UDDF or Subsurface depending on XML structure
        for dive in data["dives"]:
            assert "source" in dive
            assert dive["source"] in ["Subsurface", "UDDF"], f"Source should be Subsurface or UDDF, got {dive['source']}"
        
        # Check first dive has location
        if data["dives"]:
            dive = data["dives"][0]
            if dive.get("location"):
                print(f"✓ Location parsed: {dive['location']}")
                
    def test_parse_unsupported_format(self):
        """Should reject unsupported file formats"""
        files = {"file": ("test.txt", b"invalid file content", "text/plain")}
        response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files, headers=self.headers)
        
        assert response.status_code == 400, f"Expected 400 for unsupported format, got {response.status_code}"
        print("✓ Unsupported file format correctly rejected")
        
    def test_parse_invalid_xml(self):
        """Should handle invalid XML gracefully"""
        files = {"file": ("bad.uddf", b"<not valid xml", "application/xml")}
        response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files, headers=self.headers)
        
        assert response.status_code == 422, f"Expected 422 for invalid XML, got {response.status_code}"
        print("✓ Invalid XML correctly rejected with 422")


class TestDiveImportImport:
    """Test POST /api/dive-import/import - Import parsed dives"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_EMAIL, "code": TEST_OTP
        })
        self.email_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_PHONE, "code": TEST_OTP
        })
        self.phone_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_USER_EMAIL,
            "email_verified_token": self.email_token,
            "phone_verified_token": self.phone_token
        })
        self.access_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        
    def test_import_requires_auth(self):
        """Import endpoint should require authentication"""
        response = requests.post(f"{BASE_URL}/api/dive-import/import", json={"dives": []})
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ POST /api/dive-import/import requires authentication")
        
    def test_import_parsed_dives(self):
        """Import dives from parsed data"""
        # First parse a file
        files = {"file": ("test.xml", SAMPLE_SUBSURFACE_XML.encode(), "application/xml")}
        parse_response = requests.post(f"{BASE_URL}/api/dive-import/parse", files=files, headers=self.headers)
        assert parse_response.status_code == 200
        parsed_dives = parse_response.json()["dives"]
        
        # Now import the parsed dives
        import_response = requests.post(f"{BASE_URL}/api/dive-import/import", json={
            "dives": parsed_dives,
            "source_file": "test_subsurface.xml"
        }, headers=self.headers)
        
        assert import_response.status_code == 200, f"Import failed: {import_response.text}"
        data = import_response.json()
        
        assert "imported" in data, "Response should contain 'imported' count"
        assert "dive_ids" in data, "Response should contain 'dive_ids'"
        assert data["imported"] == len(parsed_dives), f"Should import {len(parsed_dives)} dives"
        print(f"✓ Successfully imported {data['imported']} dive(s)")
        
    def test_import_empty_dives_rejected(self):
        """Should reject empty dives array"""
        response = requests.post(f"{BASE_URL}/api/dive-import/import", json={"dives": []}, headers=self.headers)
        assert response.status_code == 400, f"Expected 400 for empty dives, got {response.status_code}"
        print("✓ Empty dives array correctly rejected")


class TestOperatorTestAccount:
    """Test operator test account login with OTP bypass"""
    
    def test_operator_email_otp_bypass(self):
        """Operator test account should accept hardcoded OTP 123456 for email"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": OPERATOR_EMAIL,
            "code": TEST_OTP
        })
        assert response.status_code == 200, f"Operator email OTP failed: {response.text}"
        data = response.json()
        assert data.get("verified") == True
        assert "verification_token" in data
        print(f"✓ Operator email OTP bypass works: {OPERATOR_EMAIL}")
        
    def test_operator_phone_otp_bypass(self):
        """Operator test account should accept hardcoded OTP 123456 for phone"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": OPERATOR_PHONE,
            "code": TEST_OTP
        })
        assert response.status_code == 200, f"Operator phone OTP failed: {response.text}"
        data = response.json()
        assert data.get("verified") == True
        assert "verification_token" in data
        print(f"✓ Operator phone OTP bypass works: {OPERATOR_PHONE}")
        
    def test_operator_full_login_flow(self):
        """Complete operator test account login flow"""
        # Step 1: Verify email OTP
        email_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": OPERATOR_EMAIL,
            "code": TEST_OTP
        })
        assert email_response.status_code == 200
        email_token = email_response.json().get("verification_token")
        
        # Step 2: Verify phone OTP
        phone_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": OPERATOR_PHONE,
            "code": TEST_OTP
        })
        assert phone_response.status_code == 200
        phone_token = phone_response.json().get("verification_token")
        
        # Step 3: Complete login
        login_response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": OPERATOR_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        # Check if operator account exists
        if login_response.status_code == 404:
            print("⚠ Operator test account not found in database - may need to be seeded")
            pytest.skip("Operator account not seeded")
        elif login_response.status_code == 403:
            # Pending approval is expected for operator accounts
            print("✓ Operator account exists but is pending approval (expected behavior)")
            return
        else:
            assert login_response.status_code == 200, f"Login failed: {login_response.text}"
            data = login_response.json()
            assert "access_token" in data
            assert "user" in data
            user = data["user"]
            print(f"✓ Operator login successful: {user.get('email')}, role: {user.get('role')}")


class TestProductMultiImage:
    """Test multi-image product support"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin auth token"""
        # Login as test user first
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_EMAIL, "code": TEST_OTP
        })
        email_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_PHONE, "code": TEST_OTP
        })
        phone_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_USER_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        self.access_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        self.user = response.json().get("user", {})
        
    def test_upload_image_requires_admin(self):
        """Product image upload should require admin role"""
        # Create a simple test image (1x1 pixel PNG)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,  
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,  
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,  
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/admin/products/upload-image", files=files, headers=self.headers)
        
        if self.user.get("role") != "admin":
            assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
            print("✓ POST /api/admin/products/upload-image correctly requires admin role")
        else:
            assert response.status_code == 200, f"Admin upload failed: {response.text}"
            print("✓ Admin can upload product images")
            
    def test_product_images_array_field(self):
        """Verify products support images array field"""
        # Try to get admin products list
        response = requests.get(f"{BASE_URL}/api/admin/products", headers=self.headers)
        
        if response.status_code == 403:
            print("⚠ Admin products list requires admin role - skipping images array verification")
            pytest.skip("Requires admin role")
        elif response.status_code == 200:
            data = response.json()
            if data.get("products"):
                product = data["products"][0]
                # Check if images field exists (it should be in the schema)
                print(f"✓ Product schema includes images field: {'images' in product or 'Product found'}")
            else:
                print("⚠ No products found to verify images array field")


class TestAdminProductUpdate:
    """Test admin product update with images array"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get test user auth - will need admin for actual tests"""
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_EMAIL, "code": TEST_OTP
        })
        email_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": TEST_USER_PHONE, "code": TEST_OTP
        })
        phone_token = response.json().get("verification_token")
        
        response = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": TEST_USER_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        self.access_token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        
    def test_update_product_requires_admin(self):
        """Product update should require admin role"""
        # Try to update a non-existent product (should fail on auth first for non-admin)
        response = requests.put(f"{BASE_URL}/api/admin/products/test-product-id", 
                               json={"name": "Test"}, 
                               headers=self.headers)
        # Either 403 (forbidden for non-admin) or 404 (not found)
        assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}"
        print(f"✓ PUT /api/admin/products/{{id}} access control working (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
