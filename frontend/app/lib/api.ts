import type {
  ProductWithPricesListResponse,
  ProductDetailResponse,
  ProductPriceHistoryRead,
  StoreListResponse,
  StoreRead,
  PriceListResponse,
  ITADGameRead,
  ITADGameWithDeals,
  ProductSort,
} from "../types";

const API_BASES = process.env.INTERNAL_API_URL
  ? [process.env.INTERNAL_API_URL]
  : ["http://localhost:8000", "http://api:8000"];

async function fetchServer<T>(path: string, revalidate = 60): Promise<T> {
  let lastError: Error | undefined;

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        next: { revalidate },
      });
      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${path}`);
      }
      return res.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("API error")) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Failed to fetch API path: ${path}`);
}

// --- Products ---

export async function getProducts(params: {
  search?: string;
  category?: string;
  store?: string;
  sort?: ProductSort;
  page?: number;
  page_size?: number;
} = {}): Promise<ProductWithPricesListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.category) sp.set("category", params.category);
  if (params.store) sp.set("store", params.store);
  if (params.sort) sp.set("sort", params.sort);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return fetchServer(`/products/with-prices${qs ? `?${qs}` : ""}`);
}

export async function getProductDetail(slug: string): Promise<ProductDetailResponse> {
  return fetchServer(`/products/${slug}`);
}

export async function getProductHistory(slug: string): Promise<ProductPriceHistoryRead[]> {
  return fetchServer(`/products/${slug}/history`);
}

// --- Stores ---

export async function getStores(params: {
  search?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<StoreListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return fetchServer(`/stores${qs ? `?${qs}` : ""}`);
}

export async function getStore(slug: string): Promise<StoreRead> {
  return fetchServer(`/stores/${slug}`);
}

// --- Prices ---

export async function getPrices(params: {
  product_slug?: string;
  store_slug?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<PriceListResponse> {
  const sp = new URLSearchParams();
  if (params.product_slug) sp.set("product_slug", params.product_slug);
  if (params.store_slug) sp.set("store_slug", params.store_slug);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return fetchServer(`/prices${qs ? `?${qs}` : ""}`);
}

// --- ITAD (client-side) ---

export async function searchITAD(
  title: string,
  results = 20,
): Promise<ITADGameRead[]> {
  const sp = new URLSearchParams({ title, results: String(results) });
  const res = await fetch(`/api/itad/search?${sp}`);
  if (!res.ok) {
    let detail = `ITAD search error: ${res.status}`;
    try {
      const payload = await res.json();
      if (payload && typeof payload.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      // Ignore JSON parsing failures and keep fallback detail.
    }

    const error = new Error(detail) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function searchITADDeals(
  title: string,
  results = 12,
  country = "PL",
): Promise<ITADGameWithDeals[]> {
  const sp = new URLSearchParams({
    title,
    results: String(results),
    country,
  });
  const res = await fetch(`/api/itad/search-deals?${sp}`);
  if (!res.ok) {
    let detail = `ITAD search error: ${res.status}`;
    try {
      const payload = await res.json();
      if (payload && typeof payload.detail === "string") {
        detail = payload.detail;
      }
    } catch {
      // Ignore JSON parsing failures and keep fallback detail.
    }
    const error = new Error(detail) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
