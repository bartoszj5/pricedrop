import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "./components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "PriceDrop",
  description: "Znajdź najlepsze okazje cenowe na gry, elektronikę i więcej",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <div className="flex flex-col h-screen overflow-hidden">
          <Suspense>
            <Navbar />
          </Suspense>
          <div className="h-px w-full bg-border" />
          {children}
        </div>
      </body>
    </html>
  );
}
