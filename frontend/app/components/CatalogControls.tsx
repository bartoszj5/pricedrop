"use client";

import {
  AlertTriangle,
  Filter,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CatalogFiltersContent from "./CatalogFiltersContent";
import { syncGamesAction } from "../search/actions";
import type { ProductSort, StoreRead } from "../types";

export interface CatalogLookupIssue {
  message: string;
  isConfig: boolean;
}

interface CatalogControlsProps {
  stores: StoreRead[];
  categories: string[];
  showCategories?: boolean;
  enableItadSearch?: boolean;
}

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
  const [isSearchNavPending, startNavTransition] = useTransition();
  const [isEnrichingCatalog, setIsEnrichingCatalog] = useState(false);
  const [lookupIssue, setLookupIssue] = useState<CatalogLookupIssue | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Zapobiega wielokrotnemu sync przy tym samym `?search=` (np. po `router.refresh()`). */
  const enrichCompletedForRef = useRef<string | null>(null);

  const urlSearchQuery = searchParams.get("search") ?? "";
  const trimmedUrlSearch = urlSearchQuery.trim();

  const activeCategory = searchParams.get("category") ?? "";
  const activeStore = searchParams.get("store") ?? "";
  const activeSort =
    (searchParams.get("sort") as ProductSort | null) ?? "featured";
  const activeFiltersCount = [
    activeCategory,
    activeStore,
    searchParams.get("search"),
  ].filter(Boolean).length;

  useEffect(() => {
    // The controlled input mirrors the URL query so back/forward navigation stays in sync.
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!enableItadSearch) return;
    if (!trimmedUrlSearch) {
      enrichCompletedForRef.current = null;
      setLookupIssue(null);
      setIsEnrichingCatalog(false);
      return;
    }

    if (enrichCompletedForRef.current === trimmedUrlSearch) {
      return;
    }

    let cancelled = false;
    setIsEnrichingCatalog(true);
    setLookupIssue(null);

    void (async () => {
      try {
        const result = await syncGamesAction(trimmedUrlSearch);
        if (cancelled) return;
        if (!result.ok) {
          setLookupIssue({
            message:
              result.error ?? "Nie udało się uzupełnić katalogu gier.",
            isConfig: Boolean(result.isConfigError),
          });
          enrichCompletedForRef.current = null;
          return;
        }
        setLookupIssue(null);
        enrichCompletedForRef.current = trimmedUrlSearch;
        router.refresh();
      } finally {
        if (!cancelled) {
          setIsEnrichingCatalog(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enableItadSearch, trimmedUrlSearch, router]);

  const searchParamsRef = useRef(searchParams);
  const pathnameRef = useRef(pathname);
  searchParamsRef.current = searchParams;
  pathnameRef.current = pathname;

  function buildUrl(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value.trim()) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete("page");
    const query = params.toString();
    const path = pathnameRef.current;
    return query ? `${path}?${query}` : path;
  }

  const applySearchNavigation = useEffectEvent((value: string) => {
    const nextUrl = buildUrl({ search: value.trim() || null });
    startNavTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  });

  const readSearchFromUrl = useEffectEvent(() => searchParams.get("search") ?? "");

  useEffect(() => {
    if (searchValue === readSearchFromUrl()) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      applySearchNavigation(searchValue);
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchValue]);

  function updateParams(changes: Record<string, string | null>) {
    const nextUrl = buildUrl(changes);
    startNavTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  function resetFilters() {
    setSearchValue("");
    startNavTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  const showGamesNavSpinner = enableItadSearch && isSearchNavPending;

  return (
    <>
      <section className="section-card p-5 md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="flex min-h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
              <span className="sr-only">
                {enableItadSearch
                  ? "Szukaj gier po tytule"
                  : "Filtruj katalog po nazwie produktu"}
              </span>
              {showGamesNavSpinner ? (
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin text-text-muted"
                  aria-hidden
                />
              ) : (
                <Search className="h-5 w-5 shrink-0 text-text-muted" />
              )}
              <input
                type="search"
                aria-label={
                  enableItadSearch
                    ? "Szukaj gier po tytule"
                    : "Filtruj katalog po nazwie produktu"
                }
                placeholder={
                  enableItadSearch
                    ? "Szukaj gry po tytule (np. Baldur, Cyberpunk, Witcher)"
                    : "Szukaj sprzętu, gier, akcesoriów i konkretnych modeli"
                }
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full bg-transparent py-4 text-base text-text-primary outline-none placeholder:text-text-muted"
              />
            </label>

            <button
              type="button"
              aria-label="Otwórz panel filtrów"
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

          {enableItadSearch && isEnrichingCatalog && trimmedUrlSearch ? (
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin"
                aria-hidden
              />
              Uzupełniamy katalog w tle…
            </p>
          ) : null}
        </div>
      </section>

      {enableItadSearch && lookupIssue && (
        <div
          className={`section-subtle flex items-start gap-4 p-5 ${
            lookupIssue.isConfig
              ? "border-accent-amber/40 bg-[#fff4df]"
              : "border-accent-red/30 bg-[#fff0eb]"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              lookupIssue.isConfig ? "bg-[#f5e1b5]" : "bg-[#f1d7cf]"
            }`}
          >
            {lookupIssue.isConfig ? (
              <Settings2 className="h-5 w-5 text-accent-amber" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-accent-red" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-lg text-text-primary">
              {lookupIssue.isConfig
                ? "Wyszukiwarka gier wymaga konfiguracji"
                : "Nie udało się odświeżyć wyników"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">
              {lookupIssue.message}
            </p>
          </div>
        </div>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm lg:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-filters-title"
            className="absolute inset-x-3 bottom-3 top-20 overflow-y-auto rounded-[30px] border border-border bg-bg-secondary p-5 shadow-[var(--shadow-float)]"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">Sterowanie katalogiem</p>
                <h2
                  id="catalog-filters-title"
                  className="mt-2 text-2xl text-text-primary"
                >
                  Filtry i sortowanie
                </h2>
              </div>
              <button
                type="button"
                aria-label="Zamknij panel filtrów"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-card text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <CatalogFiltersContent
              stores={stores}
              categories={categories}
              showCategories={showCategories}
              activeCategory={activeCategory}
              activeStore={activeStore}
              activeSort={activeSort}
              showAllCategories={showAllCategories}
              showResetButton
              onToggleAllCategories={() =>
                setShowAllCategories((currentValue) => !currentValue)
              }
              onUpdateParams={updateParams}
              onResetFilters={resetFilters}
              onAfterChange={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
