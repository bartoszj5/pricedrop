import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_storage_uri = os.getenv("RATE_LIMIT_STORAGE_URI") or os.getenv(
    "REDIS_URL", "memory://"
)

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
    headers_enabled=True,
)

LOGIN_LIMIT = os.getenv("RATE_LIMIT_LOGIN", "20/minute")
REGISTER_LIMIT = os.getenv("RATE_LIMIT_REGISTER", "20/minute")
REFRESH_LIMIT = os.getenv("RATE_LIMIT_REFRESH", "60/minute")
