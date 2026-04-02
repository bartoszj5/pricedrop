"use client";

import { Search, TrendingDown, Bell } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { label: "Gry", key: "gry" },
  { label: "Elektronika", key: "elektronika" },
  { label: "Okazje", key: "okazje" },
  { label: "Sledzone", key: "sledzone" },
];

interface NavbarProps {
  activeNav: string;
  onNavChange: (key: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Navbar({
  activeNav,
  onNavChange,
  searchQuery,
  onSearchChange,
}: NavbarProps) {
  return (
    <nav className="flex items-center gap-6 h-16 px-8 bg-bg-secondary w-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <TrendingDown className="w-7 h-7 text-accent-green" />
        <span className="text-[22px] font-bold text-text-primary">
          PriceDrop
        </span>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2.5 flex-1 h-10 bg-bg-tertiary rounded-xl px-4">
        <Search className="w-[18px] h-[18px] text-text-muted shrink-0" />
        <input
          type="text"
          placeholder="Szukaj gier, elektroniki, okazji..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none w-full"
        />
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-2 shrink-0">
        {navLinks.map((link) => (
          <button
            key={link.key}
            onClick={() => onNavChange(link.key)}
            className={`flex items-center justify-center h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeNav === link.key
                ? "bg-accent-blue text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
          >
            {link.label}
          </button>
        ))}
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
