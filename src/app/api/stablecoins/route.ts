import { NextResponse } from "next/server";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";

export async function GET() {
  try {
    const res = await fetch(`${DEFILLAMA_BASE}/stablecoins?includePrices=true`, {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch from DefiLlama" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
