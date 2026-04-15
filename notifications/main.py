import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.message import EmailMessage
from typing import Any

import aio_pika
import aiosmtplib
import httpx
from fastapi import FastAPI
from sqlmodel import Session, select

from shared.database import get_engine
from shared.models import Alert, ProductLike, User

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
    alert_id: int
    target_price: Decimal
    user_id: int
    user_email: str
    user_webhook_url: str | None
    user_notification_channel: str


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


async def _send_email_notification(
    recipient_email: str,
    event: PriceDroppedEvent,
    target_price: Decimal,
) -> bool:
    if not _smtp_configured():
        return False

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = recipient_email
    message["Subject"] = (
        f"PriceDrop alert: {event.product_title} is now {_format_price(event.new_price)} PLN"
    )
    message.set_content(
        "\n".join(
            [
                "Price dropped below your target.",
                "",
                f"Product: {event.product_title}",
                f"Store: {event.store}",
                f"Your target: {_format_price(target_price)} PLN",
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
        return True
    except Exception:
        logger.exception("Failed to send email notification to %s", recipient_email)
        return False


async def _send_discord_notification(
    webhook_url: str,
    event: PriceDroppedEvent,
    target_price: Decimal,
) -> bool:
    payload = {
        "content": "\n".join(
            [
                f"Price alert: **{event.product_title}**",
                f"Store: **{event.store}**",
                f"Target: **{_format_price(target_price)} PLN**",
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
        return True
    except Exception:
        logger.exception("Failed to send Discord notification")
        return False


async def _notify_user(
    match: _AlertMatch,
    event: PriceDroppedEvent,
) -> bool:
    channel = match.user_notification_channel or "both"
    webhook_url = (match.user_webhook_url or "").strip()

    wants_discord = channel in {"discord", "both"} and bool(webhook_url)
    wants_email = channel in {"email", "both"} and _smtp_configured()

    delivery_results: list[bool] = []
    if wants_discord:
        delivery_results.append(
            await _send_discord_notification(webhook_url, event, match.target_price)
        )
    if wants_email:
        delivery_results.append(
            await _send_email_notification(match.user_email, event, match.target_price)
        )

    if not delivery_results:
        logger.warning(
            "No notification channel available for user_id=%s (channel=%s, alert target reached)",
            match.user_id,
            channel,
        )
        return False

    return any(delivery_results)


async def _process_price_drop_event(event: PriceDroppedEvent) -> tuple[int, int, int]:
    engine = get_engine()

    with Session(engine) as session:
        stmt = (
            select(Alert, User)
            .join(User, User.id == Alert.user_id)
            .join(
                ProductLike,
                (ProductLike.user_id == Alert.user_id)
                & (ProductLike.product_id == Alert.product_id),
            )
            .where(
                Alert.product_id == event.product_id,
                Alert.is_active == True,  # noqa: E712
                Alert.triggered_at.is_(None),
                Alert.target_price >= event.new_price,
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
        sent = await _notify_user(match, event)
        if sent:
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "notifications",
        "consumer_running": CONSUMER_STATE["running"],
        "consumer_last_error": CONSUMER_STATE["last_error"],
    }
