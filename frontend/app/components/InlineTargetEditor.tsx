"use client";

import { BellRing, Check, Pencil, Target, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth, type DeliverySummaryStatus } from "../lib/auth";
import { formatPrice } from "../lib/utils";

interface InlineTargetEditorProps {
  productId: number;
  bestPrice: number | null;
  currency?: string;
  onUnlike?: () => Promise<void> | void;
}

const DELIVERY_STATUS_COPY: Record<DeliverySummaryStatus, string> = {
  sent: "Wysłane",
  partial: "Częściowo",
  failed: "Błąd",
  skipped: "Pominięte",
};

function deliveryStatusClass(status: DeliverySummaryStatus): string {
  if (status === "sent") {
    return "border-accent-green/40 bg-accent-green-soft text-accent-green";
  }
  if (status === "failed") {
    return "border-accent-red/40 bg-accent-red/8 text-accent-red";
  }
  return "border-accent-amber/40 bg-[var(--warning-surface)] text-accent-amber";
}

export default function InlineTargetEditor({
  productId,
  bestPrice,
  currency = "PLN",
  onUnlike,
}: InlineTargetEditorProps) {
  const { getAlert, setTargetPrice, unlikeProduct } = useAuth();
  const alert = getAlert(productId);
  const savedTarget = alert?.target_price ?? null;

  const [editing, setEditing] = useState(savedTarget == null);
  const [value, setValue] = useState(savedTarget != null ? savedTarget.toString() : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSyncedTarget = useRef<number | null>(savedTarget);

  useEffect(() => {
    if (savedTarget !== lastSyncedTarget.current) {
      setValue(savedTarget != null ? savedTarget.toString() : "");
      setEditing(savedTarget == null);
      setError(null);
      lastSyncedTarget.current = savedTarget;
    }
  }, [savedTarget]);

  const targetReached =
    savedTarget != null && bestPrice != null && bestPrice <= savedTarget;

  async function handleSave() {
    setError(null);
    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) {
      setError("Podaj cenę.");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Podaj dodatnią liczbę.");
      return;
    }
    setSubmitting(true);
    try {
      await setTargetPrice(productId, parsed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearTarget() {
    setError(null);
    setSubmitting(true);
    try {
      await setTargetPrice(productId, null);
      setValue("");
      setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlike() {
    setError(null);
    setSubmitting(true);
    try {
      await unlikeProduct(productId);
      await onUnlike?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border px-2.5 py-2 text-[0.72rem] ${
        targetReached
          ? "border-accent-green/40 bg-accent-green-soft"
          : "border-border bg-bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {targetReached ? (
          <BellRing className="h-3.5 w-3.5 text-accent-green" />
        ) : (
          <Target className="h-3.5 w-3.5 text-accent" />
        )}
        <span
          className={`font-semibold ${
            targetReached ? "text-accent-green" : "text-text-secondary"
          }`}
        >
          {savedTarget != null
            ? targetReached
              ? `Cel osiągnięty: ${formatPrice(savedTarget, alert?.currency ?? currency)}`
              : `Cel: ${formatPrice(savedTarget, alert?.currency ?? currency)}`
            : "Ustaw cenę docelową"}
        </span>
        {savedTarget != null && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setValue(savedTarget.toString());
              setError(null);
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2 py-0.5 text-[0.68rem] font-semibold text-text-secondary hover:border-accent/40 hover:text-accent"
            aria-label="Edytuj cenę docelową"
          >
            <Pencil className="h-3 w-3" />
            Edytuj
          </button>
        )}
      </div>

      {alert?.last_delivery_status && (
        <div
          className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${deliveryStatusClass(
            alert.last_delivery_status,
          )}`}
        >
          <BellRing className="h-3 w-3" />
          Ostatni alert: {DELIVERY_STATUS_COPY[alert.last_delivery_status]}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="np. 299"
              disabled={submitting}
              className="w-full rounded-lg border border-border bg-bg-primary px-2 py-1 pr-8 text-[0.72rem] text-text-primary placeholder:text-text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.6rem] font-semibold text-text-muted">
              {currency}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-accent text-white hover:brightness-110 disabled:opacity-60"
            aria-label="Zapisz cenę docelową"
          >
            <Check className="h-3 w-3" />
          </button>
          {savedTarget != null && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue(savedTarget.toString());
                setError(null);
              }}
              disabled={submitting}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-card text-text-secondary hover:border-accent/40 disabled:opacity-60"
              aria-label="Anuluj"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-[0.65rem] font-semibold text-accent-red">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-0.5">
        {savedTarget != null && (
          <button
            type="button"
            onClick={handleClearTarget}
            disabled={submitting}
            className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-text-muted hover:text-accent-red disabled:opacity-60"
          >
            <X className="h-3 w-3" />
            Usuń cel
          </button>
        )}
        <button
          type="button"
          onClick={handleUnlike}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-text-muted hover:text-accent-red disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" />
          Usuń
        </button>
      </div>
    </div>
  );
}
