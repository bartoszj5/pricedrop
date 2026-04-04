"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";
import { searchAndSaveGames } from "../lib/api";
import type { ITADSearchSaveResponse } from "../lib/api";

export default function GameSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigError, setIsConfigError] = useState(false);
  const [result, setResult] = useState<ITADSearchSaveResponse | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setIsConfigError(false);
    setResult(null);

    try {
      const data = await searchAndSaveGames(query.trim());
      setResult(data);
      router.refresh();
    } catch (err) {
      const isMissingKey =
        err instanceof Error &&
        ((err as Error & { status?: number }).status === 503 ||
          err.message.includes("ITAD API key missing"));
      setIsConfigError(isMissingKey);
      setError(
        isMissingKey
          ? "Brakuje klucza ITAD_API_KEY w konfiguracji serwera."
          : err instanceof Error
            ? err.message
            : "Błąd wyszukiwania",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="section-card p-5 md:p-6">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 lg:flex-row"
        >
          <label className="flex h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
            <Search className="h-5 w-5 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Wyszukaj grę po tytule (np. Cyberpunk, Witcher)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-[24px] border border-accent bg-accent px-8 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Szukaj i zapisz
          </button>
        </form>
      </section>

      {/* Error */}
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
          <div className="space-y-1">
            <h3 className="text-lg text-text-primary">
              {isConfigError
                ? "Moduł wymaga konfiguracji"
                : "Błąd wyszukiwania"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">{error}</p>
          </div>
        </div>
      )}

      {/* Success */}
      {result && !error && (
        <div className="section-subtle flex items-start gap-4 border-accent-green/30 bg-[#edf9ee] p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-green-soft">
            <Check className="h-5 w-5 text-accent-green" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg text-text-primary">
              Znaleziono {result.games_found}{" "}
              {result.games_found === 1
                ? "grę"
                : result.games_found < 5
                  ? "gry"
                  : "gier"}
            </h3>
            <p className="text-sm leading-6 text-text-secondary">
              Zapisano do bazy: {result.products_created} nowych,{" "}
              {result.products_updated} zaktualizowanych.{" "}
              {result.prices_created > 0 &&
                `Dodano ${result.prices_created} cen. `}
              {result.prices_updated > 0 &&
                `Zaktualizowano ${result.prices_updated} cen. `}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
