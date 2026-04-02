from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ConfigDict
from sqlalchemy import func, or_
from sqlmodel import SQLModel, Session, delete, select

from shared.database import get_session
from shared.models import Price, PriceHistory, Store

SessionDep = Annotated[Session, Depends(get_session)]


class StoreCreate(SQLModel):
    name: str
    slug: str
    url: str
    logo_url: str | None = None
    is_active: bool = True


class StoreUpdate(SQLModel):
    name: str | None = None
    slug: str | None = None
    url: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class StoreRead(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    url: str
    logo_url: str | None
    is_active: bool


class StoreListResponse(SQLModel):
    items: list[StoreRead]
    total: int
    page: int
    page_size: int
    total_pages: int


router = APIRouter(tags=["stores"])


def _get_store_by_slug(session: Session, slug: str) -> Store | None:
    return session.exec(select(Store).where(Store.slug == slug)).first()


def _ensure_unique_store_slug(
    session: Session,
    slug: str,
    current_store_id: int | None = None,
) -> None:
    existing = session.exec(select(Store).where(Store.slug == slug)).first()
    if existing and existing.id != current_store_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Store with slug '{slug}' already exists.",
        )


@router.get("/stores", response_model=StoreListResponse)
def list_stores(
    session: SessionDep,
    search: Annotated[str | None, Query(max_length=255)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> StoreListResponse:
    query = select(Store)
    count_query = select(func.count()).select_from(Store)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        condition = or_(Store.name.ilike(pattern), Store.slug.ilike(pattern))
        query = query.where(condition)
        count_query = count_query.where(condition)

    total = session.exec(count_query).one()
    stores = session.exec(
        query.order_by(Store.name.asc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    return StoreListResponse(
        items=[StoreRead.model_validate(store) for store in stores],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size) if total else 0,
    )


@router.get("/stores/{slug}", response_model=StoreRead)
def get_store(slug: str, session: SessionDep) -> StoreRead:
    store = _get_store_by_slug(session, slug)
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store '{slug}' not found.",
        )
    return StoreRead.model_validate(store)


@router.post("/stores", response_model=StoreRead, status_code=status.HTTP_201_CREATED)
def create_store(payload: StoreCreate, session: SessionDep) -> StoreRead:
    _ensure_unique_store_slug(session, payload.slug)

    store = Store(**payload.model_dump())
    session.add(store)
    session.commit()
    session.refresh(store)
    return StoreRead.model_validate(store)


@router.put("/stores/{slug}", response_model=StoreRead)
def update_store(slug: str, payload: StoreUpdate, session: SessionDep) -> StoreRead:
    store = _get_store_by_slug(session, slug)
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store '{slug}' not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    new_slug = update_data.get("slug")
    if new_slug and new_slug != store.slug:
        _ensure_unique_store_slug(session, new_slug, current_store_id=store.id)

    for field, value in update_data.items():
        setattr(store, field, value)

    session.add(store)
    session.commit()
    session.refresh(store)
    return StoreRead.model_validate(store)


@router.delete("/stores/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_store(slug: str, session: SessionDep) -> Response:
    store = _get_store_by_slug(session, slug)
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store '{slug}' not found.",
        )

    price_ids = session.exec(
        select(Price.id).where(Price.store_id == store.id)
    ).all()

    if price_ids:
        session.exec(delete(PriceHistory).where(PriceHistory.price_id.in_(price_ids)))

    session.exec(delete(Price).where(Price.store_id == store.id))
    session.exec(delete(Store).where(Store.id == store.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
