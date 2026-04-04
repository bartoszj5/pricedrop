"use client";

import {
  AlertTriangle,
  Check,
  Filter,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CatalogFiltersContent from "./CatalogFiltersContent";
import { syncGamesAction } from "../search/actions";
import { polishPlural } from "../lib/utils";
import type { ITADSearchSaveResponse, ProductSort, StoreRead } from "../types";

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
  const [itadError, setItadError] = useState<string | null>(null);
  const [itadConfigError, setItadConfigError] = useState(false);
  const [itadResult, setItadResult] = useState<ITADSearchSaveResponse | null>(null);
  const [isSyncPending, startSyncTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchValue(searchParams.get("search") ?? "");
  }, [searchParams]);

  function buildUrl(changes: Record<string, string | null>) {
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
    return query ? `${pathname}?${query}` : pathname;
  }

  const applySearchNavigation = useEffectEvent((value: string) => {
    const nextUrl = buildUrl({ search: value.trim() || null });
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  });

  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (searchValue === currentSearch) return;

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
  }, [searchValue, searchParams]);

  function updateParams(changes: Record<string, string | null>) {
    const nextUrl = buildUrl(changes);
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  function resetFilters() {
    setSearchValue("");
    setItadError(null);
    setItadConfigError(false);
    setItadResult(null);
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  async function handleSync() {
    const trimmedSearch = searchValue.trim();
    if (!trimmedSearch) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setItadError(null);
    setItadConfigError(false);
    setItadResult(null);

    startSyncTransition(async () => {
      const result = await syncGamesAction(trimmedSearch);

      if (!result.ok) {
        setItadError(result.error ?? "Nie udało się pobrać wyników z ITAD.");
        setItadConfigError(Boolean(result.isConfigError));
        return;
      }

      setItadResult(result.data ?? null);

      const currentSearch = searchParams.get("search") ?? "";
      const nextUrl = buildUrl({ search: trimmedSearch });

      startTransition(() => {
        if (currentSearch !== trimmedSearch) {
          router.replace(nextUrl, { scroll: false });
        } else {
          router.refresh();
        }
      });
    });
  }

  return (
    <>
      <section className="section-card p-5 md:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="flex min-h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
              <span className="sr-only">
                {enableItadSearch
                  ? "Filtruj katalog gier po tytule"
                  : "Filtruj katalog po nazwie produktu"}
              </span>
              <Search className="h-5 w-5 shrink-0 text-text-muted" />
              <input
                type="search"
                aria-label={
                  enableItadSearch
                    ? "Filtruj katalog gier po tytule"
                    : "Filtruj katalog po nazwie produktu"
                }
                placeholder={
                  enableItadSearch
                    ? "Filtruj gry po tytule (np. Baldur, Cyberpunk, Witcher)"
                    : "Szukaj sprzętu, gier, akcesoriów i konkretnych modeli"
                }
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full bg-transparent py-4 text-base text-text-primary outline-none placeholder:text-text-muted"
              />
            </label>

            {enableItadSearch && (
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncPending || !searchValue.trim()}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-[24px] border border-accent bg-accent px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSyncPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Importuj z ITAD
              </button>
            )}

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

          {enableItadSearch && (
            <p className="text-sm leading-6 text-text-secondary">
              Wpisywanie w polu powyżej filtruje gry już zapisane w katalogu.
              Użyj przycisku importu tylko wtedy, gdy chcesz dociągnąć nowe
              wyniki z IsThereAnyDeal do bazy.
            </p>
          )}
        </div>
      </section>

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
                : "Synchronizacja nie powiodła się"}
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
              {polishPlural(
                itadResult.games_found,
                "wynik",
                "wyniki",
                "wyników",
              )}
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
