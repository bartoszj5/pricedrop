export interface Product {
  id: number;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  image_url: string | null;
  release_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithBestPrice extends Product {
  best_price: number | null;
  best_price_currency: string | null;
  best_store_name: string | null;
  best_store_slug: string | null;
  best_store_logo_url: string | null;
  available_offers_count: number;
  tracked_stores_count: number;
}

export interface ProductWithPricesListResponse {
  items: ProductWithBestPrice[];
  categories: string[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Store {
  id: number;
  name: string;
  slug: string;
  url: string;
  logo_url: string | null;
  is_active: boolean;
}

export interface StoreRead extends Store {
  created_at: string;
}

export interface StoreListResponse {
  items: StoreRead[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProductStorePriceRead {
  price_id: number | null;
  store_id: number;
  store_name: string;
  store_slug: string;
  store_url: string;
  store_logo_url: string | null;
  current_price: number | null;
  currency: string | null;
  product_url: string | null;
  is_available: boolean | null;
  last_checked_at: string | null;
}

export interface ProductDetailResponse {
  product: Product;
  prices: ProductStorePriceRead[];
}

export interface ProductPriceHistoryRead {
  history_id: number;
  price_id: number;
  store_id: number;
  store_name: string;
  store_slug: string;
  old_price: number;
  new_price: number;
  currency: string;
  recorded_at: string;
}

export interface PriceDetailRead {
  id: number;
  product_id: number;
  store_id: number;
  current_price: number;
  currency: string;
  url: string;
  is_available: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  product_title: string;
  product_slug: string;
  store_slug: string;
  store_name: string;
}

export interface PriceListResponse {
  items: PriceDetailRead[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ITADGameRead {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  mature: boolean;
  image_url: string | null;
}

export interface ITADDealRead {
  shop_name: string;
  shop_id: number;
  price_amount: number;
  regular_amount: number | null;
  cut: number;
  currency: string;
  url: string;
}

export interface ITADGameWithDeals {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  mature: boolean;
  image_url: string | null;
  deals: ITADDealRead[];
  best_price: number | null;
  best_price_currency: string | null;
  best_shop: string | null;
}

export type ProductSort =
  | "featured"
  | "price_asc"
  | "price_desc"
  | "title_asc"
  | "title_desc"
  | "newest"
  | "category";
