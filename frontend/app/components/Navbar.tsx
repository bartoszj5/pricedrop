"use client";

import {
  Bell,
  Heart,
  LogIn,
  LogOut,
  ShoppingCart,
  TrendingDown,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import SearchBar from "./SearchBar";
import CategoryNav from "./CategoryNav";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-secondary/95 backdrop-blur-md">
      <div className="mx-auto flex w-[min(1380px,calc(100vw-32px))] flex-col gap-3 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="PriceDrop — strona główna"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <TrendingDown className="h-5 w-5" />
            </div>
            <span className="font-display text-2xl font-bold text-text-primary">
              PriceDrop
            </span>
          </Link>

          <div className="mx-2 hidden flex-1 md:block">
            <SearchBar />
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={user ? `Konto ${user.username}` : "Konto"}
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              >
                <User className="h-5 w-5" />
              </button>
              {menuOpen && !loading && (
                <div
                  role="menu"
                  className="animate-fade-in absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-[var(--shadow-float)]"
                >
                  {user ? (
                    <>
                      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {user.username}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                      >
                        <LogOut className="h-4 w-4" />
                        Wyloguj
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                      >
                        <LogIn className="h-4 w-4" />
                        Zaloguj sie
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-accent hover:bg-accent-soft"
                      >
                        <UserPlus className="h-4 w-4" />
                        Zaloz konto
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="Ulubione"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            >
              <Heart className="h-5 w-5" />
            </button>

            <button
              type="button"
              aria-label="Powiadomienia"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-red ring-2 ring-bg-secondary" />
            </button>

            <button
              type="button"
              aria-label="Koszyk"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="md:hidden">
          <SearchBar />
        </div>

        <CategoryNav />
      </div>
    </header>
  );
}
