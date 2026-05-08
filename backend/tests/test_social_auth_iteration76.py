"""
Social Auth + Email OTP Backend Tests — Iteration 76
Tests: social Google/Microsoft endpoints, signup-complete, email OTP fallback
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSocialGoogleEndpoint:
    """POST /api/auth/social/google — should return 400 (not 500) for invalid session_id"""

    def test_google_endpoint_exists(self):
        """Endpoint must exist and respond (not 404 or 500)"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/google",
            json={"session_id": "fake_session_id_for_testing"},
            timeout=15,
        )
        assert resp.status_code != 404, "Endpoint does not exist (404)"
        assert resp.status_code != 500, f"Endpoint returned 500 Server Error: {resp.text}"
        # Should be 4xx (graceful error)
        assert resp.status_code in [400, 401, 403, 422], \
            f"Expected 4xx for invalid session, got {resp.status_code}: {resp.text}"

    def test_google_returns_graceful_error(self):
        """Should return a meaningful error message, not crash"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/google",
            json={"session_id": "completely_invalid_session"},
            timeout=15,
        )
        assert resp.status_code in [400, 401, 403, 422]
        data = resp.json()
        assert "detail" in data, f"Response should have 'detail' field: {data}"
        assert isinstance(data["detail"], str), "Detail should be a string"
        assert len(data["detail"]) > 0, "Detail should not be empty"

    def test_google_missing_session_id(self):
        """Missing session_id should return 422 validation error"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/google",
            json={},
            timeout=15,
        )
        assert resp.status_code == 422, f"Expected 422 for missing field, got {resp.status_code}"


class TestSocialMicrosoftEndpoint:
    """POST /api/auth/social/microsoft — should return 400 (not 500) for invalid code"""

    def test_microsoft_endpoint_exists(self):
        """Endpoint must exist and respond (not 404 or 500)"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/microsoft",
            json={
                "code": "fake_auth_code",
                "code_verifier": "fake_code_verifier",
                "redirect_uri": "https://example.com/auth/callback",
            },
            timeout=15,
        )
        assert resp.status_code != 404, "Endpoint does not exist (404)"
        assert resp.status_code != 500, f"Endpoint returned 500 Server Error: {resp.text}"
        # Should be 4xx (graceful error)
        assert resp.status_code in [400, 401, 403, 422], \
            f"Expected 4xx for invalid code, got {resp.status_code}: {resp.text}"

    def test_microsoft_returns_graceful_error(self):
        """Should return a meaningful error message, not crash"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/microsoft",
            json={
                "code": "invalid_code_xyz",
                "code_verifier": "invalid_verifier",
                "redirect_uri": "https://example.com/auth/callback",
            },
            timeout=15,
        )
        assert resp.status_code in [400, 401, 403, 422, 500]
        # The key check: if 500, there's a code bug. Otherwise it's expected.
        if resp.status_code == 500:
            pytest.fail(f"Microsoft endpoint returned 500: {resp.text[:300]}")
        data = resp.json()
        assert "detail" in data or "message" in data, f"Response should have error info: {data}"

    def test_microsoft_missing_fields(self):
        """Missing required fields should return 422 validation error"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/microsoft",
            json={"code": "only_code"},
            timeout=15,
        )
        assert resp.status_code == 422, f"Expected 422 for missing fields, got {resp.status_code}"


class TestSocialSignupCompleteEndpoint:
    """POST /api/auth/social/signup-complete — endpoint must exist"""

    def test_signup_complete_endpoint_exists(self):
        """Endpoint must exist and respond with proper validation"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/signup-complete",
            json={},
            timeout=15,
        )
        assert resp.status_code != 404, "Endpoint does not exist (404)"
        # Should return 422 (validation error) for missing fields — not 404
        assert resp.status_code in [400, 422], \
            f"Expected validation error for empty body, got {resp.status_code}: {resp.text}"

    def test_signup_complete_validation(self):
        """Endpoint should validate required fields"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/social/signup-complete",
            json={
                "email": "invalid_social_user@test.example.com",
                "name": "Test Social User",
                "role": "diver",
                "provider": "google",
                "phone": "+19999999999",
                "phone_verified_token": "invalid_fake_token",
            },
            timeout=15,
        )
        assert resp.status_code != 404, "Endpoint does not exist (404)"
        assert resp.status_code != 500, f"Endpoint returned 500: {resp.text}"
        # Should fail gracefully (400 - invalid token)
        assert resp.status_code in [400, 401, 422], \
            f"Expected 4xx for invalid token, got {resp.status_code}: {resp.text}"


class TestEmailOTPFallback:
    """Email OTP fallback using the seeded test account.

    `testuser@bottom-time.com` is in `routes/auth.py` TEST_IDENTIFIERS, so
    `send-otp` short-circuits (no Resend call) and `verify-otp` accepts the
    hardcoded TEST_OTP_CODE `007320`. Using this identifier keeps the test
    suite idempotent — Resend's real-send rate limit (5/10min/identifier)
    would otherwise trip on repeated runs.
    """

    TEST_EMAIL = "testuser@bottom-time.com"
    TEST_OTP = "007320"

    def test_send_otp_to_test_email(self):
        """Send OTP to test email should succeed"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": self.TEST_EMAIL},
            timeout=15,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "expires_at" in data, f"Response should include expires_at: {data}"
        assert data.get("channel") == "email", f"Expected email channel: {data}"

    def test_verify_otp_test_account(self):
        """Verify OTP with bypass code for test account.

        Test-bypass identifier + OTP are defined in `routes/auth.py` as
        TEST_IDENTIFIERS / TEST_OTP_CODE. For these identifiers `verify-otp`
        accepts the hardcoded bypass code without a prior `send-otp` — we
        skip the send call here to stay under the per-IP slowapi limit
        (10/min) when the full suite runs.
        """
        resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": self.TEST_EMAIL, "code": self.TEST_OTP},
            timeout=15,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("verified") is True, f"Expected verified=True: {data}"
        assert "verification_token" in data, f"Response should include verification_token: {data}"

    def test_verify_otp_invalid_code(self):
        """Wrong OTP should return 400"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": self.TEST_EMAIL, "code": "000000"},
            timeout=15,
        )
        assert resp.status_code in [400, 404], \
            f"Expected 400/404 for wrong OTP, got {resp.status_code}: {resp.text}"

    def test_login_init_for_test_account(self):
        """Login init for a seeded test account should succeed."""
        resp = requests.post(
            f"{BASE_URL}/api/auth/login-init",
            json={"email": "testuser@bottom-time.com"},
            timeout=15,
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "phone_hint" in data, f"Response should include phone_hint: {data}"

    def test_send_otp_invalid_identifier(self):
        """Invalid identifier should return 400"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": "notanemail"},
            timeout=15,
        )
        assert resp.status_code == 400, f"Expected 400 for invalid identifier, got {resp.status_code}"


class TestAuthHealthCheck:
    """Quick smoke tests for auth system health"""

    def test_auth_me_unauthenticated(self):
        """GET /api/auth/me without token should return 401 or 403"""
        resp = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert resp.status_code in [401, 403], f"Expected 401/403 for unauthenticated access, got {resp.status_code}"

    def test_full_email_otp_login_flow(self):
        """Full login flow for a seeded test user.

        Contract (current): login is single-factor email-OTP — `login-init`
        returns a phone_hint for display only, and `login-complete` needs
        just `email_verified_token`. (An older revision of this test also
        verified a phone OTP; that step no longer exists in
        `CompleteLoginRequest`.)
        """
        test_email = "testuser@bottom-time.com"
        test_otp = "007320"

        # Step 1: login-init — confirms the account exists and returns a hint.
        init_resp = requests.post(
            f"{BASE_URL}/api/auth/login-init",
            json={"email": test_email},
            timeout=15,
        )
        assert init_resp.status_code == 200, f"login-init failed: {init_resp.text}"
        phone_hint = init_resp.json().get("phone_hint")
        assert phone_hint, "phone_hint should be present"

        # Step 2: send email OTP (no-op for TEST_IDENTIFIERS).
        otp_resp = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"identifier": test_email},
            timeout=15,
        )
        assert otp_resp.status_code == 200, f"send-otp failed: {otp_resp.text}"

        # Step 3: verify email OTP using the bypass code.
        verify_email_resp = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"identifier": test_email, "code": test_otp},
            timeout=15,
        )
        assert verify_email_resp.status_code == 200, f"verify email OTP failed: {verify_email_resp.text}"
        email_token = verify_email_resp.json()["verification_token"]

        # Step 4: login-complete — email_verified_token is now sufficient.
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login-complete",
            json={
                "email": test_email,
                "email_verified_token": email_token,
            },
            timeout=15,
        )
        assert login_resp.status_code == 200, f"login-complete failed: {login_resp.text}"
        data = login_resp.json()
        assert "access_token" in data, "access_token should be in response"
        assert "user" in data, "user should be in response"
        assert data["user"]["email"] == test_email

        # Step 5: use token to verify /auth/me returns the same user.
        me_resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
            timeout=10,
        )
        assert me_resp.status_code == 200, f"/auth/me failed: {me_resp.text}"
        assert me_resp.json()["email"] == test_email
