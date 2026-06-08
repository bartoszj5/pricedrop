from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from dependencies.auth import get_current_active_user
from shared.database import get_session
from shared.models import Alert, NotificationDelivery, Product, User

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
    last_delivery_status: str | None = None


def _aggregate_delivery_status(statuses: list[str]) -> str | None:
    if not statuses:
        return None
    unique_statuses = set(statuses)
    if unique_statuses == {"sent"}:
        return "sent"
    if "sent" in unique_statuses:
        return "partial"
    if "failed" in unique_statuses:
        return "failed"
    return "skipped"


def _latest_delivery_status_by_alert(
    session: Session,
    alerts: list[Alert],
) -> dict[int, str | None]:
    alert_ids = [alert.id for alert in alerts if alert.id is not None]
    if not alert_ids:
        return {}

    rows = session.exec(
        select(NotificationDelivery)
        .where(NotificationDelivery.alert_id.in_(alert_ids))  # type: ignore[attr-defined]
        .order_by(
            NotificationDelivery.created_at.desc(),
            NotificationDelivery.id.desc(),
        )
    ).all()

    latest_group_by_alert: dict[int, str] = {}
    statuses_by_alert: dict[int, list[str]] = {}
    for row in rows:
        if row.alert_id is None:
            continue
        latest_group = latest_group_by_alert.setdefault(
            row.alert_id,
            row.delivery_group_id,
        )
        if row.delivery_group_id == latest_group:
            statuses_by_alert.setdefault(row.alert_id, []).append(row.status)

    return {
        alert_id: _aggregate_delivery_status(statuses)
        for alert_id, statuses in statuses_by_alert.items()
    }


def _alert_response(
    alert: Alert,
    last_delivery_status: str | None = None,
) -> AlertResponse:
    return AlertResponse(
        id=alert.id,
        product_id=alert.product_id,
        target_price=alert.target_price,
        currency=alert.currency,
        is_active=alert.is_active,
        triggered_at=alert.triggered_at,
        created_at=alert.created_at,
        last_delivery_status=last_delivery_status,
    )


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
    statuses = _latest_delivery_status_by_alert(session, list(alerts))
    return [_alert_response(alert, statuses.get(alert.id)) for alert in alerts]


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
    return _alert_response(alert)


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
    status_by_alert = _latest_delivery_status_by_alert(session, [alert])
    return _alert_response(alert, status_by_alert.get(alert.id))


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
    status_by_alert = _latest_delivery_status_by_alert(session, [alert])
    return _alert_response(alert, status_by_alert.get(alert.id))
