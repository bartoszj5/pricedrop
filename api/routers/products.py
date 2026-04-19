from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ConfigDict
from sqlalchemy import case, func, or_
from sqlmodel import SQLModel, Session, delete, select

import cache
from dependencies.auth import require_internal_token
from shared.database import get_session
from shared.models import Alert, Price, PriceHistory, Product, Store

SessionDep = Annotated[Session, Depends(get_session)]


class ProductCreate(SQLModel):
    title: str
    slug: str
    category: str
    manufacturer_code: str | None = None
    description: str | None = None
    image_url: str | None = None
    release_date: datetime | None = None


class ProductUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    category: str | None = None
    manufacturer_code: str | None = None
    description: str | None = None
    image_url: str | None = None
    release_date: datetime | None = None


class ProductRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    category: str
    manufacturer_code: str | None
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
    store_prices: list[ProductStorePriceRead]
    active_offers_count: int
    tracked_stores_count: int
    inactive_offers_count: int


class ProductWithBestPriceRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    category: str
    manufacturer_code: str | None
    description: str | None
    image_url: str | None
    release_date: datetime | None
    created_at: datetime
    updated_at: datetime
    best_price: Decimal | None = None
    best_price_currency: str | None = None
    best_store_name: str | None = None
    best_store_slug: str | None = None
    best_store_logo_url: str | None = None
    available_offers_count: int = 0
    tracked_stores_count: int = 0


class ProductWithPricesListResponse(SQLModel):
    items: list[ProductWithBestPriceRead]
    categories: list[str]
    total: int
    page: int
    page_size: int
    total_pages: int


router = APIRouter(tags=["products"])
ProductSort = Literal[
    "featured",
    "popularity",
    "price_asc",
    "price_desc",
    "title_asc",
    "title_desc",
    "newest",
    "category",
]


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


FREE_GAME_CATEGORIES = ("game", "package", "dlc")

NOISE_TITLE_TERMS = (
    "soundtrack",
    "ost",
    "season pass",
    "year pass",
    "year 1 pass",
    "year 2 pass",
    "season 1",
    "season 2",
    "battle pass",
    "upgrade pack",
    "dlc",
    "demo",
    "companion",
)


def _apply_product_filters(
    statement,
    *,
    search: str | None = None,
    category: str | None = None,
    store: str | None = None,
):
    if search and search.strip():
        for term in search.strip().split():
            pattern = f"%{term}%"
            condition = or_(
                Product.title.ilike(pattern),
                Product.slug.ilike(pattern),
                Product.category.ilike(pattern),
                Product.manufacturer_code.ilike(pattern),
            )
            statement = statement.where(condition)

    if category and category.strip():
        normalized_category = category.strip().casefold()
        if normalized_category == "game":
            statement = statement.where(Product.category.in_(("game", "package")))
        else:
            statement = statement.where(Product.category == normalized_category)

    if store and store.strip():
        normalized_store = store.strip()
        statement = statement.where(
            select(Price.id)
            .join(Store, Price.store_id == Store.id)
            .where(
                Price.product_id == Product.id,
                Store.slug == normalized_store,
            )
            .exists()
        )

    free_game_ids = (
        select(Price.product_id)
        .join(Product, Product.id == Price.product_id)
        .where(
            Product.category.in_(FREE_GAME_CATEGORIES),
            Price.is_available.is_(True),
            Price.current_price.is_not(None),
        )
        .group_by(Price.product_id)
        .having(func.min(Price.current_price) <= 0)
    )
    statement = statement.where(Product.id.not_in(free_game_ids))

    return statement


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
        for term in search.strip().split():
            pattern = f"%{term}%"
            condition = or_(
                Product.title.ilike(pattern),
                Product.slug.ilike(pattern),
                Product.category.ilike(pattern),
                Product.manufacturer_code.ilike(pattern),
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


@router.get("/products/with-prices", response_model=ProductWithPricesListResponse)
def list_products_with_prices(
    session: SessionDep,
    search: Annotated[str | None, Query(max_length=255)] = None,
    category: Annotated[str | None, Query(max_length=50)] = None,
    store: Annotated[str | None, Query(max_length=100)] = None,
    sort: ProductSort = "featured",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ProductWithPricesListResponse:
    cache_key = cache.build_products_key(
        search=search,
        category=category,
        store=store,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    cached = cache.get_json(cache_key)
    if cached is not None:
        return ProductWithPricesListResponse.model_validate(cached)

    available_condition = (Price.is_available == True) & Price.current_price.is_not(None)

    ranked_best_prices = (
        select(
            Price.product_id.label("product_id"),
            Price.current_price.label("best_price"),
            Price.currency.label("currency"),
            Store.name.label("store_name"),
            Store.slug.label("store_slug"),
            Store.logo_url.label("store_logo_url"),
            func.row_number()
            .over(
                partition_by=Price.product_id,
                order_by=Price.current_price.asc(),
            )
            .label("rn"),
        )
        .join(Store, Price.store_id == Store.id)
        .where(available_condition)
        .subquery()
    )

    price_stats = (
        select(
            Price.product_id.label("product_id"),
            func.sum(case((available_condition, 1), else_=0)).label(
                "available_offers_count"
            ),
        )
        .group_by(Price.product_id)
        .subquery()
    )

    count_query = _apply_product_filters(
        select(func.count()).select_from(Product),
        search=search,
        category=category,
        store=store,
    )
    categories_query = _apply_product_filters(
        select(Product.category).distinct(),
        search=search,
        store=store,
    ).order_by(Product.category.asc())

    available_offers_count = func.coalesce(price_stats.c.available_offers_count, 0)
    best_price = ranked_best_prices.c.best_price
    best_price_missing = case((best_price.is_(None), 1), else_=0)
    # Recreate the filtered product subquery for stable column access in joins.
    filtered_products = _apply_product_filters(
        select(Product.id),
        search=search,
        category=category,
        store=store,
    ).subquery()
    query = (
        select(
            Product,
            ranked_best_prices.c.best_price,
            ranked_best_prices.c.currency,
            ranked_best_prices.c.store_name,
            ranked_best_prices.c.store_slug,
            ranked_best_prices.c.store_logo_url,
            available_offers_count.label("available_offers_count"),
        )
        .join(filtered_products, filtered_products.c.id == Product.id)
        .outerjoin(price_stats, price_stats.c.product_id == Product.id)
        .outerjoin(
            ranked_best_prices,
            (ranked_best_prices.c.product_id == Product.id)
            & (ranked_best_prices.c.rn == 1),
        )
    )

    if sort == "popularity":
        rank_missing = case((Product.popularity_rank.is_(None), 1), else_=0)
        order_columns = []
        trimmed_search = search.strip() if search else ""
        if trimmed_search:
            search_lower = trimmed_search.lower()
            title_lower = func.lower(Product.title)
            title_match_rank = case(
                (title_lower == search_lower, 0),
                (title_lower.like(f"{search_lower} %"), 1),
                (title_lower.like(f"{search_lower}%"), 2),
                (title_lower.like(f"% {search_lower} %"), 3),
                (title_lower.like(f"%{search_lower}%"), 4),
                else_=5,
            )
            noise_penalty = case(
                (
                    or_(
                        *[title_lower.like(f"%{term}%") for term in NOISE_TITLE_TERMS]
                    ),
                    1,
                ),
                else_=0,
            )
            order_columns.extend(
                [title_match_rank.asc(), noise_penalty.asc()]
            )
        order_columns.extend(
            [
                rank_missing.asc(),
                Product.popularity_rank.asc(),
                best_price_missing.asc(),
                best_price.asc(),
                Product.title.asc(),
            ]
        )
        query = query.order_by(*order_columns)
    elif sort == "price_asc":
        query = query.order_by(best_price_missing.asc(), best_price.asc(), Product.title.asc())
    elif sort == "price_desc":
        query = query.order_by(
            best_price_missing.asc(),
            best_price.desc(),
            Product.title.asc(),
        )
    elif sort == "title_desc":
        query = query.order_by(Product.title.desc())
    elif sort == "newest":
        query = query.order_by(Product.created_at.desc(), Product.title.asc())
    elif sort == "category":
        query = query.order_by(Product.category.asc(), Product.title.asc())
    elif sort == "title_asc":
        query = query.order_by(Product.title.asc())
    else:
        query = query.order_by(
            best_price_missing.asc(),
            best_price.asc(),
            Product.updated_at.desc(),
            Product.title.asc(),
        )

    total = session.exec(count_query).one()
    categories = session.exec(categories_query).all()
    tracked_stores_count = session.exec(select(func.count()).select_from(Store)).one()
    rows = session.exec(
        query.offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for (
        product,
        best_price_value,
        currency,
        store_name,
        store_slug,
        store_logo_url,
        available_offers_count_value,
    ) in rows:
        items.append(
            ProductWithBestPriceRead(
                id=product.id,
                title=product.title,
                slug=product.slug,
                category=product.category,
                manufacturer_code=product.manufacturer_code,
                description=product.description,
                image_url=product.image_url,
                release_date=product.release_date,
                created_at=product.created_at,
                updated_at=product.updated_at,
                best_price=best_price_value,
                best_price_currency=currency,
                best_store_name=store_name,
                best_store_slug=store_slug,
                best_store_logo_url=store_logo_url,
                available_offers_count=int(available_offers_count_value or 0),
                tracked_stores_count=int(tracked_stores_count),
            )
        )

    response = ProductWithPricesListResponse(
        items=items,
        categories=categories,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 0,
    )
    cache.set_json(cache_key, response.model_dump(mode="json"))
    return response


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
        .join(
            Price,
            (Price.store_id == Store.id) & (Price.product_id == product.id),
        )
        .order_by(Store.name.asc())
    ).all()

    store_prices = [
        ProductStorePriceRead(
            price_id=price.id,
            store_id=store.id,
            store_name=store.name,
            store_slug=store.slug,
            store_url=store.url,
            store_logo_url=store.logo_url,
            current_price=price.current_price,
            currency=price.currency,
            product_url=price.url,
            is_available=price.is_available,
            last_checked_at=price.last_checked_at,
        )
        for store, price in rows
    ]

    active_offers_count = sum(
        1 for price in store_prices if price.is_available and price.current_price is not None
    )
    tracked_stores_count = len(store_prices)
    inactive_offers_count = tracked_stores_count - active_offers_count

    return ProductDetailResponse(
        product=ProductRead.model_validate(product),
        store_prices=store_prices,
        active_offers_count=active_offers_count,
        tracked_stores_count=tracked_stores_count,
        inactive_offers_count=inactive_offers_count,
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
    dependencies=[Depends(require_internal_token)],
)
def create_product(payload: ProductCreate, session: SessionDep) -> ProductRead:
    _ensure_unique_product_slug(session, payload.slug)

    product = Product(**payload.model_dump())
    session.add(product)
    session.commit()
    session.refresh(product)

    return ProductRead.model_validate(product)


@router.patch(
    "/products/{slug}",
    response_model=ProductRead,
    dependencies=[Depends(require_internal_token)],
)
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


@router.delete(
    "/products/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_internal_token)],
)
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

    session.exec(delete(Alert).where(Alert.product_id == product.id))
    session.exec(delete(Price).where(Price.product_id == product.id))
    session.exec(delete(Product).where(Product.id == product.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
