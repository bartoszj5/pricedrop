import type { Metadata } from "next";
import { Suspense } from "react";
import { getProducts, getStores } from "../lib/api";
import {
  CatalogControlsFallback,
  PaginationFallback,
} from "../components/CatalogChromeFallback";
import CatalogControls from "../components/CatalogControls";
import ProductCard from "../components/ProductCard";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import type { ProductSort } from "../types";

export const metadata: Metadata = {
  title: "Gry — PriceDrop",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function GamesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search =
    typeof params.search === "string" ? params.search : undefined;
  const page =
    typeof params.page === "string" ? parseInt(params.page, 10) || 1 : 1;
  const store =
    typeof params.store === "string" ? params.store : undefined;
  const sort = typeof params.sort === "string" ? params.sort : undefined;

  const trimmedSearch = search?.trim();

  const [productsData, storesData] = await Promise.all([
    getProducts(
      {
        search,
        category: "game",
        store,
        sort: sort as ProductSort | undefined,
        page,
        page_size: 30,
      },
      { fresh: true },
    ),
    getStores({ page_size: 100 }, { fresh: true }),
  ]);

  const items = productsData.items;

  return (
    <main className="page-shell flex flex-col gap-6">
      <Suspense fallback={<CatalogControlsFallback />}>
        <CatalogControls
          stores={storesData.items}
          categories={productsData.categories ?? []}
          showCategories={false}
          enableItadSearch
        />
      </Suspense>

      {items.length === 0 ? (
        <EmptyState
          message={
            trimmedSearch
              ? "Nie znaleziono gier dla tego wyszukiwania"
              : "Brak gier w katalogu"
          }
          detail={
            trimmedSearch
              ? "To mogą być wyniki wyłącznie lokalne — poczekaj chwilę, w tle uzupełniamy katalog o nowe tytuły. Możesz też spróbować innej frazy."
              : "Wpisz tytuł w wyszukiwarce powyżej, aby dodać gry do katalogu i zobaczyć oferty."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {items.map((product) => (
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
