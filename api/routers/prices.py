from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ConfigDict, field_validator
from sqlalchemy import func
from sqlmodel import SQLModel, Session, delete, select

from shared.database import get_session
from shared.models import Price, PriceHistory, Product, Store

SessionDep = Annotated[Session, Depends(get_session)]


class PriceCreate(SQLModel):
    product_id: int
    store_id: int
    current_price: Decimal
    currency: str = "PLN"
    url: str
    is_available: bool = True
    last_checked_at: datetime | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class PriceUpdate(SQLModel):
    product_id: int | None = None
    store_id: int | None = None
    current_price: Decimal | None = None
    currency: str | None = None
    url: str | None = None
    is_available: bool | None = None
    last_checked_at: datetime | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class PriceRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    store_id: int
    current_price: Decimal
    currency: str
    url: str
    is_available: bool
    last_checked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PriceDetailRead(PriceRead):
    product_title: str
    product_slug: str
    store_slug: str
    store_name: str


class PriceListResponse(SQLModel):
    items: list[PriceDetailRead]
    total: int
    page: int
    page_size: int
    total_pages: int


router = APIRouter(tags=["prices"])


def _get_price_by_id(session: Session, price_id: int) -> Price | None:
    return session.exec(select(Price).where(Price.id == price_id)).first()


def _ensure_product_exists(session: Session, product_id: int) -> None:
    product = session.exec(select(Product).where(Product.id == product_id)).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found.",
        )


def _ensure_store_exists(session: Session, store_id: int) -> None:
    store = session.exec(select(Store).where(Store.id == store_id)).first()
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store with id {store_id} not found.",
        )


def _ensure_unique_price_pair(
    session: Session,
    product_id: int,
    store_id: int,
    current_price_id: int | None = None,
) -> None:
    existing = session.exec(
        select(Price).where(Price.product_id == product_id, Price.store_id == store_id)
    ).first()
    if existing and existing.id != current_price_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Price entry for this product and store already exists. "
                "Use update instead."
            ),
        )


@router.get("/prices", response_model=PriceListResponse)
def list_prices(
    session: SessionDep,
    product_slug: Annotated[str | None, Query(max_length=255)] = None,
    store_slug: Annotated[str | None, Query(max_length=255)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PriceListResponse:
    base_statement = (
        select(Price, Product, Store)
        .join(Product, Price.product_id == Product.id)
        .join(Store, Price.store_id == Store.id)
    )

    if product_slug:
        base_statement = base_statement.where(Product.slug == product_slug)
    if store_slug:
        base_statement = base_statement.where(Store.slug == store_slug)

    total_subquery = base_statement.with_only_columns(Price.id).subquery()
    total = session.exec(select(func.count()).select_from(total_subquery)).one()

    rows = session.exec(
        base_statement
        .order_by(Product.title.asc(), Store.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = [
        PriceDetailRead(
            id=price.id,
            product_id=price.product_id,
            store_id=price.store_id,
            current_price=price.current_price,
            currency=price.currency,
            url=price.url,
            is_available=price.is_available,
            last_checked_at=price.last_checked_at,
            created_at=price.created_at,
            updated_at=price.updated_at,
            product_title=product.title,
            product_slug=product.slug,
            store_slug=store.slug,
            store_name=store.name,
        )
        for price, product, store in rows
    ]

    return PriceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 0,
    )


@router.get("/prices/{price_id}", response_model=PriceDetailRead)
def get_price(price_id: int, session: SessionDep) -> PriceDetailRead:
    row = session.exec(
        select(Price, Product, Store)
        .join(Product, Price.product_id == Product.id)
        .join(Store, Price.store_id == Store.id)
        .where(Price.id == price_id)
    ).first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price with id {price_id} not found.",
        )

    price, product, store = row
    return PriceDetailRead(
        id=price.id,
        product_id=price.product_id,
        store_id=price.store_id,
        current_price=price.current_price,
        currency=price.currency,
        url=price.url,
        is_available=price.is_available,
        last_checked_at=price.last_checked_at,
        created_at=price.created_at,
        updated_at=price.updated_at,
        product_title=product.title,
        product_slug=product.slug,
        store_slug=store.slug,
        store_name=store.name,
    )


@router.post("/prices", response_model=PriceRead, status_code=status.HTTP_201_CREATED)
def create_price(payload: PriceCreate, session: SessionDep) -> PriceRead:
    _ensure_product_exists(session, payload.product_id)
    _ensure_store_exists(session, payload.store_id)
    _ensure_unique_price_pair(session, payload.product_id, payload.store_id)

    price = Price(**payload.model_dump())
    session.add(price)
    session.commit()
    session.refresh(price)

    return PriceRead.model_validate(price)


@router.patch("/prices/{price_id}", response_model=PriceRead)
def update_price(price_id: int, payload: PriceUpdate, session: SessionDep) -> PriceRead:
    price = _get_price_by_id(session, price_id)
    if not price:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price with id {price_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    next_product_id = update_data.get("product_id", price.product_id)
    next_store_id = update_data.get("store_id", price.store_id)
    if next_product_id != price.product_id:
        _ensure_product_exists(session, next_product_id)
    if next_store_id != price.store_id:
        _ensure_store_exists(session, next_store_id)
    if next_product_id != price.product_id or next_store_id != price.store_id:
        _ensure_unique_price_pair(
            session,
            next_product_id,
            next_store_id,
            current_price_id=price.id,
        )

    previous_price = price.current_price
    for field, value in update_data.items():
        setattr(price, field, value)
    price.updated_at = datetime.now(timezone.utc)

    if "current_price" in update_data and price.current_price != previous_price:
        history = PriceHistory(
            price_id=price.id,
            old_price=previous_price,
            new_price=price.current_price,
            currency=price.currency,
        )
        session.add(history)

    session.add(price)
    session.commit()
    session.refresh(price)

    return PriceRead.model_validate(price)


@router.delete("/prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price(price_id: int, session: SessionDep) -> Response:
    price = _get_price_by_id(session, price_id)
    if not price:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Price with id {price_id} not found.",
        )

    session.exec(delete(PriceHistory).where(PriceHistory.price_id == price.id))
    session.exec(delete(Price).where(Price.id == price.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
