"""Backend tests for /api/admin/bulk/* endpoints (iteration 101)."""
import os
import sys
import uuid
import pytest
import requests
from datetime import timedelta

sys.path.insert(0, "/app/backend")
from auth_utils import create_access_token  # noqa: E402
import pymongo  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
sync_db = pymongo.MongoClient(MONGO_URL)[DB_NAME]

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marine-social-1.preview.emergentagent.com").rstrip("/")
ADMIN_USER_ID = "2f04d168-7103-4225-b391-3433409cb019"  # shubham@bottom-time.com (super admin)


@pytest.fixture(scope="module")
def admin_token():
    return create_access_token({"sub": ADMIN_USER_ID}, expires_delta=timedelta(hours=1))


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---- Auth gating ----------------------------------------------------------
class TestAuthGating:
    def test_no_auth_returns_401_or_403(self, s):
        r = s.post(f"{BASE_URL}/api/admin/bulk/waitlist/delete", json={"emails": ["x@y.com"]})
        assert r.status_code in (401, 403), r.text

    def test_non_admin_returns_403(self, s):
        u = sync_db.users.find_one({"role": {"$ne": "admin"}}, {"_id": 0, "id": 1})
        if not u:
            pytest.skip("no non-admin user available")
        tok = create_access_token({"sub": u["id"]}, expires_delta=timedelta(hours=1))
        r = s.post(
            f"{BASE_URL}/api/admin/bulk/waitlist/delete",
            json={"emails": ["x@y.com"]},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403, r.text


# ---- Validation -----------------------------------------------------------
class TestValidation:
    def test_empty_ids_rejected(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/users/action",
                   json={"ids": [], "action": "suspend"}, headers=admin_headers)
        assert r.status_code in (400, 422), r.text

    def test_invalid_user_action(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/users/action",
                   json={"ids": ["fake-id"], "action": "explode"}, headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_invalid_listing_action(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/listings/action",
                   json={"ids": ["fake-id"], "action": "nope"}, headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_invalid_promo_action(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/promo-codes/action",
                   json={"ids": ["fake-id"], "action": "kill"}, headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_invalid_product_action(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/products/action",
                   json={"ids": ["fake-id"], "action": "burn"}, headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_invalid_application_action(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/applications/action",
                   json={"ids": ["fake-id"], "action": "delete"}, headers=admin_headers)
        assert r.status_code == 400, r.text


# ---- Idempotency / response shape ---------------------------------------
class TestResponseShape:
    def test_waitlist_idempotent_nonexistent(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/waitlist/delete",
                   json={"emails": ["TEST_nonexistent@example.com"]}, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "processed" in data and "failed" in data and "errors" in data
        assert data["processed"] == 0

    def test_campaigns_idempotent_nonexistent(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/campaigns/delete",
                   json={"ids": ["TEST_no_such_campaign"]}, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["processed"] == 0
        assert "errors" in d

    def test_users_action_idempotent(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/users/action",
                   json={"ids": ["TEST_no_user_x"], "action": "suspend"}, headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["processed"] == 0


# ---- Waitlist E2E ---------------------------------------------------------
class TestWaitlistE2E:
    def test_bulk_delete_3_inserted_emails(self, s, admin_headers):
        emails = [f"TEST_bulk_{uuid.uuid4().hex[:8]}@example.com" for _ in range(3)]
        for e in emails:
            r = s.post(f"{BASE_URL}/api/waitlist", json={"email": e})
            assert r.status_code in (200, 201), r.text
        r = s.post(f"{BASE_URL}/api/admin/bulk/waitlist/delete",
                   json={"emails": emails}, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["processed"] == 3, d
        assert d["failed"] == 0, d


# ---- Listings bulk (use real Mongo to seed) -----------------------------
class TestListingsBulk:
    def test_approve_2_pending_listings(self, admin_headers, s):
        ids = [f"TEST_lst_{uuid.uuid4().hex[:8]}" for _ in range(2)]
        try:
            for i in ids:
                sync_db.operator_dive_listings.insert_one(
                    {"id": i, "status": "pending", "operator_id": "no-op", "title": f"t-{i}"}
                )
            r = s.post(f"{BASE_URL}/api/admin/bulk/listings/action",
                       json={"ids": ids, "action": "approve"}, headers=admin_headers)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["processed"] == 2, d

            docs = list(sync_db.operator_dive_listings.find(
                {"id": {"$in": ids}}, {"_id": 0, "id": 1, "status": 1}
            ))
            assert all(doc["status"] == "active" for doc in docs), docs
        finally:
            sync_db.operator_dive_listings.delete_many({"id": {"$in": ids}})


class TestApplicationsBulk:
    def test_approve_pending_application_promotes_user_role(self, admin_headers, s):
        uid = f"TEST_uid_{uuid.uuid4().hex[:8]}"
        aid = f"TEST_app_{uuid.uuid4().hex[:8]}"
        try:
            sync_db.users.insert_one({
                "id": uid, "email": f"{uid}@example.com", "role": "diver",
                "status": "active", "name": "Bulk Test"
            })
            sync_db.operator_applications.insert_one({
                "id": aid, "user_id": uid, "status": "pending",
                "business_name": "TEST BulkOp", "application_data": {}
            })
            r = s.post(f"{BASE_URL}/api/admin/bulk/applications/action",
                       json={"ids": [aid], "action": "approve"}, headers=admin_headers)
            assert r.status_code == 200, r.text
            d = r.json()
            print("APPS response:", d)

            app = sync_db.operator_applications.find_one({"id": aid}, {"_id": 0})
            u = sync_db.users.find_one({"id": uid}, {"_id": 0})
            assert app["status"] == "approved", app
            assert u["role"] == "operator", u
        finally:
            sync_db.users.delete_one({"id": uid})
            sync_db.operator_applications.delete_one({"id": aid})


# ---- Users safety: admin/self exclusion --------------------------------
class TestUsersSafety:
    def test_admin_cannot_be_suspended_via_bulk(self, s, admin_headers):
        r = s.post(f"{BASE_URL}/api/admin/bulk/users/action",
                   json={"ids": [ADMIN_USER_ID], "action": "suspend"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["processed"] == 0, d

        u = sync_db.users.find_one({"id": ADMIN_USER_ID}, {"_id": 0, "status": 1, "role": 1})
        assert u.get("role") == "admin"
        assert u.get("status") != "suspended"
