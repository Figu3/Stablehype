import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { TRACKED_STABLECOINS } from "@/lib/stablecoins";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription = `Track ${TRACKED_STABLECOINS.length} stablecoins across every chain. Market caps, peg deviations, and on-chain analytics.`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://stablehype.xyz"),
  title: {
    template: "%s | StableHype",
    default: "Stablecoin Analytics Dashboard | StableHype",
  },
  description: siteDescription,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "StableHype",
    locale: "en_US",
    url: "https://stablehype.xyz/",
    title: "Stablecoin Analytics Dashboard | StableHype",
    description: siteDescription,
    images: [{ url: "https://stablehype.xyz/og-card.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "https://stablehype.xyz/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://stablecoin-api.stablehype.workers.dev" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring">
          Skip to main content
        </a>
        <Providers>
          <Header />
          <main id="main-content" className="container mx-auto px-4 py-8">{children}</main>
          <Footer />
        </Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "StableHype",
                url: "https://stablehype.xyz",
                description: siteDescription,
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://stablehype.xyz/?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "StableHype",
                url: "https://stablehype.xyz",
                logo: "https://stablehype.xyz/icon-300.png",
                description: siteDescription,
                founder: {
                  "@type": "Person",
                  name: "TokenBrice",
                  url: "https://tokenbrice.xyz",
                },
              },
            ]),
          }}
        />
      </body>
    </html>
  );
}
