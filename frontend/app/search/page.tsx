import type { Metadata } from "next";
import { getProducts, getStores } from "../lib/api";
import CatalogControls from "../components/CatalogControls";
import Sidebar from "../components/Sidebar";
import ProductCard from "../components/ProductCard";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import { isCatalogVisibleProduct } from "../lib/normalize";
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
    getProducts({
      search,
      category: "game",
      store,
      sort: sort as ProductSort | undefined,
      page,
      page_size: 24,
    }, { fresh: true }),
    getStores({ page_size: 100 }, { fresh: true }),
  ]);

  const items = productsData.items.filter(isCatalogVisibleProduct);
  const activeOffers = items.filter((p) => p.best_price != null);
  const trackedOnly = items.filter((p) => p.best_price == null);

  return (
    <main className="page-shell flex flex-col gap-6">
      {/* Wyniki od razu z bazy; uzupełnianie katalogu w tle — patrz CatalogControls */}
      <CatalogControls
        stores={storesData.items}
        categories={productsData.categories ?? []}
        showCategories={false}
        enableItadSearch
      />

      <div className="flex gap-6">
        <Sidebar
          stores={storesData.items}
          categories={productsData.categories ?? []}
          showCategories={false}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
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
            <>
              {/* Active offers */}
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="eyebrow">Aktywne oferty</span>
                  <h2 className="text-3xl text-text-primary">
                    Najlepsze oferty gier
                  </h2>
                  <p className="text-sm leading-6 text-text-secondary">
                    Gry z potwierdzoną ceną i aktywną ofertą sprzedaży.
                  </p>
                </div>
                {activeOffers.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {activeOffers.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    message="Brak aktywnych ofert"
                    detail="Te gry są w monitoringu — wyszukaj inny tytuł lub wróć później, gdy pojawią się ceny."
                  />
                )}
              </section>

              {/* Tracked only */}
              {trackedOnly.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="eyebrow">Monitoring</span>
                    <h2 className="text-3xl text-text-primary">
                      Gry w monitoringu
                    </h2>
                    <p className="text-sm leading-6 text-text-secondary">
                      Gry dodane do bazy, ale jeszcze bez aktywnej oferty
                      cenowej.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {trackedOnly.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <Pagination page={page} totalPages={productsData.total_pages} />
        </div>
      </div>
    </main>
  );
}
