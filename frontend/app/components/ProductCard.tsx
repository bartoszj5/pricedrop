import Link from "next/link";
import type { ProductWithBestPrice } from "../types";
import { formatPrice } from "../lib/utils";

interface ProductCardProps {
  product: ProductWithBestPrice;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex flex-col bg-bg-card rounded-xl overflow-hidden hover:ring-1 hover:ring-border transition-all"
    >
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
          {product.best_store_name && (
            <span className="flex items-center h-[22px] px-2 rounded-md bg-bg-tertiary text-[10px] font-medium text-text-muted">
              {product.best_store_name}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-semibold text-text-primary truncate">
          {product.title}
        </h3>

        {/* Price Row */}
        <div className="flex items-center justify-between">
          {product.best_price != null ? (
            <span className="text-lg font-bold text-text-primary">
              {formatPrice(product.best_price, product.best_price_currency ?? "PLN")}
            </span>
          ) : (
            <span className="text-sm text-text-muted">Brak cen</span>
          )}
        </div>
      </div>
    </Link>
  );
}
