"use client";

import Link from "next/link";
import { BellRing, LogIn, Save, Target, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../lib/auth";
import { formatPrice } from "../lib/utils";

interface TargetPriceFormProps {
  productId: number;
  currentBestPrice: number | null;
  currency?: string;
}

export default function TargetPriceForm({
  productId,
  currentBestPrice,
  currency = "PLN",
}: TargetPriceFormProps) {
  const { user, loading, getAlert, setTargetPrice } = useAuth();
  const alert = getAlert(productId);
  const savedTarget = alert?.target_price ?? null;

  const [value, setValue] = useState<string>(
    savedTarget != null ? savedTarget.toString() : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const lastSyncedTarget = useRef<number | null>(null);

  useEffect(() => {
    if (savedTarget !== lastSyncedTarget.current) {
      setValue(savedTarget != null ? savedTarget.toString() : "");
      lastSyncedTarget.current = savedTarget;
    }
  }, [savedTarget]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="section-subtle flex flex-wrap items-center gap-3 p-5">
        <Target className="h-5 w-5 text-accent" />
        <span className="text-sm text-text-secondary">
          Zaloguj się, aby ustawić cenę docelową i dostawać alerty o spadkach.
        </span>
        <Link
          href="/login"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110"
        >
          <LogIn className="h-4 w-4" />
          Zaloguj się
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) {
      setError("Podaj cenę docelową lub użyj przycisku Wyczyść.");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Podaj poprawną cenę większą od 0.");
      return;
    }

    setSubmitting(true);
    try {
      await setTargetPrice(productId, parsed);
      setStatus(`Alert ustawiony na ${formatPrice(parsed, currency)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać alertu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      await setTargetPrice(productId, null);
      setValue("");
      setStatus("Cena docelowa została usunięta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wyczyścić alertu.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasTarget = savedTarget != null;
  const dropNeeded =
    savedTarget != null && currentBestPrice != null && currentBestPrice > savedTarget
      ? currentBestPrice - savedTarget
      : null;

  return (
    <div className="section-subtle flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-accent" />
        <p className="font-semibold text-text-primary">Cena docelowa</p>
        {hasTarget && (
          <span className="paper-chip ml-auto">
            <BellRing className="h-3.5 w-3.5" />
            {formatPrice(savedTarget, alert?.currency ?? currency)}
          </span>
        )}
      </div>

      <p className="text-sm text-text-secondary">
        Damy Ci znać e-mailem lub na Discord, gdy cena spadnie do wybranego poziomu.
        {currentBestPrice != null && (
          <>
            {" "}Aktualnie najniższa cena to{" "}
            <span className="font-semibold text-text-primary">
              {formatPrice(currentBestPrice, currency)}
            </span>
            .
          </>
        )}
        {dropNeeded != null && (
          <>
            {" "}Potrzeba jeszcze {formatPrice(dropNeeded, currency)} spadku.
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="np. 299.00"
            className="w-full rounded-full border border-border bg-bg-card px-4 py-2.5 pr-14 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
            disabled={submitting}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-muted">
            {currency}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-card)] hover:brightness-110 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {hasTarget ? "Zaktualizuj" : "Ustaw"}
          </button>
          {hasTarget && (
            <button
              type="button"
              onClick={handleClear}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-secondary hover:border-accent-red/40 hover:text-accent-red disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              Wyczyść
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="text-xs font-semibold text-accent-red">{error}</p>
      )}
      {status && !error && (
        <p className="text-xs font-semibold text-accent-green">{status}</p>
      )}
    </div>
  );
}
