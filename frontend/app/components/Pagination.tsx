"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface PaginationProps {
  page: number;
  totalPages: number;
}

export default function Pagination({ page, totalPages }: PaginationProps) {
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function buildHref(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p > 1) {
      params.set("page", String(p));
    } else {
      params.delete("page");
    }
    return `/?${params.toString()}`;
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
    <div className="flex items-center justify-center gap-1.5 pt-4">
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="w-9 h-9 flex items-center justify-center text-text-muted text-sm">
            ...
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? "bg-accent-blue text-white"
                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link
          href={buildHref(page + 1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
