from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlmodel import Session, select

from dependencies.auth import get_current_active_user
from shared.database import get_session
from shared.models import Alert, Price, Product, Store, User

router = APIRouter(prefix="/likes", tags=["likes"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_active_user)]


class ProductLikeResponse(BaseModel):
    id: int
    product_id: int
    created_at: datetime


class LikedProductRead(BaseModel):
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
    best_price: float | None
    best_price_currency: str | None
    best_store_name: str | None
    best_store_slug: str | None
    best_store_logo_url: str | None
    available_offers_count: int
    tracked_stores_count: int
    liked_at: datetime


def _active_alert(session: Session, user_id: int, product_id: int) -> Alert | None:
    return session.exec(
        select(Alert).where(
            Alert.user_id == user_id,
            Alert.product_id == product_id,
            Alert.is_active == True,  # noqa: E712
        )
    ).first()


@router.get("/", response_model=list[ProductLikeResponse])
def list_likes(current_user: CurrentUser, session: SessionDep):
    alerts = session.exec(
        select(Alert)
        .where(
            Alert.user_id == current_user.id,
            Alert.is_active == True,  # noqa: E712
        )
        .order_by(Alert.created_at.desc())
    ).all()
    return [
        ProductLikeResponse(
            id=alert.id,
            product_id=alert.product_id,
            created_at=alert.created_at,
        )
        for alert in alerts
    ]


@router.get("/ids", response_model=list[int])
def list_like_ids(current_user: CurrentUser, session: SessionDep):
    return session.exec(
        select(Alert.product_id)
        .where(
            Alert.user_id == current_user.id,
            Alert.is_active == True,  # noqa: E712
        )
        .order_by(Alert.created_at.desc())
    ).all()


@router.get("/products", response_model=list[LikedProductRead])
def list_liked_products(current_user: CurrentUser, session: SessionDep):
    available_condition = (Price.is_available == True) & Price.current_price.is_not(None)  # noqa: E712

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

    tracked_stores_count = int(
        session.exec(select(func.count()).select_from(Store)).one()
    )

    rows = session.exec(
        select(
            Product,
            ranked_best_prices.c.best_price,
            ranked_best_prices.c.currency,
            ranked_best_prices.c.store_name,
            ranked_best_prices.c.store_slug,
            ranked_best_prices.c.store_logo_url,
            func.coalesce(price_stats.c.available_offers_count, 0).label(
                "available_offers_count"
            ),
            Alert.created_at.label("liked_at"),
        )
        .join(Alert, Alert.product_id == Product.id)
        .outerjoin(price_stats, price_stats.c.product_id == Product.id)
        .outerjoin(
            ranked_best_prices,
            (ranked_best_prices.c.product_id == Product.id)
            & (ranked_best_prices.c.rn == 1),
        )
        .where(
            Alert.user_id == current_user.id,
            Alert.is_active == True,  # noqa: E712
        )
        .order_by(Alert.created_at.desc(), Product.title.asc())
    ).all()

    return [
        LikedProductRead(
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
            best_price=float(best_price) if best_price is not None else None,
            best_price_currency=currency,
            best_store_name=store_name,
            best_store_slug=store_slug,
            best_store_logo_url=store_logo_url,
            available_offers_count=int(available_offers_count or 0),
            tracked_stores_count=tracked_stores_count,
            liked_at=liked_at,
        )
        for (
            product,
            best_price,
            currency,
            store_name,
            store_slug,
            store_logo_url,
            available_offers_count,
            liked_at,
        ) in rows
    ]


@router.post("/{product_id}", response_model=ProductLikeResponse)
def like_product(product_id: int, current_user: CurrentUser, session: SessionDep):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = _active_alert(session, current_user.id, product_id)
    if existing:
        return ProductLikeResponse(
            id=existing.id,
            product_id=existing.product_id,
            created_at=existing.created_at,
        )

    alert = Alert(
        user_id=current_user.id,
        product_id=product_id,
        target_price=None,
    )
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return ProductLikeResponse(
        id=alert.id,
        product_id=alert.product_id,
        created_at=alert.created_at,
    )


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlike_product(product_id: int, current_user: CurrentUser, session: SessionDep):
    alerts = session.exec(
        select(Alert).where(
            Alert.user_id == current_user.id,
            Alert.product_id == product_id,
            Alert.is_active == True,  # noqa: E712
        )
    ).all()
    for alert in alerts:
        alert.is_active = False
        session.add(alert)
    session.commit()
