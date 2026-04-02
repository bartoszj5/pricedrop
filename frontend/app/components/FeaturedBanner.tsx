"use client";

import { Flame, TrendingDown } from "lucide-react";

interface FeaturedBannerProps {
  title: string;
  description: string;
  oldPrice: string;
  newPrice: string;
  discount: string;
}

export default function FeaturedBanner({
  title,
  description,
  oldPrice,
  newPrice,
  discount,
}: FeaturedBannerProps) {
  return (
    <div className="flex items-center justify-between w-full h-[140px] rounded-2xl px-7 py-6 bg-gradient-to-b from-[#6366F1] via-[#4F46E5] to-[#3730A3]">
      {/* Left */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 h-[26px] px-3 rounded-full bg-white/[0.13] w-fit">
          <Flame className="w-3 h-3 text-accent-amber" />
          <span className="text-[11px] font-semibold text-white/[0.87]">
            Goraca oferta tygodnia
          </span>
        </div>
        <h2 className="text-[22px] font-bold text-white">{title}</h2>
        <p className="text-sm text-white/[0.67]">{description}</p>
      </div>

      {/* Right */}
      <div className="flex flex-col items-end gap-2">
        <span className="text-base font-medium text-white/[0.33] line-through">
          {oldPrice}
        </span>
        <span className="text-[32px] font-extrabold text-white leading-none">
          {newPrice}
        </span>
        <div className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-accent-green">
          <TrendingDown className="w-3.5 h-3.5 text-bg-primary" />
          <span className="text-[13px] font-bold text-bg-primary">
            {discount}
          </span>
        </div>
      </div>
    </div>
  );
}
