"use client";

import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-[60vh] text-text-muted">
      <AlertTriangle className="w-16 h-16 text-accent-red" />
      <div className="text-center">
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Coś poszło nie tak
        </h2>
        <p className="text-sm">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="h-10 px-6 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-accent-blue/80 transition-colors"
      >
        Spróbuj ponownie
      </button>
    </div>
  );
}
