import { getProducts, getStores } from "./lib/api";
import CatalogControls from "./components/CatalogControls";
import Sidebar from "./components/Sidebar";
import FeaturedBanner from "./components/FeaturedBanner";
import ProductCard from "./components/ProductCard";
import Pagination from "./components/Pagination";
import EmptyState from "./components/EmptyState";
import type { ProductSort, ProductWithBestPrice } from "./types";
import { humanizeCategory } from "./lib/utils";

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
      sort: sort as ProductSort | undefined,
      page,
      page_size: 24,
    }),
    getStores({ page_size: 100 }),
  ]);

  const items = productsData.items;
  const activeOffers = items.filter((product) => product.best_price != null && product.best_price > 0);
  const trackedOnly = items.filter((product) => product.best_price == null || product.best_price === 0);
  const featuredPool = activeOffers;
  const featured: ProductWithBestPrice | null =
    featuredPool.reduce<ProductWithBestPrice | null>((best, p) => {
      if (p.best_price == null) return best;
      if (!best || (best.best_price != null && p.best_price < best.best_price)) return p;
      return best;
    }, null);

  const activeStoreName = store
    ? storesData.items.find((entry) => entry.slug === store)?.name ?? store
    : null;
  const title = search
    ? `Wyniki dla "${search}"`
    : category
      ? `Kategoria: ${humanizeCategory(category)}`
      : "Katalog okazji i monitoringu";
  const subtitleParts = [
    `${productsData.total} produktów`,
    activeStoreName ? `aktywny sklep: ${activeStoreName}` : null,
    sort ? `sortowanie: ${sort.replace("_", " ")}` : "tryb: najlepsze okazje",
  ].filter(Boolean);

  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card grid gap-8 p-6 md:p-8 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">PriceDrop / szeroki katalog okazji</span>
          <h1 className="display-title max-w-4xl text-5xl text-text-primary md:text-7xl">
            {title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-text-secondary md:text-lg">
            PriceDrop rozdziela produkty z realną ceną od tych, które są dopiero
            w monitoringu. Dzięki temu nie przeglądasz atrap okazji, tylko
            widzisz, gdzie rynek faktycznie już żyje.
          </p>
          <div className="flex flex-wrap gap-2 text-sm text-text-secondary">
            {subtitleParts.map((part) => (
              <span key={part} className="paper-chip">
                {part}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Na tej stronie
            </p>
            <p className="mt-2 text-4xl text-text-primary">{items.length}</p>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Aktywne okazje
            </p>
            <p className="mt-2 text-4xl text-accent-green">{activeOffers.length}</p>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Produkty w monitoringu
            </p>
            <p className="mt-2 text-4xl text-text-primary">{trackedOnly.length}</p>
          </div>
        </div>
      </section>

      <CatalogControls
        stores={storesData.items}
        categories={productsData.categories ?? []}
      />

      <div className="flex gap-6">
        <Sidebar
          stores={storesData.items}
          categories={productsData.categories ?? []}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {page === 1 && (
            <FeaturedBanner
              product={featured}
              trackedStoresCount={storesData.total}
            />
          )}

          {items.length === 0 ? (
            <EmptyState
              message="Brak produktów dla tego zestawu filtrów"
              detail="Spróbuj zmienić kategorię, sklep albo frazę wyszukiwania. Katalog rozdziela aktywne oferty od monitoringu, więc przy ostrych filtrach wynik może być pusty."
              actionHref="/"
              actionLabel="Wróć do pełnego katalogu"
            />
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="eyebrow">Aktywne oferty</span>
                  <h2 className="text-3xl text-text-primary">Najlepsze oferty teraz</h2>
                  <p className="text-sm leading-6 text-text-secondary">
                    Produkty z potwierdzoną ceną i aktywną ofertą sprzedaży.
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
                    message="Na tej stronie nie ma jeszcze aktywnych ofert"
                    detail="Filtry zawęziły katalog do produktów, które są obecnie tylko monitorowane. To uczciwy stan danych, nie brak renderu."
                  />
                )}
              </section>

              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="eyebrow">Monitoring</span>
                  <h2 className="text-3xl text-text-primary">Produkty w monitoringu</h2>
                  <p className="text-sm leading-6 text-text-secondary">
                    Rekordy bez aktywnej oferty, ale już przygotowane pod śledzenie
                    cen w wielu sklepach.
                  </p>
                </div>
                {trackedOnly.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {trackedOnly.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    message="Wszystkie produkty z tej strony mają aktywną ofertę"
                    detail="W tym zestawie wyników monitoring bez ceny nie był potrzebny, bo cały widoczny wycinek katalogu ma już aktywne oferty."
                  />
                )}
              </section>
            </>
          )}

          <Pagination page={page} totalPages={productsData.total_pages} />
        </div>
      </div>
    </main>
  );
}
