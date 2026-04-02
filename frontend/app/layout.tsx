import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import Navbar from "./components/Navbar";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <div className="min-h-screen">
          <Suspense>
            <Navbar />
          </Suspense>
          {children}
        </div>
      </body>
    </html>
  );
}
