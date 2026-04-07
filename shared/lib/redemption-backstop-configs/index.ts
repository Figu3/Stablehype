// Hand-written redemption backstop configs.
//
// Keys are CoinGecko-style numeric ids matching `TRACKED_STABLECOINS` in
// `shared/lib/stablecoins.ts`. Stablecoins without an entry render no card.
//
// To add a stablecoin: pick the closest base config from `./shared.ts`,
// override fields you have evidence for, and run `applyTrackedReviewedDocs`
// at the bottom to attach docs links automatically.
import {
  applyTrackedReviewedDocs,
  collateralRedeemBase,
  documentedVariableFee,
  fixedFee,
  issuerBase,
  LIQUITY_STYLE_REDEMPTION_FEE,
  psmSwapBase,
  queueRedeemBase,
  stablecoinRedeemBase,
  type RedemptionBackstopConfig,
} from "./shared";

const REVIEWED_AT = "2026-04-07";

export const REDEMPTION_BACKSTOP_CONFIGS: Record<string, RedemptionBackstopConfig> = {
  // ── Off-chain issuer redemptions (Clear oracle stables + pyUSD) ──────────
  // USDT
  "1": {
    ...issuerBase,
    notes: ["Direct issuer redemption restricted to verified institutional accounts."],
  },
  // USDC
  "2": {
    ...issuerBase,
    settlementModel: "same-day",
    notes: ["Circle Mint required for direct issuer redemption (KYC-gated)."],
  },
  // PYUSD
  "120": {
    ...issuerBase,
    notes: ["Paxos issuer redemption available to verified accounts."],
  },

  // ── Collateral redeem (Clear-relevant crypto-backed) ─────────────────────
  // USDe — Ethena delta-neutral position; on-demand mint/redeem for whitelisted, queue otherwise
  "146": {
    ...queueRedeemBase,
    accessModel: "whitelisted-onchain",
    settlementModel: "same-day",
    capacityModel: { kind: "supply-ratio", ratio: 0.15, basis: "hot-buffer" },
    notes: ["Whitelisted permissionless mint/redeem; cooldown applies to retail unstaking."],
  },
  // USDS — Sky/Maker upgrade; PSM via DAI conversion
  "209": {
    ...psmSwapBase,
    notes: ["Permissionless 1:1 conversion to/from DAI via the Sky upgrade module."],
  },
  // GHO — Aave's CDP-backed; redemption via PSM (USDC↔GHO via GSM)
  "118": {
    ...psmSwapBase,
    capacityModel: { kind: "supply-ratio", ratio: 0.25, basis: "psm-balance-share" },
    costModel: fixedFee(20, "GHO Stability Module facilitator fee."),
    notes: ["Redemption via the GSM (GHO Stability Module) against USDC."],
  },

  // ── Other key stablecoins ────────────────────────────────────────────────
  // DAI — MakerDAO PSM
  "5": {
    ...psmSwapBase,
    notes: ["Multiple PSMs (USDC, GUSD, USDP) provide 1:1 redemption."],
  },
  // FRAX — AMO + base pool
  "6": {
    ...psmSwapBase,
    capacityModel: { kind: "supply-ratio", ratio: 0.20, basis: "psm-balance-share" },
    notes: ["AMO-managed redemption against the FRAX base pool."],
  },
  // LUSD — Liquity collateral redeem
  "8": {
    ...collateralRedeemBase,
    costModel: documentedVariableFee(LIQUITY_STYLE_REDEMPTION_FEE, "formula"),
    notes: ["Permissionless redemption against the lowest-CR trove for ETH."],
  },
  // crvUSD — Curve LLAMMA collateral redeem
  "110": {
    ...collateralRedeemBase,
    capacityModel: { kind: "supply-ratio", ratio: 0.30, basis: "full-system-eventual" },
    notes: ["Soft liquidation via LLAMMA bands provides continuous redemption pressure."],
  },
};

applyTrackedReviewedDocs(
  REDEMPTION_BACKSTOP_CONFIGS,
  Object.keys(REDEMPTION_BACKSTOP_CONFIGS),
  REVIEWED_AT,
);
