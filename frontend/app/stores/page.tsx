import Link from "next/link";
import { ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { getStores } from "../lib/api";
import EmptyState from "../components/EmptyState";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sklepy — PriceDrop",
};

export default async function StoresPage() {
  const data = await getStores({ page_size: 100 });

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-6 p-7 px-8 overflow-y-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">Sklepy</h1>
          <p className="text-[13px] text-text-muted">
            {data.total} sklepów w bazie
          </p>
        </div>

        {data.items.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {data.items.map((store) => (
              <Link
                key={store.slug}
                href={`/stores/${store.slug}`}
                className="flex flex-col gap-3 p-5 bg-bg-card rounded-xl border border-border hover:ring-1 hover:ring-accent-blue/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-text-primary">
                    {store.name}
                  </h3>
                  {store.is_active ? (
                    <CheckCircle className="w-5 h-5 text-accent-green" />
                  ) : (
                    <XCircle className="w-5 h-5 text-text-muted" />
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-sm text-text-muted">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="truncate">{store.url}</span>
                </div>

                <span
                  className={`text-xs font-medium ${
                    store.is_active ? "text-accent-green" : "text-text-muted"
                  }`}
                >
                  {store.is_active ? "Aktywny" : "Nieaktywny"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message="Brak sklepów w bazie" />
        )}
      </main>
    </div>
  );
}
