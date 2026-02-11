import { handleStablecoins } from "./api/stablecoins";
import { handleStablecoinDetail } from "./api/stablecoin-detail";
import { handleStablecoinCharts } from "./api/stablecoin-charts";
import { handleBlacklist } from "./api/blacklist";
import { handleUsdsStatus } from "./api/usds-status";

export function route(
  path: string,
  db: D1Database,
  ctx: ExecutionContext
): Promise<Response> | null {
  if (path === "/api/stablecoins") {
    return handleStablecoins(db);
  }

  if (path === "/api/stablecoin-charts") {
    return handleStablecoinCharts(db);
  }

  if (path === "/api/blacklist") {
    return handleBlacklist(db);
  }

  if (path === "/api/usds-status") {
    return handleUsdsStatus(db);
  }

  // /api/stablecoin/:id
  const detailMatch = path.match(/^\/api\/stablecoin\/(.+)$/);
  if (detailMatch) {
    return handleStablecoinDetail(db, decodeURIComponent(detailMatch[1]), ctx);
  }

  return null;
}
