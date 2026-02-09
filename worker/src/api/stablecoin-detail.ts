import { getCache, setCache } from "../lib/db";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

export async function handleStablecoinDetail(
  db: D1Database,
  id: string,
  ctx: ExecutionContext
): Promise<Response> {
  // Synthetic gold IDs have no DefiLlama detail page
  if (id.startsWith("gold-")) {
    return new Response(JSON.stringify({ error: "No detail data for gold tokens" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cacheKey = `detail:${id}`;
  const cached = await getCache(db, cacheKey);

  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.updatedAt;
    if (age < CACHE_TTL_SECONDS) {
      return new Response(cached.value, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS - age}`,
        },
      });
    }
  }

  // Fetch fresh data from DefiLlama
  const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(id)}`);
  if (!res.ok) {
    // If we have stale cache, return it rather than error
    if (cached) {
      return new Response(cached.value, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }
    return new Response(JSON.stringify({ error: `Failed to fetch stablecoin ${id}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await res.text();

  // Store in cache asynchronously
  ctx.waitUntil(setCache(db, cacheKey, body));

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
}
