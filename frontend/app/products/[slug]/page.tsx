import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Clock3,
  ImageOff,
  Radar,
  ShoppingBag,
  Tag,
} from "lucide-react";
import { ApiError, getProductDetail, getProductHistory } from "../../lib/api";
import { remoteImageOptions } from "../../lib/remoteImage";
import { formatDate, formatPrice, humanizeCategory, timeAgo } from "../../lib/utils";
import { isActiveOffer } from "../../lib/normalize";
import PriceHistoryChartClient from "../../components/PriceHistoryChartClient";
import EmptyState from "../../components/EmptyState";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await getProductDetail(slug);
    return {
      title: `${data.product.title} — PriceDrop`,
      description: data.product.description ?? `Porównaj ceny ${data.product.title}`,
    };
  } catch {
    return { title: "Produkt — PriceDrop" };
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let detail;
  try {
    detail = await getProductDetail(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const history = await getProductHistory(slug);
  const { product, store_prices, active_offers_count, tracked_stores_count, inactive_offers_count } = detail;

  const activeOffers = store_prices
    .filter(isActiveOffer)
    .sort((left, right) => {
      if (left.current_price == null || right.current_price == null) {
        return left.store_name.localeCompare(right.store_name, "pl");
      }
      return left.current_price - right.current_price;
    });

  const trackedOnly = store_prices
    .filter((price) => !isActiveOffer(price))
    .sort((left, right) => left.store_name.localeCompare(right.store_name, "pl"));

  const cheapest = activeOffers[0] ?? null;
  const latestCheck = store_prices
    .map((entry) => entry.last_checked_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  return (
    <main className="page-shell flex max-w-6xl flex-col gap-8">
      <Link
        href="/"
        className="flex w-fit items-center gap-2 text-sm font-semibold text-text-muted hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do listy
      </Link>

      <section className="section-card grid gap-6 p-6 md:p-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[280px] overflow-hidden rounded-[28px] border border-border bg-bg-tertiary">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 540px"
              className="object-cover"
              {...remoteImageOptions(product.image_url)}
            />
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-text-muted">
              <ImageOff className="h-10 w-10" />
            </div>
          )}
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">Karta produktu</span>
          <h1 className="display-title text-5xl text-text-primary md:text-6xl">
            {product.title}
          </h1>

          <div className="flex flex-wrap gap-2">
            <span className="paper-chip">
              <Tag className="h-3.5 w-3.5" />
              {humanizeCategory(product.category)}
            </span>
            {product.release_date && (
              <span className="paper-chip">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(product.release_date)}
              </span>
            )}
            {latestCheck && (
              <span className="paper-chip">
                <Clock3 className="h-3.5 w-3.5" />
                Ostatnie sprawdzenie {timeAgo(latestCheck)}
              </span>
            )}
          </div>

          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            {product.description ??
              "Produkt jest widoczny w katalogu PriceDrop tylko z ofertami, które mają potwierdzoną cenę i dostępność."}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="section-subtle p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Najlepsza cena
              </p>
              <p className="mt-2 text-3xl text-accent-green">
                {cheapest
                  ? formatPrice(cheapest.current_price ?? 0, cheapest.currency ?? "PLN")
                  : "Brak"}
              </p>
            </div>
            <div className="section-subtle p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Aktywne oferty
              </p>
              <p className="mt-2 text-3xl text-text-primary">{active_offers_count}</p>
            </div>
            <div className="section-subtle p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Monitorowane sklepy
              </p>
              <p className="mt-2 text-3xl text-text-primary">{tracked_stores_count}</p>
            </div>
          </div>

          {cheapest ? (
            <div className="section-subtle flex flex-wrap items-center gap-3 border-accent-green/20 bg-accent-green-soft p-5">
              <ShoppingBag className="h-5 w-5 text-accent-green" />
              <span className="text-sm text-text-secondary">Najlepsza aktywna oferta:</span>
              <span className="text-2xl text-accent-green">
                {formatPrice(cheapest.current_price ?? 0, cheapest.currency ?? "PLN")}
              </span>
              <span className="text-sm text-text-secondary">w {cheapest.store_name}</span>
            </div>
          ) : (
            <div className="section-subtle flex flex-wrap items-center gap-3 p-5">
              <Radar className="h-5 w-5 text-accent" />
              <span className="text-sm leading-6 text-text-secondary">
                Ten produkt jest już monitorowany, ale nie ma obecnie żadnej
                aktywnej oferty z potwierdzoną ceną.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Porównanie cen</span>
          <h2 className="text-3xl text-text-primary">Aktywne oferty</h2>
        </div>
        {activeOffers.length > 0 ? (
          <div className="grid gap-4">
            {activeOffers.map((price) => (
              <article
                key={price.store_id}
                className="section-subtle flex flex-col gap-4 p-5 lg:grid lg:grid-cols-[1.1fr_0.6fr_0.6fr_auto] lg:items-center"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card">
                    {price.store_logo_url ? (
                      <Image
                        src={price.store_logo_url}
                        alt={price.store_name}
                        width={28}
                        height={28}
                        className="h-7 w-7 object-contain"
                        {...remoteImageOptions(price.store_logo_url)}
                      />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div>
                    <p className="text-xl text-text-primary">{price.store_name}</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {price.last_checked_at
                        ? `Sprawdzono ${timeAgo(price.last_checked_at)}`
                        : "Brak informacji o ostatnim sprawdzeniu"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Cena
                  </p>
                  <p className="mt-2 text-3xl text-accent-green">
                    {formatPrice(price.current_price ?? 0, price.currency ?? "PLN")}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-semibold text-accent-green">
                    Dostępny
                  </p>
                </div>

                {price.product_url ? (
                  <a
                    href={price.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
                  >
                    Przejdź do oferty
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="text-sm text-text-muted">Brak linku do oferty</span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            message="Brak aktywnych ofert dla tego produktu"
            detail="Produkt pozostaje monitorowany, więc pojawi się tutaj natychmiast po pierwszym potwierdzonym odczycie ceny."
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Monitoring</span>
          <h2 className="text-3xl text-text-primary">Sklepy bez aktywnej oferty</h2>
          <p className="text-sm leading-6 text-text-secondary">
            {inactive_offers_count > 0
              ? "Te sklepy są już powiązane z produktem, ale nie mają aktualnie aktywnej oferty do pokazania."
              : "W tej chwili każdy monitorowany sklep ma aktywną ofertę."}
          </p>
        </div>

        {trackedOnly.length > 0 ? (
          <div className="grid gap-3">
            {trackedOnly.map((price) => (
              <article
                key={price.store_id}
                className="section-subtle flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-text-primary">{price.store_name}</p>
                  <p className="text-sm text-text-secondary">
                    {price.last_checked_at
                      ? `Ostatni odczyt ${timeAgo(price.last_checked_at)}`
                      : "Brak informacji o ostatnim sprawdzeniu"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-text-muted">
                  {price.current_price != null
                    ? "Oferta nieaktywna"
                    : "Czekamy na pierwszą cenę"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            message="Brak dodatkowych sklepów w monitoringu"
            detail="Każdy zapisany sklep dla tego produktu ma obecnie aktywną ofertę."
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Historia cen</span>
          <h2 className="text-3xl text-text-primary">Ruch cenowy</h2>
        </div>
        {history.length > 0 ? (
          <div className="section-subtle p-4">
            <PriceHistoryChartClient history={history} />
          </div>
        ) : (
          <EmptyState
            message="Brak historii zmian cen dla tego produktu"
            detail="Wykres pojawi się dopiero wtedy, gdy scraper zarejestruje realne zmiany ceny w czasie."
          />
        )}
      </section>
    </main>
  );
}
