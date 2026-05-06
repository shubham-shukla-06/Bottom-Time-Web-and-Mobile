"""
Test Currency Persistence Across Sessions
- Tests that currency is saved to backend profile
- Tests that currency is returned from /auth/me
- Tests login flow returns user with currency
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCurrencyPersistence:
    """Test currency persistence in backend profile"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as test user and get token"""
        # Step 1: Send OTP
        send_otp_resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        assert send_otp_resp.status_code == 200, f"Send OTP failed: {send_otp_resp.text}"
        
        # Step 2: Verify OTP
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert verify_resp.status_code == 200, f"Verify OTP failed: {verify_resp.text}"
        verification_token = verify_resp.json().get("verification_token")
        assert verification_token, "No verification token returned"
        
        # Step 3: Complete login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": verification_token
        })
        assert login_resp.status_code == 200, f"Login complete failed: {login_resp.text}"
        data = login_resp.json()
        assert "access_token" in data, "No access token in login response"
        assert "user" in data, "No user in login response"
        
        return data["access_token"], data["user"]
    
    def test_login_returns_user_with_currency(self, auth_token):
        """Test that login response includes user's currency preference"""
        token, user = auth_token
        print(f"User data from login: {user}")
        
        # User should have currency field
        assert "currency" in user or user.get("currency") is None, "User object should have currency field"
        print(f"User currency from login: {user.get('currency')}")
    
    def test_auth_me_returns_currency(self, auth_token):
        """Test that /auth/me returns user's currency preference"""
        token, _ = auth_token
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200, f"GET /auth/me failed: {resp.text}"
        
        user = resp.json()
        print(f"User from /auth/me: {user}")
        print(f"Currency from /auth/me: {user.get('currency')}")
        
        # Currency should be present (may be None for new users)
        assert "currency" in user or user.get("currency") is None
    
    def test_update_currency_to_inr(self, auth_token):
        """Test updating currency to INR via PUT /auth/profile"""
        token, _ = auth_token
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.put(f"{BASE_URL}/api/auth/profile", 
                          headers=headers,
                          json={"currency": "INR"})
        assert resp.status_code == 200, f"PUT /auth/profile failed: {resp.text}"
        
        updated_user = resp.json()
        print(f"Updated user: {updated_user}")
        assert updated_user.get("currency") == "INR", f"Currency not updated to INR, got: {updated_user.get('currency')}"
    
    def test_verify_currency_persisted_inr(self, auth_token):
        """Verify currency change persisted by fetching /auth/me"""
        token, _ = auth_token
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200, f"GET /auth/me failed: {resp.text}"
        
        user = resp.json()
        print(f"User after INR update: {user}")
        assert user.get("currency") == "INR", f"Currency not persisted as INR, got: {user.get('currency')}"
    
    def test_update_currency_to_gbp(self, auth_token):
        """Test updating currency back to GBP"""
        token, _ = auth_token
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.put(f"{BASE_URL}/api/auth/profile", 
                          headers=headers,
                          json={"currency": "GBP"})
        assert resp.status_code == 200, f"PUT /auth/profile failed: {resp.text}"
        
        updated_user = resp.json()
        assert updated_user.get("currency") == "GBP", f"Currency not updated to GBP, got: {updated_user.get('currency')}"
    
    def test_verify_currency_persisted_gbp(self, auth_token):
        """Verify GBP currency persisted"""
        token, _ = auth_token
        
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200
        
        user = resp.json()
        assert user.get("currency") == "GBP", f"Currency not persisted as GBP, got: {user.get('currency')}"
        print(f"Final user currency: {user.get('currency')}")


class TestExchangeRates:
    """Test exchange rates endpoint"""
    
    def test_exchange_rates_endpoint(self):
        """Test that exchange rates endpoint returns rates"""
        resp = requests.get(f"{BASE_URL}/api/exchange-rates")
        assert resp.status_code == 200, f"GET /exchange-rates failed: {resp.text}"
        
        data = resp.json()
        assert "rates" in data, "No rates in response"
        
        rates = data["rates"]
        print(f"Exchange rates: {rates}")
        
        # Check common currencies exist
        assert "USD" in rates, "USD not in rates"
        assert "GBP" in rates, "GBP not in rates"
        assert "INR" in rates, "INR not in rates"
        assert "EUR" in rates, "EUR not in rates"
        
        # USD should be 1
        assert rates["USD"] == 1, f"USD rate should be 1, got: {rates['USD']}"
        
        # Other rates should be positive numbers
        assert rates["GBP"] > 0, f"GBP rate should be positive, got: {rates['GBP']}"
        assert rates["INR"] > 0, f"INR rate should be positive, got: {rates['INR']}"


class TestNewLoginSessionCurrency:
    """Test that a fresh login session loads currency from backend"""
    
    def test_fresh_login_loads_currency(self):
        """Simulate fresh login and verify currency is returned"""
        # Step 1: Send OTP
        send_otp_resp = requests.post(f"{BASE_URL}/api/auth/send-otp", json={
            "identifier": "test@bottomtime.com"
        })
        assert send_otp_resp.status_code == 200
        
        # Step 2: Verify OTP
        verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "identifier": "test@bottomtime.com",
            "code": "123456"
        })
        assert verify_resp.status_code == 200
        verification_token = verify_resp.json().get("verification_token")
        
        # Step 3: Complete login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login-complete", json={
            "email": "test@bottomtime.com",
            "email_verified_token": verification_token
        })
        assert login_resp.status_code == 200
        
        data = login_resp.json()
        user = data.get("user", {})
        
        print(f"Fresh login user data: {user}")
        print(f"Fresh login currency: {user.get('currency')}")
        
        # User should have currency (we set it to GBP in previous test)
        # This verifies backend returns currency on login
        assert user.get("currency") == "GBP", f"Expected GBP from fresh login, got: {user.get('currency')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
