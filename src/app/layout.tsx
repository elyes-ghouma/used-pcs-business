import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans, Martian_Mono } from "next/font/google";
import "./globals.css";

// Big Shoulders: industrial signage caps for headings. Instrument Sans: body. Martian Mono: readouts and spec values only.
const display = Big_Shoulders({ variable: "--font-display", subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const mono = Martian_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Used Gaming PCs", template: "%s" },
  description: "Tested used gaming PCs and components.",
  openGraph: { type: "website", siteName: "Used Gaming PCs" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07100e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
