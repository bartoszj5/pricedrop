import type { Metadata } from "next";
import GameSearchPanel from "../components/GameSearchPanel";

export const metadata: Metadata = {
  title: "Gry — PriceDrop",
};

export default function SearchPage() {
  return (
    <main className="page-shell flex flex-col gap-6">
      <section className="section-card p-6 md:p-8">
        <div className="flex flex-col gap-4">
          <span className="eyebrow">Porównywarka cen</span>
          <h1 className="display-title text-4xl text-text-primary md:text-5xl">
            Znajdź najlepszą cenę gry
          </h1>
          <p className="max-w-2xl text-base leading-7 text-text-secondary">
            Wyszukaj grę i porównaj ceny w dziesiątkach sklepów cyfrowych. Dane
            pobierane na bieżąco z IsThereAnyDeal.
          </p>
        </div>
      </section>

      <GameSearchPanel />
    </main>
  );
}
