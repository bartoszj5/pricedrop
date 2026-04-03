"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Gamepad2,
  Loader2,
  Search,
  Settings2,
  ShoppingCart,
} from "lucide-react";
import { searchITADDeals } from "../lib/api";
import type { ITADGameWithDeals } from "../types";

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
  }).format(amount);
}

function pluralOferty(n: number) {
  if (n === 1) return "oferta";
  if (n >= 2 && n <= 4) return "oferty";
  return "ofert";
}

function GameCard({ game }: { game: ITADGameWithDeals }) {
  const [expanded, setExpanded] = useState(false);
  const hasDeals = game.deals.length > 0;

  return (
    <article className="overflow-hidden rounded-[28px] border border-border bg-bg-card shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="relative h-[180px] w-full shrink-0 overflow-hidden bg-bg-tertiary sm:h-auto sm:min-h-[160px] sm:w-[220px]">
          {game.image_url ? (
            <img
              src={game.image_url}
              alt={game.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <Gamepad2 className="h-10 w-10" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {game.type && (
              <span className="paper-chip bg-bg-secondary/90 text-[0.7rem]">
                {game.type}
              </span>
            )}
            {game.mature && (
              <span className="paper-chip border-transparent bg-[#f1d7cf] text-[0.7rem] text-accent-red">
                18+
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col justify-center p-5">
          <h3 className="font-display text-xl leading-tight tracking-tight text-text-primary">
            {game.title}
          </h3>

          {hasDeals ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-2xl tracking-tight text-accent-green">
                od {formatPrice(game.best_price!, game.best_price_currency!)}
              </span>
              {game.deals[0].regular_amount &&
                game.deals[0].cut > 0 && (
                  <span className="text-sm text-text-muted line-through">
                    {formatPrice(
                      game.deals[0].regular_amount,
                      game.deals[0].currency,
                    )}
                  </span>
                )}
              {game.deals[0].cut > 0 && (
                <span className="paper-chip border-accent-green/30 bg-accent-green-soft text-[0.7rem] text-accent-green">
                  -{game.deals[0].cut}%
                </span>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              Brak aktualnych ofert
            </p>
          )}

          {hasDeals && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>
                {game.deals.length} {pluralOferty(game.deals.length)} w
                sklepach
              </span>
              {game.best_shop && (
                <>
                  <span className="text-text-muted">&middot;</span>
                  <span>
                    Najtaniej w <strong>{game.best_shop}</strong>
                  </span>
                </>
              )}
            </div>
          )}

          {hasDeals && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent hover:text-accent/80"
            >
              {expanded
                ? "Zwiń oferty"
                : `Pokaż ${game.deals.length > 3 ? "wszystkie " : ""}oferty`}
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded deals list */}
      {expanded && hasDeals && (
        <div className="border-t border-border">
          <div className="divide-y divide-border/60">
            {game.deals.map((deal, i) => (
              <div
                key={`${deal.shop_id}-${i}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
              >
                <span className="min-w-[120px] text-sm font-semibold text-text-primary sm:min-w-[160px]">
                  {deal.shop_name}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${i === 0 ? "text-accent-green" : "text-text-primary"}`}
                  >
                    {formatPrice(deal.price_amount, deal.currency)}
                  </span>
                  {deal.regular_amount && deal.cut > 0 && (
                    <>
                      <span className="text-xs text-text-muted line-through">
                        {formatPrice(deal.regular_amount, deal.currency)}
                      </span>
                      <span className="rounded-full bg-accent-green-soft px-2 py-0.5 text-[0.65rem] font-bold text-accent-green">
                        -{deal.cut}%
                      </span>
                    </>
                  )}
                </div>
                <div className="ml-auto">
                  {deal.url && (
                    <a
                      href={deal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
                    >
                      Kup
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function GameSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ITADGameWithDeals[]>([]);
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
      const data = await searchITADDeals(query.trim());
      setResults(data);
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
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <section className="section-card p-5 md:p-6">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 lg:flex-row"
        >
          <label className="flex h-14 flex-1 items-center gap-3 rounded-[24px] border border-border bg-bg-card px-5 shadow-[var(--shadow-card)]">
            <Search className="h-5 w-5 shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Szukaj gry po tytule..."
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
            Szukaj
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm text-text-secondary">
              Przeszukuję oferty...
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-sm text-text-secondary">
            Znaleziono{" "}
            <strong className="text-text-primary">{results.length}</strong>{" "}
            {results.length === 1
              ? "grę"
              : results.length < 5
                ? "gry"
                : "gier"}
          </p>
          {results.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* No results */}
      {searched && !loading && !error && results.length === 0 && (
        <div className="section-subtle px-6 py-12 text-center">
          <Gamepad2 className="mx-auto h-10 w-10 text-text-muted" />
          <h3 className="mt-4 text-2xl text-text-primary">
            Brak wyników dla &quot;{query}&quot;
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Spróbuj podać pełny tytuł gry w wersji angielskiej.
          </p>
        </div>
      )}
    </div>
  );
}
