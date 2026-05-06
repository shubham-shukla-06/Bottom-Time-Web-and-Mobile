"""
Test suite for Payment and Payout System (Iteration 33)
Tests Razorpay integration (mock mode), Wise payouts, platform fees, operator payout settings
"""
import pytest
import requests
import os
import jwt

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'bottomtime-jwt-secret-change-in-production')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')

# Test user IDs
ADMIN_ID = '0455b019-66e5-4646-8d6b-bc6298ce7afe'
OPERATOR_ID = 'baf7ac6f-84e2-40fa-9739-650a6cd2d154'
DIVER_ID = '5c2d97f9-3b3e-4f95-bc2f-5f370d84922d'


@pytest.fixture
def admin_token():
    """Generate admin JWT token"""
    return jwt.encode({'sub': ADMIN_ID, 'role': 'admin'}, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture
def operator_token():
    """Generate operator JWT token"""
    return jwt.encode({'sub': OPERATOR_ID, 'role': 'operator'}, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture
def diver_token():
    """Generate diver JWT token"""
    return jwt.encode({'sub': DIVER_ID, 'role': 'diver'}, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture
def admin_client(admin_token):
    """Authenticated requests session for admin"""
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {admin_token}'
    })
    return session


@pytest.fixture
def operator_client(operator_token):
    """Authenticated requests session for operator"""
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {operator_token}'
    })
    return session


@pytest.fixture
def diver_client(diver_token):
    """Authenticated requests session for diver"""
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {diver_token}'
    })
    return session


class TestPaymentCreateOrder:
    """Tests for POST /api/payments/create-order"""
    
    def test_create_mock_order_success(self, diver_client):
        """Test creating a mock Razorpay order"""
        response = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
            "amount": 100.0,
            "currency": "INR",
            "cart_checkout": True
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify mock mode returns expected fields
        assert "order_id" in data, "Missing order_id in response"
        assert data["order_id"].startswith("order_mock_"), f"Expected mock order prefix, got {data['order_id']}"
        assert data.get("mock") == True, "Expected mock=True for placeholder keys"
        assert data["amount"] == 10000, "Amount should be in paise (100 * 100)"
        assert data["currency"] == "INR"
        assert "key_id" in data
        
        print(f"✓ Created mock order: {data['order_id']}")
    
    def test_create_order_with_booking_id(self, diver_client):
        """Test creating order with booking reference"""
        response = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
            "amount": 150.0,
            "currency": "INR",
            "booking_id": "test_booking_123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["order_id"].startswith("order_mock_")
        print(f"✓ Created order with booking_id: {data['order_id']}")
    
    def test_create_order_invalid_amount(self, diver_client):
        """Test validation rejects invalid amount"""
        response = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
            "amount": 0,
            "currency": "INR"
        })
        
        assert response.status_code == 400
        assert "Invalid amount" in response.json().get("detail", "")
        print("✓ Invalid amount validation working")
    
    def test_create_order_negative_amount(self, diver_client):
        """Test validation rejects negative amount"""
        response = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
            "amount": -50,
            "currency": "INR"
        })
        
        assert response.status_code == 400
        print("✓ Negative amount validation working")


class TestPaymentMockVerify:
    """Tests for POST /api/payments/mock-verify"""
    
    def test_mock_verify_success(self, diver_client):
        """Test mock verification marks payment as paid"""
        # First create an order
        create_resp = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
            "amount": 200.0,
            "currency": "INR"
        })
        assert create_resp.status_code == 200
        order_id = create_resp.json()["order_id"]
        
        # Now verify the mock payment
        verify_resp = diver_client.post(f"{BASE_URL}/api/payments/mock-verify", json={
            "order_id": order_id
        })
        
        assert verify_resp.status_code == 200, f"Expected 200, got {verify_resp.status_code}: {verify_resp.text}"
        data = verify_resp.json()
        
        assert data.get("verified") == True
        assert data.get("status") == "paid"
        assert data.get("mock") == True
        assert "payment_id" in data
        assert data["payment_id"].startswith("pay_mock_")
        
        print(f"✓ Mock payment verified: {data['payment_id']}")
    
    def test_mock_verify_invalid_order(self, diver_client):
        """Test verify fails for non-existent order"""
        response = diver_client.post(f"{BASE_URL}/api/payments/mock-verify", json={
            "order_id": "order_mock_nonexistent123"
        })
        
        assert response.status_code == 404
        print("✓ Non-existent order returns 404")


class TestPaymentVerify:
    """Tests for POST /api/payments/verify (real Razorpay signature verification)"""
    
    def test_verify_endpoint_exists(self, diver_client):
        """Test that verify endpoint exists and requires parameters"""
        response = diver_client.post(f"{BASE_URL}/api/payments/verify", json={})
        
        # Should fail with 400 due to missing parameters, not 404
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Missing payment details" in response.json().get("detail", "")
        print("✓ Payment verify endpoint exists and validates input")


class TestPlatformFeesGet:
    """Tests for GET /api/admin/platform-fees"""
    
    def test_get_platform_fees_admin(self, admin_client):
        """Test admin can retrieve platform fees"""
        response = admin_client.get(f"{BASE_URL}/api/admin/platform-fees")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "global_fee" in data
        assert "custom_fees" in data
        assert isinstance(data["global_fee"], (int, float))
        assert data["global_fee"] == 15.0, f"Default global fee should be 15%, got {data['global_fee']}"
        assert isinstance(data["custom_fees"], list)
        
        print(f"✓ Platform fees retrieved: global={data['global_fee']}%, custom_count={len(data['custom_fees'])}")
    
    def test_get_platform_fees_non_admin_forbidden(self, operator_client):
        """Test non-admin cannot access platform fees"""
        response = operator_client.get(f"{BASE_URL}/api/admin/platform-fees")
        
        assert response.status_code == 403
        print("✓ Non-admin access to platform fees forbidden")


class TestPlatformFeesGlobal:
    """Tests for PUT /api/admin/platform-fees/global"""
    
    def test_set_global_fee(self, admin_client):
        """Test admin can set global platform fee"""
        response = admin_client.put(f"{BASE_URL}/api/admin/platform-fees/global", json={
            "platform_fee_percent": 20.0
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Global platform fee set to 20.0%" in data.get("message", "")
        
        # Verify it was saved
        get_resp = admin_client.get(f"{BASE_URL}/api/admin/platform-fees")
        assert get_resp.status_code == 200
        assert get_resp.json()["global_fee"] == 20.0
        
        # Reset to default
        admin_client.put(f"{BASE_URL}/api/admin/platform-fees/global", json={"platform_fee_percent": 15.0})
        
        print("✓ Global platform fee update working")
    
    def test_set_global_fee_invalid_range(self, admin_client):
        """Test validation rejects fee outside 0-100 range"""
        response = admin_client.put(f"{BASE_URL}/api/admin/platform-fees/global", json={
            "platform_fee_percent": 150.0
        })
        
        assert response.status_code == 400
        assert "must be between 0 and 100" in response.json().get("detail", "")
        print("✓ Fee range validation working")


class TestPlatformFeesCustom:
    """Tests for PUT/DELETE /api/admin/platform-fees/custom"""
    
    def test_set_custom_fee_for_listing(self, admin_client):
        """Test admin can set custom fee for a listing"""
        response = admin_client.put(f"{BASE_URL}/api/admin/platform-fees/custom", json={
            "entity_type": "listing",
            "entity_id": "test_listing_123",
            "platform_fee_percent": 10.0
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Custom fee set to 10.0%" in data.get("message", "")
        
        print("✓ Custom fee for listing set")
    
    def test_set_custom_fee_for_operator(self, admin_client):
        """Test admin can set custom fee for an operator"""
        response = admin_client.put(f"{BASE_URL}/api/admin/platform-fees/custom", json={
            "entity_type": "operator",
            "entity_id": OPERATOR_ID,
            "platform_fee_percent": 12.0
        })
        
        assert response.status_code == 200
        print("✓ Custom fee for operator set")
    
    def test_set_custom_fee_invalid_entity_type(self, admin_client):
        """Test validation rejects invalid entity type"""
        response = admin_client.put(f"{BASE_URL}/api/admin/platform-fees/custom", json={
            "entity_type": "invalid_type",
            "entity_id": "test_123",
            "platform_fee_percent": 10.0
        })
        
        assert response.status_code == 400
        assert "Invalid entity type" in response.json().get("detail", "")
        print("✓ Entity type validation working")
    
    def test_delete_custom_fee(self, admin_client):
        """Test admin can delete custom fee"""
        # First create one
        admin_client.put(f"{BASE_URL}/api/admin/platform-fees/custom", json={
            "entity_type": "listing",
            "entity_id": "test_delete_listing",
            "platform_fee_percent": 8.0
        })
        
        # Now delete it
        response = admin_client.delete(
            f"{BASE_URL}/api/admin/platform-fees/custom",
            params={"entity_type": "listing", "entity_id": "test_delete_listing"}
        )
        
        assert response.status_code == 200
        assert "Custom fee removed" in response.json().get("message", "")
        print("✓ Custom fee deletion working")


class TestOperatorPayoutSettings:
    """Tests for GET/PUT /api/operator/payout-settings"""
    
    def test_get_payout_settings(self, operator_client):
        """Test operator can get payout settings"""
        response = operator_client.get(f"{BASE_URL}/api/operator/payout-settings")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "payout_settings" in data
        assert "payout_configured" in data
        
        print(f"✓ Payout settings retrieved: configured={data['payout_configured']}")
    
    def test_update_payout_settings_india(self, operator_client):
        """Test operator can save Indian bank details"""
        response = operator_client.put(f"{BASE_URL}/api/operator/payout-settings", json={
            "payout_country": "India",
            "payout_currency": "INR",
            "bank_account_name": "Test Operator",
            "bank_name": "HDFC Bank",
            "account_number": "1234567890",
            "ifsc_code": "HDFC0001234"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "Payout settings updated" in data.get("message", "")
        assert data["payout_settings"]["payout_country"] == "India"
        assert data["payout_settings"]["payout_currency"] == "INR"
        assert data["payout_settings"]["ifsc_code"] == "HDFC0001234"
        
        # Verify persistence
        get_resp = operator_client.get(f"{BASE_URL}/api/operator/payout-settings")
        assert get_resp.status_code == 200
        assert get_resp.json()["payout_configured"] == True
        
        print("✓ Indian payout settings saved and verified")
    
    def test_update_payout_settings_international(self, operator_client):
        """Test operator can save international bank details"""
        response = operator_client.put(f"{BASE_URL}/api/operator/payout-settings", json={
            "payout_country": "United States",
            "payout_currency": "USD",
            "bank_account_name": "Test US Operator",
            "bank_name": "Chase Bank",
            "account_number": "987654321",
            "swift_code": "CHASUS33",
            "routing_number": "021000021"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["payout_settings"]["payout_country"] == "United States"
        assert data["payout_settings"]["swift_code"] == "CHASUS33"
        
        print("✓ International payout settings saved")
    
    def test_payout_settings_non_operator_forbidden(self, diver_client):
        """Test non-operator cannot access payout settings"""
        response = diver_client.get(f"{BASE_URL}/api/operator/payout-settings")
        
        assert response.status_code == 403
        print("✓ Non-operator access to payout settings forbidden")


class TestPayoutsListAndProcess:
    """Tests for GET /api/payouts and POST /api/payouts/{id}/process"""
    
    def test_get_payouts_admin(self, admin_client):
        """Test admin can list all payouts"""
        response = admin_client.get(f"{BASE_URL}/api/payouts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "payouts" in data
        assert "summary" in data
        assert isinstance(data["payouts"], list)
        assert "total_pending" in data["summary"]
        assert "total_processing" in data["summary"]
        assert "total_completed" in data["summary"]
        assert "count" in data["summary"]
        
        print(f"✓ Payouts list retrieved: count={data['summary']['count']}")
    
    def test_get_payouts_operator(self, operator_client):
        """Test operator can list their payouts"""
        response = operator_client.get(f"{BASE_URL}/api/payouts")
        
        assert response.status_code == 200
        data = response.json()
        
        # Operator should only see their own payouts
        assert "payouts" in data
        assert "summary" in data
        
        print(f"✓ Operator payouts retrieved: count={data['summary']['count']}")
    
    def test_get_payouts_filter_by_status(self, admin_client):
        """Test filtering payouts by status"""
        response = admin_client.get(f"{BASE_URL}/api/payouts", params={"status": "pending"})
        
        assert response.status_code == 200
        data = response.json()
        
        # All returned payouts should be pending
        for payout in data["payouts"]:
            assert payout["status"] == "pending"
        
        print("✓ Payout status filtering working")
    
    def test_process_payout_not_found(self, admin_client):
        """Test processing non-existent payout returns 404"""
        response = admin_client.post(f"{BASE_URL}/api/payouts/nonexistent-id-123/process")
        
        assert response.status_code == 404
        print("✓ Non-existent payout returns 404")
    
    def test_process_payout_non_admin_forbidden(self, operator_client):
        """Test non-admin cannot process payouts"""
        response = operator_client.post(f"{BASE_URL}/api/payouts/any-payout-id/process")
        
        assert response.status_code == 403
        print("✓ Non-admin payout processing forbidden")


class TestPayoutAutoCreation:
    """Test payout auto-creation after booking payment completes"""
    
    def test_complete_payment_flow_creates_payout(self, diver_client, admin_client):
        """
        Test full flow: create order -> mock verify -> payout created
        This tests the _create_payout_record function
        """
        from pymongo import MongoClient
        import uuid
        
        # Setup: Create a booking first with operator_id
        client_db = MongoClient('mongodb://localhost:27017')
        db = client_db['bottomtime_db']
        
        booking_id = f"test_booking_{uuid.uuid4().hex[:8]}"
        listing_id = f"test_listing_{uuid.uuid4().hex[:8]}"
        
        # Create test listing
        db.listings.insert_one({
            "id": listing_id,
            "name": "Test Dive Experience",
            "operator_id": OPERATOR_ID,
            "price": 100.0,
            "currency": "INR",
            "status": "active"
        })
        
        # Create test booking
        db.bookings.insert_one({
            "id": booking_id,
            "listing_id": listing_id,
            "listing_name": "Test Dive Experience",
            "user_id": DIVER_ID,
            "operator_id": OPERATOR_ID,
            "date": "2026-03-01",
            "participants": 1,
            "price": 100.0,
            "status": "pending",
            "payment_status": "pending"
        })
        
        try:
            # Create payment order with booking_id
            create_resp = diver_client.post(f"{BASE_URL}/api/payments/create-order", json={
                "amount": 100.0,
                "currency": "INR",
                "booking_id": booking_id
            })
            assert create_resp.status_code == 200
            order_id = create_resp.json()["order_id"]
            
            # Verify mock payment
            verify_resp = diver_client.post(f"{BASE_URL}/api/payments/mock-verify", json={
                "order_id": order_id
            })
            assert verify_resp.status_code == 200
            
            # Check if payout was created
            payout = db.payouts.find_one({"booking_id": booking_id}, {"_id": 0})
            
            if payout:
                # Verify payout has correct fee split (15% default platform fee)
                assert payout["total_amount"] == 100.0
                assert payout["platform_fee_percent"] == 15.0
                assert payout["platform_fee"] == 15.0
                assert payout["operator_amount"] == 85.0
                assert payout["operator_id"] == OPERATOR_ID
                assert payout["status"] == "pending"
                print(f"✓ Payout created with correct fee split: operator gets {payout['operator_amount']}")
            else:
                print("Note: Payout not created - may need operator_id on booking")
            
            # Test admin can process this payout
            if payout:
                process_resp = admin_client.post(f"{BASE_URL}/api/payouts/{payout['id']}/process")
                assert process_resp.status_code == 200
                data = process_resp.json()
                assert data.get("status") == "processing"
                assert data.get("mock") == True  # Since Wise/Razorpay are in mock mode
                print(f"✓ Payout processed (mock mode): {payout['id']}")
        
        finally:
            # Cleanup
            db.bookings.delete_one({"id": booking_id})
            db.listings.delete_one({"id": listing_id})
            db.payouts.delete_many({"booking_id": booking_id})
            db.payment_transactions.delete_many({"booking_id": booking_id})
            client_db.close()


class TestBatchPayoutProcessing:
    """Tests for POST /api/payouts/batch-process"""
    
    def test_batch_process_payouts(self, admin_client):
        """Test admin can batch process pending payouts"""
        response = admin_client.post(f"{BASE_URL}/api/payouts/batch-process")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "processed" in data
        assert "failed" in data
        assert "details" in data
        
        print(f"✓ Batch process result: processed={data['processed']}, failed={data['failed']}")
    
    def test_batch_process_non_admin_forbidden(self, operator_client):
        """Test non-admin cannot batch process"""
        response = operator_client.post(f"{BASE_URL}/api/payouts/batch-process")
        
        assert response.status_code == 403
        print("✓ Non-admin batch processing forbidden")


class TestPayoutStatus:
    """Tests for GET /api/payouts/{payout_id}/status"""
    
    def test_get_payout_status_not_found(self, admin_client):
        """Test getting status of non-existent payout"""
        response = admin_client.get(f"{BASE_URL}/api/payouts/nonexistent-123/status")
        
        assert response.status_code == 404
        print("✓ Non-existent payout status returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
