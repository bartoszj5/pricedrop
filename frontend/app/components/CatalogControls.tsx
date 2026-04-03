"use client";

import {
  ChevronDown,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  Tag,
  X,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort, StoreRead } from "../types";
import { humanizeCategory } from "../lib/utils";

interface CatalogControlsProps {
  stores: StoreRead[];
  categories: string[];
}

const INITIAL_VISIBLE = 7;

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
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (searchValue === currentSearch) return;

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchValue.trim()) {
        params.set("search", searchValue);
      } else {
        params.delete("search");
      }
      params.delete("page");
      const query = params.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, searchParams, pathname, router]);

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

  const visibleCategories = showAllCategories
    ? categories
    : categories.slice(0, INITIAL_VISIBLE);
  const hasMore = categories.length > INITIAL_VISIBLE;

  return (
    <>
      {/* Search bar — always visible */}
      <section className="section-card p-5 md:p-6">
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

          {/* Mobile filter trigger */}
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
      </section>

      {/* Mobile filter drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-x-3 bottom-3 top-20 overflow-y-auto rounded-[30px] border border-border bg-bg-secondary p-5 shadow-[var(--shadow-float)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Sterowanie katalogiem</p>
                <h2 className="mt-2 text-2xl text-text-primary">
                  Filtry i sortowanie
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-card text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile filter body */}
            <div className="flex flex-col gap-5">
              {/* Categories */}
              <div className="flex flex-col gap-2.5">
                <span className="eyebrow">
                  <Sparkles className="h-3.5 w-3.5" />
                  Kategorie
                </span>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => updateParams({ category: null })}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      !activeCategory
                        ? "bg-accent/10 font-semibold text-accent"
                        : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                    }`}
                  >
                    <Tag
                      className={`h-3.5 w-3.5 ${!activeCategory ? "text-accent" : "text-text-muted"}`}
                    />
                    Wszystkie
                  </button>
                  {visibleCategories.map((cat) => {
                    const isActive = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => updateParams({ category: cat })}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-accent/10 font-semibold text-accent"
                            : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                        }`}
                      >
                        <Tag
                          className={`h-3.5 w-3.5 ${isActive ? "text-accent" : "text-text-muted"}`}
                        />
                        {humanizeCategory(cat)}
                      </button>
                    );
                  })}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories((prev) => !prev)}
                      className="mt-1 flex items-center gap-1.5 px-3 text-xs font-semibold text-accent hover:text-accent/80"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showAllCategories ? "rotate-180" : ""}`}
                      />
                      {showAllCategories
                        ? "Zwiń"
                        : `Pokaż więcej (${categories.length - INITIAL_VISIBLE})`}
                    </button>
                  )}
                </div>
              </div>

              {/* Stores */}
              {stores.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="eyebrow">
                    <StoreIcon className="h-3.5 w-3.5" />
                    Sklep
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateParams({ store: null })}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        !activeStore
                          ? "bg-accent-blue/10 font-semibold text-accent-blue"
                          : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                      }`}
                    >
                      <div
                        className={`h-3.5 w-3.5 rounded border ${
                          !activeStore
                            ? "border-accent-blue bg-accent-blue"
                            : "border-text-muted"
                        }`}
                      />
                      Wszystkie
                    </button>
                    {stores.map((s) => {
                      const isChecked = activeStore === s.slug;
                      return (
                        <button
                          key={s.slug}
                          type="button"
                          onClick={() =>
                            updateParams({ store: isChecked ? null : s.slug })
                          }
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                            isChecked
                              ? "bg-accent-blue/10 font-semibold text-accent-blue"
                              : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                          }`}
                        >
                          <div
                            className={`h-3.5 w-3.5 rounded border ${
                              isChecked
                                ? "border-accent-blue bg-accent-blue"
                                : "border-text-muted"
                            }`}
                          />
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sort */}
              <div className="flex flex-col gap-2.5">
                <span className="eyebrow">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Sortowanie
                </span>
                <select
                  value={activeSort}
                  onChange={(e) =>
                    updateParams({ sort: e.target.value || null })
                  }
                  className="h-10 rounded-xl border border-border bg-bg-card px-3 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset */}
              <button
                type="button"
                onClick={() => {
                  resetFilters();
                  setMobileOpen(false);
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-bg-card text-sm font-semibold text-text-secondary hover:text-text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Wyczyść filtry
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
