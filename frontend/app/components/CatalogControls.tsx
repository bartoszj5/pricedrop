"use client";

import {
  Filter,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  X,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort, StoreRead } from "../types";

interface CatalogControlsProps {
  stores: StoreRead[];
  categories: string[];
}

const sortOptions: Array<{ label: string; value: ProductSort }> = [
  { label: "Najlepsze okazje", value: "featured" },
  { label: "Cena rosnąco", value: "price_asc" },
  { label: "Cena malejąco", value: "price_desc" },
  { label: "Najnowsze", value: "newest" },
  { label: "Nazwa A-Z", value: "title_asc" },
  { label: "Nazwa Z-A", value: "title_desc" },
  { label: "Kategorie", value: "category" },
];

export default function CatalogControls({
  stores = [],
  categories = [],
}: CatalogControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const deferredSearch = useDeferredValue(searchValue);

  const activeCategory = searchParams.get("category") ?? "";
  const activeStore = searchParams.get("store") ?? "";
  const activeSort = (searchParams.get("sort") as ProductSort | null) ?? "featured";
  const activeFiltersCount = [activeCategory, activeStore, searchParams.get("search")]
    .filter(Boolean)
    .length;

  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (deferredSearch === currentSearch) return;
    updateParams({ search: deferredSearch || null });
  }, [deferredSearch, searchParams]);

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value.trim()) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function resetFilters() {
    setSearchValue("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  function renderFilterBody() {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Kategorie
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateParams({ category: null })}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                !activeCategory
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-bg-card text-text-secondary hover:border-accent/40 hover:text-text-primary"
              }`}
            >
              Wszystkie
            </button>
            {categories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => updateParams({ category: category })}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    isActive
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-bg-card text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="flex flex-col gap-2">
            <span className="eyebrow">
              <StoreIcon className="h-3.5 w-3.5" />
              Sklep z aktywną ofertą
            </span>
            <select
              value={activeStore}
              onChange={(event) =>
                updateParams({ store: event.target.value || null })
              }
              className="h-12 rounded-2xl border border-border bg-bg-card px-4 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">Wszystkie sklepy</option>
              {stores.map((store) => (
                <option key={store.slug} value={store.slug}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="eyebrow">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Sortowanie
            </span>
            <select
              value={activeSort}
              onChange={(event) =>
                updateParams({ sort: event.target.value || null })
              }
              className="h-12 rounded-2xl border border-border bg-bg-card px-4 text-sm text-text-primary outline-none focus:border-accent"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={resetFilters}
            className="h-12 self-end rounded-2xl border border-border bg-bg-card px-5 text-sm font-semibold text-text-secondary hover:-translate-y-0.5 hover:border-accent/40 hover:text-text-primary"
          >
            Wyczyść
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="section-card p-5 md:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="flex flex-1 items-center gap-3 rounded-[26px] border border-border bg-bg-card px-5 py-4 shadow-[var(--shadow-card)]">
              <Search className="h-5 w-5 shrink-0 text-text-muted" />
              <input
                type="search"
                placeholder="Szukaj sprzętu, gier, akcesoriów i konkretnych modeli"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
              />
            </label>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-[24px] border border-border bg-bg-card px-5 text-sm font-semibold text-text-primary shadow-[var(--shadow-card)] lg:hidden"
            >
              <Filter className="h-4 w-4" />
              Filtry
              {activeFiltersCount > 0 && (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden lg:block">{renderFilterBody()}</div>
        </div>
      </section>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-x-3 bottom-3 top-20 overflow-y-auto rounded-[30px] border border-border bg-bg-secondary p-5 shadow-[var(--shadow-float)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Sterowanie katalogiem</p>
                <h2 className="mt-2 text-2xl text-text-primary">Filtry i sortowanie</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-card text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderFilterBody()}
          </div>
        </div>
      )}
    </>
  );
}
