import { NextResponse } from "next/server";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch data for ${id}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
