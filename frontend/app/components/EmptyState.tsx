import { Compass, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function EmptyState({
  message = "Brak wyników",
  detail,
  actionHref,
  actionLabel,
}: {
  message?: string;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="section-subtle flex flex-col items-center justify-center gap-4 px-6 py-14 text-center text-text-muted">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-bg-card text-accent">
        <Compass className="h-7 w-7" />
      </div>
      <div className="max-w-xl">
        <h3 className="text-2xl text-text-primary">{message}</h3>
        {detail && <p className="mt-2 text-sm leading-6 text-text-secondary">{detail}</p>}
      </div>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-5 py-3 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
