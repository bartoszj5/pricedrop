import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import Navbar from "./components/Navbar";
import { SkeletonBox } from "./components/Skeleton";
import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-editorial",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "PriceDrop",
  description: "Katalog okazji i monitoring cen dla elektroniki, gier i akcesoriów.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
      <html lang="pl" data-scroll-behavior="smooth">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <div className="flex min-h-screen flex-col">
          <Suspense
            fallback={
              <header className="sticky top-0 z-40 border-b border-border/80 bg-bg-secondary/85 backdrop-blur-xl">
                <div className="mx-auto flex min-h-[76px] w-[min(1380px,calc(100vw-32px))] items-center py-4">
                  <SkeletonBox className="h-12 w-52 rounded-[18px]" />
                </div>
              </header>
            }
          >
            <Navbar />
          </Suspense>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border/80 bg-bg-secondary/60">
            <div className="mx-auto flex w-[min(1380px,calc(100vw-32px))] flex-col items-center gap-3 py-8 text-center text-sm text-text-muted sm:flex-row sm:justify-between sm:text-left">
              <p>&copy; {new Date().getFullYear()} PriceDrop. Monitoring cen dla elektroniki, gier i akcesoriów.</p>
              <p>Dane odświeżane automatycznie. Ceny mogą się różnić od aktualnych ofert w sklepach.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
