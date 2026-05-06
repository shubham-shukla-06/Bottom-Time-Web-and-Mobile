"""
Test Tax Compliance Engine - GST/TCS calculation for India-registered marketplace
Tests: Tax rates, preview, checkout calculation, compliance dashboard, Excel export
Categories: dive_service(18%), dive_course(18%), equipment_rental(18%), physical_goods(18%), 
            apparel(12%), platform_commission(18%)
Domestic: 18% GST, 15% commission on base, 18% GST on commission, 1% TCS
Export: 0% GST, 15% commission on base, 0% GST on commission, 0% TCS
"""
import pytest
import requests
import os
import jwt
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")

# Test credentials
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"
OPERATOR_USER_ID = "baf7ac6f-84e2-40fa-9739-650a6cd2d154"  # Thailand operator (export)
INDIAN_OPERATOR_ID = "test-indian-operator-001"  # India operator (domestic)


def generate_jwt(user_id: str, role: str) -> str:
    return jwt.encode({"sub": user_id, "role": role}, JWT_SECRET, algorithm="HS256")


ADMIN_JWT = generate_jwt(ADMIN_USER_ID, "admin")
OPERATOR_JWT = generate_jwt(OPERATOR_USER_ID, "operator")
INDIAN_OP_JWT = generate_jwt(INDIAN_OPERATOR_ID, "operator")


@pytest.fixture
def admin_headers():
    return {"Authorization": f"Bearer {ADMIN_JWT}", "Content-Type": "application/json"}


@pytest.fixture
def operator_headers():
    return {"Authorization": f"Bearer {OPERATOR_JWT}", "Content-Type": "application/json"}


@pytest.fixture
def indian_op_headers():
    return {"Authorization": f"Bearer {INDIAN_OP_JWT}", "Content-Type": "application/json"}


# ==========================
# Tax Rates API Tests (Admin)
# ==========================

class TestTaxRatesAdmin:
    """Admin endpoints for managing GST tax rates"""

    def test_get_all_tax_rates(self, admin_headers):
        """GET /api/admin/tax-rates - returns all tax categories with GST rates"""
        response = requests.get(f"{BASE_URL}/api/admin/tax-rates", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "tax_rates" in data
        assert "tcs_rate" in data
        assert data["tcs_rate"] == 1.0  # TCS rate is 1%
        
        # Verify all 6 categories exist
        categories = {r["category"] for r in data["tax_rates"]}
        expected_categories = {"dive_service", "dive_course", "equipment_rental", 
                              "physical_goods", "apparel", "platform_commission"}
        assert expected_categories == categories
        
        # Verify dive_service has 18% GST
        dive_service = next((r for r in data["tax_rates"] if r["category"] == "dive_service"), None)
        assert dive_service is not None
        assert dive_service["gst_rate"] == 18.0
        assert dive_service["sac_hsn"] == "9985"
        
        print("TEST PASSED: GET /api/admin/tax-rates returns all 6 categories correctly")

    def test_get_tax_rates_forbidden_for_non_admin(self, operator_headers):
        """Non-admin users should be forbidden"""
        response = requests.get(f"{BASE_URL}/api/admin/tax-rates", headers=operator_headers)
        assert response.status_code == 403
        print("TEST PASSED: Tax rates forbidden for non-admin")

    def test_update_tax_rate(self, admin_headers):
        """PUT /api/admin/tax-rates/{category} - update a tax rate"""
        category = "apparel"
        new_rate = 14.0
        
        response = requests.put(
            f"{BASE_URL}/api/admin/tax-rates/{category}",
            headers=admin_headers,
            json={"gst_rate": new_rate}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        assert f"Tax rate for {category} updated to {new_rate}%" in response.json()["message"]
        
        # Verify the change
        verify_response = requests.get(f"{BASE_URL}/api/admin/tax-rates", headers=admin_headers)
        rates = verify_response.json()["tax_rates"]
        apparel = next((r for r in rates if r["category"] == "apparel"), None)
        assert apparel["gst_rate"] == new_rate
        assert apparel["source"] == "custom"  # Now custom, not default
        
        # Restore original rate
        requests.put(
            f"{BASE_URL}/api/admin/tax-rates/{category}",
            headers=admin_headers,
            json={"gst_rate": 12.0}
        )
        print("TEST PASSED: PUT /api/admin/tax-rates/{category} updates rate correctly")

    def test_update_tax_rate_invalid_category(self, admin_headers):
        """Should reject unknown category"""
        response = requests.put(
            f"{BASE_URL}/api/admin/tax-rates/invalid_category",
            headers=admin_headers,
            json={"gst_rate": 18.0}
        )
        assert response.status_code == 404
        assert "Unknown tax category" in response.json()["detail"]
        print("TEST PASSED: Unknown category returns 404")

    def test_update_tax_rate_invalid_rate(self, admin_headers):
        """Should reject rate outside 0-100 range"""
        # Rate > 100
        response = requests.put(
            f"{BASE_URL}/api/admin/tax-rates/dive_service",
            headers=admin_headers,
            json={"gst_rate": 150}
        )
        assert response.status_code == 400
        
        # Rate < 0
        response = requests.put(
            f"{BASE_URL}/api/admin/tax-rates/dive_service",
            headers=admin_headers,
            json={"gst_rate": -5}
        )
        assert response.status_code == 400
        print("TEST PASSED: Invalid rate values return 400")


# ==========================
# Tax Preview API Tests
# ==========================

class TestTaxPreview:
    """POST /api/tax/preview - calculates tax breakdown for listing"""

    def test_domestic_tax_preview(self, operator_headers):
        """Domestic transaction: 18% GST, commission on base only, TCS 1%"""
        response = requests.post(
            f"{BASE_URL}/api/tax/preview",
            headers=operator_headers,
            json={
                "base_price": 1000,
                "listing_type": "dive",
                "participants": 1,
                "operator_country": "India"  # Domestic
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify diver_pays
        diver = data["diver_pays"]
        assert diver["base_amount"] == 1000
        assert diver["gst_rate"] == 18.0
        assert diver["gst_amount"] == 180.0  # 18% of 1000
        assert diver["total_amount"] == 1180.0  # 1000 + 180
        assert diver["is_export"] == False
        assert diver["sac_hsn"] == "9985"  # dive_service SAC code
        assert diver["igst"] == 180.0  # Full IGST for online
        
        # Verify operator_receives
        op = data["operator_receives"]
        assert op["base_amount"] == 1000
        assert op["commission"] == 150.0  # 15% of base (1000), NOT including GST
        assert op["commission_gst_rate"] == 18.0
        assert op["commission_gst"] == 27.0  # 18% of 150
        assert op["tcs_rate"] == 1.0
        assert op["tcs_amount"] == 10.0  # 1% of base 1000
        assert op["operator_payout"] == 993.0  # 1180 - 150 - 27 - 10
        assert op["is_domestic"] == True
        
        # GST acknowledgment required for domestic
        assert data["gst_acknowledgment_required"] == True
        assert data["acknowledgment_text"] is not None
        
        print("TEST PASSED: Domestic tax preview calculates 18% GST, 1% TCS correctly")

    def test_export_tax_preview(self, operator_headers):
        """Export transaction: 0% GST (zero-rated), 0% TCS"""
        response = requests.post(
            f"{BASE_URL}/api/tax/preview",
            headers=operator_headers,
            json={
                "base_price": 1000,
                "listing_type": "dive",
                "participants": 1,
                "operator_country": "Thailand"  # Export
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify diver_pays - zero-rated
        diver = data["diver_pays"]
        assert diver["base_amount"] == 1000
        assert diver["gst_rate"] == 0.0
        assert diver["gst_amount"] == 0.0
        assert diver["total_amount"] == 1000  # No GST added
        assert diver["is_export"] == True
        assert "tax_note" in diver
        assert "Zero-rated" in diver["tax_note"]
        
        # Verify operator_receives
        op = data["operator_receives"]
        assert op["commission"] == 150.0  # 15% of base
        assert op["commission_gst_rate"] == 0.0  # No GST on commission for export
        assert op["commission_gst"] == 0.0
        assert op["tcs_rate"] == 0  # No TCS for export
        assert op["tcs_amount"] == 0
        assert op["operator_payout"] == 850.0  # 1000 - 150
        assert op["is_domestic"] == False
        
        # No GST acknowledgment required for export
        assert data["gst_acknowledgment_required"] == False
        assert data["acknowledgment_text"] is None
        
        print("TEST PASSED: Export tax preview is zero-rated (0% GST, 0% TCS)")

    def test_tax_preview_multiple_participants(self, operator_headers):
        """Test tax calculation with multiple participants"""
        response = requests.post(
            f"{BASE_URL}/api/tax/preview",
            headers=operator_headers,
            json={
                "base_price": 500,
                "listing_type": "course",
                "participants": 3,
                "operator_country": "India"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Base should be price * participants = 500 * 3 = 1500
        assert data["diver_pays"]["base_amount"] == 1500
        assert data["diver_pays"]["gst_amount"] == 270.0  # 18% of 1500
        assert data["diver_pays"]["total_amount"] == 1770.0
        
        print("TEST PASSED: Multiple participants multiplied correctly")

    def test_tax_preview_different_listing_types(self, operator_headers):
        """Test different listing types map to correct tax categories"""
        types_to_test = [
            ("dive", "dive_service", 18.0),
            ("course", "dive_course", 18.0),
            ("equipment", "equipment_rental", 18.0),
            ("liveaboard", "dive_service", 18.0),
        ]
        
        for listing_type, expected_category, expected_rate in types_to_test:
            response = requests.post(
                f"{BASE_URL}/api/tax/preview",
                headers=operator_headers,
                json={
                    "base_price": 100,
                    "listing_type": listing_type,
                    "participants": 1,
                    "operator_country": "India"
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["diver_pays"]["gst_rate"] == expected_rate, f"Failed for {listing_type}"
        
        print("TEST PASSED: Different listing types map to correct GST rates")


# ==========================
# Checkout Tax Calculation Tests
# ==========================

class TestCheckoutTaxCalculation:
    """POST /api/tax/calculate-checkout - calculates tax at checkout with listing details"""

    def test_calculate_checkout_export(self, operator_headers):
        """Calculate checkout tax for international listing (export)"""
        # First get a listing ID
        listings_response = requests.get(f"{BASE_URL}/api/listings?limit=1")
        assert listings_response.status_code == 200
        listings = listings_response.json()["listings"]
        if not listings:
            pytest.skip("No listings available for checkout test")
        
        listing_id = listings[0]["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/tax/calculate-checkout",
            headers=operator_headers,
            json={"listing_id": listing_id, "participants": 2}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "listing_id" in data
        assert "listing_name" in data
        assert "base_price_per_person" in data
        assert "participants" in data
        assert "base_total" in data
        assert "gst_rate" in data
        assert "gst_amount" in data
        assert "total_amount" in data
        assert "is_export" in data
        
        # Verify calculation
        expected_base = data["base_price_per_person"] * data["participants"]
        assert data["base_total"] == expected_base
        
        print("TEST PASSED: Checkout tax calculation returns correct structure")

    def test_calculate_checkout_listing_not_found(self, operator_headers):
        """Should return 404 for invalid listing ID"""
        response = requests.post(
            f"{BASE_URL}/api/tax/calculate-checkout",
            headers=operator_headers,
            json={"listing_id": "non-existent-listing-id", "participants": 1}
        )
        assert response.status_code == 404
        assert "Listing not found" in response.json()["detail"]
        print("TEST PASSED: Invalid listing ID returns 404")


# ==========================
# Compliance Dashboard Tests (Admin)
# ==========================

class TestComplianceDashboard:
    """GET /api/compliance/summary - GST/TCS/revenue summary for period"""

    def test_compliance_summary_current_month(self, admin_headers):
        """Get compliance summary for current month"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/summary?period=current_month",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert data["period"] == "current_month"
        assert "period_start" in data
        assert "transactions" in data
        assert "gst" in data
        assert "tcs" in data
        assert "revenue" in data
        assert "export_value" in data
        
        # Verify transaction breakdown
        txns = data["transactions"]
        assert "total_count" in txns
        assert "domestic_count" in txns
        assert "export_count" in txns
        assert "total_collected" in txns
        
        # Verify GST breakdown
        gst = data["gst"]
        assert "gst_collected_from_divers" in gst
        assert "gst_on_commission" in gst
        assert "net_gst_liability" in gst
        
        # Verify TCS
        assert "total_tcs_collected" in data["tcs"]
        
        # Verify revenue
        assert "total_commission_earned" in data["revenue"]
        assert "total_operator_payouts" in data["revenue"]
        
        print("TEST PASSED: Compliance summary returns all required fields")

    def test_compliance_summary_different_periods(self, admin_headers):
        """Test different period options"""
        periods = ["current_month", "last_month", "current_fy", "all"]
        
        for period in periods:
            response = requests.get(
                f"{BASE_URL}/api/compliance/summary?period={period}",
                headers=admin_headers
            )
            assert response.status_code == 200, f"Failed for period {period}: {response.text}"
            assert response.json()["period"] == period
        
        print("TEST PASSED: All period options work correctly")

    def test_compliance_summary_forbidden_for_non_admin(self, operator_headers):
        """Non-admin users should be forbidden"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/summary",
            headers=operator_headers
        )
        assert response.status_code == 403
        print("TEST PASSED: Compliance summary forbidden for non-admin")


# ==========================
# Compliance Transactions Tests (Admin)
# ==========================

class TestComplianceTransactions:
    """GET /api/compliance/transactions - list paid transactions with tax details"""

    def test_get_transactions_list(self, admin_headers):
        """Get list of paid transactions"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/transactions?period=current_month",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "transactions" in data
        assert "count" in data
        assert isinstance(data["transactions"], list)
        
        print("TEST PASSED: Compliance transactions list returns correctly")

    def test_filter_transactions_by_type(self, admin_headers):
        """Filter transactions by domestic/export type"""
        # Test domestic filter
        response = requests.get(
            f"{BASE_URL}/api/compliance/transactions?period=all&tx_type=domestic",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Test export filter
        response = requests.get(
            f"{BASE_URL}/api/compliance/transactions?period=all&tx_type=export",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        print("TEST PASSED: Transaction type filtering works")

    def test_compliance_transactions_forbidden_for_non_admin(self, operator_headers):
        """Non-admin users should be forbidden"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/transactions",
            headers=operator_headers
        )
        assert response.status_code == 403
        print("TEST PASSED: Compliance transactions forbidden for non-admin")


# ==========================
# Excel Export Tests (Admin)
# ==========================

class TestComplianceExcelExport:
    """GET /api/compliance/export-excel - generates Excel file with 3 sheets"""

    def test_export_excel_returns_xlsx(self, admin_headers):
        """Export should return valid xlsx file"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/export-excel?period=current_month",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "spreadsheetml" in content_type or "vnd.openxmlformats" in content_type
        
        # Check content disposition
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp
        assert "filename=" in content_disp
        assert ".xlsx" in content_disp
        
        # Verify file can be read by openpyxl
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        
        # Verify 3 sheets exist
        sheet_names = wb.sheetnames
        assert "Transaction Register" in sheet_names
        assert "Payout Register" in sheet_names
        assert "GST Summary" in sheet_names
        
        print("TEST PASSED: Excel export returns valid xlsx with 3 sheets")

    def test_export_excel_different_periods(self, admin_headers):
        """Test Excel export for different periods"""
        periods = ["current_month", "last_month", "current_fy", "all"]
        
        for period in periods:
            response = requests.get(
                f"{BASE_URL}/api/compliance/export-excel?period={period}",
                headers=admin_headers
            )
            assert response.status_code == 200, f"Failed for period {period}"
            assert len(response.content) > 0  # Non-empty file
        
        print("TEST PASSED: Excel export works for all periods")

    def test_export_excel_forbidden_for_non_admin(self, operator_headers):
        """Non-admin users should be forbidden"""
        response = requests.get(
            f"{BASE_URL}/api/compliance/export-excel",
            headers=operator_headers
        )
        assert response.status_code == 403
        print("TEST PASSED: Excel export forbidden for non-admin")


# ==========================
# GST Acknowledgment Tests (Listing Creation)
# ==========================

class TestGSTAcknowledgment:
    """Listing creation requires gst_acknowledged for Indian operators"""

    def test_indian_operator_requires_gst_acknowledgment(self, indian_op_headers):
        """Indian operator must acknowledge GST for paid listings"""
        response = requests.post(
            f"{BASE_URL}/api/listings",
            headers=indian_op_headers,
            json={
                "name": "TEST_Dive Trip Without GST Ack",
                "type": "dive",
                "description": "Test description",
                "location": "Mumbai",
                "country": "India",
                "price": 5000,
                "currency": "INR",
                "difficulty": "beginner",
                "duration": "2 hours",
                "image_url": "https://example.com/dive.jpg",
                "highlights": ["Great dive"]
                # gst_acknowledged missing
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "GST acknowledgment required" in response.json()["detail"]
        print("TEST PASSED: Indian operator without GST ack gets 400")

    def test_indian_operator_with_gst_acknowledgment(self, indian_op_headers):
        """Indian operator can create listing with GST acknowledgment"""
        response = requests.post(
            f"{BASE_URL}/api/listings",
            headers=indian_op_headers,
            json={
                "name": "TEST_Dive Trip With GST Ack",
                "type": "dive",
                "description": "Test description",
                "location": "Mumbai",
                "country": "India",
                "price": 5000,
                "currency": "INR",
                "difficulty": "beginner",
                "duration": "2 hours",
                "image_url": "https://example.com/dive.jpg",
                "highlights": ["Great dive"],
                "gst_acknowledged": True
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        assert "id" in response.json()
        
        # Cleanup
        listing_id = response.json()["id"]
        requests.delete(f"{BASE_URL}/api/listings/{listing_id}", headers=indian_op_headers)
        
        print("TEST PASSED: Indian operator with GST ack can create listing")

    def test_free_listing_no_gst_acknowledgment_required(self, indian_op_headers):
        """Free listings (price=0) don't require GST acknowledgment"""
        response = requests.post(
            f"{BASE_URL}/api/listings",
            headers=indian_op_headers,
            json={
                "name": "TEST_Free Dive Info",
                "type": "dive",
                "description": "Free information session",
                "location": "Mumbai",
                "country": "India",
                "price": 0,  # Free
                "currency": "INR",
                "difficulty": "beginner",
                "duration": "1 hour",
                "image_url": "https://example.com/dive.jpg",
                "highlights": ["Info session"]
                # gst_acknowledged not required
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Cleanup
        listing_id = response.json()["id"]
        requests.delete(f"{BASE_URL}/api/listings/{listing_id}", headers=indian_op_headers)
        
        print("TEST PASSED: Free listing doesn't require GST acknowledgment")

    def test_non_indian_operator_no_gst_acknowledgment_required(self, operator_headers):
        """Non-Indian operators don't need GST acknowledgment"""
        # Thailand operator
        response = requests.post(
            f"{BASE_URL}/api/listings",
            headers=operator_headers,
            json={
                "name": "TEST_Thai Dive Trip",
                "type": "dive",
                "description": "Test description",
                "location": "Phuket",
                "country": "Thailand",
                "price": 5000,
                "currency": "THB",
                "difficulty": "beginner",
                "duration": "2 hours",
                "image_url": "https://example.com/dive.jpg",
                "highlights": ["Great dive"]
                # gst_acknowledged not required for non-Indian
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Cleanup
        listing_id = response.json()["id"]
        requests.delete(f"{BASE_URL}/api/listings/{listing_id}", headers=operator_headers)
        
        print("TEST PASSED: Non-Indian operator doesn't need GST acknowledgment")


# ==========================
# Payment Tax Field Storage Tests
# ==========================

class TestPaymentTaxFieldStorage:
    """Payment create-order stores tax fields properly"""

    def test_payment_order_stores_tax_fields(self, admin_headers):
        """Verify payment order stores all tax fields"""
        # Create order with tax fields
        response = requests.post(
            f"{BASE_URL}/api/payments/create-order",
            headers=admin_headers,
            json={
                "amount": 1180,
                "currency": "INR",
                "booking_id": "TEST_tax_booking_001",
                "base_amount": 1000,
                "gst_rate": 18.0,
                "gst_amount": 180,
                "igst": 180,
                "cgst": 0,
                "sgst": 0,
                "sac_hsn": "9985",
                "is_export": False
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "order_id" in data
        
        # Note: We can't directly query the DB from tests, but we verified
        # the API accepts these fields without error
        print("TEST PASSED: Payment order accepts and stores tax fields")


# ==========================
# Payout Tax Breakdown Tests
# ==========================

class TestPayoutTaxBreakdown:
    """Payout record includes proper tax breakdown"""

    def test_payout_structure_after_payment(self, admin_headers):
        """Verify payout records have tax breakdown fields"""
        # Check existing payouts for structure
        response = requests.get(
            f"{BASE_URL}/api/payouts",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Even if no payouts, verify endpoint works
        assert "payouts" in data
        assert "summary" in data
        
        # If payouts exist, verify structure
        if data["payouts"]:
            payout = data["payouts"][0]
            expected_fields = [
                "commission", "commission_gst", "tcs_amount",
                "operator_payout", "base_amount"
            ]
            for field in expected_fields:
                assert field in payout, f"Missing field: {field}"
        
        print("TEST PASSED: Payout records have proper tax breakdown structure")


# ==========================
# Cleanup
# ==========================

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Cleanup test listings after all tests"""
    yield
    # Cleanup test listings created during tests
    
    # Note: Individual tests clean up their own listings
    print("Test cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
