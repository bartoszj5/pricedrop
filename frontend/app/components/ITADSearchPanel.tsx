"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchITAD } from "../lib/api";
import type { ITADGameRead } from "../types";

export default function ITADSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ITADGameRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await searchITAD(query.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd wyszukiwania");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex items-center gap-2.5 flex-1 h-12 bg-bg-tertiary rounded-xl px-4">
          <Search className="w-5 h-5 text-text-muted shrink-0" />
          <input
            type="text"
            placeholder="Wpisz tytuł gry..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none w-full"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="h-12 px-6 rounded-xl bg-accent-blue text-sm font-medium text-white hover:bg-accent-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Szukaj
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 text-sm text-accent-red">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {results.map((game) => (
            <div
              key={game.id}
              className="flex flex-col bg-bg-card rounded-xl overflow-hidden border border-border"
            >
              {game.image_url ? (
                <img
                  src={game.image_url}
                  alt={game.title}
                  className="w-full h-[120px] object-cover"
                />
              ) : (
                <div className="w-full h-[120px] bg-bg-tertiary flex items-center justify-center text-text-muted text-sm">
                  Brak obrazka
                </div>
              )}
              <div className="flex flex-col gap-2 p-4">
                <h3 className="text-sm font-semibold text-text-primary truncate">
                  {game.title}
                </h3>
                <div className="flex items-center gap-2">
                  {game.type && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">
                      {game.type}
                    </span>
                  )}
                  {game.mature && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-accent-red/10 text-accent-red font-medium">
                      18+
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted truncate">
                  {game.slug}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        searched &&
        !loading &&
        !error && (
          <p className="text-text-muted text-sm text-center py-8">
            Brak wyników dla &quot;{query}&quot;
          </p>
        )
      )}
    </div>
  );
}
