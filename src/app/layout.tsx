import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pharos.watch"),
  title: {
    template: "%s | Pharos",
    default: "Stablecoin Analytics Dashboard | Pharos",
  },
  description:
    "Track 120+ stablecoins across every chain. Market caps, peg deviations, blacklist events, and on-chain analytics.",
  openGraph: {
    type: "website",
    siteName: "Pharos",
    locale: "en_US",
    url: "https://pharos.watch/",
    title: "Stablecoin Analytics Dashboard | Pharos",
    description:
      "Track 120+ stablecoins across every chain. Market caps, peg deviations, blacklist events, and on-chain analytics.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "https://pharos.watch/",
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
        <link rel="preconnect" href="https://api.pharos.watch" />
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
                name: "Pharos",
                url: "https://pharos.watch",
                description:
                  "Track 120+ stablecoins across every chain. Market caps, peg deviations, blacklist events, and on-chain analytics.",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://pharos.watch/?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Pharos",
                url: "https://pharos.watch",
                logo: "https://pharos.watch/pharos-icon.png",
                description:
                  "Open stablecoin analytics dashboard tracking 120+ stablecoins with honest governance classification.",
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
