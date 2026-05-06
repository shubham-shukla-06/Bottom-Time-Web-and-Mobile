"""CI Smoke Tests for critical Bottom Time API flows."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR / "backend"))

from server import app


TEST_EMAIL = "test@bottomtime.com"
TEST_PHONE = "+919876543210"
TEST_OTP = "123456"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def get_auth_headers(test_client: TestClient):
    email_verify = test_client.post(
        "/api/auth/verify-otp",
        json={"identifier": TEST_EMAIL, "code": TEST_OTP}
    )
    assert email_verify.status_code == 200, email_verify.text
    email_token = email_verify.json().get("verification_token")
    assert email_token, "Missing email verification token"

    phone_verify = test_client.post(
        "/api/auth/verify-otp",
        json={"identifier": TEST_PHONE, "code": TEST_OTP}
    )
    assert phone_verify.status_code == 200, phone_verify.text
    phone_token = phone_verify.json().get("verification_token")
    assert phone_token, "Missing phone verification token"

    login = test_client.post(
        "/api/auth/login-complete",
        json={
            "email": TEST_EMAIL,
            "email_verified_token": email_token,
            "phone_verified_token": phone_token,
        }
    )
    assert login.status_code == 200, login.text
    token = login.json().get("access_token")
    assert token, "Missing access token"
    return {"Authorization": f"Bearer {token}"}


def test_smoke_public_endpoints(client):
    products = client.get("/api/products")
    assert products.status_code == 200, products.text

    species = client.get("/api/species/common")
    assert species.status_code == 200, species.text

    ndl_table = client.get("/api/dive-planner/ndl-table?fo2=0.21&gf=85")
    assert ndl_table.status_code == 200, ndl_table.text


def test_smoke_auth_me(client):
    headers = get_auth_headers(client)
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200, me.text


def test_smoke_dive_log_and_messages(client):
    headers = get_auth_headers(client)

    dive_log = client.get("/api/dive-log", headers=headers)
    assert dive_log.status_code == 200, dive_log.text

    threads = client.get("/api/messages/threads", headers=headers)
    assert threads.status_code == 200, threads.text
