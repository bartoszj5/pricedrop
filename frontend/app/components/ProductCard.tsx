"use client";

import { Heart } from "lucide-react";
import type { ProductCardData } from "../types";

interface ProductCardProps {
  product: ProductCardData;
}

export default function ProductCard({ product }: ProductCardProps) {
  const formatPrice = (price: number) =>
    price.toLocaleString("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " zl";

  return (
    <div className="flex flex-col bg-bg-card rounded-xl overflow-hidden flex-1 min-w-0">
      {/* Image */}
      <div className="w-full h-[140px] bg-bg-tertiary overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
            Brak obrazka
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2.5 p-3.5">
        {/* Tags */}
        <div className="flex gap-1.5">
          <span className="flex items-center h-[22px] px-2 rounded-md bg-bg-tertiary text-[10px] font-medium text-text-muted">
            {product.category}
          </span>
          <span className="flex items-center h-[22px] px-2 rounded-md bg-bg-tertiary text-[10px] font-medium text-text-muted">
            {product.store}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-semibold text-text-primary truncate">
          {product.title}
        </h3>

        {/* Price Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-text-primary">
              {formatPrice(product.current_price)}
            </span>
            {product.old_price && (
              <span className="text-xs text-text-muted line-through">
                {formatPrice(product.old_price)}
              </span>
            )}
          </div>
          {product.discount && (
            <span className="flex items-center h-6 px-2 rounded-md bg-accent-green/[0.13] text-xs font-bold text-accent-green">
              -{product.discount}%
            </span>
          )}
        </div>

        {/* Track Price */}
        <button className="flex items-center gap-2 text-text-muted hover:text-accent-red transition-colors">
          <Heart className="w-3.5 h-3.5" />
          <span className="text-[11px]">Sledz cene</span>
        </button>
      </div>
    </div>
  );
}
