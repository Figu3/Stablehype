import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import StablecoinDetailClient from "./client";

export function generateStaticParams() {
  return TRACKED_STABLECOINS.map((coin) => ({ id: coin.id }));
}

export default function StablecoinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <StablecoinDetailClient params={params} />;
}
