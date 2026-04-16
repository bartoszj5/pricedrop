"use client";

import Image from "next/image";
import Link from "next/link";
import { BellRing, Flame, Heart, ImageOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { remoteImageOptions } from "../lib/remoteImage";
import type { ProductWithBestPrice } from "../types";
import { formatPrice } from "../lib/utils";
import { useAuth } from "../lib/auth";

interface ProductCardProps {
  product: ProductWithBestPrice;
  featured?: boolean;
  hideTargetBadge?: boolean;
}

export default function ProductCard({
  product,
  featured = false,
  hideTargetBadge = false,
}: ProductCardProps) {
  const hasActiveOffer = product.best_price != null;
  const router = useRouter();
  const { user, isLiked, toggleLike, getAlert } = useAuth();
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const favorited = isLiked(product.id);
  const alert = getAlert(product.id);
  const targetPrice = alert?.target_price ?? null;
  const targetCurrency = alert?.currency ?? product.best_price_currency ?? "PLN";
  const targetReached =
    targetPrice != null &&
    product.best_price != null &&
    product.best_price <= targetPrice;

  const storeLogos = [
    product.best_store_logo_url
      ? {
          name: product.best_store_name ?? "Sklep",
          logoUrl: product.best_store_logo_url,
        }
      : null,
  ].filter(Boolean) as { name: string; logoUrl: string }[];

  return (
    <Link
      href={`/products/${product.slug}`}
      className={`card-surface group relative flex h-full flex-col overflow-hidden ${
        featured ? "row-span-2 md:col-span-1" : ""
      }`}
    >
      {featured && (
        <div className="pointer-events-none absolute left-3 top-3 z-10">
          <span className="best-offer-badge">
            <Flame className="h-3 w-3" />
            Najlepsza oferta
          </span>
        </div>
      )}

      <button
        type="button"
        disabled={likePending}
        aria-label={favorited ? "Usun z ulubionych" : "Dodaj do ulubionych"}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!user) {
            router.push("/login");
            return;
          }
          setLikeError(null);
          setLikePending(true);
          try {
            await toggleLike(product.id);
          } catch (error) {
            setLikeError(
              error instanceof Error ? error.message : "Nie udalo sie zapisac ulubionych",
            );
          } finally {
            setLikePending(false);
          }
        }}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-text-muted opacity-100 shadow-sm hover:text-accent-red disabled:cursor-not-allowed md:opacity-0 md:group-hover:opacity-100"
      >
        <Heart
          className={`h-4 w-4 ${favorited ? "fill-accent-red text-accent-red" : ""}`}
        />
      </button>

      {likeError && (
        <div className="absolute bottom-3 left-3 right-3 z-10 rounded-lg bg-accent-red/90 px-2 py-1 text-xs text-white">
          {likeError}
        </div>
      )}

      <div
        className={`relative flex w-full items-center justify-center overflow-hidden bg-white ${
          featured ? "aspect-square" : "aspect-[4/3]"
        }`}
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.title}
            fill
            sizes={
              featured
                ? "(max-width: 768px) 100vw, 40vw"
                : "(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            }
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
            {...remoteImageOptions(product.image_url)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </div>

      <div
        className={`flex flex-col gap-2 border-t border-border/80 px-3 py-3 ${
          featured ? "gap-3" : ""
        }`}
      >
        <h3
          className={`two-line-clamp font-semibold text-text-primary ${
            featured ? "text-base leading-tight" : "text-[0.78rem] leading-snug"
          }`}
          title={product.title}
        >
          {product.title}
        </h3>

        {hasActiveOffer ? (
          <p
            className={`font-bold leading-none ${
              featured
                ? "text-2xl text-accent-green"
                : "text-[1.05rem] text-text-primary"
            }`}
          >
            {formatPrice(
              product.best_price!,
              product.best_price_currency ?? "PLN",
            )}
          </p>
        ) : (
          <p className="text-xs font-semibold text-text-muted">
            Brak aktywnej oferty
          </p>
        )}

        {targetPrice != null && !hideTargetBadge && (
          <div
            className={`flex items-center gap-1.5 text-[0.7rem] font-semibold ${
              targetReached ? "text-accent-green" : "text-text-muted"
            }`}
            title={targetReached ? "Cena osiągnęła Twój cel" : "Twoja cena docelowa"}
          >
            <BellRing className="h-3 w-3" />
            <span>
              {targetReached ? "Cel osiągnięty: " : "Cel: "}
              {formatPrice(targetPrice, targetCurrency)}
            </span>
          </div>
        )}

        {storeLogos.length > 0 && (
          <div className="flex items-center gap-2 opacity-80">
            {storeLogos.map((store) => (
              <div
                key={store.name}
                className="relative h-4 w-12"
                title={store.name}
              >
                <Image
                  src={store.logoUrl}
                  alt={store.name}
                  fill
                  sizes="48px"
                  className="object-contain object-left"
                  {...remoteImageOptions(store.logoUrl)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
