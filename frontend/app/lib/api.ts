import "server-only";

import {
  normalizePriceListResponse,
  normalizeProductDetailResponse,
  normalizeProductHistory,
  normalizeProductListResponse,
} from "./normalize";
import type {
  ITADSearchSaveResponse,
  PriceAvailability,
  PriceListResponse,
  ProductDetailResponse,
  ProductPriceHistoryRead,
  ProductSort,
  ProductWithPricesListResponse,
  RawPriceListResponse,
  RawProductDetailResponse,
  RawProductPriceHistoryRead,
  RawProductWithPricesListResponse,
  StoreListResponse,
  StoreRead,
} from "../types";

const API_BASES = process.env.INTERNAL_API_URL
  ? [process.env.INTERNAL_API_URL]
  : ["http://localhost:8000", "http://api:8000"];

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ServerFetchOptions {
  method?: string;
  revalidate?: number;
  fresh?: boolean;
  body?: BodyInit;
  headers?: HeadersInit;
}

async function fetchServer<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const {
    method = "GET",
    revalidate = 60,
    fresh = false,
    body,
    headers,
  } = options;
  let lastError: Error | undefined;

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        body,
        headers,
        ...(fresh ? { cache: "no-store" } : { next: { revalidate } }),
      });
      if (!res.ok) {
        let message = `API error ${res.status}: ${path}`;
        try {
          const payload = await res.json();
          if (payload && typeof payload.detail === "string") {
            message = payload.detail;
          }
        } catch {
          // Keep the fallback message if the payload is not JSON.
        }
        throw new ApiError(message, res.status);
      }
      return res.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Failed to fetch API path: ${path}`);
}

// --- Products ---

export async function getProducts(
  params: {
    search?: string;
    category?: string;
    store?: string;
    sort?: ProductSort;
    page?: number;
    page_size?: number;
  } = {},
  options: ServerFetchOptions = {},
): Promise<ProductWithPricesListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.category) sp.set("category", params.category);
  if (params.store) sp.set("store", params.store);
  if (params.sort) sp.set("sort", params.sort);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();

  const response = await fetchServer<RawProductWithPricesListResponse>(
    `/products/with-prices${qs ? `?${qs}` : ""}`,
    options,
  );

  return normalizeProductListResponse(response);
}

export async function getProductDetail(
  slug: string,
): Promise<ProductDetailResponse> {
  const response = await fetchServer<RawProductDetailResponse>(
    `/products/${slug}`,
  );

  return normalizeProductDetailResponse(response);
}

export async function getProductHistory(
  slug: string,
): Promise<ProductPriceHistoryRead[]> {
  const response = await fetchServer<RawProductPriceHistoryRead[]>(
    `/products/${slug}/history`,
  );

  return normalizeProductHistory(response);
}

// --- Stores ---

export async function getStores(
  params: {
    search?: string;
    page?: number;
    page_size?: number;
  } = {},
  options: ServerFetchOptions = {},
): Promise<StoreListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();

  return fetchServer<StoreListResponse>(`/stores${qs ? `?${qs}` : ""}`, options);
}

export async function getStore(slug: string): Promise<StoreRead> {
  return fetchServer<StoreRead>(`/stores/${slug}`);
}

// --- Prices ---

export async function getPrices(
  params: {
    product_slug?: string;
    store_slug?: string;
    availability?: PriceAvailability;
    page?: number;
    page_size?: number;
  } = {},
  options: ServerFetchOptions = {},
): Promise<PriceListResponse> {
  const sp = new URLSearchParams();
  if (params.product_slug) sp.set("product_slug", params.product_slug);
  if (params.store_slug) sp.set("store_slug", params.store_slug);
  if (params.availability) sp.set("availability", params.availability);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();

  const response = await fetchServer<RawPriceListResponse>(
    `/prices${qs ? `?${qs}` : ""}`,
    options,
  );

  return normalizePriceListResponse(response);
}

// --- ITAD sync (server-only) ---

export async function syncGamesByTitle(params: {
  title: string;
  results?: number;
  country?: string;
}): Promise<ITADSearchSaveResponse> {
  const sp = new URLSearchParams({
    title: params.title,
    results: String(params.results ?? 12),
    country: params.country ?? "PL",
  });

  return fetchServer<ITADSearchSaveResponse>(
    `/itad/search-save?${sp.toString()}`,
    {
      method: "POST",
      fresh: true,
    },
  );
}
