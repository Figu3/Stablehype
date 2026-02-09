import { getCache } from "../lib/db";

export async function handleLogos(db: D1Database): Promise<Response> {
  const cached = await getCache(db, "logos");
  if (!cached) {
    return new Response(JSON.stringify({}), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  return new Response(cached.value, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
