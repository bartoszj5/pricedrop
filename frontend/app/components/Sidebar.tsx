"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { startTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CatalogFiltersContent from "./CatalogFiltersContent";
import type { ProductSort, StoreRead } from "../types";

interface SidebarProps {
  stores: StoreRead[];
  categories: string[];
  showCategories?: boolean;
}

export default function Sidebar({
  stores,
  categories,
  showCategories = true,
}: SidebarProps) {
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
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function resetFilters() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <aside className="hidden w-[280px] shrink-0 lg:block">
      <div className="sticky top-6 flex max-h-[calc(100vh-48px)] flex-col gap-6 overflow-y-auto rounded-[28px] border border-border bg-gradient-to-b from-[rgba(255,251,244,0.98)] to-[rgba(255,253,248,0.94)] p-5 shadow-[var(--shadow-card)]">
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

        <CatalogFiltersContent
          stores={stores}
          categories={categories}
          showCategories={showCategories}
          activeCategory={activeCategory}
          activeStore={activeStore}
          activeSort={activeSort}
          showAllCategories={showAllCategories}
          onToggleAllCategories={() =>
            setShowAllCategories((currentValue) => !currentValue)
          }
          onUpdateParams={updateParams}
          onResetFilters={resetFilters}
        />
      </div>
    </aside>
  );
}
