import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Clock3,
  Radar,
  ShoppingBag,
  Tag,
} from "lucide-react";
import { getProductDetail, getProductHistory } from "../../lib/api";
import { formatPrice, formatDate, timeAgo } from "../../lib/utils";
import PriceHistoryChartClient from "../../components/PriceHistoryChartClient";
import EmptyState from "../../components/EmptyState";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

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
  } catch {
    notFound();
  }

  const history = await getProductHistory(slug);

  const { product, prices } = detail;
  const availablePrices = prices.filter(
    (p) => p.current_price != null && p.is_available,
  );
  const trackedWithoutOffer = prices.filter(
    (p) => p.current_price == null || !p.is_available,
  );
  const cheapest = availablePrices.sort(
    (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0),
  )[0];
  const latestCheck = prices
    .map((entry) => entry.last_checked_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

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
          <div className="overflow-hidden rounded-[28px] border border-border bg-bg-tertiary">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                className="h-full min-h-[280px] w-full object-cover"
              />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center text-text-muted">
                Brak obrazka
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
                {product.category}
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
                "Produkt jest widoczny w katalogu PriceDrop i może mieć zarówno aktywne oferty cenowe, jak i sklepy pozostające jeszcze wyłącznie w trybie monitoringu."}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="section-subtle p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Najlepsza cena
                </p>
                <p className="mt-2 text-3xl text-accent-green">
                  {cheapest
                    ? formatPrice(cheapest.current_price!, cheapest.currency ?? "PLN")
                    : "Brak"}
                </p>
              </div>
              <div className="section-subtle p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Aktywne oferty
                </p>
                <p className="mt-2 text-3xl text-text-primary">{availablePrices.length}</p>
              </div>
              <div className="section-subtle p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Monitoring sklepów
                </p>
                <p className="mt-2 text-3xl text-text-primary">{prices.length}</p>
              </div>
            </div>

            {cheapest ? (
              <div className="section-subtle flex flex-wrap items-center gap-3 border-accent-green/20 bg-accent-green-soft p-5">
                <ShoppingBag className="h-5 w-5 text-accent-green" />
                <span className="text-sm text-text-secondary">Najlepsza aktywna oferta:</span>
                <span className="text-2xl font-extrabold text-accent-green">
                  {formatPrice(cheapest.current_price!, cheapest.currency ?? "PLN")}
                </span>
                <span className="text-sm text-text-secondary">w {cheapest.store_name}</span>
              </div>
            ) : (
              <div className="section-subtle flex flex-wrap items-center gap-3 p-5">
                <Radar className="h-5 w-5 text-accent" />
                <span className="text-sm leading-6 text-text-secondary">
                  Ten produkt jest już w monitoringu, ale nie ma jeszcze aktywnej
                  oferty z potwierdzoną ceną.
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Sekcja główna</span>
            <h2 className="text-3xl text-text-primary">Dostępne oferty</h2>
          </div>
          {availablePrices.length > 0 ? (
            <div className="grid gap-4">
              {availablePrices.map((price) => (
                <article
                  key={price.store_id}
                  className="section-subtle flex flex-col gap-4 p-5 lg:grid lg:grid-cols-[1.1fr_0.6fr_0.6fr_auto] lg:items-center"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card">
                      {price.store_logo_url ? (
                        <img
                          src={price.store_logo_url}
                          alt={price.store_name}
                          className="h-7 w-7 object-contain"
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
                      {formatPrice(price.current_price!, price.currency ?? "PLN")}
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
              detail="Produkt nadal jest monitorowany, więc pojawi się tutaj natychmiast po pierwszym potwierdzonym odczycie ceny."
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Sekcja druga</span>
            <h2 className="text-3xl text-text-primary">Monitorowane sklepy bez ceny</h2>
            <p className="text-sm leading-6 text-text-secondary">
              Ta lista pokazuje, gdzie produkt jest już przygotowany do śledzenia,
              ale jeszcze nie ma aktywnej oferty albo dostępności.
            </p>
          </div>
          {trackedWithoutOffer.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {trackedWithoutOffer.map((price) => (
                <article
                  key={price.store_id}
                  className="section-subtle flex items-start gap-4 p-4"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card">
                    {price.store_logo_url ? (
                      <img
                        src={price.store_logo_url}
                        alt={price.store_name}
                        className="h-6 w-6 object-contain"
                      />
                    ) : (
                      <Radar className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div>
                    <p className="text-lg text-text-primary">{price.store_name}</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      {price.is_available === false
                        ? "Oferta była zarejestrowana, ale obecnie nie jest dostępna."
                        : "Sklep jest objęty monitoringiem i czeka na pierwszy odczyt ceny."}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              message="Wszystkie monitorowane sklepy mają aktywną ofertę"
              detail="Dla tego produktu nie ma obecnie żadnych dodatkowych rekordów oczekujących na pierwszą cenę."
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Historia</span>
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
