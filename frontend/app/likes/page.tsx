"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, BellRing, Heart, LogIn, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ProductCard from "../components/ProductCard";
import InlineTargetEditor from "../components/InlineTargetEditor";
import EmptyState from "../components/EmptyState";
import { apiFetch, useAuth } from "../lib/auth";
import type { ProductWithBestPrice } from "../types";

type LikedProductResponse = ProductWithBestPrice & {
  liked_at: string;
};

type Filter = "all" | "with_target" | "triggered" | "without_target";
type SortKey = "liked_desc" | "liked_asc" | "price_asc" | "price_desc" | "title_asc";

const FILTER_LABELS: { value: Filter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "with_target", label: "Z celem cenowym" },
  { value: "triggered", label: "Cel osiągnięty" },
  { value: "without_target", label: "Bez celu" },
];

const SORT_LABELS: { value: SortKey; label: string }[] = [
  { value: "liked_desc", label: "Najnowsze polubienia" },
  { value: "liked_asc", label: "Najstarsze polubienia" },
  { value: "price_asc", label: "Cena rosnąco" },
  { value: "price_desc", label: "Cena malejąco" },
  { value: "title_asc", label: "Nazwa A-Z" },
];

export default function LikesPage() {
  const { user, loading, likedProductIds, getAlert } = useAuth();
  const [items, setItems] = useState<LikedProductResponse[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("liked_desc");

  const loadLikes = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const data = await apiFetch<LikedProductResponse[]>("/likes/products");
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nie udalo sie pobrac ulubionych",
      );
      setItems([]);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems([]);
      setFetching(false);
      return;
    }
    void loadLikes();
  }, [loading, user, loadLikes]);

  useEffect(() => {
    if (!user) return;
    const likedSet = new Set(likedProductIds);
    setItems((prev) => prev.filter((item) => likedSet.has(item.id)));
  }, [likedProductIds, user]);

  const summary = useMemo(() => {
    let withTarget = 0;
    let triggered = 0;
    for (const item of items) {
      const alert = getAlert(item.id);
      const target = alert?.target_price ?? null;
      if (target != null) {
        withTarget += 1;
        if (item.best_price != null && item.best_price <= target) {
          triggered += 1;
        }
      }
    }
    return { total: items.length, withTarget, triggered };
  }, [items, getAlert]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const alert = getAlert(item.id);
      const target = alert?.target_price ?? null;
      switch (filter) {
        case "with_target":
          return target != null;
        case "without_target":
          return target == null;
        case "triggered":
          return (
            target != null && item.best_price != null && item.best_price <= target
          );
        default:
          return true;
      }
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "liked_asc":
          return new Date(a.liked_at).getTime() - new Date(b.liked_at).getTime();
        case "price_asc":
          return (a.best_price ?? Number.POSITIVE_INFINITY) -
            (b.best_price ?? Number.POSITIVE_INFINITY);
        case "price_desc":
          return (b.best_price ?? Number.NEGATIVE_INFINITY) -
            (a.best_price ?? Number.NEGATIVE_INFINITY);
        case "title_asc":
          return a.title.localeCompare(b.title, "pl");
        case "liked_desc":
        default:
          return new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime();
      }
    });
    return sorted;
  }, [items, filter, sort, getAlert]);

  if (loading || fetching) {
    return (
      <main className="page-shell flex flex-col gap-6">
        <section className="section-subtle p-8 text-sm text-text-muted">
          Ladowanie ulubionych produktow...
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-shell flex flex-col gap-6">
        <section className="section-card flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
            <LogIn className="h-7 w-7" />
          </div>
          <h1 className="display-title text-3xl text-text-primary">Ulubione produkty</h1>
          <p className="text-sm text-text-muted">Zaloguj sie, aby zobaczyc swoja liste polubionych produktow.</p>
          <Link
            href="/login"
            className="rounded-full border border-accent bg-accent px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110"
          >
            Przejdz do logowania
          </Link>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell flex flex-col gap-6">
        <section className="section-subtle rounded-2xl border border-accent-red/30 bg-accent-red/8 p-6 text-sm text-accent-red">
          {error}
        </section>
      </main>
    );
  }

  const sortDirectionIcon =
    sort === "price_asc" || sort === "liked_asc" || sort === "title_asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );

  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow">Twoje konto</span>
            <h1 className="display-title mt-1 text-4xl text-text-primary">Ulubione produkty</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Ustaw cenę docelową dla każdego produktu — powiadomimy Cię, gdy
              oferta spadnie poniżej.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="paper-chip">
              <Heart className="h-4 w-4" />
              {summary.total} {summary.total === 1 ? "produkt" : "produkty"}
            </div>
            <div className="paper-chip">
              <Target className="h-4 w-4" />
              {summary.withTarget} z celem
            </div>
            <div
              className={`paper-chip ${
                summary.triggered > 0
                  ? "border-accent-green/40 bg-accent-green-soft text-accent-green"
                  : ""
              }`}
            >
              <BellRing className="h-4 w-4" />
              {summary.triggered} cel osiągnięty
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {FILTER_LABELS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === opt.value
                      ? "border-accent bg-accent text-white shadow-[var(--shadow-card)]"
                      : "border-border bg-bg-card text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
              {sortDirectionIcon}
              <span>Sortuj:</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="rounded-full border border-border bg-bg-card px-3 py-1.5 text-xs font-semibold text-text-primary focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                {SORT_LABELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      {items.length === 0 ? (
        <EmptyState
          message="Nie masz jeszcze ulubionych produktow"
          detail="Polub dowolny produkt ikona serca, aby pojawil sie tutaj i dostawac powiadomienia o spadkach ceny."
          actionHref="/"
          actionLabel="Przegladaj katalog"
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          message="Brak produktów dla wybranego filtra"
          detail="Zmień filtr powyżej, aby zobaczyć inne ulubione produkty."
        />
      ) : (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {visibleItems.map((product) => (
            <div key={product.id} className="flex flex-col gap-2">
              <ProductCard product={product} hideTargetBadge />
              <InlineTargetEditor
                productId={product.id}
                bestPrice={product.best_price}
                currency={product.best_price_currency ?? "PLN"}
              />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
