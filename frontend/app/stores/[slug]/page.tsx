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
import { getStore, getPrices } from "../../lib/api";
import { formatPrice, getDomainLabel, timeAgo } from "../../lib/utils";
import EmptyState from "../../components/EmptyState";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

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

export default async function StoreDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let store;
  try {
    store = await getStore(slug);
  } catch {
    notFound();
  }

  const pricesData = await getPrices({ store_slug: slug, page_size: 100 });
  const activeOffers = pricesData.items.filter((price) => price.is_available);
  const inactiveOffers = pricesData.items.filter((price) => !price.is_available);

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
              {getDomainLabel(store.url)} jest jednym z kanałów widocznych w
              katalogu PriceDrop. Widok sklepu promuje realne oferty, a pozycje
              bez aktywnej dostępności traktuje jako materiał drugorzędny.
            </p>
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-bg-card px-5 py-3 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
            >
              Odwiedź sklep
              <ExternalLink className="h-4 w-4" />
            </a>
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
              <p className="mt-2 text-4xl text-accent-green">{activeOffers.length}</p>
            </div>
            <div className="section-subtle p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Wszystkie rekordy cen
              </p>
              <p className="mt-2 text-4xl text-text-primary">{pricesData.total}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Sekcja główna</span>
            <h2 className="text-3xl text-text-primary">Aktywne oferty tego sklepu</h2>
          </div>

          {activeOffers.length > 0 ? (
            <div className="grid gap-4">
              {activeOffers.map((price) => (
                <article
                  key={price.id}
                  className="section-subtle flex flex-col gap-4 p-5 lg:grid lg:grid-cols-[1.4fr_0.6fr_0.55fr_0.55fr_auto] lg:items-center"
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
                    <p className="mt-2 text-2xl text-accent-green">
                      {formatPrice(price.current_price, price.currency)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Dostępność
                    </p>
                    <p className="mt-2 text-sm font-semibold text-accent-green">
                      Dostępny
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

                  <a
                    href={price.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-2 text-sm font-semibold text-text-primary hover:-translate-y-0.5 hover:border-accent/40"
                  >
                    Kup teraz
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              message="Ten sklep nie ma jeszcze aktywnych ofert w katalogu"
              detail="Profil sklepu pozostaje widoczny, ale w tej chwili nie ma żadnych rekordów z realną ceną do wyświetlenia."
            />
          )}
        </section>

        {inactiveOffers.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Sekcja pomocnicza</span>
              <h2 className="text-3xl text-text-primary">Rekordy drugorzędne</h2>
              <p className="text-sm leading-6 text-text-secondary">
                Pozycje bez aktywnej dostępności są schowane niżej, żeby nie
                rozmywać głównego widoku ofert.
              </p>
            </div>

            <div className="grid gap-3">
              {inactiveOffers.map((price) => (
                <div
                  key={price.id}
                  className="section-subtle flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-text-primary">
                      {price.product_title ?? price.product_slug}
                    </p>
                    <p className="text-sm text-text-secondary">{price.product_slug}</p>
                  </div>
                  <p className="text-sm font-semibold text-text-muted">Niedostępny</p>
                </div>
              ))}
            </div>
          </section>
        )}
    </main>
  );
}
