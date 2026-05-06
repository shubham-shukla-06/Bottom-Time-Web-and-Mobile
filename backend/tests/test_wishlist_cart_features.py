"""
Test Suite for Wishlist and Cart Features - Iteration 42
Tests: Product wishlist toggle, get wishlist IDs (products + listings), 
       save-for-later, move-to-cart, get saved-for-later, remove saved-for-later
"""
import pytest
import requests
import os
import jwt
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
JWT_SECRET = os.environ.get("JWT_SECRET", "bottomtime-jwt-secret-change-in-production")
ADMIN_USER_ID = "0455b019-66e5-4646-8d6b-bc6298ce7afe"


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


@pytest.fixture(scope="module")
def sample_product_id():
    """Get a sample product ID from the shop"""
    response = requests.get(f"{BASE_URL}/api/products?limit=1")
    assert response.status_code == 200, f"Failed to get products: {response.text}"
    products = response.json().get("products", [])
    assert len(products) > 0, "No products found in shop"
    return products[0]["id"]


class TestProductWishlist:
    """Test product wishlist endpoints"""
    
    def test_toggle_wishlist_add(self, auth_headers, sample_product_id):
        """Test adding product to wishlist via toggle"""
        response = requests.post(
            f"{BASE_URL}/api/wishlist/product/{sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to toggle wishlist: {response.text}"
        data = response.json()
        assert "wishlisted" in data, "Response should contain 'wishlisted' field"
        print(f"Toggle wishlist result: wishlisted={data['wishlisted']}")
    
    def test_get_wishlist_ids_includes_product_ids(self, auth_headers):
        """Test GET /wishlist/ids returns product_ids array"""
        response = requests.get(
            f"{BASE_URL}/api/wishlist/ids",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get wishlist ids: {response.text}"
        data = response.json()
        assert "listing_ids" in data, "Response should contain 'listing_ids'"
        assert "product_ids" in data, "Response should contain 'product_ids'"
        print(f"Wishlist IDs: {len(data['listing_ids'])} listings, {len(data['product_ids'])} products")
    
    def test_get_product_wishlist(self, auth_headers):
        """Test GET /wishlist/products returns products"""
        response = requests.get(
            f"{BASE_URL}/api/wishlist/products",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get product wishlist: {response.text}"
        data = response.json()
        assert "products" in data, "Response should contain 'products'"
        assert "product_ids" in data, "Response should contain 'product_ids'"
        print(f"Product wishlist: {len(data['products'])} products")
    
    def test_toggle_wishlist_remove(self, auth_headers, sample_product_id):
        """Test removing product from wishlist via toggle"""
        # First ensure it's in wishlist
        requests.post(f"{BASE_URL}/api/wishlist/product/{sample_product_id}", headers=auth_headers)
        
        # Toggle again to remove
        response = requests.post(
            f"{BASE_URL}/api/wishlist/product/{sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to toggle wishlist: {response.text}"
        data = response.json()
        print(f"After second toggle: wishlisted={data['wishlisted']}")
    
    def test_wishlist_invalid_product(self, auth_headers):
        """Test wishlist with invalid product ID returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/wishlist/product/invalid-product-id-12345",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for invalid product: {response.status_code}"


class TestSaveForLater:
    """Test save-for-later cart functionality"""
    
    @pytest.fixture(autouse=True)
    def setup_cart_item(self, auth_headers, sample_product_id):
        """Ensure product is in cart before save-for-later tests"""
        # Add product to cart
        response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={sample_product_id}&quantity=1",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to add to cart: {response.text}"
        self.product_id = sample_product_id
        self.auth_headers = auth_headers
    
    def test_save_for_later(self, auth_headers, sample_product_id):
        """Test POST /cart/save-for-later removes from cart and adds to saved"""
        response = requests.post(
            f"{BASE_URL}/api/cart/save-for-later?product_id={sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to save for later: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        print(f"Save for later: {data['message']}")
    
    def test_get_saved_for_later(self, auth_headers):
        """Test GET /cart/saved-for-later returns saved items with product details"""
        response = requests.get(
            f"{BASE_URL}/api/cart/saved-for-later",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get saved items: {response.text}"
        data = response.json()
        assert "items" in data, "Response should contain 'items'"
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "product_id" in item, "Saved item should have product_id"
            assert "product" in item, "Saved item should have enriched product data"
        print(f"Saved for later: {len(data['items'])} items")
    
    def test_move_to_cart(self, auth_headers, sample_product_id):
        """Test POST /cart/move-to-cart moves from saved back to cart"""
        # First save the item
        requests.post(
            f"{BASE_URL}/api/cart/save-for-later?product_id={sample_product_id}",
            headers=auth_headers
        )
        
        # Move back to cart
        response = requests.post(
            f"{BASE_URL}/api/cart/move-to-cart?product_id={sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to move to cart: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        print(f"Move to cart: {data['message']}")
        
        # Verify item is in cart
        cart_response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        cart_data = cart_response.json()
        product_ids_in_cart = [item["product_id"] for item in cart_data.get("items", [])]
        assert sample_product_id in product_ids_in_cart, "Product should be in cart after move"
    
    def test_remove_saved_for_later(self, auth_headers, sample_product_id):
        """Test DELETE /cart/saved-for-later/{product_id} removes from saved"""
        # First save the item
        requests.post(
            f"{BASE_URL}/api/cart/save-for-later?product_id={sample_product_id}",
            headers=auth_headers
        )
        
        # Remove from saved
        response = requests.delete(
            f"{BASE_URL}/api/cart/saved-for-later/{sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to remove saved item: {response.text}"
    
    def test_move_to_cart_not_in_saved(self, auth_headers):
        """Test move-to-cart returns 404 if item not in saved list"""
        response = requests.post(
            f"{BASE_URL}/api/cart/move-to-cart?product_id=nonexistent-product-12345",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-saved item: {response.status_code}"


class TestCartOperations:
    """Test basic cart operations still work"""
    
    def test_get_cart(self, auth_headers):
        """Test GET /cart returns cart with items"""
        response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get cart: {response.text}"
        data = response.json()
        assert "items" in data, "Cart should have 'items'"
        assert "total" in data, "Cart should have 'total'"
        print(f"Cart: {len(data['items'])} items, total: ${data['total']}")
    
    def test_add_to_cart(self, auth_headers, sample_product_id):
        """Test POST /cart/add adds product to cart"""
        response = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={sample_product_id}&quantity=1",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to add to cart: {response.text}"
    
    def test_update_cart_quantity(self, auth_headers, sample_product_id):
        """Test PUT /cart/update changes quantity"""
        # First add item
        requests.post(
            f"{BASE_URL}/api/cart/add?product_id={sample_product_id}&quantity=1",
            headers=auth_headers
        )
        
        # Update quantity
        response = requests.put(
            f"{BASE_URL}/api/cart/update?product_id={sample_product_id}&quantity=2",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update cart: {response.text}"
    
    def test_remove_from_cart(self, auth_headers, sample_product_id):
        """Test DELETE /cart/{product_id} removes item"""
        # Ensure item is in cart
        requests.post(
            f"{BASE_URL}/api/cart/add?product_id={sample_product_id}&quantity=1",
            headers=auth_headers
        )
        
        # Remove item
        response = requests.delete(
            f"{BASE_URL}/api/cart/{sample_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to remove from cart: {response.text}"


class TestCurrencySelector:
    """Test currency/exchange rate endpoints"""
    
    def test_get_exchange_rates(self):
        """Test GET /exchange-rates returns rates"""
        response = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert response.status_code == 200, f"Failed to get exchange rates: {response.text}"
        data = response.json()
        assert "rates" in data, "Response should contain 'rates'"
        assert "USD" in data["rates"], "USD should be in rates"
        print(f"Exchange rates: {list(data['rates'].keys())}")


class TestCleanup:
    """Cleanup test data after tests"""
    
    def test_cleanup_cart(self, auth_headers):
        """Clear cart after tests"""
        # Get cart items
        response = requests.get(f"{BASE_URL}/api/cart", headers=auth_headers)
        if response.status_code == 200:
            items = response.json().get("items", [])
            for item in items:
                requests.delete(f"{BASE_URL}/api/cart/{item['product_id']}", headers=auth_headers)
        print("Cart cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
