import { ExternalLink, Check, X } from "lucide-react";
import type { ProductStorePriceRead } from "../types";
import { formatPrice, timeAgo } from "../lib/utils";

interface PriceComparisonTableProps {
  prices: ProductStorePriceRead[];
}

export default function PriceComparisonTable({ prices }: PriceComparisonTableProps) {
  const available = prices
    .filter((p) => p.current_price != null)
    .sort((a, b) => (a.current_price ?? 0) - (b.current_price ?? 0));

  const unavailable = prices.filter((p) => p.current_price == null);
  const sorted = [...available, ...unavailable];

  if (sorted.length === 0) {
    return (
      <p className="text-text-muted text-sm py-4">
        Brak danych cenowych dla tego produktu.
      </p>
    );
  }

  const cheapestPrice = available[0]?.current_price;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bg-tertiary text-text-muted text-xs font-semibold">
            <th className="text-left px-4 py-3">Sklep</th>
            <th className="text-left px-4 py-3">Cena</th>
            <th className="text-left px-4 py-3">Dostępność</th>
            <th className="text-left px-4 py-3">Sprawdzono</th>
            <th className="text-left px-4 py-3">Link</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const isCheapest =
              p.current_price != null && p.current_price === cheapestPrice;
            return (
              <tr
                key={p.store_id}
                className={`border-t border-border ${
                  isCheapest ? "bg-accent-green/5" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-text-primary">
                  {p.store_name}
                </td>
                <td className="px-4 py-3">
                  {p.current_price != null ? (
                    <span
                      className={`font-bold ${
                        isCheapest ? "text-accent-green" : "text-text-primary"
                      }`}
                    >
                      {formatPrice(p.current_price, p.currency ?? "PLN")}
                    </span>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.is_available ? (
                    <span className="flex items-center gap-1 text-accent-green text-xs">
                      <Check className="w-3.5 h-3.5" /> Dostępny
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-text-muted text-xs">
                      <X className="w-3.5 h-3.5" /> Niedostępny
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted text-xs">
                  {p.last_checked_at ? timeAgo(p.last_checked_at) : "-"}
                </td>
                <td className="px-4 py-3">
                  {p.product_url ? (
                    <a
                      href={p.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent-blue hover:underline text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Kup
                    </a>
                  ) : (
                    <span className="text-text-muted text-xs">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
