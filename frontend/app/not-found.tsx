import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell">
      <div className="section-card flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center text-text-muted">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-border bg-bg-card">
          <SearchX className="h-9 w-9" />
        </div>
        <div className="max-w-xl">
          <h2 className="text-4xl text-text-primary">Nie znaleziono strony</h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Strona, której szukasz, nie istnieje albo została przeniesiona do
            innej części katalogu.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-6 py-3 text-sm font-semibold text-white hover:-translate-y-0.5"
        >
          Wróć na stronę główną
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
