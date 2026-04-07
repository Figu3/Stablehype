// Hand-curated dependency configs for the 6 Clear oracle stables.
//
// Keys are CoinGecko numeric ids (matching shared/lib/stablecoins.ts).
// Each config describes the upstream collateral / mechanism / wrapper / custody
// dependencies that the stablecoin's solvency or pegging actually relies on.
//
// Sentinel upstream ids ("offchain-issuer", "fiat-banks", "cex-custody") are
// scored via SENTINEL_SCORES in clear-oracle-risk-scoring.ts.

import { findStablecoinMeta } from "./stablecoins";
import type { ClearOracleRiskConfig } from "./clear-oracle-risk-types";

export const CLEAR_ORACLE_RISK_CONFIGS: Readonly<Record<string, ClearOracleRiskConfig>> = {
  // USDT — Tether
  "1": {
    id: "1",
    governance: "centralized",
    dependencies: [
      {
        upstreamId: "offchain-issuer",
        label: "Tether issuer attestations",
        weight: 0.6,
        type: "custody",
        note: "BDO quarterly attestations; majority T-bills + cash equivalents",
      },
      {
        upstreamId: "fiat-banks",
        label: "Banking partners",
        weight: 0.3,
        type: "custody",
        note: "Cantor Fitzgerald + correspondent banks for fiat rails",
      },
    ],
    notes: "Solvency hinges on Tether's attestations and banking access.",
  },

  // USDC — Circle
  "2": {
    id: "2",
    governance: "centralized",
    dependencies: [
      {
        upstreamId: "offchain-issuer",
        label: "Circle reserve attestations",
        weight: 0.6,
        type: "custody",
        note: "Monthly Deloitte attestations; BlackRock USDXX + bank deposits",
      },
      {
        upstreamId: "fiat-banks",
        label: "BNY Mellon + custody banks",
        weight: 0.3,
        type: "custody",
        note: "Reserve cash held at regulated US banks",
      },
    ],
    notes: "Regulated US issuer with public attestations; SVB stress-test in March 2023.",
  },

  // GHO — Aave
  "118": {
    id: "118",
    governance: "decentralized",
    dependencies: [
      {
        upstreamId: "2",
        label: "USDC (GSM swap floor)",
        weight: 0.4,
        type: "mechanism",
        note: "Aave GHO Stability Module swaps GHO ↔ USDC near peg",
      },
    ],
    notes: "On-chain governance, but the GSM USDC reserve is the practical peg defender.",
  },

  // pyUSD — PayPal / Paxos
  "120": {
    id: "120",
    governance: "centralized",
    dependencies: [
      {
        upstreamId: "offchain-issuer",
        label: "Paxos issuer attestations",
        weight: 0.6,
        type: "custody",
        note: "NYDFS-supervised; monthly attestations of cash + T-bills",
      },
      {
        upstreamId: "fiat-banks",
        label: "Banking partners",
        weight: 0.3,
        type: "custody",
        note: "Reserve banking and FBO accounts for fiat rails",
      },
    ],
    notes: "NYDFS-regulated; smaller scale than USDT/USDC.",
  },

  // USDe — Ethena
  "146": {
    id: "146",
    governance: "centralized-dependent",
    dependencies: [
      {
        upstreamId: "cex-custody",
        label: "CEX off-exchange custody",
        weight: 0.55,
        type: "custody",
        note: "Copper / Ceffu / Cobo hold collateral for delta-neutral perps hedge",
      },
      {
        upstreamId: "1",
        label: "USDT (stablecoin reserve leg)",
        weight: 0.15,
        type: "collateral",
        note: "Stablecoin sleeve held alongside crypto + perps short",
      },
    ],
    notes: "Solvency depends on CEX custody integrity and perps funding regime.",
  },

  // USDS — Sky / MakerDAO
  "209": {
    id: "209",
    governance: "decentralized",
    dependencies: [
      {
        upstreamId: "2",
        label: "USDC (PSM swap floor)",
        weight: 0.5,
        type: "mechanism",
        note: "Sky PSM swaps USDS/DAI ↔ USDC at 0bps",
      },
    ],
    notes: "On-chain governance, but USDC PSM dominates day-to-day peg defense.",
  },
};

// Module-load validation: every key must resolve to a known stablecoin meta.
// Catches typos / id drift at build time, mirroring the redemption-backstops pattern.
for (const stablecoinId of Object.keys(CLEAR_ORACLE_RISK_CONFIGS)) {
  if (!findStablecoinMeta(stablecoinId)) {
    throw new Error(`Unknown clear oracle risk config id "${stablecoinId}"`);
  }
}

export function getClearOracleRiskConfig(stablecoinId: string): ClearOracleRiskConfig | null {
  return CLEAR_ORACLE_RISK_CONFIGS[stablecoinId] ?? null;
}

export function getConfiguredClearOracleRiskIds(): string[] {
  return Object.keys(CLEAR_ORACLE_RISK_CONFIGS);
}
