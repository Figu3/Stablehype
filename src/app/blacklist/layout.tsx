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
  },
};

export default function BlacklistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
