"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface CategoryEntry {
  label: string;
  href: string;
  categorySlug?: string;
  matchPath?: string;
}

const categories: CategoryEntry[] = [
  { label: "Konsole", href: "/?category=console", categorySlug: "console" },
  { label: "Laptopy", href: "/?category=laptop", categorySlug: "laptop" },
  { label: "Gry", href: "/games", matchPath: "/games" },
  {
    label: "Telefony",
    href: "/?category=smartphone",
    categorySlug: "smartphone",
  },
  { label: "TV & Audio", href: "/?category=tv", categorySlug: "tv" },
  {
    label: "Akcesoria",
    href: "/?category=headphones",
    categorySlug: "headphones",
  },
];

export default function CategoryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") ?? "";

  return (
    <nav
      aria-label="Kategorie"
      className="scrollbar-hide flex items-center justify-center gap-2 overflow-x-auto"
    >
      {categories.map((entry) => {
        const isPathMatch = entry.matchPath
          ? pathname.startsWith(entry.matchPath)
          : false;
        const isCategoryMatch =
          entry.categorySlug !== undefined &&
          pathname === "/" &&
          activeCategory === entry.categorySlug;
        const isActive = isPathMatch || isCategoryMatch;

        return (
          <Link
            key={entry.label}
            href={entry.href}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
              isActive
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            }`}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
