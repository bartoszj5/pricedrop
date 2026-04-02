"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Gamepad2,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";
import { searchITAD } from "../lib/api";
import type { ITADGameRead } from "../types";

export default function ITADSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ITADGameRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigError, setIsConfigError] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setIsConfigError(false);
    setSearched(true);
    try {
      const data = await searchITAD(query.trim());
      setResults(data);
    } catch (err) {
      const isMissingKey =
        err instanceof Error &&
        (((err as Error & { status?: number }).status === 503) ||
          err.message.includes("ITAD API key missing"));
      setIsConfigError(isMissingKey);
      setError(
        isMissingKey
          ? "Brakuje klucza ITAD_API_KEY, więc moduł gamingowy nie może jeszcze wykonać wyszukiwania."
          : err instanceof Error
            ? err.message
            : "Błąd wyszukiwania",
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="section-card p-5 md:p-6">
        <form onSubmit={handleSearch} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="flex h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
              <Search className="h-5 w-5 shrink-0 text-text-muted" />
              <input
                type="text"
                placeholder="Wpisz tytuł gry, dodatku albo konkretnej edycji"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-[24px] border border-accent bg-accent px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Szukaj w ITAD
            </button>
          </div>

          <p className="text-sm leading-6 text-text-secondary">
            Ten moduł służy do szybkiego sprawdzania, czy konkretna gra istnieje
            w bazie IsThereAnyDeal i czy warto ją później zsynchronizować z
            katalogiem PriceDrop.
          </p>
        </form>
      </section>

      {error && (
        <div
          className={`section-subtle flex items-start gap-4 p-5 ${
            isConfigError
              ? "border-accent-amber/40 bg-[#fff4df]"
              : "border-accent-red/30 bg-[#fff0eb]"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              isConfigError ? "bg-[#f5e1b5]" : "bg-[#f1d7cf]"
            }`}
          >
            {isConfigError ? (
              <Settings2 className="h-5 w-5 text-accent-amber" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-accent-red" />
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-xl text-text-primary">
              {isConfigError ? "Moduł wymaga konfiguracji" : "Nie udało się pobrać wyników"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">{error}</p>
          </div>
        </div>
      )}

      {results.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((game) => (
            <article
              key={game.id}
              className="group overflow-hidden rounded-[28px] border border-border bg-bg-card shadow-[var(--shadow-card)] hover:-translate-y-1"
            >
              <div className="relative h-[180px] overflow-hidden bg-bg-tertiary">
                {game.image_url ? (
                  <img
                    src={game.image_url}
                    alt={game.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-text-muted">
                    Brak grafiki
                  </div>
                )}

                <div className="absolute left-4 top-4 flex gap-2">
                  {game.type && <span className="paper-chip bg-bg-secondary/90">{game.type}</span>}
                  {game.mature && (
                    <span className="paper-chip border-transparent bg-[#f1d7cf] text-accent-red">
                      18+
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  <Gamepad2 className="h-3.5 w-3.5" />
                  Wynik ITAD
                </div>
                <h3 className="two-line-clamp text-[1.25rem] leading-tight text-text-primary">
                  {game.title}
                </h3>
                <p className="text-sm text-text-secondary">Slug: {game.slug}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        searched &&
        !loading &&
        !error && (
          <div className="section-subtle px-6 py-12 text-center">
            <h3 className="text-2xl text-text-primary">
              Brak wyników dla &quot;{query}&quot;
            </h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Spróbuj pełniejszego tytułu albo krótszej frazy. ITAD zwykle lepiej
              reaguje na oficjalną nazwę gry niż na potoczne skróty.
            </p>
          </div>
        )
      )}
    </div>
  );
}
