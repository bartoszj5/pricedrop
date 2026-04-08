"use client";

import { ChartColumnIncreasing, LogIn, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth";

const navLinks = [
  { label: "Okazje", href: "/" },
  ...(process.env.NODE_ENV !== "production"
    ? [{ label: "Sklepy" as const, href: "/stores" as const }]
    : []),
  { label: "Gry", href: "/games" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

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
            </div>
          </Link>
        </div>

        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <nav className="flex items-center gap-2">
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

          {!loading && (
            <div className="ml-2 flex items-center gap-2 border-l border-border/60 pl-4">
              {user ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-bg-card/70 px-3 py-2 text-sm font-semibold text-text-secondary">
                    <User className="h-4 w-4" />
                    {user.username}
                  </span>
                  <button
                    onClick={logout}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-bg-card/70 px-3 py-2 text-sm font-semibold text-text-secondary hover:-translate-y-0.5 hover:border-accent/40 hover:text-text-primary"
                  >
                    <LogOut className="h-4 w-4" />
                    Wyloguj
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap ${
                      pathname === "/login"
                        ? "border-accent bg-accent text-white shadow-[var(--shadow-card)]"
                        : "border-border bg-bg-card/70 text-text-secondary hover:-translate-y-0.5 hover:border-accent/40 hover:text-text-primary"
                    }`}
                  >
                    <LogIn className="h-4 w-4" />
                    Zaloguj sie
                  </Link>
                  <Link
                    href="/register"
                    className="flex items-center gap-1.5 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-card)] hover:brightness-110 whitespace-nowrap"
                  >
                    Zaloz konto
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
