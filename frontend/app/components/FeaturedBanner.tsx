import { Flame, TrendingDown } from "lucide-react";
import type { ProductWithBestPrice } from "../types";
import { formatPrice } from "../lib/utils";

interface FeaturedBannerProps {
  product: ProductWithBestPrice | null;
}

export default function FeaturedBanner({ product }: FeaturedBannerProps) {
  if (!product || product.best_price == null) return null;

  return (
    <div className="flex items-center justify-between w-full h-[140px] rounded-2xl px-7 py-6 bg-gradient-to-b from-[#6366F1] via-[#4F46E5] to-[#3730A3]">
      {/* Left */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 h-[26px] px-3 rounded-full bg-white/[0.13] w-fit">
          <Flame className="w-3 h-3 text-accent-amber" />
          <span className="text-[11px] font-semibold text-white/[0.87]">
            Najlepsza oferta
          </span>
        </div>
        <h2 className="text-[22px] font-bold text-white">{product.title}</h2>
        <p className="text-sm text-white/[0.67]">
          Najlepsza cena w {product.best_store_name}
        </p>
      </div>

      {/* Right */}
      <div className="flex flex-col items-end gap-2">
        <span className="text-[32px] font-extrabold text-white leading-none">
          {formatPrice(product.best_price, product.best_price_currency ?? "PLN")}
        </span>
        <div className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-accent-green">
          <TrendingDown className="w-3.5 h-3.5 text-bg-primary" />
          <span className="text-[13px] font-bold text-bg-primary">
            {product.best_store_name}
          </span>
        </div>
      </div>
    </div>
  );
}
