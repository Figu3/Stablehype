import { getCache } from "../lib/db";

export async function handleStablecoinCharts(db: D1Database): Promise<Response> {
  const cached = await getCache(db, "stablecoin-charts");
  if (!cached) {
    return new Response(JSON.stringify({ error: "Data not yet available" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(cached.value, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
