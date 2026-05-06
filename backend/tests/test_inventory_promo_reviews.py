"""
Test suite for Iteration 37: Inventory Management, Promo Codes, and Verified Reviews

Modules tested:
- Product CRUD (Admin): POST/PUT/DELETE /admin/products, GET /admin/products
- Image upload: POST /admin/products/upload-image
- Promo codes: POST/GET/PUT/DELETE /admin/promo-codes
- Promo validation: POST /promo-codes/validate
- Promo apply: POST /promo-codes/apply
- Reviews with verified purchase: POST /reviews (should reject without purchase)
"""

import pytest
import requests
import jwt
import os
import io
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"


def create_jwt_token(user_id: str, role: str = "admin", name: str = "Test Admin"):
    """Create JWT token for testing"""
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture
def admin_headers():
    """Admin user headers"""
    token = create_jwt_token(ADMIN_USER_ID, role="admin", name="Test Admin")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def regular_user_headers():
    """Regular (non-admin) user headers - using existing test user from iteration 36"""
    token = create_jwt_token("test-shop-orders-user-001", role="diver", name="Test Shop User")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestProductCRUD:
    """Product inventory CRUD operations (Admin only)"""
    
    created_product_id = None
    
    def test_create_product_as_admin(self, admin_headers):
        """POST /admin/products - Create product with all fields"""
        payload = {
            "name": "TEST_ITER37 Dive T-Shirt",
            "category": "merch",
            "description": "Premium cotton dive shirt",
            "price": 29.99,
            "currency": "USD",
            "image_url": "https://example.com/tshirt.jpg",
            "sizes": ["S", "M", "L", "XL"],
            "stock": 150,
            "in_stock": True,
            "highlights": ["100% cotton", "Machine washable"],
            "tax_category": "tshirts"
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["name"] == payload["name"]
        assert data["price"] == payload["price"]
        assert data["stock"] == payload["stock"]
        assert data["category"] == payload["category"]
        assert data["sizes"] == payload["sizes"]
        assert data["status"] == "active"
        assert data["sold_count"] == 0
        
        TestProductCRUD.created_product_id = data["id"]
        print(f"Created product: {data['id']}")
    
    def test_create_product_missing_fields(self, admin_headers):
        """POST /admin/products - Missing required fields should return 400"""
        payload = {"name": "Incomplete Product"}  # missing category and price
        
        response = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=admin_headers)
        assert response.status_code == 400
        assert "Missing required field" in response.json().get("detail", "")
    
    def test_create_product_non_admin(self, regular_user_headers):
        """POST /admin/products - Non-admin should get 403"""
        payload = {"name": "Test Product", "category": "merch", "price": 10}
        
        response = requests.post(f"{BASE_URL}/api/admin/products", json=payload, headers=regular_user_headers)
        assert response.status_code == 403
        assert "Admin only" in response.json().get("detail", "")
    
    def test_get_admin_products(self, admin_headers):
        """GET /admin/products - List products with summary stats"""
        response = requests.get(f"{BASE_URL}/api/admin/products", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "products" in data
        assert "summary" in data
        assert "total" in data["summary"]
        assert "active" in data["summary"]
        assert "out_of_stock" in data["summary"]
        assert "total_stock" in data["summary"]
        assert "total_sold" in data["summary"]
        
        print(f"Products summary: {data['summary']}")
    
    def test_get_admin_products_filter_category(self, admin_headers):
        """GET /admin/products?category=merch - Filter by category"""
        response = requests.get(f"{BASE_URL}/api/admin/products?category=merch", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        for product in data.get("products", []):
            assert product["category"] == "merch"
    
    def test_update_product(self, admin_headers):
        """PUT /admin/products/{id} - Update product"""
        if not TestProductCRUD.created_product_id:
            pytest.skip("No product to update")
        
        update_payload = {
            "name": "TEST_ITER37 Updated Dive T-Shirt",
            "price": 34.99,
            "stock": 200,
            "in_stock": False
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admin/products/{TestProductCRUD.created_product_id}",
            json=update_payload,
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == update_payload["name"]
        assert data["price"] == update_payload["price"]
        assert data["stock"] == update_payload["stock"]
        assert data["in_stock"] == update_payload["in_stock"]
        
        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/admin/products", headers=admin_headers)
        products = get_response.json().get("products", [])
        updated = next((p for p in products if p["id"] == TestProductCRUD.created_product_id), None)
        assert updated is not None
        assert updated["price"] == 34.99
    
    def test_update_nonexistent_product(self, admin_headers):
        """PUT /admin/products/{id} - Nonexistent product returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/admin/products/nonexistent-id-12345",
            json={"price": 100},
            headers=admin_headers
        )
        assert response.status_code == 404
    
    def test_delete_product(self, admin_headers):
        """DELETE /admin/products/{id} - Delete product"""
        if not TestProductCRUD.created_product_id:
            pytest.skip("No product to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/admin/products/{TestProductCRUD.created_product_id}",
            headers=admin_headers
        )
        assert response.status_code == 200
        assert "deleted" in response.json().get("message", "").lower()
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/admin/products", headers=admin_headers)
        products = get_response.json().get("products", [])
        deleted = next((p for p in products if p["id"] == TestProductCRUD.created_product_id), None)
        assert deleted is None, "Product should be deleted"


class TestImageUpload:
    """Product image upload tests"""
    
    def test_upload_image_as_admin(self, admin_headers):
        """POST /admin/products/upload-image - Upload image file"""
        # Create a minimal valid JPEG file
        jpeg_header = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xFF, 0xD9
        ])
        
        files = {'file': ('test_product.jpg', io.BytesIO(jpeg_header), 'image/jpeg')}
        headers = {"Authorization": admin_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/admin/products/upload-image", files=files, headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "url" in data
        assert data["url"].startswith("/api/uploads/")
        assert "product_" in data["url"]
        print(f"Uploaded image URL: {data['url']}")
    
    def test_upload_image_non_admin(self, regular_user_headers):
        """POST /admin/products/upload-image - Non-admin should get 403"""
        files = {'file': ('test.jpg', io.BytesIO(b'fake image content'), 'image/jpeg')}
        headers = {"Authorization": regular_user_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/admin/products/upload-image", files=files, headers=headers)
        assert response.status_code == 403


class TestPromoCodesCRUD:
    """Promo codes CRUD operations (Admin only)"""
    
    created_promo_id = None
    
    def test_create_promo_percentage(self, admin_headers):
        """POST /admin/promo-codes - Create percentage discount code"""
        payload = {
            "code": "TEST37PERCENT",
            "type": "percentage",
            "value": 15,
            "max_discount": 50,
            "min_order": 20,
            "usage_limit": 100,
            "per_user_limit": 2,
            "applies_to": "all",
            "source": "marketing"
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/promo-codes", json=payload, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["code"] == "TEST37PERCENT"
        assert data["type"] == "percentage"
        assert data["value"] == 15
        assert data["max_discount"] == 50
        assert data["active"] == True
        assert data["used_count"] == 0
        
        TestPromoCodesCRUD.created_promo_id = data["id"]
        print(f"Created promo code: {data['code']} ({data['id']})")
    
    def test_create_promo_flat(self, admin_headers):
        """POST /admin/promo-codes - Create flat discount code"""
        payload = {
            "code": "TEST37FLAT10",
            "type": "flat",
            "value": 10,
            "min_order": 30,
            "usage_limit": 0,  # unlimited
            "per_user_limit": 1,
            "applies_to": "shop",
            "source": "influencer",
            "influencer_name": "@testinfluencer"
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/promo-codes", json=payload, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["code"] == "TEST37FLAT10"
        assert data["type"] == "flat"
        assert data["value"] == 10
        assert data["source"] == "influencer"
        assert data["influencer_name"] == "@testinfluencer"
    
    def test_create_duplicate_promo(self, admin_headers):
        """POST /admin/promo-codes - Duplicate code should return 400"""
        payload = {"code": "TEST37PERCENT", "type": "percentage", "value": 10}
        
        response = requests.post(f"{BASE_URL}/api/admin/promo-codes", json=payload, headers=admin_headers)
        assert response.status_code == 400
        assert "already exists" in response.json().get("detail", "").lower()
    
    def test_create_promo_short_code(self, admin_headers):
        """POST /admin/promo-codes - Code too short should return 400"""
        payload = {"code": "AB", "type": "percentage", "value": 10}
        
        response = requests.post(f"{BASE_URL}/api/admin/promo-codes", json=payload, headers=admin_headers)
        assert response.status_code == 400
        assert "at least 3" in response.json().get("detail", "").lower()
    
    def test_get_promo_codes(self, admin_headers):
        """GET /admin/promo-codes - List codes with summary"""
        response = requests.get(f"{BASE_URL}/api/admin/promo-codes", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "promo_codes" in data
        assert "summary" in data
        assert "total" in data["summary"]
        assert "active" in data["summary"]
        assert "total_uses" in data["summary"]
        
        print(f"Promo codes summary: {data['summary']}")
    
    def test_update_promo_code(self, admin_headers):
        """PUT /admin/promo-codes/{id} - Update/toggle code"""
        if not TestPromoCodesCRUD.created_promo_id:
            pytest.skip("No promo code to update")
        
        update_payload = {"active": False, "value": 20, "usage_limit": 50}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/promo-codes/{TestPromoCodesCRUD.created_promo_id}",
            json=update_payload,
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["active"] == False
        assert data["value"] == 20
        assert data["usage_limit"] == 50
    
    def test_update_nonexistent_promo(self, admin_headers):
        """PUT /admin/promo-codes/{id} - Nonexistent code returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/admin/promo-codes/nonexistent-id-12345",
            json={"active": False},
            headers=admin_headers
        )
        assert response.status_code == 404


class TestPromoValidation:
    """Promo code validation and application tests"""
    
    def test_validate_existing_promo(self, regular_user_headers):
        """POST /promo-codes/validate - Validate DIVE20 code"""
        # DIVE20 is mentioned as existing from manual testing
        payload = {"code": "DIVE20", "order_total": 100, "applies_to": "all"}
        
        response = requests.post(f"{BASE_URL}/api/promo-codes/validate", json=payload, headers=regular_user_headers)
        
        if response.status_code == 404:
            # DIVE20 might not exist, let's try with a test code we created
            pytest.skip("DIVE20 promo code not found, testing with other codes")
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == True
        assert "discount" in data
        assert "final_total" in data
        print(f"DIVE20 validation: discount={data['discount']}, final_total={data['final_total']}")
    
    def test_validate_invalid_promo(self, regular_user_headers):
        """POST /promo-codes/validate - Invalid code returns 404"""
        payload = {"code": "INVALID123XYZ", "order_total": 100, "applies_to": "all"}
        
        response = requests.post(f"{BASE_URL}/api/promo-codes/validate", json=payload, headers=regular_user_headers)
        assert response.status_code == 404
        assert "invalid" in response.json().get("detail", "").lower()
    
    def test_validate_empty_code(self, regular_user_headers):
        """POST /promo-codes/validate - Empty code returns 400"""
        payload = {"code": "", "order_total": 100, "applies_to": "all"}
        
        response = requests.post(f"{BASE_URL}/api/promo-codes/validate", json=payload, headers=regular_user_headers)
        assert response.status_code == 400
        assert "enter" in response.json().get("detail", "").lower()
    
    def test_apply_promo_code(self, regular_user_headers):
        """POST /promo-codes/apply - Record usage after payment"""
        payload = {
            "code": "DIVE20",  # Assuming DIVE20 exists
            "order_id": "test-order-iter37-001",
            "discount": 20
        }
        
        response = requests.post(f"{BASE_URL}/api/promo-codes/apply", json=payload, headers=regular_user_headers)
        
        # Should return applied: true if code exists, applied: false if not
        assert response.status_code == 200
        data = response.json()
        assert "applied" in data
        print(f"Promo apply result: {data}")


class TestVerifiedReviews:
    """Reviews with verified purchase requirement"""
    
    def test_review_without_purchase_rejected(self, regular_user_headers):
        """POST /reviews - Should REJECT if no verified purchase"""
        # Use a listing ID that the test user hasn't booked
        payload = {
            "listing_id": "nonexistent-listing-iter37",
            "rating": 5,
            "comment": "Great dive experience!"
        }
        
        response = requests.post(f"{BASE_URL}/api/reviews", json=payload, headers=regular_user_headers)
        
        # Should get 403 because user hasn't purchased
        assert response.status_code == 403
        assert "purchased" in response.json().get("detail", "").lower() or "verified" in response.json().get("detail", "").lower()
        print(f"Review rejection: {response.json().get('detail')}")
    
    def test_review_invalid_rating(self, regular_user_headers):
        """POST /reviews - Invalid rating returns 400"""
        payload = {
            "listing_id": "test-listing-iter37",
            "rating": 6,  # Invalid - should be 1-5
            "comment": "Test comment"
        }
        
        response = requests.post(f"{BASE_URL}/api/reviews", json=payload, headers=regular_user_headers)
        assert response.status_code == 400
        assert "1-5" in response.json().get("detail", "")


class TestCleanup:
    """Clean up test data"""
    
    def test_cleanup_promo_codes(self, admin_headers):
        """Delete test promo codes"""
        # Get all promo codes
        response = requests.get(f"{BASE_URL}/api/admin/promo-codes", headers=admin_headers)
        if response.status_code != 200:
            return
        
        codes = response.json().get("promo_codes", [])
        for code in codes:
            if code["code"].startswith("TEST37"):
                delete_resp = requests.delete(
                    f"{BASE_URL}/api/admin/promo-codes/{code['id']}",
                    headers=admin_headers
                )
                if delete_resp.status_code == 200:
                    print(f"Cleaned up promo code: {code['code']}")
    
    def test_cleanup_products(self, admin_headers):
        """Delete test products"""
        response = requests.get(f"{BASE_URL}/api/admin/products", headers=admin_headers)
        if response.status_code != 200:
            return
        
        products = response.json().get("products", [])
        for product in products:
            if "TEST_ITER37" in product.get("name", ""):
                delete_resp = requests.delete(
                    f"{BASE_URL}/api/admin/products/{product['id']}",
                    headers=admin_headers
                )
                if delete_resp.status_code == 200:
                    print(f"Cleaned up product: {product['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
