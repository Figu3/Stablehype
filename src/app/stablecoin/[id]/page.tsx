import { TRACKED_STABLECOINS } from "@/lib/stablecoins";
import StablecoinDetailClient from "./client";

export function generateStaticParams() {
  return TRACKED_STABLECOINS.map((coin) => ({ id: coin.id }));
}

export default async function StablecoinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StablecoinDetailClient id={id} />;
}
