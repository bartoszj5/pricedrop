from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ConfigDict
from sqlalchemy import func, or_
from sqlmodel import SQLModel, Session, delete, select

from shared.database import get_session
from shared.models import Price, PriceHistory, Product, Store

SessionDep = Annotated[Session, Depends(get_session)]


class ProductCreate(SQLModel):
    title: str
    slug: str
    category: str
    description: str | None = None
    image_url: str | None = None
    release_date: datetime | None = None


class ProductUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    category: str | None = None
    description: str | None = None
    image_url: str | None = None
    release_date: datetime | None = None


class ProductRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    category: str
    description: str | None
    image_url: str | None
    release_date: datetime | None
    created_at: datetime
    updated_at: datetime


class ProductStorePriceRead(SQLModel):
    price_id: int | None
    store_id: int
    store_name: str
    store_slug: str
    store_url: str
    store_logo_url: str | None
    current_price: Decimal | None
    currency: str | None
    product_url: str | None
    is_available: bool | None
    last_checked_at: datetime | None


class ProductPriceHistoryRead(SQLModel):
    history_id: int
    price_id: int
    store_id: int
    store_name: str
    store_slug: str
    old_price: Decimal
    new_price: Decimal
    currency: str
    recorded_at: datetime


class ProductListResponse(SQLModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProductDetailResponse(SQLModel):
    product: ProductRead
    prices: list[ProductStorePriceRead]


router = APIRouter(tags=["products"])


def _get_product_by_slug(session: Session, slug: str) -> Product | None:
    return session.exec(select(Product).where(Product.slug == slug)).first()


def _ensure_unique_product_slug(
    session: Session,
    slug: str,
    current_product_id: int | None = None,
) -> None:
    statement = select(Product).where(Product.slug == slug)
    existing = session.exec(statement).first()
    if existing and existing.id != current_product_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Product with slug '{slug}' already exists.",
        )


@router.get("/products", response_model=ProductListResponse)
def list_products(
    session: SessionDep,
    search: Annotated[str | None, Query(max_length=255)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ProductListResponse:
    query = select(Product)
    count_query = select(func.count()).select_from(Product)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        condition = or_(
            Product.title.ilike(pattern),
            Product.slug.ilike(pattern),
            Product.category.ilike(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = session.exec(count_query).one()
    products = session.exec(
        query
        .order_by(Product.title.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ProductListResponse(
        items=[ProductRead.model_validate(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 0,
    )


@router.get("/products/{slug}", response_model=ProductDetailResponse)
def get_product_details(slug: str, session: SessionDep) -> ProductDetailResponse:
    product = _get_product_by_slug(session, slug)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{slug}' not found.",
        )

    rows = session.exec(
        select(Store, Price)
        .outerjoin(
            Price,
            (Price.store_id == Store.id) & (Price.product_id == product.id),
        )
        .order_by(Store.name.asc())
    ).all()

    prices = [
        ProductStorePriceRead(
            price_id=price.id if price else None,
            store_id=store.id,
            store_name=store.name,
            store_slug=store.slug,
            store_url=store.url,
            store_logo_url=store.logo_url,
            current_price=price.current_price if price else None,
            currency=price.currency if price else None,
            product_url=price.url if price else None,
            is_available=price.is_available if price else None,
            last_checked_at=price.last_checked_at if price else None,
        )
        for store, price in rows
    ]

    return ProductDetailResponse(
        product=ProductRead.model_validate(product),
        prices=prices,
    )


@router.get("/products/{slug}/history", response_model=list[ProductPriceHistoryRead])
def get_product_price_history(
    slug: str,
    session: SessionDep,
) -> list[ProductPriceHistoryRead]:
    product = _get_product_by_slug(session, slug)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{slug}' not found.",
        )

    rows = session.exec(
        select(PriceHistory, Price, Store)
        .join(Price, PriceHistory.price_id == Price.id)
        .join(Store, Price.store_id == Store.id)
        .where(Price.product_id == product.id)
        .order_by(PriceHistory.recorded_at.desc())
    ).all()

    return [
        ProductPriceHistoryRead(
            history_id=history.id,
            price_id=price.id,
            store_id=store.id,
            store_name=store.name,
            store_slug=store.slug,
            old_price=history.old_price,
            new_price=history.new_price,
            currency=history.currency,
            recorded_at=history.recorded_at,
        )
        for history, price, store in rows
    ]


@router.post(
    "/products",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
)
def create_product(payload: ProductCreate, session: SessionDep) -> ProductRead:
    _ensure_unique_product_slug(session, payload.slug)

    product = Product(**payload.model_dump())
    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductRead.model_validate(product)


@router.put("/products/{slug}", response_model=ProductRead)
def update_product(
    slug: str,
    payload: ProductUpdate,
    session: SessionDep,
) -> ProductRead:
    product = _get_product_by_slug(session, slug)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{slug}' not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    new_slug = update_data.get("slug")
    if new_slug and new_slug != product.slug:
        _ensure_unique_product_slug(session, new_slug, current_product_id=product.id)

    for field, value in update_data.items():
        setattr(product, field, value)

    product.updated_at = datetime.now(timezone.utc)
    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductRead.model_validate(product)


@router.delete("/products/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(slug: str, session: SessionDep) -> Response:
    product = _get_product_by_slug(session, slug)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{slug}' not found.",
        )

    price_ids = session.exec(
        select(Price.id).where(Price.product_id == product.id)
    ).all()

    if price_ids:
        session.exec(delete(PriceHistory).where(PriceHistory.price_id.in_(price_ids)))

    session.exec(delete(Price).where(Price.product_id == product.id))
    session.exec(delete(Product).where(Product.id == product.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
