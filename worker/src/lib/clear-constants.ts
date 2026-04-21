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

// Plasma-side Aave GHO USDT GSM (RemoteGSM architecture).
// UNDERLYING_ASSET is stataUSDT on Plasma (0xE0126F0c4451B2B917064A93040fd4770D6774b5),
// which wraps aUSDT0 over the underlying USDT0 (0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb).
// Same BuyAsset/SellAsset event signatures as Ethereum; fee still denominated in GHO.
export const GSM_CONTRACTS_PLASMA: readonly string[] = [
  "0xd06114f714becd6f373e5ce94e07278ef46ebf37",
] as const;

export const GSM_UNDERLYING_PLASMA: Record<string, string> = {
  "0xd06114f714becd6f373e5ce94e07278ef46ebf37": "0xe0126f0c4451b2b917064a93040fd4770d6774b5", // stataUSDT
};

// Plasma RPC + chainId. Public endpoint, no API key needed.
// Deploy block ≈ 4.75M — we start later because the Safe has no historical
// activity there, and the RPC enforces a 10K block range per getLogs call.
export const PLASMA_RPC_URL = "https://rpc.plasma.to";
export const PLASMA_CHAIN_ID = 9745;
export const PLASMA_SAFE_FIRST_BLOCK = 19_700_000;
