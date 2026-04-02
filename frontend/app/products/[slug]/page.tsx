import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { getProductDetail, getProductHistory } from "../../lib/api";
import { formatPrice, formatDate } from "../../lib/utils";
import PriceComparisonTable from "../../components/PriceComparisonTable";
import PriceHistoryChartClient from "../../components/PriceHistoryChartClient";
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

  // Find cheapest available price
  const availablePrices = prices.filter(
    (p) => p.current_price != null && p.is_available,
  );
  const cheapest = availablePrices.sort(
    (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0),
  )[0];

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-8 p-7 px-8 overflow-y-auto max-w-5xl mx-auto w-full">
        {/* Back */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Wróć do listy
        </Link>

        {/* Product Info */}
        <div className="flex gap-8">
          {/* Image */}
          <div className="w-[360px] h-[200px] rounded-xl bg-bg-tertiary overflow-hidden shrink-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted">
                Brak obrazka
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-3 flex-1">
            <h1 className="text-3xl font-bold text-text-primary">
              {product.title}
            </h1>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-bg-tertiary text-xs font-medium text-text-muted">
                <Tag className="w-3.5 h-3.5" />
                {product.category}
              </span>
              {product.release_date && (
                <span className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-bg-tertiary text-xs font-medium text-text-muted">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(product.release_date)}
                </span>
              )}
            </div>

            {product.description && (
              <p className="text-sm text-text-secondary leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Best Price Highlight */}
            {cheapest && (
              <div className="flex items-center gap-3 mt-2 p-4 rounded-xl bg-accent-green/10 border border-accent-green/20">
                <span className="text-sm text-text-secondary">
                  Najlepsza cena:
                </span>
                <span className="text-2xl font-extrabold text-accent-green">
                  {formatPrice(cheapest.current_price!, cheapest.currency ?? "PLN")}
                </span>
                <span className="text-sm text-text-muted">
                  w {cheapest.store_name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Price Comparison */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Porównanie cen
          </h2>
          <PriceComparisonTable prices={prices} />
        </section>

        {/* Price History */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Historia cen
          </h2>
          <div className="bg-bg-card rounded-xl p-4 border border-border">
            <PriceHistoryChartClient history={history} />
          </div>
        </section>
      </main>
    </div>
  );
}
