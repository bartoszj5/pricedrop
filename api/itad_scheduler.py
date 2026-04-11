"""Background ITAD sync loop.

Periodically pulls the most-popular games from ITAD, upserts them into the
catalog, and refreshes prices for every tracked game. Runs inside the FastAPI
lifespan so there's no external worker dependency.
"""
import asyncio
import logging
import os
import re

from sqlmodel import Session

from routers.itad import (
    run_popular_games_sync,
    run_tracked_games_price_refresh,
)
from shared.database import get_engine

logger = logging.getLogger(__name__)


_DURATION_RE = re.compile(r"^\s*(\d+)\s*([smhd]?)\s*$", re.IGNORECASE)


def _parse_duration_seconds(value: str, default: int) -> int:
    match = _DURATION_RE.match(value or "")
    if not match:
        return default
    amount = int(match.group(1))
    unit = (match.group(2) or "s").lower()
    multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
    return max(0, amount * multiplier)


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


async def itad_sync_loop(stop_event: asyncio.Event) -> None:
    interval = _parse_duration_seconds(os.getenv("ITAD_SYNC_INTERVAL", "6h"), 6 * 3600)
    popular_limit = _env_int("ITAD_POPULAR_LIMIT", 60)
    country = os.getenv("ITAD_SYNC_COUNTRY", "PL").upper()
    startup_delay = _env_int("ITAD_SYNC_STARTUP_DELAY", 30, minimum=0)

    if interval <= 0:
        logger.info("[itad/scheduler] disabled (ITAD_SYNC_INTERVAL=0)")
        return

    if not os.getenv("ITAD_API_KEY", "").strip():
        logger.info("[itad/scheduler] disabled (ITAD_API_KEY not set)")
        return

    logger.info(
        "[itad/scheduler] started (interval=%ss, limit=%s, country=%s)",
        interval,
        popular_limit,
        country,
    )

    try:
        await asyncio.wait_for(stop_event.wait(), timeout=startup_delay)
        return
    except asyncio.TimeoutError:
        pass

    while not stop_event.is_set():
        try:
            await asyncio.to_thread(
                _run_once,
                popular_limit=popular_limit,
                country=country,
            )
        except Exception:
            logger.exception("[itad/scheduler] run failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
            return
        except asyncio.TimeoutError:
            continue


def _run_once(*, popular_limit: int, country: str) -> None:
    engine = get_engine()
    with Session(engine) as session:
        counts, games, ranked = run_popular_games_sync(
            session,
            limit=popular_limit,
            offset=0,
            country=country,
            only_games=True,
        )
        logger.info(
            "[itad/scheduler] popular sync: ranked=%s selected=%s created=%s updated=%s",
            ranked,
            len(games),
            counts["products_created"],
            counts["products_updated"],
        )

    with Session(engine) as session:
        refresh_counts = run_tracked_games_price_refresh(session, country=country)
        logger.info(
            "[itad/scheduler] price refresh: prices_created=%s prices_updated=%s history=%s",
            refresh_counts["prices_created"],
            refresh_counts["prices_updated"],
            refresh_counts["history_created"],
        )
