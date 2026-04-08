from decimal import Decimal
from pathlib import Path
import sys

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

import pytest  # noqa: E402

from main import app  # noqa: E402
from shared.database import get_session  # noqa: E402
from shared.models import Product  # noqa: E402


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    with Session(engine) as session:
        product = Product(title="Test Product", slug="test-product", category="game")
        session.add(product)
        session.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def _register(client: TestClient, username="testuser", email="test@example.com", password="Secret123!"):
    return client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": password,
    })


def _login(client: TestClient, username="testuser", password="Secret123!"):
    return client.post("/auth/login", data={
        "username": username,
        "password": password,
    })


def _auth_header(client: TestClient) -> dict:
    _register(client)
    resp = _login(client)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# --- Registration ---


def test_register_success(client: TestClient):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "testuser"
    assert body["email"] == "test@example.com"
    assert "hashed_password" not in body


def test_register_duplicate_username(client: TestClient):
    _register(client)
    resp = _register(client, email="other@example.com")
    assert resp.status_code == 409
    assert "username" in resp.json()["detail"]


def test_register_duplicate_email(client: TestClient):
    _register(client)
    resp = _register(client, username="other")
    assert resp.status_code == 409
    assert "email" in resp.json()["detail"]


# --- Login ---


def test_login_success(client: TestClient):
    _register(client)
    resp = _login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_sets_httponly_cookie(client: TestClient):
    _register(client)
    resp = _login(client)
    assert "access_token" in resp.cookies


def test_me_via_cookie(client: TestClient):
    _register(client)
    resp = _login(client)
    cookie_token = resp.cookies["access_token"]
    resp = client.get("/auth/me", cookies={"access_token": cookie_token})
    assert resp.status_code == 200
    assert resp.json()["username"] == "testuser"


def test_login_wrong_password(client: TestClient):
    _register(client)
    resp = _login(client, password="wrong")
    assert resp.status_code == 401


def test_login_nonexistent_user(client: TestClient):
    resp = _login(client, username="nobody")
    assert resp.status_code == 401


# --- /auth/me ---


def test_me_returns_current_user(client: TestClient):
    headers = _auth_header(client)
    resp = client.get("/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == "testuser"


def test_me_requires_auth(client: TestClient):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_login_sets_refresh_cookie(client: TestClient):
    _register(client)
    resp = _login(client)
    assert "refresh_token" in resp.cookies


def test_refresh_issues_new_access_token(client: TestClient):
    _register(client)
    resp = _login(client)
    refresh_cookie = resp.cookies["refresh_token"]
    resp = client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert resp.json()["token_type"] == "bearer"


def test_refresh_without_cookie_returns_401(client: TestClient):
    resp = client.post("/auth/refresh")
    assert resp.status_code == 401


def test_refresh_with_invalid_token_returns_401(client: TestClient):
    resp = client.post("/auth/refresh", cookies={"refresh_token": "invalid.token.here"})
    assert resp.status_code == 401


def test_refresh_with_access_token_as_refresh_returns_401(client: TestClient):
    _register(client)
    resp = _login(client)
    access_token = resp.cookies["access_token"]
    resp = client.post("/auth/refresh", cookies={"refresh_token": access_token})
    assert resp.status_code == 401


def test_logout_clears_cookie(client: TestClient):
    _register(client)
    _login(client)
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    set_cookie_header = resp.headers.get("set-cookie", "")
    assert "access_token" in set_cookie_header
    assert "refresh_token" in set_cookie_header


# --- Alerts (protected) ---


def test_create_and_list_alerts(client: TestClient):
    headers = _auth_header(client)

    resp = client.post("/alerts/", json={
        "product_id": 1,
        "target_price": "49.99",
    }, headers=headers)
    assert resp.status_code == 201
    alert_id = resp.json()["id"]

    resp = client.get("/alerts/", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == alert_id


def test_create_alert_duplicate_rejected(client: TestClient):
    headers = _auth_header(client)
    client.post("/alerts/", json={"product_id": 1, "target_price": "49.99"}, headers=headers)
    resp = client.post("/alerts/", json={"product_id": 1, "target_price": "39.99"}, headers=headers)
    assert resp.status_code == 409


def test_delete_alert(client: TestClient):
    headers = _auth_header(client)
    resp = client.post("/alerts/", json={"product_id": 1, "target_price": "49.99"}, headers=headers)
    alert_id = resp.json()["id"]

    resp = client.delete(f"/alerts/{alert_id}", headers=headers)
    assert resp.status_code == 204

    resp = client.get("/alerts/", headers=headers)
    assert resp.json() == []


def test_deactivate_alert(client: TestClient):
    headers = _auth_header(client)
    resp = client.post("/alerts/", json={"product_id": 1, "target_price": "49.99"}, headers=headers)
    alert_id = resp.json()["id"]

    resp = client.patch(f"/alerts/{alert_id}/deactivate", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


def test_alerts_require_auth(client: TestClient):
    resp = client.get("/alerts/")
    assert resp.status_code == 401
