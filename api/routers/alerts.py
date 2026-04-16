from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from dependencies.auth import get_current_active_user
from shared.database import get_session
from shared.models import Alert, Product, User

router = APIRouter(prefix="/alerts", tags=["alerts"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_active_user)]


class AlertCreate(BaseModel):
    product_id: int
    target_price: Decimal | None = None
    currency: str = "PLN"


class AlertTargetPriceUpdate(BaseModel):
    target_price: Decimal | None = None
    currency: str = "PLN"


class AlertResponse(BaseModel):
    id: int
    product_id: int
    target_price: Decimal | None = None
    currency: str
    is_active: bool
    triggered_at: datetime | None = None
    created_at: datetime


@router.get("/", response_model=list[AlertResponse])
def list_alerts(
    current_user: CurrentUser,
    session: SessionDep,
    is_active: bool | None = Query(default=None),
):
    query = select(Alert).where(Alert.user_id == current_user.id)
    if is_active is not None:
        query = query.where(Alert.is_active == is_active)
    alerts = session.exec(query).all()
    return alerts


@router.post("/", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(data: AlertCreate, current_user: CurrentUser, session: SessionDep):
    product = session.get(Product, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = session.exec(
        select(Alert).where(
            Alert.user_id == current_user.id,
            Alert.product_id == data.product_id,
            Alert.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active alert for this product already exists",
        )

    alert = Alert(
        user_id=current_user.id,
        product_id=data.product_id,
        target_price=data.target_price,
        currency=data.currency,
    )
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


@router.patch("/by-product/{product_id}", response_model=AlertResponse)
def upsert_target_price_by_product(
    product_id: int,
    data: AlertTargetPriceUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if data.target_price is not None and data.target_price < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_price must be non-negative",
        )

    alert = session.exec(
        select(Alert).where(
            Alert.user_id == current_user.id,
            Alert.product_id == product_id,
            Alert.is_active == True,  # noqa: E712
        )
    ).first()

    if alert:
        alert.target_price = data.target_price
        alert.currency = data.currency
    else:
        alert = Alert(
            user_id=current_user.id,
            product_id=product_id,
            target_price=data.target_price,
            currency=data.currency,
        )
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: int, current_user: CurrentUser, session: SessionDep):
    alert = session.get(Alert, alert_id)
    if not alert or alert.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    session.delete(alert)
    session.commit()


@router.patch("/{alert_id}/deactivate", response_model=AlertResponse)
def deactivate_alert(alert_id: int, current_user: CurrentUser, session: SessionDep):
    alert = session.get(Alert, alert_id)
    if not alert or alert.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert
