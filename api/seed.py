from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import random

from sqlalchemy import func
from sqlmodel import Session, select

from shared.database import get_engine
from shared.models import Price, Product, Store

STORES = [
    {
        "name": "Steam",
        "slug": "steam",
        "url": "https://store.steampowered.com",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg",
        "is_active": True,
    },
    {
        "name": "x-kom",
        "slug": "x-kom",
        "url": "https://www.x-kom.pl",
        "logo_url": "https://upload.wikimedia.org/wikipedia/commons/8/8c/X-kom_logo.svg",
        "is_active": True,
    },
    {
        "name": "morele",
        "slug": "morele",
        "url": "https://www.morele.net",
        "logo_url": "https://www.morele.net/favicon.ico",
        "is_active": True,
    },
    {
        "name": "Media Expert",
        "slug": "mediaexpert",
        "url": "https://www.mediaexpert.pl",
        "logo_url": "https://www.mediaexpert.pl/favicon.ico",
        "is_active": True,
    },
    {
        "name": "Allegro",
        "slug": "allegro",
        "url": "https://allegro.pl",
        "logo_url": "https://a.allegroimg.com/sellercms/allegro-main-logo-color.svg",
        "is_active": True,
    },
]

PRODUCTS = [
    {
        "title": "Cyberpunk 2077 Ultimate Edition",
        "slug": "cyberpunk-2077-ultimate-edition",
        "category": "game",
        "description": "Fictional complete edition with all DLCs.",
        "base_price": Decimal("249.99"),
    },
    {
        "title": "Elden Ring Nightreign",
        "slug": "elden-ring-nightreign",
        "category": "game",
        "description": "Fictional expansion bundle.",
        "base_price": Decimal("279.99"),
    },
    {
        "title": "Baldurs Gate 3 Deluxe",
        "slug": "baldurs-gate-3-deluxe",
        "category": "game",
        "description": "Fictional deluxe package.",
        "base_price": Decimal("229.99"),
    },
    {
        "title": "EA Sports FC 27",
        "slug": "ea-sports-fc-27",
        "category": "game",
        "description": "Fictional next-season football game.",
        "base_price": Decimal("319.99"),
    },
    {
        "title": "Steam Deck OLED 1TB",
        "slug": "steam-deck-oled-1tb",
        "category": "handheld",
        "description": "Fictional storage variant for test data.",
        "base_price": Decimal("3099.00"),
    },
    {
        "title": "PlayStation 5 Slim",
        "slug": "playstation-5-slim",
        "category": "console",
        "description": "Fictional bundle version.",
        "base_price": Decimal("2199.00"),
    },
    {
        "title": "Xbox Series X 1TB",
        "slug": "xbox-series-x-1tb",
        "category": "console",
        "description": "Fictional revision.",
        "base_price": Decimal("2399.00"),
    },
    {
        "title": "Nintendo Switch OLED",
        "slug": "nintendo-switch-oled",
        "category": "console",
        "description": "Fictional color edition.",
        "base_price": Decimal("1499.00"),
    },
    {
        "title": "GeForce RTX 5070 12GB",
        "slug": "geforce-rtx-5070-12gb",
        "category": "gpu",
        "description": "Fictional desktop GPU model.",
        "base_price": Decimal("3299.00"),
    },
    {
        "title": "Radeon RX 8800 XT 16GB",
        "slug": "radeon-rx-8800-xt-16gb",
        "category": "gpu",
        "description": "Fictional desktop GPU model.",
        "base_price": Decimal("2999.00"),
    },
    {
        "title": "Samsung Odyssey G6 32",
        "slug": "samsung-odyssey-g6-32",
        "category": "monitor",
        "description": "Fictional monitor variant.",
        "base_price": Decimal("1799.00"),
    },
    {
        "title": "Logitech G Pro X Superlight 2",
        "slug": "logitech-g-pro-x-superlight-2",
        "category": "accessory",
        "description": "Fictional color variant.",
        "base_price": Decimal("599.00"),
    },
]

STORE_MULTIPLIERS = {
    "steam": Decimal("0.95"),
    "x-kom": Decimal("1.01"),
    "morele": Decimal("1.00"),
    "mediaexpert": Decimal("1.03"),
    "allegro": Decimal("0.98"),
}


def money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def supports_category(store_slug: str, category: str) -> bool:
    if store_slug == "steam":
        return category in {"game", "handheld"}
    return True


def calculate_price(base_price: Decimal, store_slug: str, rng: random.Random) -> Decimal:
    base_multiplier = STORE_MULTIPLIERS.get(store_slug, Decimal("1.00"))
    noise = Decimal(str(rng.uniform(-0.06, 0.08)))
    factor = base_multiplier + noise
    if factor < Decimal("0.60"):
        factor = Decimal("0.60")
    return money(base_price * factor)


def upsert_store(session: Session, payload: dict[str, object]) -> tuple[Store, bool]:
    store = session.exec(select(Store).where(Store.slug == payload["slug"])).first()
    if store:
        store.name = str(payload["name"])
        store.url = str(payload["url"])
        store.logo_url = str(payload["logo_url"])
        store.is_active = bool(payload["is_active"])
        session.add(store)
        return store, False

    created = Store(**payload)
    session.add(created)
    session.flush()
    return created, True


def upsert_product(session: Session, payload: dict[str, object]) -> tuple[Product, bool]:
    product = session.exec(select(Product).where(Product.slug == payload["slug"])).first()
    if product:
        product.title = str(payload["title"])
        product.category = str(payload["category"])
        product.description = str(payload["description"])
        product.updated_at = datetime.now(timezone.utc)
        session.add(product)
        return product, False

    created = Product(**payload)
    session.add(created)
    session.flush()
    return created, True


def upsert_price(
    session: Session,
    product: Product,
    store: Store,
    current_price: Decimal,
    is_available: bool,
    now: datetime,
) -> bool:
    price = session.exec(
        select(Price).where(Price.product_id == product.id, Price.store_id == store.id)
    ).first()
    price_url = f"{store.url.rstrip('/')}/p/{product.slug}"

    if price:
        price.current_price = current_price
        price.currency = "PLN"
        price.url = price_url
        price.is_available = is_available
        price.last_checked_at = now
        price.updated_at = now
        session.add(price)
        return False

    created = Price(
        product_id=product.id,
        store_id=store.id,
        current_price=current_price,
        currency="PLN",
        url=price_url,
        is_available=is_available,
        last_checked_at=now,
    )
    session.add(created)
    return True


def seed() -> None:
    rng = random.Random(20260402)
    now = datetime.now(timezone.utc)

    created_stores = 0
    updated_stores = 0
    created_products = 0
    updated_products = 0
    created_prices = 0
    updated_prices = 0

    with Session(get_engine()) as session:
        stores_by_slug: dict[str, Store] = {}
        for store_payload in STORES:
            store, created = upsert_store(session, store_payload)
            stores_by_slug[store.slug] = store
            if created:
                created_stores += 1
            else:
                updated_stores += 1

        for product_data in PRODUCTS:
            product_payload = {
                "title": product_data["title"],
                "slug": product_data["slug"],
                "category": product_data["category"],
                "description": product_data["description"],
                "image_url": None,
                "release_date": None,
            }
            product, created = upsert_product(session, product_payload)
            if created:
                created_products += 1
            else:
                updated_products += 1

            base_price = product_data["base_price"]
            for store in stores_by_slug.values():
                if not supports_category(store.slug, product.category):
                    continue

                price_value = calculate_price(base_price, store.slug, rng)
                is_available = rng.random() >= 0.05
                was_created = upsert_price(
                    session=session,
                    product=product,
                    store=store,
                    current_price=price_value,
                    is_available=is_available,
                    now=now,
                )
                if was_created:
                    created_prices += 1
                else:
                    updated_prices += 1

        session.commit()

        total_stores = session.exec(select(func.count()).select_from(Store)).one()
        total_products = session.exec(select(func.count()).select_from(Product)).one()
        total_prices = session.exec(select(func.count()).select_from(Price)).one()

    print("Seed completed.")
    print(
        "Stores: "
        f"created={created_stores}, updated={updated_stores}, total={total_stores}"
    )
    print(
        "Products: "
        f"created={created_products}, updated={updated_products}, total={total_products}"
    )
    print(
        "Prices: "
        f"created={created_prices}, updated={updated_prices}, total={total_prices}"
    )


if __name__ == "__main__":
    seed()
