import type {
  ProductWithPricesListResponse,
  ProductDetailResponse,
  ProductPriceHistoryRead,
  StoreListResponse,
  StoreRead,
  PriceListResponse,
  ITADGameRead,
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
  page?: number;
  page_size?: number;
} = {}): Promise<ProductWithPricesListResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
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
    throw new Error(`ITAD search error: ${res.status}`);
  }
  return res.json();
}
