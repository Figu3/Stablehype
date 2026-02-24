/**
 * Clear Protocol v0.2 contract addresses and ABI fragments for on-chain reads.
 * Ethereum mainnet only.
 */

// ── Token addresses ──────────────────────────────────────────────────────────

export const CLEAR_TOKENS = [
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const, decimals: 6, llamaId: "2" },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const, decimals: 6, llamaId: "1" },
  { symbol: "GHO",  address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f" as const, decimals: 18, llamaId: "118" },
  { symbol: "USDe", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3" as const, decimals: 18, llamaId: "146" },
  { symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F" as const, decimals: 18, llamaId: "209" },
] as const;

export type ClearTokenSymbol = (typeof CLEAR_TOKENS)[number]["symbol"];

// ── Contract addresses ───────────────────────────────────────────────────────

export const CLEAR_ORACLE_ADDRESS = "0x1eE149bd53B4193987109f604A1715CBA861d3a3" as const;
export const CLEAR_SWAP_ADDRESS = "0x07656EA4898760d55feA211015df247b44B9D81b" as const;
export const CLEAR_VAULT_ADDRESS = "0x7F2B45840fa82e7DfaFbd5f732F8D619f9585F6A" as const;

// ── ABI fragments (only functions we call) ───────────────────────────────────

export const clearOracleAbi = [
  {
    name: "getPriceAndRedemptionPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_asset", type: "address" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "redemptionPrice", type: "uint256" },
    ],
  },
  {
    name: "getUSDPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_asset", type: "address" }],
    outputs: [{ name: "price", type: "uint256" }],
  },
  {
    name: "oracleConfiguration",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_asset", type: "address" }],
    outputs: [
      { name: "enabled", type: "bool" },
      { name: "assetDecimals", type: "uint8" },
      { name: "oracleDecimals", type: "uint8" },
      { name: "redemptionPrice", type: "uint256" },
      { name: "priceTTL", type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "adapterType", type: "uint8" },
      { name: "adapter", type: "address" },
    ],
  },
] as const;

export const clearSwapAbi = [
  {
    name: "getDepegTresholdBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "depegThresholdBps", type: "uint256" },
      { name: "maximalDepegThresholdBps", type: "uint256" },
    ],
  },
] as const;

// ── RPC endpoint ─────────────────────────────────────────────────────────────

export const ETH_RPC_URL = "https://eth.llamarpc.com";

// ── Oracle price decimals (all prices normalized to 8) ───────────────────────

export const ORACLE_DECIMALS = 8;
