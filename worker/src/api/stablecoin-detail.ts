import { getCache, setCache } from "../lib/db";

const DEFILLAMA_BASE = "https://stablecoins.llama.fi";
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

export async function handleStablecoinDetail(
  db: D1Database,
  id: string,
  ctx: ExecutionContext
): Promise<Response> {
  const cacheKey = `detail:${id}`;
  const cached = await getCache(db, cacheKey);

  if (cached) {
    const age = Math.floor(Date.now() / 1000) - cached.updatedAt;
    if (age < CACHE_TTL_SECONDS) {
      return new Response(cached.value, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS - age}, max-age=10`,
        },
      });
    }
  }

  // Fetch from DefiLlama stablecoin API
  const res = await fetch(`${DEFILLAMA_BASE}/stablecoin/${encodeURIComponent(id)}`);
  if (!res.ok) {
    // If we have stale cache, return it rather than error
    if (cached) {
      return new Response(cached.value, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=60, max-age=10",
        },
      });
    }
    return new Response(JSON.stringify({ error: `Failed to fetch stablecoin ${id}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await res.text();

  // Validate JSON structure before caching — skip cache on parse failure
  try {
    JSON.parse(body);
    ctx.waitUntil(setCache(db, cacheKey, body));
  } catch {
    console.warn(`[detail] Invalid JSON response for ${id}, skipping cache write`);
  }

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}, max-age=10`,
    },
  });
}
