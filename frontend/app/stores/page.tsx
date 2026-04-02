import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Globe, RadioTower, XCircle } from "lucide-react";
import { getStores } from "../lib/api";
import EmptyState from "../components/EmptyState";
import type { Metadata } from "next";
import { getDomainLabel } from "../lib/utils";

export const metadata: Metadata = {
  title: "Sklepy — PriceDrop",
};

export default async function StoresPage() {
  const data = await getStores({ page_size: 100 });
  const activeCount = data.items.filter((store) => store.is_active).length;

  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card grid gap-6 p-6 md:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">Sieć źródeł</span>
          <h1 className="display-title text-5xl text-text-primary md:text-6xl">
            Sklepy objęte monitoringiem
          </h1>
          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            Lista źródeł, z których PriceDrop pobiera ceny lub przygotowuje
            monitoring. To lekki katalog kanałów sprzedaży, a nie panel operacyjny.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Wszystkie sklepy
            </p>
            <p className="mt-2 text-4xl text-text-primary">{data.total}</p>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Aktywne źródła
            </p>
            <p className="mt-2 text-4xl text-accent-green">{activeCount}</p>
          </div>
        </div>
      </section>

      {data.items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((store) => (
              <Link
                key={store.slug}
                href={`/stores/${store.slug}`}
                className="group flex flex-col gap-4 rounded-[28px] border border-border bg-bg-card p-5 shadow-[var(--shadow-card)] hover:-translate-y-1 hover:border-accent/30"
              >
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Źródło sprzedaży</span>
                  {store.is_active ? (
                    <CheckCircle2 className="h-5 w-5 text-accent-green" />
                  ) : (
                    <XCircle className="h-5 w-5 text-text-muted" />
                  )}
                </div>

                <div>
                  <h3 className="text-[1.5rem] leading-tight text-text-primary">
                    {store.name}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {getDomainLabel(store.url)}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-border bg-bg-secondary px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Status
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {store.is_active ? "Aktywny" : "Nieaktywny"}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-border bg-bg-secondary px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Typ
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <Globe className="h-4 w-4 text-accent-blue" />
                      Sklep online
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-border/80 pt-4 text-sm text-text-secondary">
                  <div className="inline-flex items-center gap-2">
                    <RadioTower className="h-4 w-4 text-accent" />
                    Kanał pod monitoring
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-text-primary group-hover:text-accent" />
                </div>
              </Link>
            ))}
        </div>
      ) : (
        <EmptyState message="Brak sklepów w bazie" />
      )}
    </main>
  );
}
