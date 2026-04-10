from decimal import Decimal
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

from main import app  # noqa: E402
from shared.database import get_session  # noqa: E402
from shared.models import Price, Product, Store  # noqa: E402


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
        steam = Store(
            name="Steam",
            slug="steam",
            url="https://store.steampowered.com",
            is_active=True,
        )
        gog = Store(
            name="GOG",
            slug="gog",
            url="https://www.gog.com",
            is_active=True,
        )
        free_dlc = Product(
            title="Free DLC",
            slug="free-dlc",
            category="dlc",
        )
        tracked_only = Product(
            title="Tracked Only",
            slug="tracked-only",
            category="game",
        )
        session.add_all([steam, gog, free_dlc, tracked_only])
        session.commit()
        session.refresh(steam)
        session.refresh(gog)
        session.refresh(free_dlc)
        session.refresh(tracked_only)

        session.add_all(
            [
                Price(
                    product_id=free_dlc.id,
                    store_id=steam.id,
                    current_price=Decimal("0.00"),
                    currency="PLN",
                    url="https://example.com/free-dlc-steam",
                    is_available=True,
                ),
                Price(
                    product_id=free_dlc.id,
                    store_id=gog.id,
                    current_price=Decimal("19.99"),
                    currency="PLN",
                    url="https://example.com/free-dlc-gog",
                    is_available=False,
                ),
                Price(
                    product_id=tracked_only.id,
                    store_id=steam.id,
                    current_price=Decimal("29.99"),
                    currency="PLN",
                    url="https://example.com/tracked-only-steam",
                    is_available=False,
                ),
            ]
        )
        session.commit()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_product_detail_includes_all_tracked_rows_and_counts_zero_price_as_active(
    client: TestClient,
):
    response = client.get("/products/free-dlc")

    assert response.status_code == 200
    payload = response.json()

    assert payload["active_offers_count"] == 1
    assert payload["tracked_stores_count"] == 2
    assert payload["inactive_offers_count"] == 1
    assert len(payload["store_prices"]) == 2
    assert payload["store_prices"][0]["store_slug"] == "gog"
    assert payload["store_prices"][1]["current_price"] == "0.00"
    assert payload["store_prices"][1]["is_available"] is True


def test_prices_endpoint_filters_by_availability_and_reports_summary_totals(
    client: TestClient,
):
    active_response = client.get(
        "/prices?store_slug=steam&availability=active&page_size=100"
    )
    inactive_response = client.get(
        "/prices?store_slug=steam&availability=inactive&page_size=100"
    )

    assert active_response.status_code == 200
    assert inactive_response.status_code == 200

    active_payload = active_response.json()
    inactive_payload = inactive_response.json()

    assert active_payload["availability"] == "active"
    assert active_payload["total"] == 1
    assert active_payload["all_total"] == 2
    assert active_payload["active_total"] == 1
    assert active_payload["inactive_total"] == 1
    assert [item["product_slug"] for item in active_payload["items"]] == ["free-dlc"]

    assert inactive_payload["availability"] == "inactive"
    assert inactive_payload["total"] == 1
    assert inactive_payload["all_total"] == 2
    assert inactive_payload["active_total"] == 1
    assert inactive_payload["inactive_total"] == 1
    assert [item["product_slug"] for item in inactive_payload["items"]] == [
        "tracked-only"
    ]


def test_products_with_prices_store_filter_keeps_tracked_products_without_active_offer(
    client: TestClient,
):
    response = client.get("/products/with-prices?store=steam&page_size=100")

    assert response.status_code == 200
    payload = response.json()

    returned_slugs = {item["slug"] for item in payload["items"]}
    assert "tracked-only" in returned_slugs
    assert "free-dlc" not in returned_slugs

    tracked_product = next(
        item for item in payload["items"] if item["slug"] == "tracked-only"
    )
    assert tracked_product["best_price"] is None


def test_products_with_prices_excludes_free_game_like_products(
    client: TestClient,
):
    response = client.get("/products/with-prices?category=game&page_size=100")

    assert response.status_code == 200
    payload = response.json()

    returned_slugs = {item["slug"] for item in payload["items"]}
    assert "free-dlc" not in returned_slugs
    assert payload["total"] == len(payload["items"])
