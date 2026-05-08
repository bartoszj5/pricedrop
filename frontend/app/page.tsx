import { Suspense } from "react";
import { getProducts, getStores } from "./lib/api";
import CatalogControls from "./components/CatalogControls";
import { CatalogControlsFallback, PaginationFallback } from "./components/CatalogChromeFallback";
import ProductCard from "./components/ProductCard";
import Pagination from "./components/Pagination";
import EmptyState from "./components/EmptyState";
import { isGameLikeCategory, isMainCatalogVisibleProduct } from "./lib/normalize";
import type { ProductSort, ProductWithBestPrice } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const page = typeof params.page === "string" ? parseInt(params.page, 10) || 1 : 1;
  const category = typeof params.category === "string" ? params.category : undefined;
  const store = typeof params.store === "string" ? params.store : undefined;
  const sort = typeof params.sort === "string" ? params.sort : undefined;

  const [productsData, storesData] = await Promise.all([
    getProducts({
      search,
      category,
      store,
      main_catalog: true,
      sort: sort as ProductSort | undefined,
      page,
      page_size: 30,
    }),
    getStores({ page_size: 100 }),
  ]);

  const categories = (productsData.categories ?? []).filter(
    (value) => !isGameLikeCategory(value),
  );
  const items = productsData.items.filter(isMainCatalogVisibleProduct);
  const usesFeaturedSort = !sort || sort === "featured";

  const featured: ProductWithBestPrice | null =
    page === 1 && usesFeaturedSort
      ? (items[0] ?? null)
      : null;

  const restItems = featured
    ? items.filter((p) => p.id !== featured.id)
    : items;

  return (
    <main className="page-shell flex flex-col gap-6">
      <Suspense fallback={<CatalogControlsFallback />}>
        <CatalogControls stores={storesData.items} categories={categories} />
      </Suspense>

      {items.length === 0 ? (
        <EmptyState
          message="Brak produktów dla tego zestawu filtrów"
          detail="Spróbuj zmienić kategorię, sklep albo frazę wyszukiwania. Strona główna pokazuje elektronikę i produkty sklepowe — pełny katalog gier jest w zakładce Gry."
          actionHref="/"
          actionLabel="Wróć do pełnego katalogu"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {featured && <ProductCard product={featured} featured />}
          {restItems.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Suspense fallback={<PaginationFallback />}>
        <Pagination page={page} totalPages={productsData.total_pages} />
      </Suspense>
    </main>
  );
}
