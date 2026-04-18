from pathlib import Path
import sys

import fakeredis
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

import cache  # noqa: E402
from rate_limit import limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _disable_rate_limiter():
    """Disable slowapi during tests unless a specific test opts back in."""
    previous = limiter.enabled
    limiter.enabled = False
    limiter.reset()
    try:
        yield
    finally:
        limiter.enabled = previous


@pytest.fixture(autouse=True)
def _fake_redis():
    """Swap in fakeredis so refresh-token revocation + cache use an in-memory store."""
    fake = fakeredis.FakeRedis(decode_responses=True)
    cache.reset_client_for_tests(fake)
    try:
        yield fake
    finally:
        fake.flushall()
        cache.reset_client_for_tests(None)
