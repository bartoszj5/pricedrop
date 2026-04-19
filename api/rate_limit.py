import os
from urllib.parse import urlparse, urlunparse

from slowapi import Limiter
from slowapi.util import get_remote_address


def _build_storage_uri() -> str:
    if uri := os.getenv("RATE_LIMIT_STORAGE_URI"):
        return uri
    base = os.getenv("REDIS_URL", "memory://")
    password = os.getenv("REDIS_PASSWORD")
    if password and base.startswith("redis://"):
        parsed = urlparse(base)
        authed = parsed._replace(netloc=f":{password}@{parsed.hostname}:{parsed.port or 6379}")
        return urlunparse(authed)
    return base


_storage_uri = _build_storage_uri()

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
    headers_enabled=True,
)

LOGIN_LIMIT = os.getenv("RATE_LIMIT_LOGIN", "20/minute")
REGISTER_LIMIT = os.getenv("RATE_LIMIT_REGISTER", "20/minute")
REFRESH_LIMIT = os.getenv("RATE_LIMIT_REFRESH", "60/minute")
