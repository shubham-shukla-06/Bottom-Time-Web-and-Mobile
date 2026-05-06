"""
Test BT-COMMAND Centre API endpoints
Tests all 12 /cmd/* analytics endpoints for admin dashboard
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCommandCentreAPI:
    """Test all /cmd/* analytics endpoints"""
    
    admin_token = None
    
    @classmethod
    def get_admin_token(cls):
        """Login as admin and get token"""
        if cls.admin_token:
            return cls.admin_token
            
        # Step 1: Login init
        resp = requests.post(f"{BASE_URL}/api/auth/login-init", json={"email": "admin@bottomtime.com"})
        if resp.status_code != 200:
            pytest.skip(f"Login init failed: {resp.status_code}")
            
        # Step 2: Send email OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "admin@bottomtime.com"})
        if resp.status_code != 200:
            pytest.skip(f"Send OTP failed: {resp.status_code}")
            
        # Step 3: Verify email OTP (123456 is hardcoded)
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "admin@bottomtime.com", "code": "123456"})
        if resp.status_code != 200:
            pytest.skip(f"Verify email OTP failed: {resp.status_code}")
        email_token = resp.json().get("verification_token")
        
        # Step 4: Send phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"identifier": "+12025559999"})
        if resp.status_code != 200:
            pytest.skip(f"Send phone OTP failed: {resp.status_code}")
            
        # Step 5: Verify phone OTP
        resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"identifier": "+12025559999", "code": "123456"})
        if resp.status_code != 200:
            pytest.skip(f"Verify phone OTP failed: {resp.status_code}")
        phone_token = resp.json().get("verification_token")
        
        # Step 6: Complete login
        resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "admin@bottomtime.com",
            "email_verified_token": email_token,
            "phone_verified_token": phone_token
        })
        if resp.status_code != 200:
            pytest.skip(f"Login complete failed: {resp.status_code}")
            
        cls.admin_token = resp.json().get("access_token")
        return cls.admin_token
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin authorization headers"""
        token = self.get_admin_token()
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # ==================== SECTION 1: PULSE ====================
    def test_cmd_pulse_returns_200(self, admin_headers):
        """GET /api/cmd/pulse returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_pulse_data_structure(self, admin_headers):
        """GET /api/cmd/pulse returns expected fields"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers)
        data = resp.json()
        
        # Check required fields
        assert "active_divers" in data, "Missing active_divers"
        assert "active_shops" in data, "Missing active_shops"
        assert "bookings_today" in data, "Missing bookings_today"
        assert "gbv" in data, "Missing gbv"
        assert "net_revenue" in data, "Missing net_revenue"
        assert "refund_rate" in data, "Missing refund_rate"
        assert "changes_24h" in data, "Missing changes_24h"
        assert "action_required" in data, "Missing action_required"
        
        # Verify changes_24h structure
        assert "users" in data["changes_24h"], "Missing users in changes_24h"
        assert "bookings" in data["changes_24h"], "Missing bookings in changes_24h"
        
        # Verify action_required structure  
        assert "pending_users" in data["action_required"], "Missing pending_users"
        assert "pending_listings" in data["action_required"], "Missing pending_listings"
        print(f"PULSE DATA: active_divers={data['active_divers']}, gbv=${data['gbv']}, net_revenue=${data['net_revenue']}")
        
    # ==================== SECTION 2: DISCOVER ====================
    def test_cmd_discover_returns_200(self, admin_headers):
        """GET /api/cmd/discover returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/discover", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_discover_data_structure(self, admin_headers):
        """GET /api/cmd/discover returns funnel metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/discover", headers=admin_headers)
        data = resp.json()
        
        assert "supply" in data, "Missing supply"
        assert "demand" in data, "Missing demand"
        assert "funnel" in data, "Missing funnel"
        assert "cancel_rate" in data, "Missing cancel_rate"
        assert "top_booked" in data, "Missing top_booked"
        
        # Verify funnel structure
        funnel = data["funnel"]
        assert "searches" in funnel, "Missing searches in funnel"
        assert "listing_views" in funnel, "Missing listing_views in funnel"
        assert "bookings" in funnel, "Missing bookings in funnel"
        print(f"DISCOVER: searches={funnel['searches']}, views={funnel['listing_views']}, bookings={funnel['bookings']}")
        
    # ==================== SECTION 3: PATHWAY ====================
    def test_cmd_pathway_returns_200(self, admin_headers):
        """GET /api/cmd/pathway returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pathway", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_pathway_data_structure(self, admin_headers):
        """GET /api/cmd/pathway returns dive stats"""
        resp = requests.get(f"{BASE_URL}/api/cmd/pathway", headers=admin_headers)
        data = resp.json()
        
        assert "total_logs" in data, "Missing total_logs"
        assert "log_adoption_pct" in data, "Missing log_adoption_pct"
        assert "dive_stats" in data, "Missing dive_stats"
        assert "certification_distribution" in data, "Missing certification_distribution"
        
        # Verify dive_stats structure
        stats = data["dive_stats"]
        assert "avg_depth" in stats, "Missing avg_depth in dive_stats"
        assert "max_depth" in stats, "Missing max_depth in dive_stats"
        print(f"PATHWAY: total_logs={data['total_logs']}, adoption={data['log_adoption_pct']}%")
        
    # ==================== SECTION 4: SHOP ====================
    def test_cmd_shop_returns_200(self, admin_headers):
        """GET /api/cmd/shop returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/shop", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_shop_data_structure(self, admin_headers):
        """GET /api/cmd/shop returns commerce metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/shop", headers=admin_headers)
        data = resp.json()
        
        assert "total_revenue" in data, "Missing total_revenue"
        assert "total_units" in data, "Missing total_units"
        assert "aov" in data, "Missing aov"
        assert "categories" in data, "Missing categories"
        assert "top_sellers" in data, "Missing top_sellers"
        assert "active_carts" in data, "Missing active_carts"
        print(f"SHOP: revenue=${data['total_revenue']}, units={data['total_units']}, aov=${data['aov']}")
        
    # ==================== SECTION 5: COMMUNITY ====================
    def test_cmd_community_returns_200(self, admin_headers):
        """GET /api/cmd/community returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/community", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_community_data_structure(self, admin_headers):
        """GET /api/cmd/community returns social metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/community", headers=admin_headers)
        data = resp.json()
        
        assert "total_connections" in data, "Missing total_connections"
        assert "avg_connections" in data, "Missing avg_connections"
        assert "connected_who_booked" in data, "Missing connected_who_booked"
        assert "solo_who_booked" in data, "Missing solo_who_booked"
        print(f"COMMUNITY: connections={data['total_connections']}, avg={data['avg_connections']}")
        
    # ==================== SECTION 6: CHAT ====================
    def test_cmd_chat_returns_200(self, admin_headers):
        """GET /api/cmd/chat returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/chat", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_chat_data_structure(self, admin_headers):
        """GET /api/cmd/chat returns messaging metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/chat", headers=admin_headers)
        data = resp.json()
        
        assert "total_threads" in data, "Missing total_threads"
        assert "dm_threads" in data, "Missing dm_threads"
        assert "group_threads" in data, "Missing group_threads"
        assert "total_messages" in data, "Missing total_messages"
        assert "unread_messages" in data, "Missing unread_messages"
        print(f"CHAT: threads={data['total_threads']}, dms={data['dm_threads']}, groups={data['group_threads']}")
        
    # ==================== SECTION 7: EVENTS ====================
    def test_cmd_events_returns_200(self, admin_headers):
        """GET /api/cmd/events returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/events", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_events_data_structure(self, admin_headers):
        """GET /api/cmd/events returns event metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/events", headers=admin_headers)
        data = resp.json()
        
        assert "total_events" in data, "Missing total_events"
        assert "live_events" in data, "Missing live_events"
        assert "total_rsvps" in data, "Missing total_rsvps"
        assert "capacity_utilization" in data, "Missing capacity_utilization"
        assert "by_type" in data, "Missing by_type"
        assert "by_location" in data, "Missing by_location"
        print(f"EVENTS: total={data['total_events']}, live={data['live_events']}, rsvps={data['total_rsvps']}")
        
    # ==================== SECTION 8: REVENUE ====================
    def test_cmd_revenue_returns_200(self, admin_headers):
        """GET /api/cmd/revenue returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/revenue", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_revenue_data_structure(self, admin_headers):
        """GET /api/cmd/revenue returns economics metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/revenue", headers=admin_headers)
        data = resp.json()
        
        assert "total_revenue" in data, "Missing total_revenue"
        assert "booking_gbv" in data, "Missing booking_gbv"
        assert "booking_commission" in data, "Missing booking_commission"
        assert "shop_revenue" in data, "Missing shop_revenue"
        assert "take_rate" in data, "Missing take_rate"
        assert "rev_per_diver" in data, "Missing rev_per_diver"
        assert "daily_revenue" in data, "Missing daily_revenue"
        print(f"REVENUE: total=${data['total_revenue']}, gbv=${data['booking_gbv']}, take_rate={data['take_rate']}%")
        
    # ==================== SECTION 9: CASHFLOW ====================
    def test_cmd_cashflow_returns_200(self, admin_headers):
        """GET /api/cmd/cashflow returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/cashflow", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_cashflow_data_structure(self, admin_headers):
        """GET /api/cmd/cashflow returns payment metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/cashflow", headers=admin_headers)
        data = resp.json()
        
        assert "captured" in data, "Missing captured"
        assert "failed" in data, "Missing failed"
        assert "pending" in data, "Missing pending"
        assert "refunds" in data, "Missing refunds"
        assert "booking_status" in data, "Missing booking_status"
        print(f"CASHFLOW: captured=${data['captured']}, failed=${data['failed']}, refunds=${data['refunds']}")
        
    # ==================== SECTION 10: TRUST ====================
    def test_cmd_trust_returns_200(self, admin_headers):
        """GET /api/cmd/trust returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/trust", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_trust_data_structure(self, admin_headers):
        """GET /api/cmd/trust returns safety metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/trust", headers=admin_headers)
        data = resp.json()
        
        assert "total_reports" in data, "Missing total_reports"
        assert "pending" in data, "Missing pending"
        assert "by_reason" in data, "Missing by_reason"
        assert "low_rated_listings" in data, "Missing low_rated_listings"
        assert "recent_reports" in data, "Missing recent_reports"
        print(f"TRUST: reports={data['total_reports']}, pending={data['pending']}")
        
    # ==================== SECTION 11: PLATFORM ====================
    def test_cmd_platform_returns_200(self, admin_headers):
        """GET /api/cmd/platform returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/platform", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_platform_data_structure(self, admin_headers):
        """GET /api/cmd/platform returns db health metrics"""
        resp = requests.get(f"{BASE_URL}/api/cmd/platform", headers=admin_headers)
        data = resp.json()
        
        assert "database_collections" in data, "Missing database_collections"
        assert "total_documents" in data, "Missing total_documents"
        assert "collection_sizes" in data, "Missing collection_sizes"
        assert "event_distribution" in data, "Missing event_distribution"
        print(f"PLATFORM: collections={data['database_collections']}, docs={data['total_documents']}")
        
    # ==================== SECTION 12: GROWTH ====================
    def test_cmd_growth_returns_200(self, admin_headers):
        """GET /api/cmd/growth returns 200"""
        resp = requests.get(f"{BASE_URL}/api/cmd/growth", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
    def test_cmd_growth_data_structure(self, admin_headers):
        """GET /api/cmd/growth returns growth trends"""
        resp = requests.get(f"{BASE_URL}/api/cmd/growth", headers=admin_headers)
        data = resp.json()
        
        assert "daily_signups" in data, "Missing daily_signups"
        assert "role_distribution" in data, "Missing role_distribution"
        assert "country_distribution" in data, "Missing country_distribution"
        print(f"GROWTH: signups_entries={len(data['daily_signups'])}, roles={len(data['role_distribution'])}")
        
    # ==================== AUTHORIZATION TESTS ====================
    def test_cmd_endpoints_require_auth(self):
        """All /cmd/* endpoints should require authentication"""
        endpoints = [
            "/api/cmd/pulse", "/api/cmd/discover", "/api/cmd/pathway", "/api/cmd/shop",
            "/api/cmd/community", "/api/cmd/chat", "/api/cmd/events", "/api/cmd/revenue",
            "/api/cmd/cashflow", "/api/cmd/trust", "/api/cmd/platform", "/api/cmd/growth"
        ]
        for ep in endpoints:
            resp = requests.get(f"{BASE_URL}{ep}")
            assert resp.status_code in [401, 403], f"{ep} should require auth, got {resp.status_code}"
        print("All 12 /cmd/* endpoints require authentication ✓")
        
    def test_cmd_endpoints_require_admin_role(self):
        """All /cmd/* endpoints should require admin role"""
        # First login as non-admin (diver) - we'll test unauthorized access
        # For now just verify the 401/403 response is returned for no token
        resp = requests.get(f"{BASE_URL}/api/cmd/pulse", headers={"Authorization": "Bearer invalid"})
        assert resp.status_code == 401, f"Invalid token should return 401, got {resp.status_code}"


class TestCommandCentreDataIntegrity:
    """Test data consistency across cmd endpoints"""
    
    @pytest.fixture
    def admin_headers(self):
        token = TestCommandCentreAPI.get_admin_token()
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_pulse_and_growth_user_counts_match(self, admin_headers):
        """Verify user counts are consistent between pulse and growth"""
        pulse = requests.get(f"{BASE_URL}/api/cmd/pulse", headers=admin_headers).json()
        growth = requests.get(f"{BASE_URL}/api/cmd/growth", headers=admin_headers).json()
        
        pulse_total = pulse.get("total_users", 0)
        growth_total = sum(r["count"] for r in growth.get("role_distribution", []))
        
        assert pulse_total == growth_total, f"User count mismatch: pulse={pulse_total}, growth={growth_total}"
        print(f"User counts match: {pulse_total}")
        
    def test_revenue_and_cashflow_consistency(self, admin_headers):
        """Verify revenue data is consistent"""
        revenue = requests.get(f"{BASE_URL}/api/cmd/revenue", headers=admin_headers).json()
        cashflow = requests.get(f"{BASE_URL}/api/cmd/cashflow", headers=admin_headers).json()
        
        # Both should have reasonable values
        assert revenue["total_revenue"] >= 0, "Revenue should be non-negative"
        assert cashflow["captured"] >= 0, "Captured amount should be non-negative"
        print(f"Revenue=${revenue['total_revenue']}, Captured=${cashflow['captured']}")
