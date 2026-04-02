import type { Metadata } from "next";
import ITADSearchPanel from "../components/ITADSearchPanel";

export const metadata: Metadata = {
  title: "Szukaj gier (ITAD) — PriceDrop",
};

export default function SearchPage() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col gap-6 p-7 px-8 overflow-y-auto max-w-5xl mx-auto w-full">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">
            Szukaj gier (IsThereAnyDeal)
          </h1>
          <p className="text-[13px] text-text-muted">
            Wyszukaj gry w bazie IsThereAnyDeal, aby sprawdzić dostępność i ceny
          </p>
        </div>

        <ITADSearchPanel />
      </main>
    </div>
  );
}
