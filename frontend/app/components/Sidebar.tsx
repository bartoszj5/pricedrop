"use client";

import {
  SlidersHorizontal,
  Gamepad2,
  Monitor,
  Headphones,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

const categories = [
  { label: "Gry PC", icon: Gamepad2, key: "gry-pc" },
  { label: "Konsole", icon: Monitor, key: "konsole" },
  { label: "Akcesoria", icon: Headphones, key: "akcesoria" },
  { label: "Smartfony", icon: Smartphone, key: "smartfony" },
];

const platforms = [
  "Steam",
  "Epic",
  "GOG",
  "PS Store",
  "Xbox",
];

const discounts = ["-10%", "-25%", "-50%", "-75%"];

const stores = ["Steam", "Epic Games Store", "GOG.com"];

export default function Sidebar() {
  const [activeCategory, setActiveCategory] = useState("gry-pc");
  const [activePlatforms, setActivePlatforms] = useState<string[]>(["Steam"]);
  const [activeDiscount, setActiveDiscount] = useState("-50%");
  const [checkedStores, setCheckedStores] = useState<string[]>(["Steam"]);
  const [priceMin, setPriceMin] = useState("0");
  const [priceMax, setPriceMax] = useState("500");

  const togglePlatform = (p: string) =>
    setActivePlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );

  const toggleStore = (s: string) =>
    setCheckedStores((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  return (
    <aside className="w-[260px] shrink-0 bg-bg-secondary flex flex-col gap-7 py-6 px-5 overflow-y-auto">
      {/* Title */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-[18px] h-[18px] text-text-secondary" />
        <span className="text-base font-semibold text-text-primary">
          Filtry
        </span>
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          KATEGORIE
        </span>
        <div className="flex flex-col gap-1">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-2.5 h-9 px-3 rounded-lg w-full text-left transition-colors ${
                  isActive
                    ? "bg-bg-tertiary text-text-primary font-medium"
                    : "text-text-secondary hover:bg-bg-tertiary/50"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${isActive ? "text-accent-green" : "text-text-muted"}`}
                />
                <span className="text-sm">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price Range */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          ZAKRES CEN
        </span>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center h-9 px-3 bg-bg-tertiary rounded-lg flex-1">
            <input
              type="text"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="bg-transparent text-[13px] text-text-secondary outline-none w-full"
              placeholder="0 zł"
            />
          </div>
          <span className="text-sm text-text-muted">—</span>
          <div className="flex items-center h-9 px-3 bg-bg-tertiary rounded-lg flex-1">
            <input
              type="text"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="bg-transparent text-[13px] text-text-secondary outline-none w-full"
              placeholder="500 zł"
            />
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          PLATFORMY
        </span>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                activePlatforms.includes(p)
                  ? "bg-accent-blue text-text-primary"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Discount */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          MIN. ZNIZKA
        </span>
        <div className="flex flex-wrap gap-1.5">
          {discounts.map((d) => {
            const isActive = activeDiscount === d;
            return (
              <button
                key={d}
                onClick={() => setActiveDiscount(d)}
                className={`flex items-center justify-center h-[30px] px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-accent-green/15 text-accent-green font-semibold"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stores */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-text-muted tracking-[1px]">
          SKLEPY
        </span>
        <div className="flex flex-col gap-1.5">
          {stores.map((s) => {
            const isChecked = checkedStores.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStore(s)}
                className="flex items-center gap-2.5 h-8 px-1 w-full"
              >
                <div
                  className={`w-4 h-4 rounded shrink-0 ${
                    isChecked
                      ? "bg-accent-blue"
                      : "border-[1.5px] border-text-muted"
                  }`}
                />
                <span
                  className={`text-[13px] ${
                    isChecked
                      ? "text-text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  {s}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
