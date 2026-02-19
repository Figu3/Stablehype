/**
 * GET /api/price-sources?stablecoin=<id>
 *
 * Returns multi-source price data for a given stablecoin, grouped by category.
 */

export async function handlePriceSources(db: D1Database, url: URL): Promise<Response> {
  const stablecoinId = url.searchParams.get("stablecoin");

  if (!stablecoinId) {
    return new Response(JSON.stringify({ error: "Missing ?stablecoin= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await db
      .prepare(
        "SELECT source_category, source_name, price_usd, confidence, extra_json, updated_at FROM price_sources WHERE stablecoin_id = ? ORDER BY source_category, confidence DESC"
      )
      .bind(stablecoinId)
      .all<{
        source_category: string;
        source_name: string;
        price_usd: number;
        confidence: number | null;
        extra_json: string | null;
        updated_at: number;
      }>();

    const sources: Record<string, unknown[]> = {
      dex: [],
      oracle: [],
      cex: [],
    };

    let latestUpdatedAt = 0;

    for (const row of result.results ?? []) {
      const category = row.source_category;
      if (!(category in sources)) continue;

      let extra: Record<string, unknown> = {};
      if (row.extra_json) {
        try {
          extra = JSON.parse(row.extra_json);
        } catch {
          // skip malformed extra
        }
      }

      sources[category].push({
        ...extra,
        // Typed fields AFTER spread so they always win over extra_json keys
        name: row.source_name,
        price: row.price_usd,
        confidence: row.confidence ?? 0,
      });

      if (row.updated_at > latestUpdatedAt) {
        latestUpdatedAt = row.updated_at;
      }
    }

    const totalSources =
      sources.dex.length + sources.oracle.length + sources.cex.length;

    if (totalSources === 0) {
      // Short cache for empty responses so data appears quickly after first sync
      return new Response(JSON.stringify({ stablecoinId, sources: { dex: [], oracle: [], cex: [] }, updatedAt: 0 }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=30, max-age=15",
        },
      });
    }

    return new Response(
      JSON.stringify({
        stablecoinId,
        updatedAt: latestUpdatedAt,
        sources,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, max-age=60",
        },
      }
    );
  } catch (err) {
    console.error("[price-sources] D1 query failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
