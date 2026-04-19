import logging
import os

from fastapi import APIRouter, Depends

import cache
from dependencies.auth import require_internal_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

if not os.getenv("INTERNAL_API_TOKEN"):
    logger.warning(
        "INTERNAL_API_TOKEN is not set; /internal endpoints will reject all requests"
    )


@router.post(
    "/cache/invalidate-products",
    dependencies=[Depends(require_internal_token)],
)
def invalidate_products_cache() -> dict[str, int | str]:
    deleted = cache.invalidate_products()
    logger.info("invalidated %d product cache keys", deleted)
    return {"status": "ok", "deleted": deleted}
