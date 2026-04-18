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

STRONG_PASSWORD = "Zq7-mLp9#XvT2kRn4"


class CSRFTestClient(TestClient):
    """TestClient that auto-injects X-CSRF-Token from the cookie jar, like the frontend."""

    def request(self, method: str, url, **kwargs):
        if method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            csrf = self.cookies.get("csrf_token")
            if csrf:
                headers = dict(kwargs.get("headers") or {})
                headers.setdefault("X-CSRF-Token", csrf)
                kwargs["headers"] = headers
        return super().request(method, url, **kwargs)


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

    with CSRFTestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture()
def raw_client():
    """Plain TestClient without auto CSRF injection, for testing the middleware itself."""
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


def _register(client: TestClient, username="testuser", email="test@example.com", password=STRONG_PASSWORD):
    return client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": password,
    })


def _login(client: TestClient, username="testuser", password=STRONG_PASSWORD):
    return client.post("/auth/login", data={
        "username": username,
        "password": password,
    })


def _auth_header(client: TestClient) -> dict:
    _register(client)
    resp = _login(client)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _like_product(client: TestClient, headers: dict, product_id: int = 1):
    return client.post(f"/likes/{product_id}", headers=headers)


# --- Registration ---


def test_register_success(client: TestClient):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "testuser"
    assert body["email"] == "test@example.com"
    assert "hashed_password" not in body


def test_register_rejects_short_password(client: TestClient):
    resp = _register(client, password="Ab1!")
    assert resp.status_code == 422


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


def test_login_sets_csrf_cookie(client: TestClient):
    _register(client)
    resp = _login(client)
    assert "csrf_token" in resp.cookies
    # CSRF cookie must be readable by JS (not HttpOnly) so the client can echo it in a header.
    set_cookie_headers = resp.headers.get_list("set-cookie")
    csrf_header = next((h for h in set_cookie_headers if h.startswith("csrf_token=")), None)
    assert csrf_header is not None
    assert "httponly" not in csrf_header.lower()


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


def test_me_includes_discord_webhook_field(client: TestClient):
    headers = _auth_header(client)
    resp = client.get("/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["discord_webhook_url"] is None


def test_update_me_settings_updates_discord_webhook(client: TestClient):
    headers = _auth_header(client)
    webhook = "https://discord.com/api/webhooks/123/token"

    resp = client.patch(
        "/auth/me/settings",
        headers=headers,
        json={"discord_webhook_url": webhook},
    )
    assert resp.status_code == 200
    assert resp.json()["discord_webhook_url"] == webhook

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["discord_webhook_url"] == webhook


def test_update_me_settings_can_clear_discord_webhook(client: TestClient):
    headers = _auth_header(client)

    set_resp = client.patch(
        "/auth/me/settings",
        headers=headers,
        json={"discord_webhook_url": "https://discord.com/api/webhooks/123/token"},
    )
    assert set_resp.status_code == 200

    clear_resp = client.patch(
        "/auth/me/settings",
        headers=headers,
        json={"discord_webhook_url": ""},
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["discord_webhook_url"] is None


def test_update_me_settings_rejects_invalid_webhook_url(client: TestClient):
    headers = _auth_header(client)
    resp = client.patch(
        "/auth/me/settings",
        headers=headers,
        json={"discord_webhook_url": "https://example.com/not-a-discord-webhook"},
    )
    assert resp.status_code == 422


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


def test_refresh_rotates_token(client: TestClient):
    """Old refresh token must be rejected after rotation."""
    _register(client)
    login_resp = _login(client)
    old_refresh = login_resp.cookies["refresh_token"]

    # First refresh: succeeds, rotates the token.
    first = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert first.status_code == 200

    # Second refresh with the *old* cookie: must be rejected.
    client.cookies.clear()
    replay = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert replay.status_code == 401


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


# --- CSRF middleware ---


def test_csrf_blocks_unsafe_request_without_header(raw_client: TestClient):
    _register(raw_client)
    _login(raw_client)
    # raw_client does NOT auto-inject X-CSRF-Token. After login, auth cookies are set.
    resp = raw_client.post("/auth/logout")
    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]


def test_csrf_allows_safe_request_without_header(raw_client: TestClient):
    _register(raw_client)
    _login(raw_client)
    resp = raw_client.get("/auth/me")
    assert resp.status_code == 200


def test_csrf_allows_unauth_post_without_header(raw_client: TestClient):
    """Exempt paths (login/register/refresh) work without CSRF header."""
    # Plain POST without prior cookies — should reach the handler (validation error here).
    resp = raw_client.post("/auth/login", data={"username": "x", "password": STRONG_PASSWORD})
    # No user exists yet; expect 401 from handler, not 403 from middleware.
    assert resp.status_code == 401


# --- Alerts (protected) ---


def test_like_product_and_list_like_ids(client: TestClient):
    headers = _auth_header(client)

    like = _like_product(client, headers, product_id=1)
    assert like.status_code == 200
    assert like.json()["product_id"] == 1

    ids = client.get("/likes/ids", headers=headers)
    assert ids.status_code == 200
    assert 1 in ids.json()


def test_list_liked_products_returns_product_data(client: TestClient):
    headers = _auth_header(client)
    _like_product(client, headers, product_id=1)

    response = client.get("/likes/products", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == 1
    assert payload[0]["slug"] == "test-product"
    assert payload[0]["available_offers_count"] == 0


def test_create_alert_without_prior_like(client: TestClient):
    headers = _auth_header(client)

    resp = client.post(
        "/alerts/",
        json={"product_id": 1, "target_price": "49.99"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["target_price"] == "49.99"


def test_create_alert_without_target_price_is_a_like(client: TestClient):
    headers = _auth_header(client)

    resp = client.post("/alerts/", json={"product_id": 1}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["target_price"] is None

    ids = client.get("/likes/ids", headers=headers)
    assert ids.status_code == 200
    assert 1 in ids.json()


def test_like_creates_alert_with_null_target(client: TestClient):
    headers = _auth_header(client)
    _like_product(client, headers, product_id=1)

    alerts = client.get("/alerts/", headers=headers)
    assert alerts.status_code == 200
    payload = alerts.json()
    assert len(payload) == 1
    assert payload[0]["product_id"] == 1
    assert payload[0]["target_price"] is None


def test_unlike_deactivates_active_alert(client: TestClient):
    headers = _auth_header(client)
    created = client.post(
        "/alerts/",
        json={"product_id": 1, "target_price": "49.99"},
        headers=headers,
    )
    assert created.status_code == 201

    unlike = client.delete("/likes/1", headers=headers)
    assert unlike.status_code == 204

    active_alerts = client.get("/alerts/?is_active=true", headers=headers)
    assert active_alerts.status_code == 200
    assert active_alerts.json() == []


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
