"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface PaginationProps {
  page: number;
  totalPages: number;
}

export default function Pagination({ page, totalPages }: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function buildHref(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p > 1) {
      params.set("page", String(p));
    } else {
      params.delete("page");
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-card text-text-muted hover:-translate-y-0.5 hover:text-text-primary"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="flex h-11 w-11 items-center justify-center text-sm text-text-muted">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-4 text-sm font-semibold ${
              p === page
                ? "border-accent bg-accent text-white"
                : "border-border bg-bg-card text-text-secondary hover:-translate-y-0.5 hover:text-text-primary"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link
          href={buildHref(page + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-card text-text-muted hover:-translate-y-0.5 hover:text-text-primary"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
