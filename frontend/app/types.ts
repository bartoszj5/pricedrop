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

export interface Store {
  id: number;
  name: string;
  slug: string;
  url: string;
  logo_url: string | null;
  is_active: boolean;
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

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProductCardData {
  id: number;
  title: string;
  slug: string;
  category: string;
  image_url: string | null;
  store: string;
  current_price: number;
  old_price: number | null;
  discount: number | null;
  currency: string;
}
