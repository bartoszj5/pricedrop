"use client";

import { useState } from "react";
import { ArrowUpDown, LayoutGrid, List } from "lucide-react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import FeaturedBanner from "./components/FeaturedBanner";
import ProductCard from "./components/ProductCard";
import type { ProductCardData } from "./types";

const MOCK_PRODUCTS: ProductCardData[] = [
  {
    id: 1,
    title: "Elden Ring",
    slug: "elden-ring",
    category: "RPG",
    image_url: "https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg",
    store: "Steam",
    current_price: 129.99,
    old_price: 249.99,
    discount: 48,
    currency: "PLN",
  },
  {
    id: 2,
    title: "Baldur's Gate 3",
    slug: "baldurs-gate-3",
    category: "RPG",
    image_url: "https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg",
    store: "Steam",
    current_price: 149.99,
    old_price: 249.99,
    discount: 40,
    currency: "PLN",
  },
  {
    id: 3,
    title: "Baldur's Gate 3",
    slug: "baldurs-gate-3-gog",
    category: "RPG",
    image_url: "https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg",
    store: "GOG",
    current_price: 149.99,
    old_price: 249.99,
    discount: 40,
    currency: "PLN",
  },
  {
    id: 4,
    title: "Red Dead Redemption 2",
    slug: "red-dead-redemption-2",
    category: "Akcja",
    image_url: "https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg",
    store: "Steam",
    current_price: 59.99,
    old_price: 239.99,
    discount: 75,
    currency: "PLN",
  },
  {
    id: 5,
    title: "Sony WH-1000XM5",
    slug: "sony-wh-1000xm5",
    category: "Audio",
    image_url: null,
    store: "MediaExpert",
    current_price: 1199,
    old_price: 1799,
    discount: 33,
    currency: "PLN",
  },
  {
    id: 6,
    title: "PS5 DualSense Edge",
    slug: "ps5-dualsense-edge",
    category: "Akcesoria",
    image_url: null,
    store: "Morele",
    current_price: 799,
    old_price: 1049,
    discount: 24,
    currency: "PLN",
  },
  {
    id: 7,
    title: "Samsung Galaxy S24 Ultra",
    slug: "samsung-galaxy-s24-ultra",
    category: "Smartfony",
    image_url: null,
    store: "x-kom",
    current_price: 5499,
    old_price: null,
    discount: null,
    currency: "PLN",
  },
  {
    id: 8,
    title: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3",
    category: "RPG",
    image_url: "https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg",
    store: "GOG",
    current_price: 29.99,
    old_price: 149.99,
    discount: 80,
    currency: "PLN",
  },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState("elektronika");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Chunk products into rows of 4
  const rows: ProductCardData[][] = [];
  for (let i = 0; i < MOCK_PRODUCTS.length; i += 4) {
    rows.push(MOCK_PRODUCTS.slice(i, i + 4));
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navbar */}
      <Navbar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Divider */}
      <div className="h-px w-full bg-border" />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Sidebar Divider */}
        <div className="w-px bg-border" />

        {/* Main Content */}
        <main className="flex-1 flex flex-col gap-6 p-7 px-8 overflow-y-auto">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-text-primary">
                Najlepsze okazje
              </h1>
              <p className="text-[13px] text-text-muted">
                2,847 produktow &bull; Ostatnia aktualizacja: 5 min temu
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-bg-tertiary text-[13px] text-text-secondary hover:text-text-primary transition-colors">
                <ArrowUpDown className="w-3.5 h-3.5" />
                Sortuj: Najwieksza znizka
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Featured Banner */}
          <FeaturedBanner
            title="Cyberpunk 2077: Ultimate Edition"
            description="Najnizsza cena w historii — tylko przez 48h!"
            oldPrice="299,99 zl"
            newPrice="89,99 zl"
            discount="-70%"
          />

          {/* Product Grid */}
          <div className="flex flex-col gap-4">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-4">
                {row.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
                {/* Fill empty slots to maintain grid alignment */}
                {row.length < 4 &&
                  Array.from({ length: 4 - row.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex-1 min-w-0" />
                  ))}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
