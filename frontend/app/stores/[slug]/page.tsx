import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { getStore, getPrices } from "../../lib/api";
import { formatPrice, timeAgo } from "../../lib/utils";
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-8 p-7 px-8 overflow-y-auto max-w-5xl mx-auto w-full">
        {/* Back */}
        <Link
          href="/stores"
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do sklepów
        </Link>

        {/* Store Header */}
        <div className="flex items-center justify-between p-6 bg-bg-card rounded-xl border border-border">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-text-primary">
              {store.name}
            </h1>
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent-blue hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              {store.url}
            </a>
          </div>
          <div className="flex items-center gap-2">
            {store.is_active ? (
              <>
                <CheckCircle className="w-5 h-5 text-accent-green" />
                <span className="text-sm font-medium text-accent-green">
                  Aktywny
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-text-muted" />
                <span className="text-sm font-medium text-text-muted">
                  Nieaktywny
                </span>
              </>
            )}
          </div>
        </div>

        {/* Products at this store */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Produkty ({pricesData.total})
          </h2>

          {pricesData.items.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-tertiary text-text-muted text-xs font-semibold">
                    <th className="text-left px-4 py-3">Produkt</th>
                    <th className="text-left px-4 py-3">Cena</th>
                    <th className="text-left px-4 py-3">Dostępność</th>
                    <th className="text-left px-4 py-3">Sprawdzono</th>
                    <th className="text-left px-4 py-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {pricesData.items.map((price) => (
                    <tr key={price.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${price.product_slug}`}
                          className="font-medium text-text-primary hover:text-accent-blue transition-colors"
                        >
                          {price.product_slug}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-bold text-text-primary">
                        {formatPrice(price.current_price, price.currency)}
                      </td>
                      <td className="px-4 py-3">
                        {price.is_available ? (
                          <span className="text-accent-green text-xs">Dostępny</span>
                        ) : (
                          <span className="text-text-muted text-xs">Niedostępny</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {price.last_checked_at
                          ? timeAgo(price.last_checked_at)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={price.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-accent-blue hover:underline text-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Kup
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Brak produktów w tym sklepie" />
          )}
        </section>
      </main>
    </div>
  );
}
