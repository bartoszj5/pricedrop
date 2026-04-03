import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, SQLModel, delete, select

from shared.database import get_session
from shared.models import Alert, Price, PriceHistory, Product

router = APIRouter(tags=["dedup"])

# Common Polish electronics category words that stores prepend to product titles.
CATEGORY_PREFIXES = {
    "monitor", "laptop", "notebook", "ultrabook", "procesor", "dysk",
    "karta", "pamiec", "drukarka", "router", "switch", "klawiatura",
    "mysz", "myszka", "sluchawki", "glosnik", "telewizor", "smartfon",
    "telefon", "tablet", "konsola", "kontroler", "fotel", "krzeslo",
    "biurko", "zasilacz", "obudowa", "chlodzenie", "wentylator",
    "plyta", "glowna", "kamera", "aparat", "obiektyw", "smartwatch",
    "zegarek", "powerbank", "ladowarka", "kabel", "adapter", "hub",
    "pendrive", "ssd", "hdd", "ram",
    "graficzna", "sieciowa", "dzwiekowa", "twardy", "zewnetrzny",
}

_DIACRITICS = str.maketrans("ąćęłńóśźż", "acelnoszz")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")

# Morele-style spec suffixes: ", 3.5 GHz, 32 MB, BOX (100-100000927BOX)"
# Truncate at the first comma followed by a number (spec data, not product name).
_SPEC_SUFFIX = re.compile(r",\s*\d.*$")
# Trailing parenthesised part numbers, e.g. "(100-100000927BOX)" or "(YD3200C5FHBOX)"
_PART_NUMBER = re.compile(r"\s*\([A-Z0-9][-A-Z0-9]*\)\s*$", re.IGNORECASE)


def fingerprint(title: str) -> str:
    """Compute a canonical fingerprint by stripping category prefixes, specs, and slugifying."""
    s = title.lower().strip().translate(_DIACRITICS)

    # Strip spec suffixes (e.g. ", 3.5 ghz, 32 mb, box ...").
    s = _SPEC_SUFFIX.sub("", s)
    # Strip trailing part numbers in parentheses.
    s = _PART_NUMBER.sub("", s)

    tokens = s.split()

    # Strip leading category words.
    stripped = 0
    while stripped < len(tokens) and tokens[stripped] in CATEGORY_PREFIXES:
        stripped += 1

    # Don't strip everything.
    if 0 < stripped < len(tokens):
        tokens = tokens[stripped:]

    return _NON_ALNUM.sub("-", " ".join(tokens)).strip("-")


# --- Response models ---


class DuplicateInfo(SQLModel):
    id: int
    title: str
    slug: str
    price_count: int


class DuplicateGroup(SQLModel):
    fingerprint: str
    canonical_id: int
    canonical_title: str
    canonical_slug: str
    duplicates: list[DuplicateInfo]


class DeduplicateResponse(SQLModel):
    dry_run: bool
    groups_found: int
    products_merged: int
    prices_reassigned: int
    prices_deleted: int
    groups: list[DuplicateGroup]


SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/products/deduplicate", response_model=DeduplicateResponse)
def deduplicate_products(
    session: SessionDep,
    dry_run: Annotated[
        bool, Query(description="Preview changes without applying them")
    ] = True,
) -> DeduplicateResponse:
    """Find and merge duplicate products that differ only by category prefix words."""
    products = session.exec(select(Product)).all()

    # Group by fingerprint.
    groups: dict[str, list[Product]] = defaultdict(list)
    for product in products:
        fp = fingerprint(product.title)
        groups[fp].append(product)

    # Keep only groups with actual duplicates.
    dup_groups = {fp: prods for fp, prods in groups.items() if len(prods) > 1}

    result_groups: list[DuplicateGroup] = []
    total_merged = 0
    total_reassigned = 0
    total_deleted = 0

    for fp, prods in dup_groups.items():
        # Canonical = shortest title (least prefix noise), then oldest.
        prods.sort(key=lambda p: (len(p.title), p.created_at))
        canonical = prods[0]
        duplicates_info: list[DuplicateInfo] = []

        for dup in prods[1:]:
            dup_prices = session.exec(
                select(Price).where(Price.product_id == dup.id)
            ).all()

            reassigned = 0
            deleted = 0

            if not dry_run:
                for price in dup_prices:
                    # Check if canonical already has a price from this store.
                    conflict = session.exec(
                        select(Price).where(
                            Price.product_id == canonical.id,
                            Price.store_id == price.store_id,
                        )
                    ).first()

                    if conflict:
                        # Store already tracked on canonical — drop duplicate's price.
                        session.exec(
                            delete(PriceHistory).where(
                                PriceHistory.price_id == price.id
                            )
                        )
                        session.delete(price)
                        deleted += 1
                    else:
                        # Move price to canonical product.
                        price.product_id = canonical.id
                        session.add(price)
                        reassigned += 1

                # Move alerts.
                dup_alerts = session.exec(
                    select(Alert).where(Alert.product_id == dup.id)
                ).all()
                for alert in dup_alerts:
                    alert.product_id = canonical.id
                    session.add(alert)

                # Delete the duplicate product.
                session.delete(dup)

                # Update canonical slug to the normalized form so future
                # scrapes (which now use normalizeTitle) will match.
                canonical.slug = fp
                canonical.updated_at = datetime.now(timezone.utc)
                session.add(canonical)
            else:
                reassigned = len(dup_prices)

            duplicates_info.append(
                DuplicateInfo(
                    id=dup.id,
                    title=dup.title,
                    slug=dup.slug,
                    price_count=len(dup_prices),
                )
            )
            total_merged += 1
            total_reassigned += reassigned
            total_deleted += deleted

        result_groups.append(
            DuplicateGroup(
                fingerprint=fp,
                canonical_id=canonical.id,
                canonical_title=canonical.title,
                canonical_slug=canonical.slug,
                duplicates=duplicates_info,
            )
        )

    if not dry_run:
        session.commit()

    return DeduplicateResponse(
        dry_run=dry_run,
        groups_found=len(dup_groups),
        products_merged=total_merged,
        prices_reassigned=total_reassigned,
        prices_deleted=total_deleted,
        groups=result_groups,
    )
