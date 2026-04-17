from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
import fnmatch
import sys
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

import cache  # noqa: E402
from main import app  # noqa: E402
from shared.database import get_session  # noqa: E402
from shared.models import Price, Product, Store  # noqa: E402


class FakeRedis:
    """Minimal stand-in for the subset of redis.Redis we call."""

    def __init__(self) -> None:
        self.store: dict[str, tuple[str, float | None]] = {}

    def _purge(self, key: str) -> None:
        entry = self.store.get(key)
        if entry and entry[1] is not None and entry[1] <= time.time():
            self.store.pop(key, None)

    def get(self, key: str):
        self._purge(key)
        entry = self.store.get(key)
        return entry[0] if entry else None

    def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = (value, time.time() + ttl)

    def scan_iter(self, match: str, count: int = 0):
        for key in list(self.store.keys()):
            self._purge(key)
            if key in self.store and fnmatch.fnmatch(key, match):
                yield key

    def delete(self, key: str) -> int:
        return 1 if self.store.pop(key, None) is not None else 0


@pytest.fixture()
def fake_redis() -> Iterator[FakeRedis]:
    fake = FakeRedis()
    cache.reset_client_for_tests(fake)  # type: ignore[arg-type]
    try:
        yield fake
    finally:
        cache.reset_client_for_tests(None)


@pytest.fixture()
def client(fake_redis: FakeRedis) -> Iterator[TestClient]:
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
        store = Store(name="Steam", slug="steam", url="https://store.steampowered.com", is_active=True)
        session.add(store)
        session.commit()
        session.refresh(store)

        product = Product(title="Witcher 3", slug="witcher-3", category="game")
        session.add(product)
        session.commit()
        session.refresh(product)

        session.add(
            Price(
                product_id=product.id,
                store_id=store.id,
                current_price=Decimal("49.99"),
                currency="PLN",
                url="https://example.com/witcher-3-steam",
                is_available=True,
            )
        )
        session.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_with_prices_writes_cache_on_first_hit_and_reuses_on_second(
    client: TestClient,
    fake_redis: FakeRedis,
):
    assert not fake_redis.store

    first = client.get("/products/with-prices?category=game&page=1&page_size=20&sort=featured")
    assert first.status_code == 200

    cached_keys = list(fake_redis.store.keys())
    assert len(cached_keys) == 1
    assert cached_keys[0].startswith("api:cache:products:")

    fake_redis.store[cached_keys[0]] = ('{"items":[],"categories":[],"total":0,"page":1,"page_size":20,"total_pages":0}', None)

    second = client.get("/products/with-prices?category=game&page=1&page_size=20&sort=featured")
    assert second.status_code == 200
    assert second.json()["total"] == 0


def test_invalidate_products_cache_clears_all_product_keys(
    client: TestClient,
    fake_redis: FakeRedis,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")

    client.get("/products/with-prices?category=game")
    client.get("/products/with-prices?category=electronics")
    assert len(fake_redis.store) == 2

    response = client.post(
        "/internal/cache/invalidate-products",
        headers={"X-Internal-Token": "secret"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "deleted": 2}
    assert fake_redis.store == {}


def test_invalidate_returns_503_when_token_unset(
    client: TestClient,
    fake_redis: FakeRedis,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)

    response = client.post("/internal/cache/invalidate-products")
    assert response.status_code == 503


def test_invalidate_requires_token_when_configured(
    client: TestClient,
    fake_redis: FakeRedis,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")

    unauthorized = client.post("/internal/cache/invalidate-products")
    assert unauthorized.status_code == 401

    authorized = client.post(
        "/internal/cache/invalidate-products",
        headers={"X-Internal-Token": "secret"},
    )
    assert authorized.status_code == 200
