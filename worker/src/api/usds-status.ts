import { getCache } from "../lib/db";

export async function handleUsdsStatus(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, "usds-status");
    if (!cached) {
      return new Response(JSON.stringify(null), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    return new Response(cached.value, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[usds-status] D1 query failed:", err);
    return new Response(JSON.stringify(null), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
