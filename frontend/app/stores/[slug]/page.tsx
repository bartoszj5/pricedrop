import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Store as StoreIcon,
  XCircle,
} from "lucide-react";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { ApiError, getPrices, getStore } from "../../lib/api";
import {
  formatPrice,
  getStoreSourceLabel,
  isGenericStoreUrl,
  timeAgo,
} from "../../lib/utils";
import type { Metadata } from "next";
import type { PriceAvailability } from "../../types";

const PAGE_SIZE = 24;

const availabilityOptions: Array<{
  label: string;
  value: PriceAvailability;
  description: string;
}> = [
  {
    label: "Wszystkie",
    value: "all",
    description: "Pełny widok cen zapisanych dla tego sklepu.",
  },
  {
    label: "Aktywne",
    value: "active",
    description: "Oferty z aktualnie aktywną dostępnością.",
  },
  {
    label: "Monitoring",
    value: "inactive",
    description: "Powiązania bez aktywnej oferty albo bez ceny.",
  },
];

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const store = await getStore(slug);
    return {
      title: `${store.name} — PriceDrop`,
    };
  } catch {
    return { title: "Sklep — PriceDrop" };
  }
}

export default async function StoreDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const page =
    typeof resolvedSearchParams.page === "string"
      ? parseInt(resolvedSearchParams.page, 10) || 1
      : 1;
  const availability =
    typeof resolvedSearchParams.availability === "string" &&
    availabilityOptions.some(
      (option) => option.value === resolvedSearchParams.availability,
    )
      ? (resolvedSearchParams.availability as PriceAvailability)
      : "all";

  let store;
  try {
    store = await getStore(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const pricesData = await getPrices(
    { store_slug: slug, availability, page, page_size: PAGE_SIZE },
    { revalidate: 60 },
  );
  const genericStoreUrl = isGenericStoreUrl(store.url);
  const currentAvailabilityOption = availabilityOptions.find(
    (option) => option.value === availability,
  )!;

  function buildFilterHref(nextAvailability: PriceAvailability) {
    const params = new URLSearchParams();
    if (nextAvailability !== "all") {
      params.set("availability", nextAvailability);
    }
    return params.toString()
      ? `/stores/${slug}?${params.toString()}`
      : `/stores/${slug}`;
  }

  return (
    <main className="page-shell flex max-w-6xl flex-col gap-8">
      <Link
        href="/stores"
        className="flex w-fit items-center gap-2 text-sm font-semibold text-text-muted hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do sklepów
      </Link>

      <section className="section-card grid gap-6 p-6 md:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">Profil sklepu</span>
          <h1 className="display-title text-5xl text-text-primary md:text-6xl">
            {store.name}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            {genericStoreUrl
              ? `${store.name} został zaimportowany z IsThereAnyDeal. PriceDrop monitoruje jego oferty, ale nie ma jeszcze potwierdzonego adresu strony głównej sklepu.`
              : `${getStoreSourceLabel(store.url)} jest jednym z kanałów widocznych w katalogu PriceDrop. Widok sklepu pokazuje komplet aktywnych i monitorowanych rekordów cenowych.`}
          </p>
          {genericStoreUrl ? (
            <div className="section-subtle w-fit border-accent-blue/20 bg-[rgba(47,93,124,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
              Adres sklepu nie został jeszcze zweryfikowany. Korzystaj z linków
              do konkretnych ofert przy produktach niżej.
            </div>
          ) : (
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-bg-card px-5 py-3 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
            >
              Odwiedź sklep
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Status
            </p>
            <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
              {store.is_active ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-accent-green" />
                  <span className="text-accent-green">Aktywny</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-text-muted" />
                  <span className="text-text-muted">Nieaktywny</span>
                </>
              )}
            </div>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Aktywne oferty
            </p>
            <p className="mt-2 text-4xl text-accent-green">
              {pricesData.active_total}
            </p>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Wszystkie rekordy cen
            </p>
            <p className="mt-2 text-4xl text-text-primary">{pricesData.all_total}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Widok oferty</span>
            <h2 className="text-3xl text-text-primary">
              {currentAvailabilityOption.label === "Wszystkie"
                ? "Wszystkie rekordy sklepu"
                : currentAvailabilityOption.label === "Aktywne"
                  ? "Aktywne oferty tego sklepu"
                  : "Monitoring bez aktywnej oferty"}
            </h2>
            <p className="text-sm leading-6 text-text-secondary">
              {currentAvailabilityOption.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {availabilityOptions.map((option) => {
              const isActive = option.value === availability;
              return (
                <Link
                  key={option.value}
                  href={buildFilterHref(option.value)}
                  className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${
                    isActive
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-bg-card text-text-secondary hover:border-accent/30 hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        {pricesData.items.length > 0 ? (
          <>
            <div className="grid gap-4">
              {pricesData.items.map((price) => {
                const isActive = price.is_available && price.current_price != null;

                return (
                  <article
                    key={price.id}
                    className="section-subtle flex flex-col gap-4 p-5 lg:grid lg:grid-cols-[1.35fr_0.55fr_0.5fr_0.6fr_auto] lg:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-bg-card text-accent">
                        <StoreIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <Link
                          href={`/products/${price.product_slug}`}
                          className="text-xl leading-tight text-text-primary hover:text-accent"
                        >
                          {price.product_title ?? price.product_slug}
                        </Link>
                        <p className="mt-1 text-sm text-text-secondary">
                          {price.product_slug}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                        Cena
                      </p>
                      <p
                        className={`mt-2 text-2xl ${
                          isActive ? "text-accent-green" : "text-text-primary"
                        }`}
                      >
                        {price.current_price != null
                          ? formatPrice(price.current_price, price.currency)
                          : "Brak"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                        Status
                      </p>
                      <p
                        className={`mt-2 text-sm font-semibold ${
                          isActive ? "text-accent-green" : "text-text-muted"
                        }`}
                      >
                        {isActive ? "Dostępny" : "Monitoring"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                        Ostatnie sprawdzenie
                      </p>
                      <p className="mt-2 text-sm text-text-secondary">
                        {price.last_checked_at ? timeAgo(price.last_checked_at) : "Brak"}
                      </p>
                    </div>

                    {price.url ? (
                      <a
                        href={price.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
                      >
                        {isActive ? "Kup teraz" : "Zobacz ofertę"}
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-sm text-text-muted">Brak linku</span>
                    )}
                  </article>
                );
              })}
            </div>

            <Pagination page={page} totalPages={pricesData.total_pages} />
          </>
        ) : (
          <EmptyState
            message="Brak rekordów dla tego widoku"
            detail="Zmień filtr aktywności albo przejdź do pełnego widoku, aby zobaczyć pozostałe rekordy sklepu."
          />
        )}
      </section>
    </main>
  );
}
