"use client";

import {
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Store as StoreIcon,
  Tag,
} from "lucide-react";
import { startTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort, StoreRead } from "../types";
import { humanizeCategory } from "../lib/utils";

interface SidebarProps {
  stores: StoreRead[];
  categories: string[];
  showCategories?: boolean;
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

export default function Sidebar({ stores, categories, showCategories = true }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showAllCategories, setShowAllCategories] = useState(false);

  const activeCategory = searchParams.get("category") ?? "";
  const activeStore = searchParams.get("store") ?? "";
  const activeSort =
    (searchParams.get("sort") as ProductSort | null) ?? "featured";

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
    startTransition(() => {
      router.push(pathname);
    });
  }

  const visibleCategories = showAllCategories
    ? categories
    : categories.slice(0, INITIAL_VISIBLE);
  const hasMore = categories.length > INITIAL_VISIBLE;

  return (
    <aside className="hidden w-[280px] shrink-0 lg:block">
      <div className="sticky top-6 flex max-h-[calc(100vh-48px)] flex-col gap-6 overflow-y-auto rounded-[28px] border border-border bg-gradient-to-b from-[rgba(255,251,244,0.98)] to-[rgba(255,253,248,0.94)] p-5 shadow-[var(--shadow-card)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-text-muted" />
            <span className="text-sm font-bold text-text-primary">Filtry</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-accent"
          >
            <RotateCcw className="h-3 w-3" />
            Wyczyść
          </button>
        </div>

        <div className="h-px bg-border/60" />

        {/* Categories */}
        {showCategories && (
          <>
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

            <div className="h-px bg-border/60" />
          </>
        )}

        {/* Stores */}
        {stores.length > 0 && (
          <>
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

            <div className="h-px bg-border/60" />
          </>
        )}

        {/* Sort */}
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Sortowanie
          </span>
          <select
            value={activeSort}
            onChange={(e) => updateParams({ sort: e.target.value || null })}
            className="h-10 rounded-xl border border-border bg-bg-card px-3 text-sm text-text-primary outline-none focus:border-accent"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
}
