import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ImageOff, Radar, Store as StoreIcon, Tag } from "lucide-react";
import { remoteImageOptions } from "../lib/remoteImage";
import type { ProductWithBestPrice } from "../types";
import { formatPrice, humanizeCategory } from "../lib/utils";

interface ProductCardProps {
  product: ProductWithBestPrice;
}

export default function ProductCard({ product }: ProductCardProps) {
  const hasActiveOffer = product.best_price != null;
  const availableOffersCount = product.available_offers_count ?? 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-[30px] border border-border bg-bg-card shadow-[var(--shadow-card)] hover:-translate-y-1 hover:border-accent/30"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg-tertiary">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            {...remoteImageOptions(product.image_url)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImageOff className="h-8 w-8" />
          </div>
        )}

        <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
          <span className="paper-chip bg-bg-secondary/90">
            <Tag className="h-3.5 w-3.5" />
            {humanizeCategory(product.category)}
          </span>
          <span
            className={`paper-chip ${
              hasActiveOffer
                ? "border-transparent bg-accent-green-soft text-accent-green"
                : "bg-bg-secondary/90 text-text-secondary"
            }`}
          >
            {hasActiveOffer ? "Aktywna oferta" : "W monitoringu"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <h3 className="two-line-clamp text-[1.28rem] leading-tight text-text-primary">
            {product.title}
          </h3>
          {product.best_store_name ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary">
              {product.best_store_logo_url ? (
                <Image
                  src={product.best_store_logo_url}
                  alt={product.best_store_name}
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain"
                  {...remoteImageOptions(product.best_store_logo_url)}
                />
              ) : (
                <StoreIcon className="h-3.5 w-3.5" />
              )}
              {product.best_store_name}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              Monitorujemy rynek i czekamy na pierwszą potwierdzoną cenę.
            </p>
          )}
        </div>

        {availableOffersCount > 0 && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary">
            <Radar className="h-3.5 w-3.5 text-accent" />
            {availableOffersCount} {availableOffersCount === 1 ? "oferta" : availableOffersCount < 5 ? "oferty" : "ofert"}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/80 pt-4">
          <div>
            {hasActiveOffer ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Najlepsza cena
                </p>
                <p className="mt-2 text-3xl leading-none text-accent-green">
                  {formatPrice(product.best_price!, product.best_price_currency ?? "PLN")}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Status
                </p>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <Radar className="h-4 w-4 text-accent" />
                  Brak aktywnej oferty
                </div>
              </>
            )}
          </div>

          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-secondary text-text-primary group-hover:border-accent/40 group-hover:text-accent">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}
