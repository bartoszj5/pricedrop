import type { Metadata } from "next";
import { getProducts, getStores } from "../lib/api";
import CatalogControls from "../components/CatalogControls";
import Sidebar from "../components/Sidebar";
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

  const items = productsData.items;
  const activeOffers = items.filter((p) => p.best_price != null);
  const trackedOnly = items.filter((p) => p.best_price == null);

  return (
    <main className="page-shell flex flex-col gap-6">
      {/* Search + filters (ITAD integration for games) */}
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
              message="Brak gier w bazie"
              detail="Filtrowanie nie znalazło jeszcze zapisanych gier. Użyj przycisku importu z ITAD, jeśli chcesz dociągnąć nowe wyniki do bazy."
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
                    detail="Gry na tej stronie są w monitoringu — wyszukaj nowe tytuły, aby dodać oferty."
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
