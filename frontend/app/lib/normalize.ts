import type {
  PriceDetailRead,
  PriceListResponse,
  ProductDetailResponse,
  ProductPriceHistoryRead,
  ProductStorePriceRead,
  ProductWithBestPrice,
  ProductWithPricesListResponse,
  RawPriceDetailRead,
  RawPriceListResponse,
  RawProductDetailResponse,
  RawProductPriceHistoryRead,
  RawProductStorePriceRead,
  RawProductWithBestPrice,
  RawProductWithPricesListResponse,
} from "../types";

function parseMoney(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeProductWithBestPrice(
  product: RawProductWithBestPrice,
): ProductWithBestPrice {
  return {
    ...product,
    best_price: parseMoney(product.best_price),
  };
}

function normalizeProductStorePrice(
  price: RawProductStorePriceRead,
): ProductStorePriceRead {
  return {
    ...price,
    current_price: parseMoney(price.current_price),
  };
}

function normalizePriceDetail(price: RawPriceDetailRead): PriceDetailRead {
  return {
    ...price,
    current_price: parseMoney(price.current_price),
  };
}

function normalizeProductHistoryEntry(
  entry: RawProductPriceHistoryRead,
): ProductPriceHistoryRead {
  return {
    ...entry,
    old_price: parseMoney(entry.old_price) ?? 0,
    new_price: parseMoney(entry.new_price) ?? 0,
  };
}

export function normalizeProductListResponse(
  response: RawProductWithPricesListResponse,
): ProductWithPricesListResponse {
  return {
    ...response,
    items: response.items.map(normalizeProductWithBestPrice),
  };
}

export function normalizeProductDetailResponse(
  response: RawProductDetailResponse,
): ProductDetailResponse {
  return {
    ...response,
    store_prices: response.store_prices.map(normalizeProductStorePrice),
  };
}

export function normalizeProductHistory(
  response: RawProductPriceHistoryRead[],
): ProductPriceHistoryRead[] {
  return response.map(normalizeProductHistoryEntry);
}

export function normalizePriceListResponse(
  response: RawPriceListResponse,
): PriceListResponse {
  return {
    ...response,
    items: response.items.map(normalizePriceDetail),
  };
}

const GAME_LIKE_CATEGORIES = new Set(["game", "package", "dlc"]);

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? "").trim().toLowerCase();
}

export function isGameLikeCategory(category: string | null | undefined) {
  return GAME_LIKE_CATEGORIES.has(normalizeCategory(category));
}

export function isMainCatalogVisibleProduct(product: {
  category: string | null | undefined;
}) {
  return !isGameLikeCategory(product.category);
}

export function isActiveOffer(price: { current_price: number | null; is_available: boolean | null }) {
  return price.is_available === true && price.current_price != null;
}

export function hasTrackedPrice(price: { current_price: number | null; is_available: boolean | null }) {
  return price.current_price != null || price.is_available === false;
}
