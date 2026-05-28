import asyncio
import hmac
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.message import EmailMessage
from typing import Any

import aio_pika
import aiosmtplib
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from shared.database import get_engine
from shared.models import Alert, NotificationDelivery, User

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("notifications")

RABBITMQ_URL = os.getenv(
    "RABBITMQ_URL",
    "amqp://guest:guest@rabbitmq:5672/",
)
EXCHANGE_NAME = os.getenv("RABBITMQ_EXCHANGE", "price_events")
ROUTING_KEY = os.getenv("RABBITMQ_ROUTING_KEY", "price.dropped")
QUEUE_NAME = os.getenv("RABBITMQ_QUEUE", "notifications.price.dropped")

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


SMTP_USE_TLS = _read_bool_env("SMTP_USE_TLS", False)
SMTP_STARTTLS = _read_bool_env("SMTP_STARTTLS", not SMTP_USE_TLS)
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")

EVENT_PRICE_DROP = "price_drop"
EVENT_TEST = "test"
CHANNEL_EMAIL = "email"
CHANNEL_DISCORD = "discord"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"

CONSUMER_STATE: dict[str, str | bool | None] = {
    "running": False,
    "last_error": None,
}


@dataclass(slots=True)
class PriceDroppedEvent:
    product_id: int
    product_title: str
    store: str
    old_price: Decimal
    new_price: Decimal
    url: str


@dataclass(slots=True)
class _AlertMatch:
    alert_id: int | None
    target_price: Decimal | None
    user_id: int
    user_email: str
    user_webhook_url: str | None
    user_notification_channel: str


@dataclass(slots=True)
class DeliveryAttempt:
    channel: str
    status: str
    reason: str | None = None
    error_message: str | None = None


class InternalTestNotificationRequest(BaseModel):
    user_id: int
    email: str
    discord_webhook_url: str | None = None
    notification_channel: str = "both"


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid decimal value: {value}") from exc


def _format_price(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'))}"


def _parse_price_drop_event(body: bytes) -> PriceDroppedEvent | None:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.warning("Received malformed JSON message: %r", body)
        return None

    try:
        product_id = int(payload["product_id"])
        return PriceDroppedEvent(
            product_id=product_id,
            product_title=str(payload.get("product_title") or f"Product #{product_id}"),
            store=str(payload.get("store") or "Unknown store"),
            old_price=_to_decimal(payload["old_price"]),
            new_price=_to_decimal(payload["new_price"]),
            url=str(payload.get("url") or ""),
        )
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("Skipping invalid price.dropped payload %s (%s)", payload, exc)
        return None


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def _aggregate_attempt_status(attempts: list[DeliveryAttempt]) -> str:
    if not attempts:
        return STATUS_SKIPPED
    statuses = {attempt.status for attempt in attempts}
    if statuses == {STATUS_SENT}:
        return STATUS_SENT
    if STATUS_SENT in statuses:
        return "partial"
    if STATUS_FAILED in statuses:
        return STATUS_FAILED
    return STATUS_SKIPPED


def _safe_delivery_error(channel: str, exc: Exception) -> str:
    if channel == CHANNEL_DISCORD and isinstance(exc, httpx.HTTPStatusError):
        return f"Discord webhook returned HTTP {exc.response.status_code}"
    if channel == CHANNEL_DISCORD:
        return "Discord webhook request failed"
    return f"Email send failed: {type(exc).__name__}"


def _selected_channels(channel: str) -> list[str]:
    if channel == CHANNEL_EMAIL:
        return [CHANNEL_EMAIL]
    if channel == CHANNEL_DISCORD:
        return [CHANNEL_DISCORD]
    return [CHANNEL_DISCORD, CHANNEL_EMAIL]


def _delivery_row(
    match: _AlertMatch,
    event: PriceDroppedEvent,
    attempt: DeliveryAttempt,
    *,
    delivery_group_id: str,
    event_type: str,
    created_at: datetime,
) -> NotificationDelivery:
    return NotificationDelivery(
        delivery_group_id=delivery_group_id,
        user_id=match.user_id,
        alert_id=match.alert_id,
        product_id=event.product_id if event.product_id > 0 else None,
        event_type=event_type,
        channel=attempt.channel,
        status=attempt.status,
        reason=attempt.reason,
        error_message=attempt.error_message,
        product_title=event.product_title,
        store=event.store,
        old_price=event.old_price,
        new_price=event.new_price,
        target_price=match.target_price,
        currency="PLN",
        product_url=event.url or None,
        created_at=created_at,
    )


def _persist_delivery_attempts(
    match: _AlertMatch,
    event: PriceDroppedEvent,
    attempts: list[DeliveryAttempt],
    *,
    event_type: str,
) -> list[NotificationDelivery]:
    if not attempts:
        return []
    engine = get_engine()
    delivery_group_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    deliveries = [
        _delivery_row(
            match,
            event,
            attempt,
            delivery_group_id=delivery_group_id,
            event_type=event_type,
            created_at=created_at,
        )
        for attempt in attempts
    ]
    with Session(engine) as session:
        session.add_all(deliveries)
        session.commit()
        for delivery in deliveries:
            session.refresh(delivery)
    return deliveries


async def _send_email_notification(
    recipient_email: str,
    event: PriceDroppedEvent,
    target_price: Decimal | None,
) -> tuple[bool, str | None]:
    if not _smtp_configured():
        return False, "Email channel is not configured"

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = recipient_email
    message["Subject"] = (
        f"PriceDrop alert: {event.product_title} is now {_format_price(event.new_price)} PLN"
    )
    intro = (
        "Price dropped below your target."
        if target_price is not None
        else "Price dropped on a product you follow."
    )
    target_line = (
        f"Your target: {_format_price(target_price)} PLN"
        if target_price is not None
        else "Your target: any drop"
    )
    message.set_content(
        "\n".join(
            [
                intro,
                "",
                f"Product: {event.product_title}",
                f"Store: {event.store}",
                target_line,
                f"Previous price: {_format_price(event.old_price)} PLN",
                f"Current price: {_format_price(event.new_price)} PLN",
                f"Offer URL: {event.url or 'N/A'}",
            ]
        )
    )

    try:
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USERNAME or None,
            password=SMTP_PASSWORD or None,
            start_tls=False if SMTP_USE_TLS else SMTP_STARTTLS,
            use_tls=SMTP_USE_TLS,
            timeout=20,
        )
        return True, None
    except Exception as exc:
        logger.exception("Failed to send email notification to %s", recipient_email)
        return False, _safe_delivery_error(CHANNEL_EMAIL, exc)


async def _send_discord_notification(
    webhook_url: str,
    event: PriceDroppedEvent,
    target_price: Decimal | None,
) -> tuple[bool, str | None]:
    target_line = (
        f"Target: **{_format_price(target_price)} PLN**"
        if target_price is not None
        else "Target: **any drop**"
    )
    payload = {
        "content": "\n".join(
            [
                f"Price alert: **{event.product_title}**",
                f"Store: **{event.store}**",
                target_line,
                f"Old: ~~{_format_price(event.old_price)} PLN~~",
                f"Now: **{_format_price(event.new_price)} PLN**",
                event.url,
            ]
        ).strip(),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
        return True, None
    except Exception as exc:
        logger.exception("Failed to send Discord notification")
        return False, _safe_delivery_error(CHANNEL_DISCORD, exc)


async def _notify_user(
    match: _AlertMatch,
    event: PriceDroppedEvent,
) -> list[DeliveryAttempt]:
    channel = match.user_notification_channel or "both"
    webhook_url = (match.user_webhook_url or "").strip()

    attempts: list[DeliveryAttempt] = []
    for selected_channel in _selected_channels(channel):
        if selected_channel == CHANNEL_DISCORD:
            if not webhook_url:
                attempts.append(
                    DeliveryAttempt(
                        channel=CHANNEL_DISCORD,
                        status=STATUS_SKIPPED,
                        reason="discord_webhook_missing",
                    )
                )
                continue
            delivered, error_message = await _send_discord_notification(
                webhook_url,
                event,
                match.target_price,
            )
            attempts.append(
                DeliveryAttempt(
                    channel=CHANNEL_DISCORD,
                    status=STATUS_SENT if delivered else STATUS_FAILED,
                    reason=None if delivered else "delivery_failed",
                    error_message=error_message,
                )
            )
            continue

        if not _smtp_configured():
            attempts.append(
                DeliveryAttempt(
                    channel=CHANNEL_EMAIL,
                    status=STATUS_SKIPPED,
                    reason="email_not_configured",
                )
            )
            continue
        delivered, error_message = await _send_email_notification(
            match.user_email,
            event,
            match.target_price,
        )
        attempts.append(
            DeliveryAttempt(
                channel=CHANNEL_EMAIL,
                status=STATUS_SENT if delivered else STATUS_FAILED,
                reason=None if delivered else "delivery_failed",
                error_message=error_message,
            )
        )

    if not any(attempt.status == STATUS_SENT for attempt in attempts):
        logger.warning(
            "No notification channel available for user_id=%s (channel=%s, alert target reached)",
            match.user_id,
            channel,
        )

    return attempts


async def _process_price_drop_event(event: PriceDroppedEvent) -> tuple[int, int, int]:
    engine = get_engine()

    with Session(engine) as session:
        stmt = (
            select(Alert, User)
            .join(User, User.id == Alert.user_id)
            .where(
                Alert.product_id == event.product_id,
                Alert.is_active == True,  # noqa: E712
                (Alert.target_price.is_(None))
                | (Alert.target_price >= event.new_price),
            )
        )
        rows = session.exec(stmt).all()
        matches = [
            _AlertMatch(
                alert_id=alert.id,
                target_price=alert.target_price,
                user_id=user.id,
                user_email=user.email,
                user_webhook_url=user.discord_webhook_url,
                user_notification_channel=user.notification_channel or "both",
            )
            for alert, user in rows
        ]

    if not matches:
        return 0, 0, 0

    delivered_ids: list[int] = []
    failed_count = 0
    for match in matches:
        attempts = await _notify_user(match, event)
        _persist_delivery_attempts(match, event, attempts, event_type=EVENT_PRICE_DROP)
        sent = any(attempt.status == STATUS_SENT for attempt in attempts)
        if sent and match.alert_id is not None:
            delivered_ids.append(match.alert_id)
        else:
            failed_count += 1

    if delivered_ids:
        now = datetime.now(timezone.utc)
        with Session(engine) as session:
            for alert_id in delivered_ids:
                alert = session.get(Alert, alert_id)
                if alert is None:
                    continue
                alert.triggered_at = now
                if alert.target_price is not None:
                    alert.is_active = False
                session.add(alert)
            session.commit()

    return len(matches), len(delivered_ids), failed_count


async def _consume_price_dropped(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=20)

                exchange = await channel.declare_exchange(
                    EXCHANGE_NAME,
                    aio_pika.ExchangeType.TOPIC,
                    durable=True,
                )
                queue = await channel.declare_queue(QUEUE_NAME, durable=True)
                await queue.bind(exchange, routing_key=ROUTING_KEY)

                logger.info(
                    "RabbitMQ consumer connected (exchange=%s, queue=%s, key=%s)",
                    EXCHANGE_NAME,
                    QUEUE_NAME,
                    ROUTING_KEY,
                )
                CONSUMER_STATE["running"] = True
                CONSUMER_STATE["last_error"] = None

                async with queue.iterator() as queue_iter:
                    async for message in queue_iter:
                        if stop_event.is_set():
                            break

                        event = _parse_price_drop_event(message.body)
                        if event is None:
                            await message.ack()
                            continue

                        try:
                            matched, delivered, failed = await _process_price_drop_event(
                                event
                            )
                        except Exception:
                            logger.exception(
                                "Unhandled error processing price.dropped for product_id=%s",
                                event.product_id,
                            )
                            await message.nack(requeue=not message.redelivered)
                            continue

                        logger.info(
                            "Processed price.dropped for product_id=%s (matched_alerts=%s, delivered=%s, failed=%s, redelivered=%s)",
                            event.product_id,
                            matched,
                            delivered,
                            failed,
                            message.redelivered,
                        )

                        if failed and not message.redelivered:
                            await message.nack(requeue=True)
                        else:
                            await message.ack()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            CONSUMER_STATE["running"] = False
            CONSUMER_STATE["last_error"] = str(exc)
            logger.exception("Consumer error, retrying in 5s")
            await asyncio.sleep(5)
        finally:
            CONSUMER_STATE["running"] = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(_consume_price_dropped(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        consumer_task.cancel()
        with suppress(asyncio.CancelledError):
            await consumer_task


app = FastAPI(title="PriceDrop Notifications", lifespan=lifespan)


def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    if not INTERNAL_API_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="notifications internal api disabled: INTERNAL_API_TOKEN not set",
        )
    if not x_internal_token or not hmac.compare_digest(
        x_internal_token,
        INTERNAL_API_TOKEN,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )


def _attempt_payload(attempt: DeliveryAttempt) -> dict[str, str | None]:
    return {
        "channel": attempt.channel,
        "status": attempt.status,
        "reason": attempt.reason,
        "error_message": attempt.error_message,
    }


@app.get(
    "/internal/notification-config",
    dependencies=[Depends(require_internal_token)],
)
def notification_config():
    return {
        "service_available": True,
        "email_configured": _smtp_configured(),
        "consumer_running": CONSUMER_STATE["running"],
        "consumer_last_error": CONSUMER_STATE["last_error"],
    }


@app.post(
    "/internal/test-notification",
    dependencies=[Depends(require_internal_token)],
)
async def test_notification(data: InternalTestNotificationRequest):
    event = PriceDroppedEvent(
        product_id=0,
        product_title="Powiadomienie testowe PriceDrop",
        store="PriceDrop",
        old_price=Decimal("0.00"),
        new_price=Decimal("0.00"),
        url="",
    )
    match = _AlertMatch(
        alert_id=None,
        target_price=None,
        user_id=data.user_id,
        user_email=data.email,
        user_webhook_url=data.discord_webhook_url,
        user_notification_channel=data.notification_channel,
    )
    attempts = await _notify_user(match, event)
    _persist_delivery_attempts(match, event, attempts, event_type=EVENT_TEST)
    return {
        "status": _aggregate_attempt_status(attempts),
        "deliveries": [_attempt_payload(attempt) for attempt in attempts],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "notifications",
        "consumer_running": CONSUMER_STATE["running"],
        "consumer_last_error": CONSUMER_STATE["last_error"],
    }
