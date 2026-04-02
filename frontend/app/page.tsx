import { Suspense } from "react";
import { getProducts, getStores } from "./lib/api";
import Sidebar from "./components/Sidebar";
import FeaturedBanner from "./components/FeaturedBanner";
import ProductCard from "./components/ProductCard";
import Pagination from "./components/Pagination";
import SortDropdown from "./components/SortDropdown";
import EmptyState from "./components/EmptyState";
import type { ProductWithBestPrice } from "./types";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const page = typeof params.page === "string" ? parseInt(params.page, 10) || 1 : 1;
  const category = typeof params.category === "string" ? params.category : undefined;
  const store = typeof params.store === "string" ? params.store : undefined;

  const searchQuery = [search, category].filter(Boolean).join(" ");

  const [productsData, storesData] = await Promise.all([
    getProducts({ search: searchQuery || undefined, page, page_size: 20 }),
    getStores({ page_size: 100 }),
  ]);

  // Client-side store filter: the API search only filters by title/slug/category,
  // so we filter by store on the server component level
  let items = productsData.items;
  if (store) {
    items = items.filter((p) => p.best_store_slug === store);
  }

  // Extract unique categories from all products for sidebar
  const categories = [...new Set(productsData.items.map((p) => p.category))].sort();

  // Find product with lowest price for featured banner
  const featured: ProductWithBestPrice | null =
    items.reduce<ProductWithBestPrice | null>((best, p) => {
      if (p.best_price == null) return best;
      if (!best || (best.best_price != null && p.best_price < best.best_price)) return p;
      return best;
    }, null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <Suspense>
        <Sidebar stores={storesData.items} categories={categories} />
      </Suspense>
      <div className="w-px bg-border" />

      <main className="flex-1 flex flex-col gap-6 p-7 px-8 overflow-y-auto">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-text-primary">
              {search ? `Wyniki: "${search}"` : "Najlepsze okazje"}
            </h1>
            <p className="text-[13px] text-text-muted">
              {productsData.total} produktów
            </p>
          </div>
          <Suspense>
            <SortDropdown />
          </Suspense>
        </div>

        {/* Featured Banner */}
        {!search && !category && page === 1 && (
          <FeaturedBanner product={featured} />
        )}

        {/* Product Grid */}
        {items.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState message="Nie znaleziono produktów" />
        )}

        {/* Pagination */}
        <Suspense>
          <Pagination page={page} totalPages={productsData.total_pages} />
        </Suspense>
      </main>
    </div>
  );
}
