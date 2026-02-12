import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Freeze & Blacklist Tracker",
  description:
    "Track USDC and USDT address freezes and blacklist events across Ethereum, Tron, and L2 chains.",
  alternates: {
    canonical: "/blacklist/",
  },
  openGraph: {
    title: "Freeze & Blacklist Tracker",
    description:
      "Track USDC and USDT address freezes and blacklist events across Ethereum, Tron, and L2 chains.",
    url: "/blacklist/",
    type: "website",
    siteName: "Pharos",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function BlacklistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://pharos.watch" },
              { "@type": "ListItem", position: 2, name: "Freeze & Blacklist Tracker", item: "https://pharos.watch/blacklist/" },
            ],
          }),
        }}
      />
      {children}
    </>
  );
}
