import { handleStablecoins } from "./api/stablecoins";
import { handleStablecoinDetail } from "./api/stablecoin-detail";
import { handleLogos } from "./api/logos";
import { handleBlacklist } from "./api/blacklist";

export function route(
  path: string,
  db: D1Database,
  ctx: ExecutionContext
): Promise<Response> | null {
  if (path === "/api/stablecoins") {
    return handleStablecoins(db);
  }

  if (path === "/api/logos") {
    return handleLogos(db);
  }

  if (path === "/api/blacklist") {
    return handleBlacklist(db);
  }

  // /api/stablecoin/:id
  const detailMatch = path.match(/^\/api\/stablecoin\/(.+)$/);
  if (detailMatch) {
    return handleStablecoinDetail(db, decodeURIComponent(detailMatch[1]), ctx);
  }

  return null;
}
