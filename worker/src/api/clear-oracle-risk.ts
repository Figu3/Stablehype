// GET /api/clear-oracle-risk
//
// Pure-config dependency risk snapshot for the 6 Clear oracle stables. No D1
// reads, no live data — entirely derived from CLEAR_ORACLE_RISK_CONFIGS plus
// the scoring functions in shared/lib/clear-oracle-risk-scoring.ts.
import { CLEAR_ORACLE_RISK_CONFIGS } from "@shared/lib/clear-oracle-risk-config";
import { scoreAllClearOracleConfigs } from "@shared/lib/clear-oracle-risk-scoring";
import { CLEAR_ORACLE_RISK_VERSION } from "@shared/lib/clear-oracle-risk-version";
import type { ClearOracleRiskResponse } from "@shared/lib/clear-oracle-risk-types";

export async function handleClearOracleRisk(): Promise<Response> {
  try {
    const coins = scoreAllClearOracleConfigs(CLEAR_ORACLE_RISK_CONFIGS);
    const updatedAt = Math.floor(Date.now() / 1000);
    const effectiveAt = CLEAR_ORACLE_RISK_VERSION.changelog[0]?.date ?? "";

    const response: ClearOracleRiskResponse = {
      coins,
      methodology: {
        version: CLEAR_ORACLE_RISK_VERSION.currentVersion,
        effectiveAt,
      },
      updatedAt,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, max-age=60",
        "X-Methodology-Version": CLEAR_ORACLE_RISK_VERSION.currentVersion,
      },
    });
  } catch (err) {
    console.error("[clear-oracle-risk] failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
