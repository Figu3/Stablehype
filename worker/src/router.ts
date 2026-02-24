import { handleStablecoins } from "./api/stablecoins";
import { handleStablecoinDetail } from "./api/stablecoin-detail";
import { handleStablecoinCharts } from "./api/stablecoin-charts";
import { handleBlacklist } from "./api/blacklist";
import { handleDepegEvents } from "./api/depeg-events";
import { handleBackfillDepegs } from "./api/backfill-depegs";
import { handlePegSummary } from "./api/peg-summary";
import { handleHealth } from "./api/health";
import { handleUsdsStatus } from "./api/usds-status";
import { handleBluechipRatings } from "./api/bluechip";
import { handleDexLiquidity } from "./api/dex-liquidity";
import { handleDexLiquidityHistory } from "./api/dex-liquidity-history";
import { handlePriceSources } from "./api/price-sources";
import { handlePoolSnapshots } from "./api/bot-pool-snapshots";
import { handleCexPrices } from "./api/bot-cex-prices";
import { handlePoolRegistry } from "./api/bot-pool-registry";
import { handleSpreads } from "./api/bot-spreads";
import { handleArbOpportunities } from "./api/bot-arb-opportunities";
import { requireApiKey } from "./lib/auth";

type RouteHandler = (ctx: RouteContext) => Promise<Response>;

interface RouteContext {
  url: URL;
  db: D1Database;
  execCtx: ExecutionContext;
  request?: Request;
  adminKey?: string;
}

/** Wrap a handler with X-Api-Key authentication (reuses ADMIN_KEY) */
const authed =
  (handler: RouteHandler): RouteHandler =>
  async (c) => {
    const denied = requireApiKey(c.request, c.adminKey);
    if (denied) return denied;
    return handler(c);
  };

/** Static path → handler map for O(1) dispatch */
const routes: Record<string, RouteHandler> = {
  "/api/stablecoins": (c) => handleStablecoins(c.db),
  "/api/stablecoin-charts": (c) => handleStablecoinCharts(c.db),
  "/api/blacklist": (c) => handleBlacklist(c.db, c.url),
  "/api/depeg-events": (c) => handleDepegEvents(c.db, c.url),
  "/api/backfill-depegs": (c) => handleBackfillDepegs(c.db, c.url, c.adminKey, c.request),
  "/api/peg-summary": (c) => handlePegSummary(c.db),
  "/api/health": (c) => handleHealth(c.db),
  "/api/usds-status": (c) => handleUsdsStatus(c.db),
  "/api/bluechip-ratings": (c) => handleBluechipRatings(c.db),
  "/api/dex-liquidity": (c) => handleDexLiquidity(c.db),
  "/api/dex-liquidity-history": (c) => handleDexLiquidityHistory(c.db, c.url),
  "/api/price-sources": (c) => handlePriceSources(c.db, c.url),
  // Bot-facing endpoints (API key required)
  "/api/bot/pool-snapshots": authed((c) => handlePoolSnapshots(c.db, c.url)),
  "/api/bot/cex-prices": authed((c) => handleCexPrices(c.db, c.url)),
  "/api/bot/pool-registry": authed((c) => handlePoolRegistry(c.db, c.url)),
  "/api/bot/spreads": authed((c) => handleSpreads(c.db, c.url)),
  "/api/bot/arb-opportunities": authed((c) => handleArbOpportunities(c.db, c.url)),
};

export function route(
  url: URL,
  db: D1Database,
  ctx: ExecutionContext,
  request?: Request,
  adminKey?: string
): Promise<Response> | null {
  const path = url.pathname;
  const routeCtx: RouteContext = { url, db, execCtx: ctx, request, adminKey };

  // Static routes — O(1) lookup
  const handler = routes[path];
  if (handler) return handler(routeCtx);

  // /api/stablecoin/:id — dynamic route
  const detailMatch = path.match(/^\/api\/stablecoin\/(.+)$/);
  if (detailMatch) {
    return handleStablecoinDetail(db, decodeURIComponent(detailMatch[1]), ctx);
  }

  return null;
}
