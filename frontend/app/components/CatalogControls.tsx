"use client";

import {
  AlertTriangle,
  Filter,
  Loader2,
  Settings2,
  SlidersHorizontal,
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
import { syncGamesAction } from "../games/actions";
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

const SORT_LABELS: Record<ProductSort, string> = {
  featured: "Polecane",
  price_asc: "Cena rosnąco",
  price_desc: "Cena malejąco",
  newest: "Najnowsze",
  title_asc: "Nazwa A-Z",
  title_desc: "Nazwa Z-A",
  category: "Kategorie",
};

export default function CatalogControls({
  stores = [],
  categories = [],
  showCategories = true,
  enableItadSearch = false,
}: CatalogControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isSearchNavPending, startNavTransition] = useTransition();
  const [isEnrichingCatalog, setIsEnrichingCatalog] = useState(false);
  const [lookupIssue, setLookupIssue] = useState<CatalogLookupIssue | null>(null);
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

  const searchParamsRef = useRef(searchParams);
  const pathnameRef = useRef(pathname);
  searchParamsRef.current = searchParams;
  pathnameRef.current = pathname;

  const buildRefreshUrl = useEffectEvent(() => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    params.delete("page");
    const query = params.toString();
    const path = pathnameRef.current;
    return query ? `${path}?${query}` : path;
  });

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
        const refreshUrl = buildRefreshUrl();
        startNavTransition(() => {
          router.replace(refreshUrl, { scroll: false });
        });
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

  function updateParams(changes: Record<string, string | null>) {
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
    const nextUrl = query ? `${path}?${query}` : path;
    startNavTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  function resetFilters() {
    startNavTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  const activeSortLabel = SORT_LABELS[activeSort] ?? SORT_LABELS.featured;
  const activeStoreLabel =
    stores.find((s) => s.slug === activeStore)?.name ?? null;
  const showBackgroundSpinner =
    enableItadSearch && (isEnrichingCatalog || isSearchNavPending);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">
            {activeFiltersCount > 0
              ? `Aktywne filtry: ${activeFiltersCount}`
              : "Wszystkie produkty"}
          </span>
          {showBackgroundSpinner && trimmedUrlSearch ? (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Uzupełniamy katalog…
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Sortuj</span>
            <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" />
            <select
              aria-label="Sortowanie"
              value={activeSort}
              onChange={(event) =>
                updateParams({ sort: event.target.value || null })
              }
              className="h-10 appearance-none rounded-full border border-border bg-bg-card pl-9 pr-8 text-sm font-semibold text-text-primary outline-none hover:border-accent/40 focus:border-accent"
            >
              {(Object.keys(SORT_LABELS) as ProductSort[]).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg-card px-4 text-sm font-semibold text-text-primary hover:border-accent/40"
          >
            <Filter className="h-4 w-4" />
            Filtry
            {activeFiltersCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[0.7rem] text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <span className="hidden items-center gap-1 text-xs text-text-muted md:inline-flex">
            {activeStoreLabel && (
              <span className="rounded-full bg-bg-tertiary px-2.5 py-1 font-semibold text-text-secondary">
                {activeStoreLabel}
              </span>
            )}
            <span>·</span>
            <span>{activeSortLabel}</span>
          </span>
        </div>
      </div>

      {enableItadSearch && lookupIssue && (
        <div
          className={`section-subtle flex items-start gap-4 p-5 ${
            lookupIssue.isConfig
              ? "border-accent-amber/40 bg-[#fff8e6]"
              : "border-accent-red/30 bg-[#fef2f2]"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              lookupIssue.isConfig ? "bg-[#fde68a]" : "bg-[#fecaca]"
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

      {drawerOpen && (
        <div className="animate-fade-in fixed inset-0 z-50 bg-text-primary/30 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-filters-title"
            className="animate-slide-up absolute right-0 top-0 h-full w-[min(420px,calc(100vw-32px))] overflow-y-auto border-l border-border bg-bg-secondary p-6 shadow-[var(--shadow-float)]"
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
                onClick={() => setDrawerOpen(false)}
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
              onAfterChange={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
