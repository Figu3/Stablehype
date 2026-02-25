import { route } from "./router";
import { syncStablecoins } from "./cron/sync-stablecoins";
import { syncStablecoinCharts } from "./cron/sync-stablecoin-charts";
import { syncBlacklist } from "./cron/sync-blacklist";
import { syncUsdsStatus } from "./cron/sync-usds-status";
import { syncBluechip } from "./cron/sync-bluechip";
import { syncFxRates } from "./cron/sync-fx-rates";
import { syncDexLiquidity } from "./cron/sync-dex-liquidity";
import { syncPriceSources } from "./cron/sync-price-sources";
import { pruneHistory } from "./cron/prune-history";
import { syncLogos } from "./cron/sync-logos";
import { checkRateLimit } from "./lib/rate-limit";
import { createLogger } from "./lib/logger";

interface Env {
  DB: D1Database;
  CORS_ORIGIN: string;
  ETHERSCAN_API_KEY?: string;
  TRONGRID_API_KEY?: string;
  DRPC_API_KEY?: string;
  ADMIN_KEY?: string;
  GRAPH_API_KEY?: string;
  ROUTEMESH_RPC_URL?: string;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, X-Api-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function addCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = env.CORS_ORIGIN;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }),
        origin
      );
    }

    // Rate limit: 120 requests/minute per IP
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const rateLimited = checkRateLimit(clientIp);
    if (rateLimited) return addCorsHeaders(rateLimited, origin);

    const url = new URL(request.url);
    const skipCache = url.pathname === "/api/health";

    // Check edge cache first
    const cache = caches.default;
    const cacheKey = new Request(request.url, { method: "GET" });
    if (!skipCache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return addCorsHeaders(cached, origin);
      }
    }

    const response = await route(url, env.DB, ctx, request, env.ADMIN_KEY);

    if (!response) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
        origin
      );
    }

    // Ensure all cacheable responses have an explicit Cache-Control header
    // (prevents Cloudflare edge from using its default TTL for responses without one)
    if (!skipCache && response.status === 200) {
      const hasCC = response.headers.has("Cache-Control");
      if (!hasCC) {
        const withCC = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        });
        withCC.headers.set("Cache-Control", "public, s-maxage=60, max-age=10");
        ctx.waitUntil(cache.put(cacheKey, withCC.clone()));
        return addCorsHeaders(withCC, origin);
      }
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return addCorsHeaders(response, origin);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    const log = createLogger("cron");

    /** Wrap a cron job to record success/failure timestamps in D1 */
    const tracked = (name: string, fn: () => Promise<void>): Promise<void> =>
      fn()
        .then(() => {
          log.info("completed", { job: name });
          return recordCronRun(env.DB, name, true);
        })
        .catch((err) => {
          log.error("failed", { job: name, error: String(err) });
          return recordCronRun(env.DB, name, false);
        });

    switch (cron) {
      case "*/5 * * * *":
        ctx.waitUntil(tracked("sync-stablecoins", () => syncStablecoins(env.DB)));
        ctx.waitUntil(tracked("sync-stablecoin-charts", () => syncStablecoinCharts(env.DB)));
        break;
      case "*/10 * * * *":
        // Chain price-sources AFTER dex-liquidity so it reads fresh dex_prices data
        ctx.waitUntil(
          tracked("sync-dex-liquidity+price-sources", () =>
            syncDexLiquidity(env.DB, env.GRAPH_API_KEY ?? null).then(() =>
              syncPriceSources(env.DB, env.ROUTEMESH_RPC_URL ?? null)
            )
          )
        );
        break;
      case "*/15 * * * *":
        ctx.waitUntil(
          tracked("sync-blacklist", () =>
            syncBlacklist(
              env.DB,
              env.ETHERSCAN_API_KEY ?? null,
              env.TRONGRID_API_KEY ?? null,
              env.DRPC_API_KEY ?? null
            )
          )
        );
        ctx.waitUntil(tracked("sync-usds-status", () => syncUsdsStatus(env.DB, env.ETHERSCAN_API_KEY ?? null)));
        ctx.waitUntil(tracked("sync-bluechip", () => syncBluechip(env.DB)));
        break;
      case "0 */2 * * *":
        ctx.waitUntil(tracked("sync-fx-rates", () => syncFxRates(env.DB)));
        ctx.waitUntil(tracked("prune-history", () => pruneHistory(env.DB)));
        ctx.waitUntil(tracked("sync-logos", () => syncLogos(env.DB)));
        break;
    }
  },
};

async function recordCronRun(db: D1Database, name: string, success: boolean): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const col = success ? "last_success" : "last_failure";
    await db
      .prepare(
        `INSERT INTO cron_health (job_name, ${col}) VALUES (?, ?)
         ON CONFLICT(job_name) DO UPDATE SET ${col} = excluded.${col}`
      )
      .bind(name, now)
      .run();
  } catch {
    // Best-effort — don't let monitoring break crons
  }
}
