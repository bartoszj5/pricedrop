import type { Metadata } from "next";
import ITADSearchPanel from "../components/ITADSearchPanel";

export const metadata: Metadata = {
  title: "Szukaj gier (ITAD) — PriceDrop",
};

export default function SearchPage() {
  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card grid gap-6 p-6 md:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 flex flex-col gap-4">
          <span className="eyebrow">Gaming utility</span>
          <h1 className="display-title text-5xl text-text-primary md:text-6xl">
            Szukaj gier w bazie IsThereAnyDeal
          </h1>
          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            Moduł ITAD jest pobocznym narzędziem dla katalogu PriceDrop. Służy do
            szybkiego sprawdzania tytułów, zanim trafią do właściwego monitoringu
            cen albo synchronizacji produktowej.
          </p>
        </div>
        <div className="grid gap-3">
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Kiedy używać
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Gdy chcesz zweryfikować poprawny tytuł gry, sprawdzić slug albo
              zawęzić wynik przed dalszym spięciem z katalogiem głównym.
            </p>
          </div>
          <div className="section-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Zakres
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              To narzędzie nie udaje jeszcze pełnej porównywarki cen. Jest
              użytecznym lookupem do świata gier i sklepów cyfrowych.
            </p>
          </div>
        </div>
      </section>

        <ITADSearchPanel />
    </main>
  );
}
