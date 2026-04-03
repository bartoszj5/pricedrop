"use client";

import { ArrowUpRight, ChartColumnIncreasing } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { label: "Okazje", href: "/" },
  { label: "Sklepy", href: "/stores" },
  { label: "Gry", href: "/search" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg-secondary/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] w-[min(1380px,calc(100vw-32px))] flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-border bg-bg-card text-accent shadow-[var(--shadow-card)]">
              <ChartColumnIncreasing className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-display text-[1.7rem] leading-none text-text-primary">
                PriceDrop
              </span>
              <span className="text-[0.76rem] font-semibold uppercase tracking-[0.24em] text-text-muted">
                Editorial market board
              </span>
            </div>
          </Link>

          <div className="paper-chip hidden xl:inline-flex">
            Monitoring cen dla katalogu i gier
          </div>
        </div>

        <nav className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
        {navLinks.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap ${
                isActive
                  ? "border-accent bg-accent text-white shadow-[var(--shadow-card)]"
                  : "border-border bg-bg-card/70 text-text-secondary hover:-translate-y-0.5 hover:border-accent/40 hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        </nav>

        <div className="hidden items-center gap-2 text-sm text-text-secondary xl:flex">
          <span className="paper-chip">
            Ceny aktywne i produkty w monitoringu
          </span>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
          >
            Porównywarka gier
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
