from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
import os
import re
import unicodedata
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import SQLModel, Session, select

from shared.database import get_session
from shared.models import Price, PriceHistory, Product, Store

ITAD_BASE_URL_DEFAULT = "https://api.isthereanydeal.com"
ITAD_FALLBACK_STORE_URL = "https://isthereanydeal.com"

router = APIRouter(tags=["itad"])

_slug_regex = re.compile(r"[^a-z0-9]+")
logger = logging.getLogger(__name__)


class ITADGameRead(SQLModel):
    id: str
    slug: str
    title: str
    type: str | None
    mature: bool
    image_url: str | None = None


class ITADSyncResponse(SQLModel):
    source: str
    country: str
    ranked_games_fetched: int
    games_selected: int
    products_synced: int
    products_created: int
    products_updated: int
    stores_created: int
    prices_created: int
    prices_updated: int
    history_created: int
    preview: list[ITADGameRead]


def _get_api_key() -> str:
    api_key = os.getenv("ITAD_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ITAD API key missing. Set ITAD_API_KEY environment variable.",
        )
    return api_key


def _get_base_url() -> str:
    return os.getenv("ITAD_BASE_URL", ITAD_BASE_URL_DEFAULT).rstrip("/")


def _get_timeout_seconds() -> float:
    raw = os.getenv("ITAD_TIMEOUT_SECONDS", "20")
    try:
        timeout = float(raw)
    except ValueError:
        timeout = 20.0
    if timeout <= 0:
        return 20.0
    return timeout


def _safe_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:300] or "unknown ITAD error"

    if isinstance(payload, dict):
        reason = payload.get("reason_phrase")
        if isinstance(reason, str) and reason:
            return reason
    return str(payload)[:300]


def _itad_request(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: Any = None,
) -> Any:
    try:
        response = client.request(method, path, params=params, json=json_body)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ITAD connection failed for {path}: {exc}",
        ) from exc

    if response.status_code >= 400:
        detail = _safe_error_detail(response)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ITAD request failed for {path} ({response.status_code}): {detail}",
        )

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ITAD returned invalid JSON for {path}",
        ) from exc


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = _slug_regex.sub("-", ascii_value.lower()).strip("-")
    return slug


def _image_from_assets(game: dict[str, Any]) -> str | None:
    assets = game.get("assets")
    if not isinstance(assets, dict):
        return None

    for key in ("boxart", "banner400", "banner300", "banner145", "banner600"):
        value = assets.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _merge_game_with_info(game: dict[str, Any], info: dict[str, Any]) -> dict[str, Any]:
    merged = dict(game)

    slug = info.get("slug")
    if isinstance(slug, str) and slug:
        merged["slug"] = slug

    title = info.get("title")
    if isinstance(title, str) and title:
        merged["title"] = title

    game_type = info.get("type")
    if isinstance(game_type, str) and game_type:
        merged["type"] = game_type

    mature = info.get("mature")
    if isinstance(mature, bool):
        merged["mature"] = mature

    assets = info.get("assets")
    if isinstance(assets, dict) and assets:
        merged["assets"] = assets

    return merged


def _hydrate_games_with_assets(
    client: httpx.Client,
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    hydrated: list[dict[str, Any]] = []

    for game in games:
        game_id = game.get("id")
        if not isinstance(game_id, str):
            hydrated.append(game)
            continue

        try:
            info_payload = _itad_request(
                client,
                "GET",
                "/games/info/v2",
                params={"id": game_id},
            )
        except HTTPException as exc:
            logger.warning("ITAD info lookup failed for %s: %s", game_id, exc.detail)
            hydrated.append(game)
            continue

        if not isinstance(info_payload, dict):
            hydrated.append(game)
            continue

        hydrated.append(_merge_game_with_info(game, info_payload))

    return hydrated


def _decimal_money(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return None


def _normalize_currency(value: Any) -> str:
    if not isinstance(value, str):
        return "USD"
    normalized = value.strip().upper()
    if len(normalized) != 3:
        return "USD"
    return normalized


def _select_deal_price(deal: dict[str, Any]) -> Decimal | None:
    price_obj = deal.get("price")
    if not isinstance(price_obj, dict):
        return None
    return _decimal_money(price_obj.get("amount"))


@router.get("/itad/search", response_model=list[ITADGameRead])
def search_itad_games(
    title: Annotated[str, Query(min_length=1, max_length=120)],
    results: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ITADGameRead]:
    api_key = _get_api_key()

    with httpx.Client(
        base_url=_get_base_url(),
        timeout=_get_timeout_seconds(),
        params={"key": api_key},
    ) as client:
        payload = _itad_request(
            client,
            "GET",
            "/games/search/v1",
            params={"title": title, "results": results},
        )

    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unexpected ITAD search response format.",
        )

    items: list[ITADGameRead] = []
    for item in payload:
        if not isinstance(item, dict):
            continue

        game_id = item.get("id")
        slug = item.get("slug")
        game_title = item.get("title")
        game_type = item.get("type")
        mature = item.get("mature", False)

        if not isinstance(game_id, str) or not isinstance(slug, str):
            continue
        if not isinstance(game_title, str):
            continue

        items.append(
            ITADGameRead(
                id=game_id,
                slug=slug,
                title=game_title,
                type=game_type if isinstance(game_type, str) else None,
                mature=bool(mature),
                image_url=_image_from_assets(item),
            )
        )

    return items


@router.post("/itad/sync", response_model=ITADSyncResponse)
def sync_itad_games(
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    country: Annotated[str, Query(min_length=2, max_length=2)] = "PL",
    only_games: bool = True,
) -> ITADSyncResponse:
    api_key = _get_api_key()
    country_upper = country.upper()

    with httpx.Client(
        base_url=_get_base_url(),
        timeout=_get_timeout_seconds(),
        params={"key": api_key},
    ) as client:
        ranked_payload = _itad_request(
            client,
            "GET",
            "/stats/most-popular/v1",
            params={"limit": limit, "offset": offset},
        )

        if not isinstance(ranked_payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unexpected ITAD ranked games response format.",
            )

        selected_games = [
            game
            for game in ranked_payload
            if isinstance(game, dict)
            and isinstance(game.get("id"), str)
            and isinstance(game.get("slug"), str)
            and isinstance(game.get("title"), str)
            and (not only_games or game.get("type") == "game")
        ]

        game_ids = [str(game["id"]) for game in selected_games]
        if not game_ids:
            return ITADSyncResponse(
                source="isthereanydeal",
                country=country_upper,
                ranked_games_fetched=len(ranked_payload),
                games_selected=0,
                products_synced=0,
                products_created=0,
                products_updated=0,
                stores_created=0,
                prices_created=0,
                prices_updated=0,
                history_created=0,
                preview=[],
            )

        selected_games = _hydrate_games_with_assets(client, selected_games)

        prices_payload = _itad_request(
            client,
            "POST",
            "/games/prices/v3",
            params={"country": country_upper, "deals": False, "vouchers": True},
            json_body=game_ids,
        )

    if not isinstance(prices_payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unexpected ITAD prices response format.",
        )

    now = datetime.now(timezone.utc)

    products_created = 0
    products_updated = 0
    stores_created = 0
    prices_created = 0
    prices_updated = 0
    history_created = 0

    all_stores = session.exec(select(Store)).all()
    stores_by_name = {store.name.casefold(): store for store in all_stores}
    used_slugs = {store.slug for store in all_stores}

    products_by_game_id: dict[str, Product] = {}

    for game in selected_games:
        game_id = str(game["id"])
        slug = str(game["slug"])
        title = str(game["title"])
        category = str(game.get("type") or "game")
        image_url = _image_from_assets(game)

        product = session.exec(select(Product).where(Product.slug == slug)).first()
        if product is None:
            product = Product(
                title=title,
                slug=slug,
                category=category,
                image_url=image_url,
            )
            session.add(product)
            session.flush()
            products_created += 1
        else:
            changed = False
            if product.title != title:
                product.title = title
                changed = True
            if product.category != category:
                product.category = category
                changed = True
            if image_url and product.image_url != image_url:
                product.image_url = image_url
                changed = True
            if changed:
                product.updated_at = now
                session.add(product)
                products_updated += 1

        products_by_game_id[game_id] = product

    product_ids = [product.id for product in products_by_game_id.values() if product.id is not None]
    existing_prices = []
    if product_ids:
        existing_prices = session.exec(
            select(Price).where(Price.product_id.in_(product_ids))
        ).all()

    prices_by_pair: dict[tuple[int, int], Price] = {
        (price.product_id, price.store_id): price
        for price in existing_prices
    }

    for game_price_row in prices_payload:
        if not isinstance(game_price_row, dict):
            continue

        game_id = game_price_row.get("id")
        if not isinstance(game_id, str):
            continue

        product = products_by_game_id.get(game_id)
        if product is None or product.id is None:
            continue

        deals = game_price_row.get("deals")
        if not isinstance(deals, list):
            continue

        best_deal_by_shop: dict[int, tuple[dict[str, Any], Decimal]] = {}

        for deal in deals:
            if not isinstance(deal, dict):
                continue

            shop_obj = deal.get("shop")
            if not isinstance(shop_obj, dict):
                continue

            raw_shop_id = shop_obj.get("id")
            try:
                shop_id = int(raw_shop_id)
            except (TypeError, ValueError):
                continue

            amount = _select_deal_price(deal)
            if amount is None:
                continue

            existing = best_deal_by_shop.get(shop_id)
            if existing is None or amount < existing[1]:
                best_deal_by_shop[shop_id] = (deal, amount)

        for shop_id, selected in best_deal_by_shop.items():
            deal, amount = selected
            shop_obj = deal.get("shop")
            if not isinstance(shop_obj, dict):
                continue

            shop_name = str(shop_obj.get("name") or "").strip()
            if not shop_name:
                continue

            store_key = shop_name.casefold()
            store = stores_by_name.get(store_key)
            if store is None:
                slug_base = _slugify(shop_name) or f"shop-{shop_id}"
                slug_candidate = slug_base
                suffix = 1
                while slug_candidate in used_slugs:
                    suffix += 1
                    slug_candidate = f"{slug_base}-{suffix}"

                store = Store(
                    name=shop_name,
                    slug=slug_candidate,
                    url=ITAD_FALLBACK_STORE_URL,
                    is_active=True,
                )
                session.add(store)
                session.flush()

                stores_by_name[store_key] = store
                used_slugs.add(slug_candidate)
                stores_created += 1

            if store.id is None:
                continue

            price_obj = deal.get("price")
            if not isinstance(price_obj, dict):
                continue

            currency = _normalize_currency(price_obj.get("currency"))
            deal_url = str(deal.get("url") or "").strip()
            if not deal_url.startswith(("http://", "https://")):
                deal_url = ITAD_FALLBACK_STORE_URL

            pair = (product.id, store.id)
            price_row = prices_by_pair.get(pair)

            if price_row is None:
                created = Price(
                    product_id=product.id,
                    store_id=store.id,
                    current_price=amount,
                    currency=currency,
                    url=deal_url,
                    is_available=True,
                    last_checked_at=now,
                )
                session.add(created)
                session.flush()

                prices_by_pair[pair] = created
                prices_created += 1
                continue

            old_price = price_row.current_price
            price_row.current_price = amount
            price_row.currency = currency
            price_row.url = deal_url
            price_row.is_available = True
            price_row.last_checked_at = now
            price_row.updated_at = now
            session.add(price_row)
            prices_updated += 1

            if old_price != amount:
                session.add(
                    PriceHistory(
                        price_id=price_row.id,
                        old_price=old_price,
                        new_price=amount,
                        currency=currency,
                        recorded_at=now,
                    )
                )
                history_created += 1

    session.commit()

    preview = [
        ITADGameRead(
            id=str(game["id"]),
            slug=str(game["slug"]),
            title=str(game["title"]),
            type=game.get("type") if isinstance(game.get("type"), str) else None,
            mature=bool(game.get("mature", False)),
            image_url=_image_from_assets(game),
        )
        for game in selected_games[:10]
    ]

    return ITADSyncResponse(
        source="isthereanydeal",
        country=country_upper,
        ranked_games_fetched=len(ranked_payload),
        games_selected=len(selected_games),
        products_synced=len(products_by_game_id),
        products_created=products_created,
        products_updated=products_updated,
        stores_created=stores_created,
        prices_created=prices_created,
        prices_updated=prices_updated,
        history_created=history_created,
        preview=preview,
    )
