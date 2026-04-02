import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 min-h-[60vh] text-text-muted">
      <SearchX className="w-16 h-16" />
      <div className="text-center">
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Nie znaleziono strony
        </h2>
        <p className="text-sm">Strona, której szukasz, nie istnieje.</p>
      </div>
      <Link
        href="/"
        className="h-10 px-6 rounded-lg bg-accent-blue text-sm font-medium text-white hover:bg-accent-blue/80 transition-colors flex items-center"
      >
        Wróć na stronę główną
      </Link>
    </div>
  );
}
