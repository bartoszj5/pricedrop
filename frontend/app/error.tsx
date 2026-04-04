"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell">
      <div className="section-card flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center text-text-muted">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-bg-card text-accent-red">
          <AlertTriangle className="h-9 w-9" />
        </div>
        <div className="max-w-xl">
          <h2 className="text-4xl text-text-primary">Coś poszło nie tak</h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Nie udało się wczytać tej części aplikacji. Spróbuj ponownie za
            chwilę albo wróć do poprzedniego widoku.
          </p>
          {error.digest ? (
            <p className="mt-4 font-mono text-xs text-text-muted">
              Identyfikator: {error.digest}
            </p>
          ) : null}
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-semibold text-white"
        >
          <RotateCcw className="h-4 w-4" />
          Spróbuj ponownie
        </button>
      </div>
    </main>
  );
}
