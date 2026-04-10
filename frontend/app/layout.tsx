import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider, themeInitScript } from "./lib/theme";
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
      <html lang="pl" data-scroll-behavior="smooth" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <ThemeProvider>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Suspense
              fallback={
                <header className="sticky top-0 z-40 border-b border-border bg-bg-secondary">
                  <div className="mx-auto flex min-h-[76px] w-[min(1380px,calc(100vw-32px))] items-center gap-4 py-4">
                    <SkeletonBox className="h-10 w-40 rounded-xl" />
                    <SkeletonBox className="h-11 flex-1 rounded-full" />
                    <SkeletonBox className="h-10 w-40 rounded-full" />
                  </div>
                </header>
              }
            >
              <Navbar />
            </Suspense>
            <div className="flex-1">{children}</div>
            <footer className="border-t border-border bg-bg-secondary">
              <div className="mx-auto flex w-[min(1380px,calc(100vw-32px))] flex-col items-center gap-4 py-10 text-center text-sm text-text-muted sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <TrendingDown className="h-4 w-4" />
                  </div>
                  <span className="font-display text-lg font-bold text-text-primary">PriceDrop</span>
                </div>
                <p>Dane odświeżane automatycznie. Ceny mogą się różnić od aktualnych ofert.</p>
              </div>
            </footer>
          </div>
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
