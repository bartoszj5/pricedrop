"use client";

import Link from "next/link";
import { Heart, LogIn } from "lucide-react";
import { useEffect, useState } from "react";

import ProductCard from "../components/ProductCard";
import EmptyState from "../components/EmptyState";
import { apiFetch, useAuth } from "../lib/auth";
import type { ProductWithBestPrice } from "../types";

type LikedProductResponse = ProductWithBestPrice & {
  liked_at: string;
};

export default function LikesPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ProductWithBestPrice[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setItems([]);
      setFetching(false);
      return;
    }

    let cancelled = false;

    async function loadLikes() {
      setFetching(true);
      setError(null);
      try {
        const data = await apiFetch<LikedProductResponse[]>("/likes/products");
        if (!cancelled) {
          setItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nie udalo sie pobrac ulubionych");
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setFetching(false);
        }
      }
    }

    loadLikes();

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

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

  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <span className="eyebrow">Twoje konto</span>
          <h1 className="display-title mt-1 text-4xl text-text-primary">Ulubione produkty</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Produkty, ktore obserwujesz. Powiadomimy Cie o kazdym spadku ceny.
          </p>
        </div>
        <div className="paper-chip">
          <Heart className="h-4 w-4" />
          {items.length} {items.length === 1 ? "produkt" : "produkty"}
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState
          message="Nie masz jeszcze ulubionych produktow"
          detail="Polub dowolny produkt ikona serca, aby pojawil sie tutaj i dostawac powiadomienia o spadkach ceny."
          actionHref="/"
          actionLabel="Przegladaj katalog"
        />
      ) : (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      )}
    </main>
  );
}
