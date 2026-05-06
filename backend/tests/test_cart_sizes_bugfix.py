"""
Test Suite for Cart Quantity +/- Buttons with Sized Products - Bug Fix Validation
Tests the fix for: + button on Product Detail page fails to update cart for items with variants (sizes)
Root cause: update logic sent selectedSize from page UI state instead of actual cart item size

Key scenarios:
1. Add product WITH sizes to cart with specific size
2. + button increments quantity using cart item's actual size
3. - button decrements quantity using cart item's actual size  
4. Cart quantity display updates correctly after +/- operations
5. Products WITHOUT sizes still work correctly
"""
import pytest
import requests
import os
import jwt
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"

# Products for testing
PRODUCT_WITH_SIZES_ID = "4241b6db-428d-4c16-aa63-86e00fd0692b"  # Bottom Time Logo Tee with sizes S,M,L,XL
PRODUCT_WITH_SIZES_2_ID = "7afb7cb8-dedb-4edc-ba80-e46d8ad12345"  # Ocean Explorer Hoodie with sizes S,M,L,XL,XXL
PRODUCT_NO_SIZES_ID = "74566369-6d41-4e1f-a5be-d05e619e94a2"  # Bottom Time Water Bottle - no sizes


def generate_token(user_id: str) -> str:
    """Generate a valid JWT token for testing"""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module")
def auth_headers():
    """Generate auth headers with admin token"""
    token = generate_token(ADMIN_USER_ID)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def clear_cart_before_test(auth_headers):
    """Clear cart before each test to ensure clean state"""
    # Get current cart items
    response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
    if response.status_code == 200:
        items = response.json().get("items", [])
        for item in items:
            requests.delete(f"{BASE_URL}/api/cart/{item['product_id']}", headers=auth_headers)
    yield
    # Cleanup after test
    response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
    if response.status_code == 200:
        items = response.json().get("items", [])
        for item in items:
            requests.delete(f"{BASE_URL}/api/cart/{item['product_id']}", headers=auth_headers)


class TestCartWithSizes:
    """Test cart operations for products WITH sizes/variants - Bug fix validation"""
    
    def test_add_product_with_size_to_cart(self, auth_headers):
        """Test adding a product with specific size to cart"""
        # Add product with size M
        response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=M",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to add product with size: {response.text}"
        
        # Verify cart contains item with correct size
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        assert cart_response.status_code == 200
        cart_data = cart_response.json()
        
        items = cart_data.get("items", [])
        assert len(items) == 1, f"Expected 1 item in cart, got {len(items)}"
        
        item = items[0]
        assert item["product_id"] == PRODUCT_WITH_SIZES_ID
        assert item["size"] == "M", f"Expected size M, got {item.get('size')}"
        assert item["quantity"] == 1
        print(f"Successfully added product with size M, quantity: {item['quantity']}")

    def test_increment_quantity_with_correct_size(self, auth_headers):
        """TEST BUG FIX: + button should increment using cart item's actual size, not UI selectedSize"""
        # Step 1: Add product with size L to cart
        add_response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=L",
            headers=auth_headers
        )
        assert add_response.status_code == 200
        
        # Step 2: Verify initial state - size L, quantity 1
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        cart_data = cart_response.json()
        items = cart_data.get("items", [])
        assert len(items) == 1
        assert items[0]["size"] == "L"
        assert items[0]["quantity"] == 1
        
        # Step 3: Simulate + button click - add 1 with CORRECT size (L) 
        # This is what the fixed code does - uses targetItem.size from cartItemsForProduct
        increment_response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=L",
            headers=auth_headers
        )
        assert increment_response.status_code == 200, f"Failed to increment: {increment_response.text}"
        
        # Step 4: Verify quantity increased to 2, size still L
        cart_response2 = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        cart_data2 = cart_response2.json()
        items2 = cart_data2.get("items", [])
        
        # Should still be 1 item (size L) with quantity 2
        size_l_items = [i for i in items2 if i["size"] == "L"]
        assert len(size_l_items) == 1, f"Expected 1 item with size L, got {len(size_l_items)}"
        assert size_l_items[0]["quantity"] == 2, f"Expected quantity 2, got {size_l_items[0]['quantity']}"
        print(f"+ button correctly incremented size L item to quantity 2")

    def test_increment_with_wrong_size_creates_new_item(self, auth_headers):
        """Verify behavior: Using wrong size creates a NEW cart item (old bug behavior)"""
        # Step 1: Add product with size XL to cart
        add_response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=XL",
            headers=auth_headers
        )
        assert add_response.status_code == 200
        
        # Step 2: Try to increment with WRONG size S (simulating old bug - using selectedSize instead of cart item size)
        # This would happen if UI defaults to first size (S) but cart has XL
        wrong_size_response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=S",
            headers=auth_headers
        )
        assert wrong_size_response.status_code == 200
        
        # Step 3: Verify we now have 2 SEPARATE items - one size XL, one size S
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        cart_data = cart_response.json()
        items = cart_data.get("items", [])
        
        # Find items for our product
        product_items = [i for i in items if i["product_id"] == PRODUCT_WITH_SIZES_ID]
        assert len(product_items) == 2, f"Expected 2 separate cart items (one per size), got {len(product_items)}"
        
        sizes = {i["size"] for i in product_items}
        assert sizes == {"XL", "S"}, f"Expected sizes XL and S, got {sizes}"
        print("Verified: Adding with wrong size creates new cart item instead of incrementing existing")

    def test_decrement_quantity_with_correct_size(self, auth_headers):
        """TEST BUG FIX: - button should decrement using cart item's actual size"""
        # Step 1: Add product with size M, quantity 3
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=3&size=M", headers=auth_headers)
        
        # Verify initial state
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        assert items[0]["quantity"] == 3
        assert items[0]["size"] == "M"
        
        # Step 2: Simulate - button click - update with quantity -1 using CORRECT size
        # Fixed code uses: axios.put(/cart/update?product_id={id}&quantity={qty-1}&size={targetItem.size})
        decrement_response = requests.put(
            f"{BASE_URL}/api/cart/update?product_id={PRODUCT_WITH_SIZES_ID}&quantity=2&size=M",
            headers=auth_headers
        )
        assert decrement_response.status_code == 200, f"Failed to decrement: {decrement_response.text}"
        
        # Step 3: Verify quantity decreased to 2
        cart_response2 = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items2 = cart_response2.json().get("items", [])
        
        size_m_items = [i for i in items2 if i["size"] == "M"]
        assert len(size_m_items) == 1
        assert size_m_items[0]["quantity"] == 2, f"Expected quantity 2, got {size_m_items[0]['quantity']}"
        print(f"- button correctly decremented size M item to quantity 2")

    def test_decrement_with_wrong_size_fails(self, auth_headers):
        """Verify: Decrementing with wrong size returns 404 (item not found)"""
        # Add product with size L
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=2&size=L", headers=auth_headers)
        
        # Try to update with wrong size XL (simulating old bug)
        wrong_size_response = requests.put(
            f"{BASE_URL}/api/cart/update?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=XL",
            headers=auth_headers
        )
        # Should fail because there's no item with size XL
        assert wrong_size_response.status_code == 404, f"Expected 404, got {wrong_size_response.status_code}"
        print("Verified: Updating with wrong size returns 404 (item not in cart)")

    def test_decrement_to_zero_removes_item(self, auth_headers):
        """Test that decrementing to 0 removes the item from cart"""
        # Add item with size S
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=S", headers=auth_headers)
        
        # Decrement to 0 (remove)
        remove_response = requests.put(
            f"{BASE_URL}/api/cart/update?product_id={PRODUCT_WITH_SIZES_ID}&quantity=0&size=S",
            headers=auth_headers
        )
        assert remove_response.status_code == 200
        
        # Verify item is gone
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        size_s_items = [i for i in items if i["product_id"] == PRODUCT_WITH_SIZES_ID and i["size"] == "S"]
        assert len(size_s_items) == 0, "Item should be removed when quantity is 0"
        print("Decrement to 0 correctly removes item from cart")

    def test_multiple_sizes_same_product_in_cart(self, auth_headers):
        """Test handling multiple sizes of same product in cart"""
        # Add same product with different sizes
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=S", headers=auth_headers)
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=2&size=M", headers=auth_headers)
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=3&size=L", headers=auth_headers)
        
        # Verify cart state
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        
        product_items = [i for i in items if i["product_id"] == PRODUCT_WITH_SIZES_ID]
        assert len(product_items) == 3, f"Expected 3 items (one per size), got {len(product_items)}"
        
        # Calculate total quantity across all sizes
        total_qty = sum(i["quantity"] for i in product_items)
        assert total_qty == 6, f"Expected total quantity 6 (1+2+3), got {total_qty}"
        
        # Increment only size M
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=M", headers=auth_headers)
        
        # Verify only M increased
        cart_response2 = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items2 = cart_response2.json().get("items", [])
        product_items2 = [i for i in items2 if i["product_id"] == PRODUCT_WITH_SIZES_ID]
        
        size_m = next((i for i in product_items2 if i["size"] == "M"), None)
        assert size_m["quantity"] == 3, f"Size M should be 3, got {size_m['quantity']}"
        
        size_s = next((i for i in product_items2 if i["size"] == "S"), None)
        assert size_s["quantity"] == 1, f"Size S should still be 1, got {size_s['quantity']}"
        
        print("Multiple sizes in cart handled correctly - only targeted size modified")


class TestCartWithoutSizes:
    """Test cart operations for products WITHOUT sizes still work correctly"""
    
    def test_add_product_without_size(self, auth_headers):
        """Test adding product that has no sizes"""
        response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_NO_SIZES_ID}&quantity=1",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify in cart with no size
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        item = next((i for i in items if i["product_id"] == PRODUCT_NO_SIZES_ID), None)
        
        assert item is not None
        assert item.get("size") is None, f"Product without sizes should have null size, got {item.get('size')}"
        assert item["quantity"] == 1
        print("Product without sizes added successfully")

    def test_increment_product_without_size(self, auth_headers):
        """Test + button works for products without sizes"""
        # Add product
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_NO_SIZES_ID}&quantity=1", headers=auth_headers)
        
        # Increment (no size param needed)
        increment_response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={PRODUCT_NO_SIZES_ID}&quantity=1",
            headers=auth_headers
        )
        assert increment_response.status_code == 200
        
        # Verify quantity is 2
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        item = next((i for i in items if i["product_id"] == PRODUCT_NO_SIZES_ID), None)
        
        assert item["quantity"] == 2
        print("+ button works correctly for products without sizes")

    def test_decrement_product_without_size(self, auth_headers):
        """Test - button works for products without sizes"""
        # Add product with quantity 3
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_NO_SIZES_ID}&quantity=3", headers=auth_headers)
        
        # Decrement (no size param)
        decrement_response = requests.put(
            f"{BASE_URL}/api/cart/update?product_id={PRODUCT_NO_SIZES_ID}&quantity=2",
            headers=auth_headers
        )
        assert decrement_response.status_code == 200
        
        # Verify quantity is 2
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        items = cart_response.json().get("items", [])
        item = next((i for i in items if i["product_id"] == PRODUCT_NO_SIZES_ID), None)
        
        assert item["quantity"] == 2
        print("- button works correctly for products without sizes")


class TestCartTotalCalculation:
    """Test cart total is calculated correctly with sizes"""
    
    def test_cart_total_multiple_sizes(self, auth_headers):
        """Test cart total is sum of all items across sizes"""
        # Add items with different sizes
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=2&size=S", headers=auth_headers)
        requests.post(f"{BASE_URL}/api/cart/add?product_id={PRODUCT_WITH_SIZES_ID}&quantity=1&size=L", headers=auth_headers)
        
        # Get product price
        product_response = requests.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_SIZES_ID}")
        product_price = product_response.json().get("price", 0)
        
        # Get cart total
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        cart_data = cart_response.json()
        
        expected_total = product_price * 3  # 2 + 1 = 3 items
        assert abs(cart_data["total"] - expected_total) < 0.01, f"Expected total {expected_total}, got {cart_data['total']}"
        print(f"Cart total correctly calculated: ${cart_data['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
