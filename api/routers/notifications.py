import os
from datetime import datetime
from decimal import Decimal
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from dependencies.auth import get_current_active_user
from shared.database import get_session
from shared.models import NotificationDelivery, User

router = APIRouter(prefix="/notifications", tags=["notifications"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_active_user)]

CHANNEL_EMAIL = "email"
CHANNEL_DISCORD = "discord"


class NotificationStatusWarning(BaseModel):
    code: str
    message: str


class NotificationStatusResponse(BaseModel):
    notification_channel: str
    discord_configured: bool
    email_configured: bool
    service_available: bool
    selected_channels: list[str]
    effective_channels: list[str]
    warnings: list[NotificationStatusWarning]


class NotificationTestDeliveryResponse(BaseModel):
    channel: str
    status: str
    reason: str | None = None
    error_message: str | None = None


class NotificationTestResponse(BaseModel):
    status: str
    deliveries: list[NotificationTestDeliveryResponse]


class NotificationDeliveryResponse(BaseModel):
    id: int
    delivery_group_id: str
    user_id: int
    alert_id: int | None
    product_id: int | None
    event_type: str
    channel: str
    status: str
    reason: str | None
    error_message: str | None
    product_title: str | None
    store: str | None
    old_price: Decimal | None
    new_price: Decimal | None
    target_price: Decimal | None
    currency: str
    product_url: str | None
    created_at: datetime


def _notifications_url() -> str:
    return os.getenv("NOTIFICATIONS_INTERNAL_URL", "http://notifications:8002").rstrip("/")


def _internal_token() -> str:
    return os.getenv("INTERNAL_API_TOKEN", "").strip()


def _selected_channels(channel: str) -> list[str]:
    if channel == CHANNEL_EMAIL:
        return [CHANNEL_EMAIL]
    if channel == CHANNEL_DISCORD:
        return [CHANNEL_DISCORD]
    return [CHANNEL_DISCORD, CHANNEL_EMAIL]


def _channel_ready(
    channel: str,
    *,
    discord_configured: bool,
    email_configured: bool,
) -> bool:
    if channel == CHANNEL_DISCORD:
        return discord_configured
    if channel == CHANNEL_EMAIL:
        return email_configured
    return False


def _status_from_config(
    current_user: User,
    *,
    service_available: bool,
    email_configured: bool,
) -> NotificationStatusResponse:
    channel = current_user.notification_channel or "both"
    selected_channels = _selected_channels(channel)
    discord_configured = bool((current_user.discord_webhook_url or "").strip())
    effective_channels = [
        selected_channel
        for selected_channel in selected_channels
        if _channel_ready(
            selected_channel,
            discord_configured=discord_configured,
            email_configured=email_configured,
        )
    ]
    warnings: list[NotificationStatusWarning] = []
    if not service_available:
        warnings.append(
            NotificationStatusWarning(
                code="notifications_unavailable",
                message="Serwis powiadomień jest niedostępny.",
            )
        )
    if CHANNEL_DISCORD in selected_channels and not discord_configured:
        warnings.append(
            NotificationStatusWarning(
                code="discord_webhook_missing",
                message="Discord jest wybrany, ale nie ma zapisanego webhooka.",
            )
        )
    if CHANNEL_EMAIL in selected_channels and not email_configured:
        warnings.append(
            NotificationStatusWarning(
                code="email_not_configured",
                message="Email jest wybrany, ale SMTP nie jest skonfigurowany.",
            )
        )
    return NotificationStatusResponse(
        notification_channel=channel,
        discord_configured=discord_configured,
        email_configured=email_configured,
        service_available=service_available,
        selected_channels=selected_channels,
        effective_channels=effective_channels if service_available else [],
        warnings=warnings,
    )


async def _fetch_notification_config() -> tuple[bool, bool]:
    token = _internal_token()
    if not token:
        return False, False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                f"{_notifications_url()}/internal/notification-config",
                headers={"X-Internal-Token": token},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return False, False
    return bool(payload.get("service_available", True)), bool(
        payload.get("email_configured", False)
    )


@router.get("/status", response_model=NotificationStatusResponse)
async def notification_status(current_user: CurrentUser):
    service_available, email_configured = await _fetch_notification_config()
    return _status_from_config(
        current_user,
        service_available=service_available,
        email_configured=email_configured,
    )


@router.post("/test", response_model=NotificationTestResponse)
async def test_notification(current_user: CurrentUser):
    token = _internal_token()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notification test disabled: INTERNAL_API_TOKEN not set",
        )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{_notifications_url()}/internal/test-notification",
                headers={"X-Internal-Token": token},
                json={
                    "user_id": current_user.id,
                    "email": current_user.email,
                    "discord_webhook_url": current_user.discord_webhook_url,
                    "notification_channel": current_user.notification_channel,
                },
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        detail = "Notification test failed"
        try:
            payload = exc.response.json()
            if isinstance(payload.get("detail"), str):
                detail = payload["detail"]
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notification service unavailable",
        ) from exc


@router.get("/history", response_model=list[NotificationDeliveryResponse])
def notification_history(
    current_user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=20, ge=1, le=100),
):
    return session.exec(
        select(NotificationDelivery)
        .where(NotificationDelivery.user_id == current_user.id)
        .order_by(NotificationDelivery.created_at.desc(), NotificationDelivery.id.desc())
        .limit(limit)
    ).all()
