import type { Metadata } from "next";
import { OverviewPanel } from "@/components/overview/overview-panel";

export const metadata: Metadata = {
  title: "Overview",
  description: "Clear and Sève side by side: Clear's liquidity, volume and fees, Sève's loan, and how much of Clear is Sève's capital.",
  alternates: { canonical: "/overview/" },
};

export default function OverviewPage() {
  return <OverviewPanel />;
}
