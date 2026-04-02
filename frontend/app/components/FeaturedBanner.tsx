import { ArrowRight, Radar, Sparkles, TrendingDown } from "lucide-react";
import Link from "next/link";
import type { ProductWithBestPrice } from "../types";
import { formatPrice } from "../lib/utils";

interface FeaturedBannerProps {
  product: ProductWithBestPrice | null;
  trackedStoresCount: number;
}

export default function FeaturedBanner({
  product,
  trackedStoresCount,
}: FeaturedBannerProps) {
  const availableOffersCount = product?.available_offers_count ?? 0;
  const trackedCount = product?.tracked_stores_count ?? trackedStoresCount;

  if (!product || product.best_price == null) {
    return (
      <section className="section-card grid gap-6 p-6 md:p-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">
            <Radar className="h-3.5 w-3.5" />
            Monitoring zamiast pustej obietnicy
          </span>
          <h2 className="max-w-2xl text-4xl leading-none text-text-primary md:text-5xl">
            Katalog czeka na pierwsze aktywne oferty, ale już śledzi pełny rynek.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            PriceDrop nie udaje okazji tam, gdzie ich jeszcze nie ma. Zamiast tego
            pokazuje, które produkty są już objęte monitoringiem i ile sklepów
            sprawdzamy w tle.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="section-subtle flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
                Zakres monitoringu
              </p>
              <p className="mt-2 text-3xl text-text-primary">{trackedStoresCount} sklepów</p>
            </div>
            <Sparkles className="h-8 w-8 text-accent" />
          </div>

          <div className="section-subtle p-5">
            <p className="text-sm leading-6 text-text-secondary">
              Gdy tylko pojawi się pierwsza potwierdzona cena, karta produktu
              automatycznie przejdzie z trybu monitoringu do trybu okazji.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-card grid gap-6 p-6 md:p-8 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative z-10 flex flex-col gap-4">
        <span className="eyebrow">
          <TrendingDown className="h-3.5 w-3.5" />
          Najmocniejsza oferta na tej stronie
        </span>
        <h2 className="max-w-3xl text-4xl leading-none text-text-primary md:text-5xl">
          {product.title}
        </h2>
        <p className="max-w-2xl text-base leading-7 text-text-secondary">
          Najtańsza aktywna oferta jest już dostępna w sklepie {product.best_store_name}.
          Produkt pozostaje jednocześnie monitorowany szerzej, więc karta nadal
          pokaże kolejne ruchy cenowe.
        </p>
        <Link
          href={`/products/${product.slug}`}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-accent bg-accent px-5 py-3 text-sm font-semibold text-white hover:-translate-y-0.5"
        >
          Otwórz detal produktu
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-3">
        <div className="section-subtle p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
            Najlepsza cena
          </p>
          <p className="mt-3 text-5xl leading-none text-accent-green">
            {formatPrice(product.best_price, product.best_price_currency ?? "PLN")}
          </p>
          <p className="mt-3 text-sm text-text-secondary">
            {availableOffersCount} aktywne oferty, monitoring w{" "}
            {trackedCount} sklepach.
          </p>
        </div>

        <div className="section-subtle flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
              Sklep prowadzący
            </p>
            <p className="mt-2 text-2xl text-text-primary">{product.best_store_name}</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-bg-card">
            {product.best_store_logo_url ? (
              <img
                src={product.best_store_logo_url}
                alt={product.best_store_name ?? "Sklep"}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <TrendingDown className="h-6 w-6 text-accent" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
