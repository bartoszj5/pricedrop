from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint


# --- Product ---


class Product(SQLModel, table=True):
    __tablename__ = "products"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=255, index=True)
    slug: str = Field(max_length=255, unique=True, index=True)
    category: str = Field(max_length=50, index=True)
    manufacturer_code: str | None = Field(default=None, max_length=128, index=True)
    description: str | None = Field(default=None)
    image_url: str | None = Field(default=None, max_length=512)
    release_date: datetime | None = Field(default=None)
    popularity_rank: int | None = Field(default=None, index=True)
    itad_game_id: str | None = Field(default=None, max_length=64, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    prices: list["Price"] = Relationship(back_populates="product")
    alerts: list["Alert"] = Relationship(back_populates="product")


# --- Store ---


class Store(SQLModel, table=True):
    __tablename__ = "stores"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, unique=True)
    slug: str = Field(max_length=100, unique=True, index=True)
    url: str = Field(max_length=512)
    logo_url: str | None = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    prices: list["Price"] = Relationship(back_populates="store")


# --- Price ---


class Price(SQLModel, table=True):
    __tablename__ = "prices"
    __table_args__ = (
        UniqueConstraint("product_id", "store_id", name="uq_price_product_store"),
    )

    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    store_id: int = Field(foreign_key="stores.id", index=True)
    current_price: Decimal = Field(max_digits=10, decimal_places=2)
    currency: str = Field(default="PLN", max_length=3)
    url: str = Field(max_length=512)
    is_available: bool = Field(default=True)
    last_checked_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    product: Product = Relationship(back_populates="prices")
    store: Store = Relationship(back_populates="prices")
    history: list["PriceHistory"] = Relationship(back_populates="price")


# --- PriceHistory ---


class PriceHistory(SQLModel, table=True):
    __tablename__ = "price_history"

    id: int | None = Field(default=None, primary_key=True)
    price_id: int = Field(foreign_key="prices.id", index=True)
    old_price: Decimal = Field(max_digits=10, decimal_places=2)
    new_price: Decimal = Field(max_digits=10, decimal_places=2)
    currency: str = Field(default="PLN", max_length=3)
    recorded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    price: Price = Relationship(back_populates="history")


# --- User ---


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(max_length=255, unique=True, index=True)
    username: str = Field(max_length=100, unique=True, index=True)
    hashed_password: str = Field(max_length=255)
    discord_webhook_url: str | None = Field(default=None, max_length=1024)
    notification_channel: str = Field(default="both", max_length=16)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    alerts: list["Alert"] = Relationship(back_populates="user")


# --- Alert ---


class Alert(SQLModel, table=True):
    __tablename__ = "alerts"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    target_price: Decimal | None = Field(
        default=None, max_digits=10, decimal_places=2
    )
    currency: str = Field(default="PLN", max_length=3)
    is_active: bool = Field(default=True)
    triggered_at: datetime | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    user: User = Relationship(back_populates="alerts")
    product: Product = Relationship(back_populates="alerts")
