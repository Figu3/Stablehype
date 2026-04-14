/**
 * Shared constants for Clear Protocol API endpoints.
 */

// GHO refunds received from Aave (reduces GSM fees owed)
// 2026-04-10: 593.7 GHO refund
export const GSM_REFUNDS_USD = 593.7;

// Clear team Safe that occasionally pays GSM fees directly (outside the vault rebalance path)
// by minting/redeeming GHO on the Aave GSM contracts as part of rebalancing logic.
export const CLEAR_TEAM_SAFE = "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d";

// Aave GHO GSM contracts the Safe interacts with. Both emit BuyAsset / SellAsset.
// UNDERLYING_ASSET verified on-chain 2026-04-14:
//   GSM_USDC   → USDC  (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
//   GSM_USDT_4626 → stataUSDT (0x7Bc3485026Ac48b6cf9BaF0A377477Fff5703Af8), wraps aUSDT
export const GSM_CONTRACTS: readonly string[] = [
  "0x0d8effc11df3f229aa1ea0509bc9dfa632a13578", // GSM USDC
  "0x882285e62656b9623af136ce3078c6bdcc33f5e3", // GSM USDT (4626 stata wrapper)
] as const;
