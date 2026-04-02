"use client";

import { TrendingDown, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchInput from "./SearchInput";

const navLinks = [
  { label: "Produkty", href: "/" },
  { label: "Sklepy", href: "/stores" },
  { label: "Szukaj ITAD", href: "/search" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6 h-16 px-8 bg-bg-secondary w-full">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <TrendingDown className="w-7 h-7 text-accent-green" />
        <span className="text-[22px] font-bold text-text-primary">
          PriceDrop
        </span>
      </Link>

      {/* Search Bar */}
      <SearchInput />

      {/* Nav Links */}
      <div className="flex items-center gap-2 shrink-0">
        {navLinks.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-blue text-white"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* User Section */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="w-9 h-9 rounded-full bg-accent-blue flex items-center justify-center text-sm font-semibold text-white">
          BJ
        </div>
        <button className="relative text-text-muted hover:text-text-primary transition-colors">
          <Bell className="w-[22px] h-[22px]" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-red rounded-full" />
        </button>
      </div>
    </nav>
  );
}
