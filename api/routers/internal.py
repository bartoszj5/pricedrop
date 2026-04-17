import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException, status

import cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

if not os.getenv("INTERNAL_API_TOKEN"):
    logger.warning(
        "INTERNAL_API_TOKEN is not set; /internal endpoints will reject all requests"
    )


def _require_internal_token(token: str | None) -> None:
    expected = os.getenv("INTERNAL_API_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="internal api disabled",
        )
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )


@router.post("/cache/invalidate-products")
def invalidate_products_cache(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> dict[str, int | str]:
    _require_internal_token(x_internal_token)
    deleted = cache.invalidate_products()
    logger.info("invalidated %d product cache keys", deleted)
    return {"status": "ok", "deleted": deleted}
