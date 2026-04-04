"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  Settings2,
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
import { searchAndSaveGames } from "../lib/api";
import type { ITADSearchSaveResponse } from "../lib/api";

interface CatalogControlsProps {
  stores: StoreRead[];
  categories: string[];
  showCategories?: boolean;
  enableItadSearch?: boolean;
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
  showCategories = true,
  enableItadSearch = false,
}: CatalogControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ITAD search state
  const [itadLoading, setItadLoading] = useState(false);
  const [itadError, setItadError] = useState<string | null>(null);
  const [itadConfigError, setItadConfigError] = useState(false);
  const [itadResult, setItadResult] = useState<ITADSearchSaveResponse | null>(null);

  const activeCategory = searchParams.get("category") ?? "";
  const activeStore = searchParams.get("store") ?? "";
  const activeSort = (searchParams.get("sort") as ProductSort | null) ?? "featured";
  const activeFiltersCount = [activeCategory, activeStore, searchParams.get("search")]
    .filter(Boolean)
    .length;

  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  function navigateWithSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  // Debounced search — only for non-ITAD mode
  useEffect(() => {
    if (enableItadSearch) return;

    const currentSearch = searchParams.get("search") ?? "";
    if (searchValue === currentSearch) return;

    debounceRef.current = setTimeout(() => {
      navigateWithSearch(searchValue);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, searchParams, pathname, router, enableItadSearch]);

  async function handleItadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchValue.trim()) return;

    setItadLoading(true);
    setItadError(null);
    setItadConfigError(false);
    setItadResult(null);

    try {
      const data = await searchAndSaveGames(searchValue.trim());
      setItadResult(data);
    } catch (err) {
      const isMissingKey =
        err instanceof Error &&
        ((err as Error & { status?: number }).status === 503 ||
          err.message.includes("ITAD API key missing"));
      setItadConfigError(isMissingKey);
      setItadError(
        isMissingKey
          ? "Brakuje klucza ITAD_API_KEY w konfiguracji serwera."
          : err instanceof Error
            ? err.message
            : "Błąd wyszukiwania",
      );
    } finally {
      setItadLoading(false);
      const p = new URLSearchParams(searchParams.toString());
      const trimmed = searchValue.trim();
      if (trimmed) {
        p.set("search", trimmed);
      } else {
        p.delete("search");
      }
      p.delete("page");
      const query = p.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
        router.refresh();
      });
    }
  }

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
        {enableItadSearch ? (
          <form onSubmit={handleItadSubmit} className="flex flex-col gap-3 lg:flex-row">
            <label className="flex h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
              <Search className="h-5 w-5 shrink-0 text-text-muted" />
              <input
                type="text"
                placeholder="Wyszukaj grę po tytule (np. Cyberpunk, Witcher)..."
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
              />
            </label>
            <button
              type="submit"
              disabled={itadLoading || !searchValue.trim()}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-[24px] border border-accent bg-accent px-8 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {itadLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Szukaj
            </button>
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
          </form>
        ) : (
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
        )}
      </section>

      {/* ITAD feedback */}
      {enableItadSearch && itadError && (
        <div
          className={`section-subtle flex items-start gap-4 p-5 ${
            itadConfigError
              ? "border-accent-amber/40 bg-[#fff4df]"
              : "border-accent-red/30 bg-[#fff0eb]"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              itadConfigError ? "bg-[#f5e1b5]" : "bg-[#f1d7cf]"
            }`}
          >
            {itadConfigError ? (
              <Settings2 className="h-5 w-5 text-accent-amber" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-accent-red" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-lg text-text-primary">
              {itadConfigError
                ? "Moduł wymaga konfiguracji"
                : "Błąd wyszukiwania"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">{itadError}</p>
          </div>
        </div>
      )}

      {enableItadSearch && itadResult && !itadError && (
        <div className="section-subtle flex items-start gap-4 border-accent-green/30 bg-[#edf9ee] p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-green-soft">
            <Check className="h-5 w-5 text-accent-green" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg text-text-primary">
              Znaleziono {itadResult.games_found}{" "}
              {itadResult.games_found === 1
                ? "grę"
                : itadResult.games_found < 5
                  ? "gry"
                  : "gier"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">
              Zapisano do bazy: {itadResult.products_created} nowych,{" "}
              {itadResult.products_updated} zaktualizowanych.{" "}
              {itadResult.prices_created > 0 &&
                `Dodano ${itadResult.prices_created} cen. `}
              {itadResult.prices_updated > 0 &&
                `Zaktualizowano ${itadResult.prices_updated} cen. `}
            </p>
          </div>
        </div>
      )}

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
              {showCategories && (
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
              )}

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
