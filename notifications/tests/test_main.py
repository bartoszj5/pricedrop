import asyncio
import json
import sys
import types
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

sys.modules.setdefault(
    "aio_pika",
    types.SimpleNamespace(
        ExchangeType=types.SimpleNamespace(TOPIC="topic"),
        connect_robust=None,
    ),
)
sys.modules.setdefault("aiosmtplib", types.SimpleNamespace(send=None))

import notifications.main as notifications  # noqa: E402
from shared.models import Alert, Product, User  # noqa: E402


@pytest.fixture()
def engine():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)
    try:
        yield test_engine
    finally:
        SQLModel.metadata.drop_all(test_engine)


def _event(product_id: int = 1) -> notifications.PriceDroppedEvent:
    return notifications.PriceDroppedEvent(
        product_id=product_id,
        product_title="Steam Deck OLED",
        store="Steam",
        old_price=Decimal("2999.00"),
        new_price=Decimal("2499.00"),
        url="https://example.com/steam-deck-oled",
    )


def _create_product(session: Session) -> Product:
    product = Product(
        title="Steam Deck OLED",
        slug="steam-deck-oled",
        category="console",
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def _create_user(
    session: Session,
    username: str,
    *,
    notification_channel: str = "both",
    discord_webhook_url: str | None = "https://discord.com/api/webhooks/123/token",
) -> User:
    user = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password="hashed-password",
        notification_channel=notification_channel,
        discord_webhook_url=discord_webhook_url,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _alerts_by_id(session: Session) -> dict[int, Alert]:
    return {alert.id: alert for alert in session.exec(select(Alert)).all()}


def test_process_price_drop_deactivates_threshold_alert_but_keeps_watchlist_active(
    engine,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(notifications, "get_engine", lambda: engine)

    with Session(engine) as session:
        product = _create_product(session)
        threshold_user = _create_user(session, "threshold")
        watchlist_user = _create_user(session, "watchlist")
        threshold_alert = Alert(
            user_id=threshold_user.id,
            product_id=product.id,
            target_price=Decimal("2600.00"),
        )
        watchlist_alert = Alert(
            user_id=watchlist_user.id,
            product_id=product.id,
            target_price=None,
        )
        session.add_all([threshold_alert, watchlist_alert])
        session.commit()
        session.refresh(threshold_alert)
        session.refresh(watchlist_alert)
        threshold_alert_id = threshold_alert.id
        watchlist_alert_id = watchlist_alert.id
        product_id = product.id

    async def send_success(
        match: notifications._AlertMatch,
        event: notifications.PriceDroppedEvent,
    ) -> bool:
        return True

    monkeypatch.setattr(notifications, "_notify_user", send_success)

    result = asyncio.run(notifications._process_price_drop_event(_event(product_id)))

    assert result == (2, 2, 0)
    with Session(engine) as session:
        alerts = _alerts_by_id(session)
        threshold = alerts[threshold_alert_id]
        watchlist = alerts[watchlist_alert_id]

    assert threshold.triggered_at is not None
    assert threshold.is_active is False
    assert watchlist.triggered_at is not None
    assert watchlist.is_active is True


def test_process_price_drop_without_available_channel_keeps_alert_untriggered(
    engine,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(notifications, "get_engine", lambda: engine)
    monkeypatch.setattr(notifications, "SMTP_HOST", "")
    monkeypatch.setattr(notifications, "SMTP_FROM", "")

    with Session(engine) as session:
        product = _create_product(session)
        user = _create_user(
            session,
            "email-only",
            notification_channel="email",
            discord_webhook_url=None,
        )
        alert = Alert(
            user_id=user.id,
            product_id=product.id,
            target_price=Decimal("2600.00"),
        )
        session.add(alert)
        session.commit()
        session.refresh(alert)
        alert_id = alert.id
        product_id = product.id

    result = asyncio.run(notifications._process_price_drop_event(_event(product_id)))

    assert result == (1, 0, 1)
    with Session(engine) as session:
        alert = session.get(Alert, alert_id)

    assert alert is not None
    assert alert.triggered_at is None
    assert alert.is_active is True


def test_notify_user_treats_partial_discord_email_failure_as_success(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[str] = []
    monkeypatch.setattr(notifications, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(notifications, "SMTP_FROM", "alerts@example.com")

    async def discord_fails(
        webhook_url: str,
        event: notifications.PriceDroppedEvent,
        target_price: Decimal | None,
    ) -> bool:
        calls.append(f"discord:{webhook_url}")
        return False

    async def email_succeeds(
        recipient_email: str,
        event: notifications.PriceDroppedEvent,
        target_price: Decimal | None,
    ) -> bool:
        calls.append(f"email:{recipient_email}")
        return True

    monkeypatch.setattr(notifications, "_send_discord_notification", discord_fails)
    monkeypatch.setattr(notifications, "_send_email_notification", email_succeeds)

    match = notifications._AlertMatch(
        alert_id=1,
        target_price=Decimal("2600.00"),
        user_id=1,
        user_email="buyer@example.com",
        user_webhook_url="https://discord.com/api/webhooks/123/token",
        user_notification_channel="both",
    )

    delivered = asyncio.run(notifications._notify_user(match, _event()))

    assert delivered is True
    assert calls == [
        "discord:https://discord.com/api/webhooks/123/token",
        "email:buyer@example.com",
    ]


class FakeMessage:
    def __init__(self, *, redelivered: bool = False) -> None:
        self.body = json.dumps(
            {
                "product_id": 1,
                "product_title": "Steam Deck OLED",
                "store": "Steam",
                "old_price": "2999.00",
                "new_price": "2499.00",
                "url": "https://example.com/steam-deck-oled",
            }
        ).encode()
        self.redelivered = redelivered
        self.acked = False
        self.nack_requeue: bool | None = None

    async def ack(self) -> None:
        self.acked = True

    async def nack(self, *, requeue: bool) -> None:
        self.nack_requeue = requeue


class FakeQueueIterator:
    def __init__(self, message: FakeMessage, stop_event: asyncio.Event) -> None:
        self.message = message
        self.stop_event = stop_event
        self.sent = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def __aiter__(self):
        return self

    async def __anext__(self) -> FakeMessage:
        if self.sent:
            self.stop_event.set()
            raise StopAsyncIteration
        self.sent = True
        return self.message


class FakeQueue:
    def __init__(self, message: FakeMessage, stop_event: asyncio.Event) -> None:
        self.message = message
        self.stop_event = stop_event

    async def bind(self, exchange, *, routing_key: str) -> None:
        return None

    def iterator(self) -> FakeQueueIterator:
        return FakeQueueIterator(self.message, self.stop_event)


class FakeChannel:
    def __init__(self, message: FakeMessage, stop_event: asyncio.Event) -> None:
        self.message = message
        self.stop_event = stop_event

    async def set_qos(self, *, prefetch_count: int) -> None:
        return None

    async def declare_exchange(self, name: str, exchange_type, *, durable: bool):
        return object()

    async def declare_queue(self, name: str, *, durable: bool) -> FakeQueue:
        return FakeQueue(self.message, self.stop_event)


class FakeConnection:
    def __init__(self, message: FakeMessage, stop_event: asyncio.Event) -> None:
        self.message = message
        self.stop_event = stop_event

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def channel(self) -> FakeChannel:
        return FakeChannel(self.message, self.stop_event)


def _run_consumer_once(
    monkeypatch: pytest.MonkeyPatch,
    message: FakeMessage,
) -> None:
    stop_event = asyncio.Event()

    async def connect_robust(url: str) -> FakeConnection:
        return FakeConnection(message, stop_event)

    async def process_failed(
        event: notifications.PriceDroppedEvent,
    ) -> tuple[int, int, int]:
        return 1, 0, 1

    monkeypatch.setattr(notifications.aio_pika, "connect_robust", connect_robust)
    monkeypatch.setattr(notifications, "_process_price_drop_event", process_failed)

    asyncio.run(notifications._consume_price_dropped(stop_event))


def test_consumer_requeues_first_failed_delivery(monkeypatch: pytest.MonkeyPatch):
    message = FakeMessage(redelivered=False)

    _run_consumer_once(monkeypatch, message)

    assert message.acked is False
    assert message.nack_requeue is True


def test_consumer_acks_redelivered_failed_delivery(monkeypatch: pytest.MonkeyPatch):
    message = FakeMessage(redelivered=True)

    _run_consumer_once(monkeypatch, message)

    assert message.acked is True
    assert message.nack_requeue is None
