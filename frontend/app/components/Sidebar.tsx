"use client";

import { SlidersHorizontal, Tag } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { StoreRead } from "../types";

interface SidebarProps {
  stores: StoreRead[];
  categories: string[];
}

export default function Sidebar({ stores, categories }: SidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category") ?? "";
  const activeStore = searchParams.get("store") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  }

  return (
    <aside className="w-[260px] shrink-0 bg-bg-secondary flex flex-col gap-7 py-6 px-5 overflow-y-auto">
      {/* Title */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-[18px] h-[18px] text-text-secondary" />
        <span className="text-base font-semibold text-text-primary">
          Filtry
        </span>
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          KATEGORIE
        </span>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setParam("category", "")}
            className={`flex items-center gap-2.5 h-9 px-3 rounded-lg w-full text-left transition-colors ${
              !activeCategory
                ? "bg-bg-tertiary text-text-primary font-medium"
                : "text-text-secondary hover:bg-bg-tertiary/50"
            }`}
          >
            <Tag className={`w-4 h-4 ${!activeCategory ? "text-accent-green" : "text-text-muted"}`} />
            <span className="text-sm">Wszystkie</span>
          </button>
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setParam("category", cat)}
                className={`flex items-center gap-2.5 h-9 px-3 rounded-lg w-full text-left transition-colors ${
                  isActive
                    ? "bg-bg-tertiary text-text-primary font-medium"
                    : "text-text-secondary hover:bg-bg-tertiary/50"
                }`}
              >
                <Tag className={`w-4 h-4 ${isActive ? "text-accent-green" : "text-text-muted"}`} />
                <span className="text-sm">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stores */}
      {stores.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-muted tracking-[1px]">
            SKLEPY
          </span>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setParam("store", "")}
              className="flex items-center gap-2.5 h-8 px-1 w-full"
            >
              <div
                className={`w-4 h-4 rounded shrink-0 ${
                  !activeStore ? "bg-accent-blue" : "border-[1.5px] border-text-muted"
                }`}
              />
              <span
                className={`text-[13px] ${
                  !activeStore ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                Wszystkie
              </span>
            </button>
            {stores.map((s) => {
              const isChecked = activeStore === s.slug;
              return (
                <button
                  key={s.slug}
                  onClick={() => setParam("store", isChecked ? "" : s.slug)}
                  className="flex items-center gap-2.5 h-8 px-1 w-full"
                >
                  <div
                    className={`w-4 h-4 rounded shrink-0 ${
                      isChecked
                        ? "bg-accent-blue"
                        : "border-[1.5px] border-text-muted"
                    }`}
                  />
                  <span
                    className={`text-[13px] ${
                      isChecked ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
