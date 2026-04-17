import json
import logging
import os
from typing import Any

import redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DEFAULT_TTL_SECONDS = int(os.getenv("CACHE_DEFAULT_TTL_SECONDS", "300"))
PRODUCTS_CACHE_PREFIX = "api:cache:products"

_client: redis.Redis | None = None
_client_initialised = False


def get_client() -> redis.Redis | None:
    global _client, _client_initialised
    if _client_initialised:
        return _client
    _client_initialised = True
    try:
        _kw: dict[str, Any] = {
            "decode_responses": True,
            "socket_timeout": 1.0,
            "socket_connect_timeout": 1.0,
        }
        if os.getenv("REDIS_PASSWORD"):
            _kw["password"] = os.environ["REDIS_PASSWORD"]
        _client = redis.Redis.from_url(REDIS_URL, **_kw)
    except Exception as exc:
        logger.warning("redis cache init failed: %s", exc)
        _client = None
    return _client


def reset_client_for_tests(client: redis.Redis | None) -> None:
    """Override the cached client. Use only in tests."""
    global _client, _client_initialised
    _client = client
    _client_initialised = True


def get_json(key: str) -> Any | None:
    client = get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
    except Exception as exc:
        logger.warning("redis GET failed (%s): %s", key, exc)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("redis cache has corrupt JSON at %s", key)
        return None


def set_json(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    client = get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.warning("redis SETEX failed (%s): %s", key, exc)


def delete_prefix(prefix: str) -> int:
    client = get_client()
    if client is None:
        return 0
    deleted = 0
    try:
        for key in client.scan_iter(match=f"{prefix}*", count=500):
            deleted += client.delete(key)
    except Exception as exc:
        logger.warning("redis DELETE prefix failed (%s): %s", prefix, exc)
    return deleted


def invalidate_products() -> int:
    return delete_prefix(f"{PRODUCTS_CACHE_PREFIX}:")


def build_products_key(**params: Any) -> str:
    parts = [
        f"{k}={params[k]}" for k in sorted(params) if params[k] is not None and params[k] != ""
    ]
    return f"{PRODUCTS_CACHE_PREFIX}:{'|'.join(parts) or 'default'}"
