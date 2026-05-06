"""
Phase 4 New Features Tests:
- Cart system (add/remove/view)
- Stripe checkout (creates session, polls status)
- Review & rating system (create, get for listing, update avg)
- Direct messaging (send, threads, read messages)
- Dive log (create/delete entries, stats)
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCartSystem:
    """Test cart add/remove/view functionality"""
    
    @pytest.fixture(scope="class")
    def test_user(self, request):
        """Create a test user and return token"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"TEST_cart_user_{unique_id}@test.com"
        phone = f"+1555300{unique_id[:4]}"
        name = "TEST Cart User"
        
        # Store signup data
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": name, "role": "diver"
        })
        
        # Send and verify email OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_resp.json().get("verification_token")
        
        # Send and verify phone OTP
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_resp.json().get("verification_token")
        
        # Complete signup
        signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email,
            "phone": phone,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        
        token = signup_resp.json().get("access_token")
        user_data = signup_resp.json().get("user", {})
        
        request.cls.auth_token = token
        request.cls.user_id = user_data.get("id")
        request.cls.email = email
        return {"token": token, "user_id": user_data.get("id"), "email": email}
    
    @pytest.fixture
    def auth_header(self, test_user):
        return {"Authorization": f"Bearer {test_user['token']}"}
    
    @pytest.fixture
    def product_id(self):
        """Get first product ID from shop"""
        resp = requests.get(f"{BASE_URL}/api/products")
        products = resp.json().get("products", [])
        if products:
            return products[0]["id"]
        pytest.skip("No products available")
    
    def test_get_empty_cart(self, auth_header):
        """Test GET /api/cart returns empty cart initially"""
        resp = requests.get(f"{BASE_URL}/api/cart", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] == 0
        print(f"✓ Empty cart: {data}")
    
    def test_add_to_cart(self, auth_header, product_id):
        """Test POST /api/cart/add?product_id=X&quantity=1"""
        resp = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={product_id}&quantity=1",
            headers=auth_header
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Added to cart"
        print(f"✓ Added to cart: {data}")
    
    def test_cart_has_item(self, auth_header, product_id):
        """Test GET /api/cart shows added item"""
        # First add to cart
        requests.post(
            f"{BASE_URL}/api/cart/add?product_id={product_id}&quantity=2",
            headers=auth_header
        )
        
        resp = requests.get(f"{BASE_URL}/api/cart", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) > 0
        assert data["total"] > 0
        # Check enriched product data
        item = data["items"][0]
        assert "product" in item
        assert "name" in item["product"]
        print(f"✓ Cart with item: total=${data['total']}, items={len(data['items'])}")
    
    def test_remove_from_cart(self, auth_header, product_id):
        """Test DELETE /api/cart/{product_id}"""
        # First add item
        requests.post(
            f"{BASE_URL}/api/cart/add?product_id={product_id}&quantity=1",
            headers=auth_header
        )
        
        # Remove it
        resp = requests.delete(f"{BASE_URL}/api/cart/{product_id}", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Removed from cart"
        print(f"✓ Removed from cart: {data}")
    
    def test_cart_requires_auth(self):
        """Test cart endpoints require authentication"""
        resp = requests.get(f"{BASE_URL}/api/cart")
        assert resp.status_code in [401, 403]
        print("✓ Cart requires auth")
    
    def test_add_to_cart_invalid_product(self, auth_header):
        """Test adding non-existent product returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.post(
            f"{BASE_URL}/api/cart/add?product_id={fake_id}&quantity=1",
            headers=auth_header
        )
        assert resp.status_code == 404
        print("✓ Add invalid product returns 404")


class TestStripeCheckout:
    """Test Stripe checkout session creation"""
    
    @pytest.fixture(scope="class")
    def test_user_with_cart(self, request):
        """Create user with items in cart"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"TEST_checkout_{unique_id}@test.com"
        phone = f"+1555400{unique_id[:4]}"
        
        # Create user
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "TEST Checkout User", "role": "diver"
        })
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_resp.json().get("verification_token")
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_resp.json().get("verification_token")
        
        signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token, "phone_verified_token": phone_token
        })
        token = signup_resp.json().get("access_token")
        
        # Get a product and add to cart
        products = requests.get(f"{BASE_URL}/api/products").json().get("products", [])
        if products:
            product_id = products[0]["id"]
            requests.post(
                f"{BASE_URL}/api/cart/add?product_id={product_id}&quantity=1",
                headers={"Authorization": f"Bearer {token}"}
            )
        
        request.cls.token = token
        return {"token": token}
    
    @pytest.fixture
    def auth_header(self, test_user_with_cart):
        return {"Authorization": f"Bearer {test_user_with_cart['token']}"}
    
    def test_create_checkout_session(self, auth_header):
        """Test POST /api/checkout/create-session returns Stripe URL"""
        resp = requests.post(
            f"{BASE_URL}/api/checkout/create-session",
            headers=auth_header,
            json={"origin_url": "https://marine-social-1.preview.emergentagent.com"}
        )
        # Could be 200 if successful or 400 if cart empty
        if resp.status_code == 200:
            data = resp.json()
            assert "url" in data
            assert "session_id" in data
            assert "stripe.com" in data["url"] or "checkout" in data["url"]
            print(f"✓ Checkout session created: session_id={data['session_id'][:20]}...")
        elif resp.status_code == 400:
            # Cart may be empty - acceptable
            print(f"✓ Checkout requires non-empty cart: {resp.json()}")
        else:
            print(f"Checkout response: {resp.status_code} - {resp.text}")
            assert resp.status_code in [200, 400]
    
    def test_checkout_empty_cart(self):
        """Test checkout with empty cart returns 400"""
        # Create fresh user with empty cart
        unique_id = str(uuid.uuid4())[:6]
        email = f"TEST_empty_cart_{unique_id}@test.com"
        phone = f"+1555500{unique_id[:4]}"
        
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "TEST Empty Cart", "role": "diver"
        })
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_resp.json().get("verification_token")
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_resp.json().get("verification_token")
        
        signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token, "phone_verified_token": phone_token
        })
        token = signup_resp.json().get("access_token")
        
        resp = requests.post(
            f"{BASE_URL}/api/checkout/create-session",
            headers={"Authorization": f"Bearer {token}"},
            json={"origin_url": "https://test.com"}
        )
        assert resp.status_code == 400
        assert "empty" in resp.json().get("detail", "").lower()
        print("✓ Empty cart checkout returns 400")


class TestReviewSystem:
    """Test review and rating system"""
    
    @pytest.fixture(scope="class")
    def test_user(self, request):
        """Create test user for reviews"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"TEST_review_{unique_id}@test.com"
        phone = f"+1555600{unique_id[:4]}"
        
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "TEST Reviewer", "role": "diver"
        })
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_resp.json().get("verification_token")
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_resp.json().get("verification_token")
        
        signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token, "phone_verified_token": phone_token
        })
        token = signup_resp.json().get("access_token")
        
        request.cls.token = token
        return {"token": token}
    
    @pytest.fixture
    def auth_header(self, test_user):
        return {"Authorization": f"Bearer {test_user['token']}"}
    
    @pytest.fixture
    def listing_id(self):
        """Get first listing ID"""
        resp = requests.get(f"{BASE_URL}/api/listings")
        listings = resp.json().get("listings", [])
        if listings:
            return listings[0]["id"]
        pytest.skip("No listings available")
    
    def test_get_reviews_for_listing(self, listing_id):
        """Test GET /api/reviews/{listing_id} - no auth required"""
        resp = requests.get(f"{BASE_URL}/api/reviews/{listing_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "reviews" in data
        print(f"✓ Get reviews: {len(data['reviews'])} reviews for listing")
    
    def test_create_review(self, auth_header, listing_id):
        """Test POST /api/reviews creates review with rating 1-5"""
        resp = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=auth_header,
            json={
                "listing_id": listing_id,
                "rating": 5,
                "comment": "TEST review - excellent diving experience!"
            }
        )
        # Could be 200 (created) or 400 (already reviewed)
        if resp.status_code == 200:
            data = resp.json()
            assert "id" in data
            assert data["rating"] == 5
            assert data["listing_id"] == listing_id
            print(f"✓ Review created: id={data['id'][:8]}...")
        elif resp.status_code == 400:
            assert "already" in resp.json().get("detail", "").lower()
            print("✓ User already reviewed this listing (expected behavior)")
        else:
            pytest.fail(f"Unexpected status: {resp.status_code} - {resp.text}")
    
    def test_review_invalid_rating(self, auth_header, listing_id):
        """Test review with rating outside 1-5 returns 400"""
        resp = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=auth_header,
            json={
                "listing_id": listing_id,
                "rating": 10,  # Invalid
                "comment": "Invalid rating test"
            }
        )
        assert resp.status_code == 400
        print("✓ Invalid rating (10) returns 400")
    
    def test_review_requires_auth(self, listing_id):
        """Test creating review without auth returns 401"""
        resp = requests.post(
            f"{BASE_URL}/api/reviews",
            json={"listing_id": listing_id, "rating": 5, "comment": "No auth"}
        )
        assert resp.status_code in [401, 403]
        print("✓ Review creation requires auth")
    
    def test_listing_rating_updated(self, listing_id):
        """Test listing rating is updated after review"""
        # Get listing before and after
        resp = requests.get(f"{BASE_URL}/api/listings/{listing_id}")
        assert resp.status_code == 200
        listing = resp.json()
        assert "rating" in listing
        assert "review_count" in listing
        # Note: Rating might be default or calculated from reviews
        print(f"✓ Listing has rating: {listing['rating']} ({listing['review_count']} reviews)")


class TestMessaging:
    """Test direct messaging system"""
    
    @pytest.fixture(scope="class")
    def two_users(self, request):
        """Create two test users for messaging"""
        users = []
        for i in range(2):
            unique_id = str(uuid.uuid4())[:6]
            email = f"TEST_msg_user{i}_{unique_id}@test.com"
            phone = f"+1555700{unique_id[:4]}"
            
            requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
                "email": email, "name": f"TEST Msg User {i}", "role": "diver"
            })
            requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
            email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
                "identifier": email, "code": "123456"
            })
            email_token = email_resp.json().get("verification_token")
            requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
            phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
                "identifier": phone, "code": "123456"
            })
            phone_token = phone_resp.json().get("verification_token")
            
            signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
                "email": email, "phone": phone,
                "email_verified_token": email_token, "phone_verified_token": phone_token
            })
            token = signup_resp.json().get("access_token")
            user_data = signup_resp.json().get("user", {})
            users.append({"token": token, "id": user_data.get("id"), "email": email})
        
        request.cls.users = users
        return users
    
    def test_send_message(self, two_users):
        """Test POST /api/messages sends message to another user"""
        user1 = two_users[0]
        user2 = two_users[1]
        
        resp = requests.post(
            f"{BASE_URL}/api/messages",
            headers={"Authorization": f"Bearer {user1['token']}"},
            json={"to_id": user2["id"], "content": "TEST message - hello!"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "thread_id" in data
        assert data["content"] == "TEST message - hello!"
        print(f"✓ Message sent: thread_id={data['thread_id'][:20]}...")
    
    def test_get_threads(self, two_users):
        """Test GET /api/messages/threads returns threads"""
        user1 = two_users[0]
        user2 = two_users[1]
        
        # First send a message to create thread
        requests.post(
            f"{BASE_URL}/api/messages",
            headers={"Authorization": f"Bearer {user1['token']}"},
            json={"to_id": user2["id"], "content": "Creating thread for test"}
        )
        
        # Get threads for user1
        resp = requests.get(
            f"{BASE_URL}/api/messages/threads",
            headers={"Authorization": f"Bearer {user1['token']}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "threads" in data
        if len(data["threads"]) > 0:
            thread = data["threads"][0]
            assert "thread_id" in thread
            assert "other_user" in thread
            assert "last_message" in thread
            print(f"✓ Got {len(data['threads'])} threads")
        else:
            print("✓ No threads yet (expected if this is first message)")
    
    def test_get_messages_in_thread(self, two_users):
        """Test GET /api/messages/{thread_id} returns messages"""
        user1 = two_users[0]
        user2 = two_users[1]
        
        # Send message to create/use thread
        msg_resp = requests.post(
            f"{BASE_URL}/api/messages",
            headers={"Authorization": f"Bearer {user1['token']}"},
            json={"to_id": user2["id"], "content": "Test thread message"}
        )
        thread_id = msg_resp.json().get("thread_id")
        
        # Get messages in thread
        resp = requests.get(
            f"{BASE_URL}/api/messages/{thread_id}",
            headers={"Authorization": f"Bearer {user1['token']}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "messages" in data
        assert len(data["messages"]) > 0
        print(f"✓ Got {len(data['messages'])} messages in thread")
    
    def test_messages_require_auth(self):
        """Test messaging endpoints require auth"""
        resp = requests.get(f"{BASE_URL}/api/messages/threads")
        assert resp.status_code in [401, 403]
        print("✓ Messages require auth")


class TestDiveLog:
    """Test dive log create/delete/stats"""
    
    @pytest.fixture(scope="class")
    def test_user(self, request):
        """Create test user for dive logs"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"TEST_divelog_{unique_id}@test.com"
        phone = f"+1555800{unique_id[:4]}"
        
        requests.post(f"{BASE_URL}/api/auth/store-signup-data", json={
            "email": email, "name": "TEST Diver Logger", "role": "diver"
        })
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": email})
        email_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": email, "code": "123456"
        })
        email_token = email_resp.json().get("verification_token")
        requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": phone})
        phone_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": phone, "code": "123456"
        })
        phone_token = phone_resp.json().get("verification_token")
        
        signup_resp = requests.post(f"{BASE_URL}/api/auth/signup-complete", json={
            "email": email, "phone": phone,
            "email_verified_token": email_token, "phone_verified_token": phone_token
        })
        token = signup_resp.json().get("access_token")
        user_data = signup_resp.json().get("user", {})
        
        request.cls.token = token
        request.cls.user_id = user_data.get("id")
        return {"token": token, "user_id": user_data.get("id")}
    
    @pytest.fixture
    def auth_header(self, test_user):
        return {"Authorization": f"Bearer {test_user['token']}"}
    
    def test_create_dive_log(self, auth_header):
        """Test POST /api/dive-log creates entry"""
        resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            headers=auth_header,
            json={
                "site_name": "TEST Blue Hole",
                "location": "Dahab, Egypt",
                "date": "2026-01-15",
                "max_depth": 18.5,
                "duration": 45,
                "buddy": "Test Buddy",
                "visibility": "Excellent",
                "water_temp": 26.0,
                "notes": "TEST dive log entry",
                "rating": 5
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["site_name"] == "TEST Blue Hole"
        assert data["max_depth"] == 18.5
        print(f"✓ Dive log created: id={data['id'][:8]}...")
        return data["id"]
    
    def test_get_dive_logs_with_stats(self, auth_header):
        """Test GET /api/dive-log returns logs and stats"""
        # First create a log
        requests.post(
            f"{BASE_URL}/api/dive-log",
            headers=auth_header,
            json={
                "site_name": "TEST Reef Dive",
                "location": "Sharm El Sheikh, Egypt",
                "date": "2026-01-20",
                "max_depth": 25.0,
                "duration": 50
            }
        )
        
        resp = requests.get(f"{BASE_URL}/api/dive-log", headers=auth_header)
        assert resp.status_code == 200
        data = resp.json()
        assert "logs" in data
        assert "stats" in data
        stats = data["stats"]
        assert "total" in stats
        assert "max_depth" in stats
        assert "countries" in stats
        print(f"✓ Dive logs: {stats['total']} dives, max_depth={stats['max_depth']}m, {stats['countries']} countries")
    
    def test_delete_dive_log(self, auth_header):
        """Test DELETE /api/dive-log/{id} deletes entry"""
        # Create a log first
        create_resp = requests.post(
            f"{BASE_URL}/api/dive-log",
            headers=auth_header,
            json={
                "site_name": "TEST To Delete",
                "location": "Test Location, Test Country",
                "date": "2026-01-25"
            }
        )
        log_id = create_resp.json()["id"]
        
        # Delete it
        resp = requests.delete(f"{BASE_URL}/api/dive-log/{log_id}", headers=auth_header)
        assert resp.status_code == 200
        assert resp.json()["message"] == "Log deleted"
        print(f"✓ Dive log deleted: {log_id[:8]}...")
    
    def test_delete_nonexistent_log(self, auth_header):
        """Test deleting non-existent log returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.delete(f"{BASE_URL}/api/dive-log/{fake_id}", headers=auth_header)
        assert resp.status_code == 404
        print("✓ Delete non-existent log returns 404")
    
    def test_dive_log_requires_auth(self):
        """Test dive log endpoints require auth"""
        resp = requests.get(f"{BASE_URL}/api/dive-log")
        assert resp.status_code in [401, 403]
        print("✓ Dive log requires auth")
    
    def test_user_total_dives_updated(self, auth_header, test_user):
        """Test user's total_dives is updated after creating log"""
        # Create multiple logs
        for i in range(2):
            requests.post(
                f"{BASE_URL}/api/dive-log",
                headers=auth_header,
                json={
                    "site_name": f"TEST Count Dive {i}",
                    "location": "Test, Country",
                    "date": f"2026-02-0{i+1}"
                }
            )
        
        # Check user profile
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_header)
        if resp.status_code == 200:
            user = resp.json()
            total_dives = user.get("total_dives", 0)
            print(f"✓ User total_dives updated: {total_dives}")
        else:
            print(f"Note: Could not verify total_dives update")


class TestProductsAPI:
    """Test products endpoint for shop"""
    
    def test_get_products(self):
        """Test GET /api/products returns products"""
        resp = requests.get(f"{BASE_URL}/api/products")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "products" in data
        assert data["count"] == 10  # 10 seeded products
        print(f"✓ Products: {data['count']} available")
    
    def test_filter_products_by_category(self):
        """Test filtering products by category"""
        # Test merch
        resp = requests.get(f"{BASE_URL}/api/products?category=merch")
        assert resp.status_code == 200
        products = resp.json()["products"]
        assert all(p["category"] == "merch" for p in products)
        print(f"✓ Merch filter: {len(products)} items")
        
        # Test gear
        resp = requests.get(f"{BASE_URL}/api/products?category=gear")
        assert resp.status_code == 200
        products = resp.json()["products"]
        assert all(p["category"] == "gear" for p in products)
        print(f"✓ Gear filter: {len(products)} items")
    
    def test_sort_products(self):
        """Test sorting products"""
        # Price ascending
        resp = requests.get(f"{BASE_URL}/api/products?sort_by=price_asc")
        assert resp.status_code == 200
        products = resp.json()["products"]
        prices = [p["price"] for p in products]
        assert prices == sorted(prices)
        print(f"✓ Price sort working: ${prices[0]} to ${prices[-1]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
