import { getCache } from "../lib/db";

export async function handleBluechipRatings(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, "bluechip-ratings");
    if (!cached) {
      return new Response(JSON.stringify(null), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return new Response(cached.value, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[bluechip] D1 query failed:", err);
    return new Response(JSON.stringify(null), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
