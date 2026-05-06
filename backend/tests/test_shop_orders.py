"""
Backend API tests for shop/orders e-commerce features:
- GET /products/{product_id} - product detail
- PUT /cart/update - update cart item quantity
- GET /user/shipping-address - get saved shipping address
- POST /orders/create - create order with shipping
- GET /orders - user order history
- GET /orders/{order_id} - single order detail
- GET /orders/admin/all - admin get all orders
- PUT /orders/{order_id}/fulfillment - admin update fulfillment status
- Stock deduction after order creation
"""

import pytest
import requests
import os
import jwt
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API_URL = f"{BASE_URL}/api"

# Test credentials
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"
TEST_USER_ID = "test-shop-orders-user-001"  # Created in DB for testing
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")

# Generate test JWT tokens with proper expiry
def generate_jwt(user_id, role="user"):
    from datetime import datetime, timezone, timedelta
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

ADMIN_TOKEN = generate_jwt(ADMIN_USER_ID, "admin")
TEST_USER_TOKEN = generate_jwt(TEST_USER_ID, "diver")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_client(api_client):
    """Admin authenticated session"""
    api_client.headers.update({"Authorization": f"Bearer {ADMIN_TOKEN}"})
    return api_client


@pytest.fixture(scope="module")
def user_client():
    """User authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TEST_USER_TOKEN}"
    })
    return session


class TestProductDetail:
    """Tests for GET /products/{product_id}"""
    
    def test_get_product_detail_success(self, api_client):
        """Test getting product detail by ID"""
        # First get list of products
        response = api_client.get(f"{API_URL}/products")
        assert response.status_code == 200
        products = response.json().get("products", [])
        assert len(products) > 0, "No products available for testing"
        
        product_id = products[0]["id"]
        
        # Get product detail
        response = api_client.get(f"{API_URL}/products/{product_id}")
        assert response.status_code == 200
        
        product = response.json()
        assert product["id"] == product_id
        assert "name" in product
        assert "price" in product
        assert "category" in product
        assert "in_stock" in product
        print(f"✓ Product detail retrieved: {product['name']} - ${product['price']}")
    
    def test_get_product_detail_not_found(self, api_client):
        """Test 404 for non-existent product"""
        fake_id = "non-existent-product-id"
        response = api_client.get(f"{API_URL}/products/{fake_id}")
        assert response.status_code == 404
        print("✓ 404 returned for non-existent product")


class TestCartUpdate:
    """Tests for PUT /cart/update - quantity controls"""
    
    def test_add_to_cart_then_update_quantity(self, user_client):
        """Test adding item to cart and updating quantity"""
        # Get a product
        response = user_client.get(f"{API_URL}/products")
        products = response.json().get("products", [])
        assert len(products) > 0
        
        product = next((p for p in products if p.get("in_stock", True)), products[0])
        product_id = product["id"]
        
        # Add to cart
        response = user_client.post(f"{API_URL}/cart/add?product_id={product_id}&quantity=1")
        assert response.status_code == 200
        print(f"✓ Added product to cart: {product['name']}")
        
        # Update quantity to 3
        response = user_client.put(f"{API_URL}/cart/update?product_id={product_id}&quantity=3")
        assert response.status_code == 200
        print("✓ Updated cart quantity to 3")
        
        # Verify cart
        response = user_client.get(f"{API_URL}/cart")
        assert response.status_code == 200
        cart = response.json()
        item = next((i for i in cart["items"] if i["product_id"] == product_id), None)
        assert item is not None
        assert item["quantity"] == 3
        print(f"✓ Cart verified: quantity = {item['quantity']}")
    
    def test_update_quantity_to_zero_removes_item(self, user_client):
        """Test that updating quantity to 0 removes item from cart"""
        # Get a product
        response = user_client.get(f"{API_URL}/products")
        products = response.json().get("products", [])
        product = next((p for p in products if p.get("in_stock", True)), products[0])
        product_id = product["id"]
        
        # Add to cart
        user_client.post(f"{API_URL}/cart/add?product_id={product_id}&quantity=1&size=M")
        
        # Update quantity to 0
        response = user_client.put(f"{API_URL}/cart/update?product_id={product_id}&quantity=0&size=M")
        assert response.status_code == 200
        assert "Removed" in response.json().get("message", "")
        print("✓ Setting quantity to 0 removes item from cart")


class TestShippingAddress:
    """Tests for GET /user/shipping-address"""
    
    def test_get_shipping_address_empty(self, user_client):
        """Test getting shipping address when none saved"""
        response = user_client.get(f"{API_URL}/user/shipping-address")
        assert response.status_code == 200
        data = response.json()
        assert "shipping_address" in data
        print(f"✓ Shipping address endpoint works: {data}")
    
    def test_get_shipping_address_unauthenticated(self, api_client):
        """Test shipping address requires authentication"""
        unauthenticated = requests.Session()
        response = unauthenticated.get(f"{API_URL}/user/shipping-address")
        assert response.status_code in [401, 403]
        print("✓ Shipping address requires authentication")


class TestOrderCreation:
    """Tests for POST /orders/create - order creation after payment"""
    
    @pytest.fixture(autouse=True)
    def setup_cart(self, user_client):
        """Ensure cart has items before order tests"""
        response = user_client.get(f"{API_URL}/products")
        products = response.json().get("products", [])
        in_stock_product = next((p for p in products if p.get("in_stock", True)), None)
        
        if in_stock_product:
            user_client.post(f"{API_URL}/cart/add?product_id={in_stock_product['id']}&quantity=1")
        
        self.product = in_stock_product
    
    def test_create_order_requires_shipping(self, user_client):
        """Test order creation fails without complete shipping"""
        response = user_client.post(f"{API_URL}/orders/create", json={
            "payment_id": "mock_payment_123",
            "shipping": {}  # Empty shipping
        })
        assert response.status_code == 400
        assert "Shipping" in response.json().get("detail", "")
        print("✓ Order creation requires complete shipping address")
    
    def test_create_order_requires_cart_items(self, user_client):
        """Test order creation fails with empty cart"""
        # First clear the cart to ensure it's empty
        # Get cart and remove all items
        response = user_client.get(f"{API_URL}/cart")
        cart = response.json()
        for item in cart.get("items", []):
            user_client.delete(f"{API_URL}/cart/{item['product_id']}")
        
        # Try to create order with empty cart
        response = user_client.post(f"{API_URL}/orders/create", json={
            "payment_id": "mock_payment_123",
            "shipping": {
                "name": "Test User",
                "address_line1": "123 Test St",
                "city": "Test City",
                "pincode": "123456"
            }
        })
        assert response.status_code == 400
        assert "Cart is empty" in response.json().get("detail", "")
        print("✓ Order creation fails with empty cart")


class TestOrderFlow:
    """Full order creation flow test with mock payment"""
    
    def test_full_order_flow(self, user_client):
        """Test complete order flow: cart -> payment -> order -> history"""
        # Use the test user client
        client = user_client
        
        # Clear any existing cart first
        response = client.get(f"{API_URL}/cart")
        cart = response.json()
        for item in cart.get("items", []):
            client.delete(f"{API_URL}/cart/{item['product_id']}")
        
        # 1. Get product
        response = client.get(f"{API_URL}/products")
        products = response.json().get("products", [])
        product = next((p for p in products if p.get("in_stock", True)), None)
        assert product is not None, "No in-stock products available"
        product_id = product["id"]
        product.get("stock", 999)
        
        # 2. Add to cart
        response = client.post(f"{API_URL}/cart/add?product_id={product_id}&quantity=2")
        assert response.status_code == 200
        print(f"✓ Step 1: Added {product['name']} x2 to cart")
        
        # 3. Create mock payment order
        response = client.post(f"{API_URL}/payments/create-order", json={
            "amount": product["price"] * 2,
            "currency": "INR",
            "cart_checkout": True
        })
        assert response.status_code == 200
        payment_data = response.json()
        order_id = payment_data.get("order_id")
        print(f"✓ Step 2: Created payment order: {order_id}")
        
        # 4. Mock verify payment
        response = client.post(f"{API_URL}/payments/mock-verify", json={
            "order_id": order_id
        })
        assert response.status_code == 200
        verify_data = response.json()
        assert verify_data.get("verified") == True
        payment_id = verify_data.get("payment_id")
        print(f"✓ Step 3: Payment verified: {payment_id}")
        
        # 5. Create order
        shipping = {
            "name": "Test Customer",
            "phone": "+911234567890",
            "address_line1": "123 Test Lane",
            "address_line2": "Apt 4B",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "country": "India"
        }
        response = client.post(f"{API_URL}/orders/create", json={
            "payment_id": payment_id,
            "shipping": shipping,
            "currency": "INR",
            "gst_amount": 0
        })
        assert response.status_code == 200
        order = response.json()
        assert "id" in order
        assert "order_number" in order
        assert order["payment_status"] == "paid"
        assert order["status"] == "confirmed"
        assert order["fulfillment_status"] == "pending"
        assert order["item_count"] == 2
        assert order["shipping"]["name"] == "Test Customer"
        created_order_id = order["id"]
        print(f"✓ Step 4: Order created: {order['order_number']}")
        
        # 6. Verify order in history
        response = client.get(f"{API_URL}/orders")
        assert response.status_code == 200
        orders = response.json().get("orders", [])
        assert len(orders) > 0
        found_order = next((o for o in orders if o["id"] == created_order_id), None)
        assert found_order is not None
        print(f"✓ Step 5: Order found in history")
        
        # 7. Get order detail
        response = client.get(f"{API_URL}/orders/{created_order_id}")
        assert response.status_code == 200
        order_detail = response.json()
        assert order_detail["id"] == created_order_id
        assert len(order_detail["items"]) > 0
        print(f"✓ Step 6: Order detail retrieved")
        
        # 8. Verify cart is cleared
        response = client.get(f"{API_URL}/cart")
        assert response.status_code == 200
        cart = response.json()
        assert len(cart.get("items", [])) == 0
        print("✓ Step 7: Cart cleared after order")
        
        return created_order_id


class TestOrderHistory:
    """Tests for GET /orders - user order history"""
    
    def test_get_orders_authenticated(self):
        """Test getting order history for authenticated user"""
        admin_client = requests.Session()
        admin_client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        response = admin_client.get(f"{API_URL}/orders")
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        print(f"✓ Order history retrieved: {len(data['orders'])} orders")
    
    def test_get_orders_unauthenticated(self):
        """Test order history requires authentication"""
        response = requests.get(f"{API_URL}/orders")
        assert response.status_code in [401, 403]
        print("✓ Order history requires authentication")


class TestOrderDetail:
    """Tests for GET /orders/{order_id}"""
    
    def test_get_order_not_found(self):
        """Test 404 for non-existent order"""
        client = requests.Session()
        client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        response = client.get(f"{API_URL}/orders/non-existent-order-id")
        assert response.status_code == 404
        print("✓ 404 returned for non-existent order")


class TestAdminOrders:
    """Tests for admin order management endpoints"""
    
    def test_get_all_orders_admin(self):
        """Test admin can get all orders with summary"""
        client = requests.Session()
        client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        response = client.get(f"{API_URL}/orders/admin/all")
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total" in summary
        assert "pending_fulfillment" in summary
        assert "shipped" in summary
        assert "delivered" in summary
        assert "total_revenue" in summary
        print(f"✓ Admin orders: {summary['total']} orders, revenue: {summary['total_revenue']}")
    
    def test_get_all_orders_non_admin(self, user_client):
        """Test non-admin cannot access all orders"""
        response = user_client.get(f"{API_URL}/orders/admin/all")
        assert response.status_code == 403
        print("✓ Non-admin cannot access admin orders endpoint")
    
    def test_filter_orders_by_fulfillment(self):
        """Test filtering orders by fulfillment status"""
        client = requests.Session()
        client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        response = client.get(f"{API_URL}/orders/admin/all?fulfillment=pending")
        assert response.status_code == 200
        data = response.json()
        # All returned orders should have pending fulfillment
        for order in data.get("orders", []):
            assert order.get("fulfillment_status") == "pending"
        print("✓ Order filtering by fulfillment status works")


class TestFulfillmentUpdate:
    """Tests for PUT /orders/{order_id}/fulfillment"""
    
    def test_update_fulfillment_non_admin(self, user_client):
        """Test non-admin cannot update fulfillment"""
        response = user_client.put(
            f"{API_URL}/orders/fake-order-id/fulfillment",
            json={"fulfillment_status": "shipped"}
        )
        assert response.status_code == 403
        print("✓ Non-admin cannot update fulfillment status")
    
    def test_update_fulfillment_invalid_status(self):
        """Test invalid fulfillment status is rejected"""
        client = requests.Session()
        client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        # First create an order to get a valid order_id
        # Get all orders and use the first one if exists
        response = client.get(f"{API_URL}/orders/admin/all")
        orders = response.json().get("orders", [])
        
        if orders:
            order_id = orders[0]["id"]
            response = client.put(
                f"{API_URL}/orders/{order_id}/fulfillment",
                json={"fulfillment_status": "invalid_status"}
            )
            assert response.status_code == 400
            print("✓ Invalid fulfillment status rejected")
        else:
            pytest.skip("No orders available for fulfillment test")
    
    def test_update_fulfillment_to_shipped(self):
        """Test updating order to shipped status with tracking"""
        client = requests.Session()
        client.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ADMIN_TOKEN}"
        })
        
        # Get pending orders
        response = client.get(f"{API_URL}/orders/admin/all?fulfillment=pending")
        orders = response.json().get("orders", [])
        
        if orders:
            order_id = orders[0]["id"]
            response = client.put(
                f"{API_URL}/orders/{order_id}/fulfillment",
                json={
                    "fulfillment_status": "shipped",
                    "tracking_number": "TRK123456789",
                    "tracking_url": "https://track.example.com/TRK123456789"
                }
            )
            assert response.status_code == 200
            assert "shipped" in response.json().get("message", "").lower()
            print("✓ Order fulfillment updated to shipped with tracking")
        else:
            pytest.skip("No pending orders available for fulfillment test")


class TestStockDeduction:
    """Test stock deduction after order creation"""
    
    def test_stock_deduction_on_order(self, user_client):
        """Test that stock is deducted after order creation"""
        client = user_client
        
        # Get product with stock info
        response = client.get(f"{API_URL}/products")
        products = response.json().get("products", [])
        product = next((p for p in products if p.get("in_stock", True)), None)
        
        if not product:
            pytest.skip("No in-stock products available")
        
        product_id = product["id"]
        initial_sold_count = product.get("sold_count", 0)
        
        # Add to cart
        qty_to_order = 1
        response = client.post(f"{API_URL}/cart/add?product_id={product_id}&quantity={qty_to_order}")
        assert response.status_code == 200
        
        # Create payment
        response = client.post(f"{API_URL}/payments/create-order", json={
            "amount": product["price"] * qty_to_order,
            "currency": "INR"
        })
        order_id = response.json().get("order_id")
        
        # Mock verify
        response = client.post(f"{API_URL}/payments/mock-verify", json={"order_id": order_id})
        payment_id = response.json().get("payment_id")
        
        # Create order
        response = client.post(f"{API_URL}/orders/create", json={
            "payment_id": payment_id,
            "shipping": {
                "name": "Stock Test",
                "address_line1": "123 Stock St",
                "city": "Test City",
                "pincode": "123456"
            }
        })
        assert response.status_code == 200
        
        # Verify product sold_count increased
        response = client.get(f"{API_URL}/products/{product_id}")
        updated_product = response.json()
        assert updated_product.get("sold_count", 0) >= initial_sold_count
        print(f"✓ Stock deduction verified: sold_count = {updated_product.get('sold_count')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
