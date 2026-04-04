"use client";

import {
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  Tag,
} from "lucide-react";
import type { ProductSort, StoreRead } from "../types";
import { humanizeCategory } from "../lib/utils";

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

interface CatalogFiltersContentProps {
  stores: StoreRead[];
  categories: string[];
  showCategories: boolean;
  activeCategory: string;
  activeStore: string;
  activeSort: ProductSort;
  showAllCategories: boolean;
  showResetButton?: boolean;
  onToggleAllCategories: () => void;
  onUpdateParams: (changes: Record<string, string | null>) => void;
  onResetFilters: () => void;
  onAfterChange?: () => void;
}

export default function CatalogFiltersContent({
  stores,
  categories,
  showCategories,
  activeCategory,
  activeStore,
  activeSort,
  showAllCategories,
  showResetButton = false,
  onToggleAllCategories,
  onUpdateParams,
  onResetFilters,
  onAfterChange,
}: CatalogFiltersContentProps) {
  const visibleCategories = showAllCategories
    ? categories
    : categories.slice(0, INITIAL_VISIBLE);
  const hasMore = categories.length > INITIAL_VISIBLE;

  function applyChanges(changes: Record<string, string | null>) {
    onUpdateParams(changes);
    onAfterChange?.();
  }

  function resetFilters() {
    onResetFilters();
    onAfterChange?.();
  }

  return (
    <div className="flex flex-col gap-5">
      {showCategories && (
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Kategorie
          </span>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => applyChanges({ category: null })}
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
            {visibleCategories.map((category) => {
              const isActive = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => applyChanges({ category })}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-accent/10 font-semibold text-accent"
                      : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                  }`}
                >
                  <Tag
                    className={`h-3.5 w-3.5 ${isActive ? "text-accent" : "text-text-muted"}`}
                  />
                  {humanizeCategory(category)}
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                onClick={onToggleAllCategories}
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

      {stores.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">
            <StoreIcon className="h-3.5 w-3.5" />
            Sklep
          </span>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => applyChanges({ store: null })}
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
            {stores.map((store) => {
              const isChecked = activeStore === store.slug;
              return (
                <button
                  key={store.slug}
                  type="button"
                  onClick={() =>
                    applyChanges({ store: isChecked ? null : store.slug })
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
                  {store.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="eyebrow">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Sortowanie
        </span>
        <select
          aria-label="Sortowanie katalogu"
          value={activeSort}
          onChange={(event) =>
            applyChanges({ sort: event.target.value || null })
          }
          className="h-10 rounded-xl border border-border bg-bg-card px-3 text-sm text-text-primary outline-none focus:border-accent"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {showResetButton && (
        <button
          type="button"
          onClick={resetFilters}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-bg-card text-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Wyczyść filtry
        </button>
      )}
    </div>
  );
}
