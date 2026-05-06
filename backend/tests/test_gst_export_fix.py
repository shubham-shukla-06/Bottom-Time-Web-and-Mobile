"""
Test GST Export Fix - Iteration 82
Tests the fix for GST being charged on exports (shipping outside India).
Under Indian GST law, exports are zero-rated (0% GST).

Key changes tested:
1. POST /api/tax/calculate-cart with shipping_country=India → GST > 0 (domestic)
2. POST /api/tax/calculate-cart with shipping_country=United States → GST = 0 (export)
3. POST /api/tax/calculate-cart with shipping_country=United Kingdom → GST = 0 (export)
4. POST /api/tax/calculate-cart with no shipping_country → falls back to user profile location_country
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGSTExportFix:
    """Tests for GST export zero-rating fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token and ensure cart has items"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Step 1: Send OTP
        otp_res = self.session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        assert otp_res.status_code == 200, f"Send OTP failed: {otp_res.text}"
        
        # Step 2: Verify OTP
        verify_res = self.session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert verify_res.status_code == 200, f"Verify OTP failed: {verify_res.text}"
        verification_token = verify_res.json().get("verification_token")
        
        # Step 3: Complete login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": verification_token
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.token = login_res.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Add a product to cart for testing
        self.product_id = "4241b6db-428d-4c16-aa63-86e00fd0692b"  # Bottom Time Logo Tee
        self.session.post(f"{BASE_URL}/api/cart/add", params={
            "product_id": self.product_id,
            "quantity": 1
        })
        # Ignore if already in cart
        
        yield
        
        # Cleanup: Remove item from cart
        self.session.delete(f"{BASE_URL}/api/cart/{self.product_id}")
    
    def test_domestic_shipping_india_has_gst(self):
        """Test: Shipping to India should have GST > 0 (domestic sale)"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "India"
        })
        assert res.status_code == 200, f"API failed: {res.text}"
        data = res.json()
        
        # Verify is_domestic == True
        assert data.get("is_domestic") == True, f"Expected is_domestic=True for India, got {data.get('is_domestic')}"
        
        # Verify GST is calculated (should be > 0 for domestic)
        totals = data.get("totals", {})
        gst = totals.get("gst", 0)
        assert gst > 0, f"Expected GST > 0 for domestic shipping to India, got {gst}"
        
        # Verify items have GST
        items = data.get("items", [])
        if items:
            item = items[0]
            assert item.get("gst_amount", 0) > 0, f"Expected item GST > 0, got {item.get('gst_amount')}"
            assert item.get("is_export") == False, f"Expected is_export=False for domestic"
        
        print(f"✓ Domestic (India): GST = {gst}, is_domestic = {data.get('is_domestic')}")
    
    def test_export_shipping_usa_no_gst(self):
        """Test: Shipping to United States should have GST = 0 (zero-rated export)"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "United States"
        })
        assert res.status_code == 200, f"API failed: {res.text}"
        data = res.json()
        
        # Verify is_domestic == False
        assert data.get("is_domestic") == False, f"Expected is_domestic=False for USA, got {data.get('is_domestic')}"
        
        # Verify GST is 0 (zero-rated export)
        totals = data.get("totals", {})
        gst = totals.get("gst", 0)
        assert gst == 0, f"Expected GST = 0 for export to USA, got {gst}"
        
        # Verify items have is_export=True and gst_amount=0
        items = data.get("items", [])
        if items:
            item = items[0]
            assert item.get("gst_amount", 0) == 0, f"Expected item GST = 0, got {item.get('gst_amount')}"
            assert item.get("is_export") == True, f"Expected is_export=True for export"
        
        print(f"✓ Export (USA): GST = {gst}, is_domestic = {data.get('is_domestic')}")
    
    def test_export_shipping_uk_no_gst(self):
        """Test: Shipping to United Kingdom should have GST = 0 (zero-rated export)"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "United Kingdom"
        })
        assert res.status_code == 200, f"API failed: {res.text}"
        data = res.json()
        
        # Verify is_domestic == False
        assert data.get("is_domestic") == False, f"Expected is_domestic=False for UK, got {data.get('is_domestic')}"
        
        # Verify GST is 0 (zero-rated export)
        totals = data.get("totals", {})
        gst = totals.get("gst", 0)
        assert gst == 0, f"Expected GST = 0 for export to UK, got {gst}"
        
        print(f"✓ Export (UK): GST = {gst}, is_domestic = {data.get('is_domestic')}")
    
    def test_export_shipping_australia_no_gst(self):
        """Test: Shipping to Australia should have GST = 0 (zero-rated export)"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "Australia"
        })
        assert res.status_code == 200, f"API failed: {res.text}"
        data = res.json()
        
        assert data.get("is_domestic") == False, f"Expected is_domestic=False for Australia"
        assert data.get("totals", {}).get("gst", 0) == 0, f"Expected GST = 0 for export to Australia"
        
        print(f"✓ Export (Australia): GST = 0, is_domestic = False")
    
    def test_no_shipping_country_falls_back_to_profile(self):
        """Test: No shipping_country should fall back to user profile location_country"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={})
        assert res.status_code == 200, f"API failed: {res.text}"
        data = res.json()
        
        # The result depends on user's profile location_country
        # Just verify the API works and returns valid structure
        assert "totals" in data, "Response should have totals"
        assert "is_domestic" in data, "Response should have is_domestic flag"
        
        print(f"✓ No shipping_country: is_domestic = {data.get('is_domestic')}, GST = {data.get('totals', {}).get('gst', 0)}")
    
    def test_cart_total_lower_for_export(self):
        """Test: Cart total should be lower when shipping internationally (no GST)"""
        # Get domestic total (India)
        domestic_res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "India"
        })
        assert domestic_res.status_code == 200
        domestic_data = domestic_res.json()
        domestic_total = domestic_data.get("totals", {}).get("total", 0)
        domestic_base = domestic_data.get("totals", {}).get("base", 0)
        domestic_gst = domestic_data.get("totals", {}).get("gst", 0)
        
        # Get export total (USA)
        export_res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "United States"
        })
        assert export_res.status_code == 200
        export_data = export_res.json()
        export_total = export_data.get("totals", {}).get("total", 0)
        export_base = export_data.get("totals", {}).get("base", 0)
        export_gst = export_data.get("totals", {}).get("gst", 0)
        
        # Base amounts should be the same
        assert domestic_base == export_base, f"Base amounts should match: domestic={domestic_base}, export={export_base}"
        
        # Export GST should be 0
        assert export_gst == 0, f"Export GST should be 0, got {export_gst}"
        
        # Domestic GST should be > 0
        assert domestic_gst > 0, f"Domestic GST should be > 0, got {domestic_gst}"
        
        # Export total should be lower (no GST)
        assert export_total < domestic_total, f"Export total ({export_total}) should be less than domestic total ({domestic_total})"
        
        # Export total should equal base (since GST = 0)
        assert export_total == export_base, f"Export total should equal base: {export_total} vs {export_base}"
        
        print(f"✓ Domestic total: {domestic_total} (base: {domestic_base} + GST: {domestic_gst})")
        print(f"✓ Export total: {export_total} (base: {export_base} + GST: {export_gst})")
        print(f"✓ Savings on export: {domestic_total - export_total}")
    
    def test_case_insensitive_country_matching(self):
        """Test: Country matching should be case-insensitive"""
        # Test lowercase
        res1 = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "india"
        })
        assert res1.status_code == 200
        assert res1.json().get("is_domestic") == True, "lowercase 'india' should be domestic"
        
        # Test uppercase
        res2 = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "INDIA"
        })
        assert res2.status_code == 200
        assert res2.json().get("is_domestic") == True, "uppercase 'INDIA' should be domestic"
        
        # Test mixed case
        res3 = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "InDiA"
        })
        assert res3.status_code == 200
        assert res3.json().get("is_domestic") == True, "mixed case 'InDiA' should be domestic"
        
        print("✓ Case-insensitive country matching works")
    
    def test_whitespace_handling(self):
        """Test: Country with leading/trailing whitespace should be handled"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "  India  "
        })
        assert res.status_code == 200
        assert res.json().get("is_domestic") == True, "' India ' with whitespace should be domestic"
        
        print("✓ Whitespace handling works")


class TestCalculateTaxFunction:
    """Tests for the calculate_tax function behavior"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        self.session.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        verify_res = self.session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        verification_token = verify_res.json().get("verification_token")
        login_res = self.session.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": verification_token
        })
        self.token = login_res.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Add product to cart
        self.product_id = "4241b6db-428d-4c16-aa63-86e00fd0692b"
        self.session.post(f"{BASE_URL}/api/cart/add", params={
            "product_id": self.product_id,
            "quantity": 1
        })
        
        yield
        
        self.session.delete(f"{BASE_URL}/api/cart/{self.product_id}")
    
    def test_export_returns_is_export_true(self):
        """Test: Export should return is_export=True in item details"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "United States"
        })
        assert res.status_code == 200
        data = res.json()
        
        items = data.get("items", [])
        assert len(items) > 0, "Should have items in cart"
        
        for item in items:
            assert item.get("is_export") == True, f"Item should have is_export=True for export"
            assert item.get("gst_rate") == 0.0, f"Item should have gst_rate=0 for export"
            assert item.get("gst_amount") == 0.0, f"Item should have gst_amount=0 for export"
        
        print("✓ Export items have is_export=True, gst_rate=0, gst_amount=0")
    
    def test_domestic_returns_is_export_false(self):
        """Test: Domestic should return is_export=False in item details"""
        res = self.session.post(f"{BASE_URL}/api/tax/calculate-cart", json={
            "shipping_country": "India"
        })
        assert res.status_code == 200
        data = res.json()
        
        items = data.get("items", [])
        assert len(items) > 0, "Should have items in cart"
        
        for item in items:
            assert item.get("is_export") == False, f"Item should have is_export=False for domestic"
            assert item.get("gst_rate") > 0, f"Item should have gst_rate > 0 for domestic"
            assert item.get("gst_amount") > 0, f"Item should have gst_amount > 0 for domestic"
        
        print("✓ Domestic items have is_export=False, gst_rate > 0, gst_amount > 0")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
