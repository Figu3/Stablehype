import type { StablecoinMeta, FilterTag } from "./types";
import { getFilterTags } from "./types";

// Helper to reduce boilerplate
interface StablecoinOpts {
  yieldBearing?: boolean;
  rwa?: boolean;
  collateral?: string;
  pegMechanism?: string;
  goldOunces?: number;
}

function usd(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"], opts?: StablecoinOpts): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency: "USD", governance, yieldBearing: opts?.yieldBearing ?? false, rwa: opts?.rwa ?? false }, collateral: opts?.collateral, pegMechanism: opts?.pegMechanism };
}
function eur(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"], opts?: StablecoinOpts): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency: "EUR", governance, yieldBearing: opts?.yieldBearing ?? false, rwa: opts?.rwa ?? false }, collateral: opts?.collateral, pegMechanism: opts?.pegMechanism };
}
function other(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"], pegCurrency: StablecoinMeta["flags"]["pegCurrency"], opts?: StablecoinOpts): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency, governance, yieldBearing: opts?.yieldBearing ?? false, rwa: opts?.rwa ?? false }, collateral: opts?.collateral, pegMechanism: opts?.pegMechanism, goldOunces: opts?.goldOunces };
}

/**
 * Top 100 stablecoins by market cap (DefiLlama, July 2025).
 * IDs are DefiLlama numeric IDs (string).
 *
 * Classification flags:
 *   backing:      rwa-backed | crypto-backed | algorithmic
 *   pegCurrency:  USD | EUR | CHF | BRL | RUB | VAR | OTHER
 *   governance:   centralized | centralized-dependent | decentralized
 *   yieldBearing: token itself accrues yield
 *   rwa:          backed by real-world assets (treasuries, bonds, etc.)
 */
export const TRACKED_STABLECOINS: StablecoinMeta[] = [
  // ── Rank 1-10 ────────────────────────────────────────────────────────
  usd("1", "Tether", "USDT", "rwa-backed", "centralized", {
    collateral: "Cash, cash equivalents, U.S. Treasury bills, and secured loans",
    pegMechanism: "Direct 1:1 redemption through Tether",
  }),
  usd("2", "USD Coin", "USDC", "rwa-backed", "centralized", {
    collateral: "Cash and short-term U.S. Treasury securities in segregated accounts",
    pegMechanism: "Direct 1:1 redemption through Circle",
  }),
  usd("146", "Ethena USDe", "USDe", "crypto-backed", "centralized-dependent", {
    yieldBearing: true,
    collateral: "ETH, BTC, and SOL in delta-neutral positions (spot long + short perpetual futures)",
    pegMechanism: "Delta-neutral hedging on centralized exchanges (Binance, Bybit, OKX) via custodians",
  }),
  usd("209", "Sky Dollar", "USDS", "crypto-backed", "centralized-dependent", {
    collateral: "Mix of crypto (ETH), RWA (U.S. Treasuries), and centralized stablecoins (USDC) via Sky vaults",
    pegMechanism: "Peg Stability Modules enabling 1:1 swaps with USDC and DAI",
  }),
  usd("262", "World Liberty Financial USD", "USD1", "rwa-backed", "centralized", {
    collateral: "Short-term U.S. Treasury bills and cash equivalents",
    pegMechanism: "Direct 1:1 redemption through World Liberty Financial",
  }),
  usd("5", "Dai", "DAI", "crypto-backed", "centralized-dependent", {
    collateral: "Mix of crypto (ETH, wBTC), RWA (U.S. Treasuries), and centralized stablecoins (USDC) via Maker vaults",
    pegMechanism: "Peg Stability Module enabling 1:1 swaps with USDC; overcollateralized CDP liquidations",
  }),
  usd("120", "PayPal USD", "PYUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar deposits, U.S. Treasury securities, and reverse repurchase agreements",
    pegMechanism: "Direct 1:1 redemption through PayPal/Paxos",
  }),
  usd("246", "Falcon USD", "USDf", "crypto-backed", "centralized-dependent", {
    collateral: "Delta-neutral positions using BTC, ETH, and stablecoins via institutional custody",
    pegMechanism: "Delta-neutral hedging on centralized exchanges with institutional-grade custodians",
  }),
  // USYC removed — yield-bearing token that deviates from peg due to accrued yield
  usd("286", "Global Dollar", "USDG", "rwa-backed", "centralized", {
    collateral: "Cash and short-term U.S. Treasury securities",
    pegMechanism: "Direct 1:1 redemption through Paxos",
  }),

  // ── Rank 11-20 ───────────────────────────────────────────────────────
  usd("250", "Ripple USD", "RLUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar deposits and short-term U.S. government Treasuries",
    pegMechanism: "Direct 1:1 redemption through Ripple",
  }),
  // USDY removed — yield-bearing token that deviates from peg due to accrued yield
  usd("173", "BlackRock USD", "BUIDL", "rwa-backed", "centralized", {
    yieldBearing: true, rwa: true,
    collateral: "Tokenized U.S. Treasury securities managed by BlackRock",
    pegMechanism: "NAV-based pricing with institutional redemption through BlackRock/Securitize",
  }),
  usd("14", "USDD", "USDD", "crypto-backed", "centralized-dependent", {
    collateral: "Over-collateralized by BTC, USDT, and TRX held in TRON DAO Reserve",
    pegMechanism: "Peg Stability Module with USDT; overcollateralization ratio maintained above 120%",
  }),
  usd("221", "Ethena USDtb", "USDTB", "rwa-backed", "centralized", {
    rwa: true,
    collateral: "Tokenized U.S. Treasury bills via Securitize/BlackRock BUIDL fund",
    pegMechanism: "NAV-based pricing backed by underlying Treasury securities",
  }),
  usd("213", "M by M0", "M", "rwa-backed", "centralized-dependent", {
    rwa: true,
    collateral: "U.S. Treasury bills held by approved Minters with on-chain verification",
    pegMechanism: "Authorized minters earn yield; independent validators verify reserves on-chain",
  }),
  usd("336", "United Stables", "U", "rwa-backed", "centralized", {
    collateral: "Cash, USDC, USDT, and USD1 held in segregated custodial accounts (BVI entity)",
    pegMechanism: "Direct 1:1 redemption for reserve assets through United Stables",
  }),
  usd("309", "USD.AI", "USDai", "rwa-backed", "centralized-dependent", {
    collateral: "U.S. Treasuries via M0 platform; minted by depositing USDC or USDT",
    pegMechanism: "1:1 mint/redeem against USDC/USDT with underlying T-bill backing via M0",
  }),
  usd("195", "Usual USD", "USD0", "rwa-backed", "centralized-dependent", {
    rwa: true,
    collateral: "Short-term U.S. Treasury bills and money market instruments",
    pegMechanism: "1:1 minting against approved RWA collateral with on-chain verification",
  }),
  usd("118", "GHO", "GHO", "crypto-backed", "centralized-dependent", {
    collateral: "Multiple crypto assets (ETH, wBTC, LINK) deposited in Aave V3 as collateral",
    pegMechanism: "Overcollateralized minting via Aave; GHO Stability Module enables direct USDC/USDT swaps",
  }),

  // ── Rank 21-30 ───────────────────────────────────────────────────────
  other("258", "A7A5", "A7A5", "rwa-backed", "centralized", "RUB", {
    collateral: "Russian ruble-denominated reserves",
    pegMechanism: "Direct redemption for RUB through issuer",
  }),
  usd("7", "TrueUSD", "TUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollars held in escrow accounts with independent attestation",
    pegMechanism: "Direct 1:1 redemption through TrueToken/Archblock",
  }),
  usd("119", "First Digital USD", "FDUSD", "rwa-backed", "centralized", {
    collateral: "Cash and cash equivalents (U.S. Treasury bills) held in custodial accounts",
    pegMechanism: "Direct 1:1 redemption through First Digital Trust",
  }),
  usd("296", "Cap cUSD", "CUSD", "rwa-backed", "centralized-dependent", {
    collateral: "Basket of regulated stablecoins: USDC, USDT, pyUSD, BUIDL, and BENJI (max 40% each)",
    pegMechanism: "Peg Stability Module enabling 1:1 minting/redemption against underlying stablecoin basket",
  }),
  usd("12", "Neutrino USD", "USDN", "algorithmic", "centralized-dependent", {
    collateral: "WAVES tokens deposited via smart contract; NSBT recapitalization token for undercollateralization",
    pegMechanism: "Algorithmic mint/burn of WAVES at $1 face value with NSBT auctions for reserve recovery; operates on Waves (not Ethereum or a Stage 1 L2)",
  }),
  eur("50", "EURC", "EURC", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves held in regulated financial institutions",
    pegMechanism: "Direct 1:1 redemption through Circle",
  }),
  usd("197", "Resolv USD", "USR", "crypto-backed", "centralized-dependent", {
    collateral: "ETH, stETH, and BTC hedged with short perpetual futures",
    pegMechanism: "Delta-neutral hedging on centralized exchanges (Binance, Hyperliquid, Deribit) via Fireblocks/Ceffu",
  }),
  usd("272", "YLDS", "YLDS", "rwa-backed", "centralized", {
    yieldBearing: true, rwa: true,
    collateral: "U.S. Treasury securities generating yield",
    pegMechanism: "NAV-based institutional redemption with regulatory oversight",
  }),
  usd("110", "crvUSD", "crvUSD", "crypto-backed", "centralized-dependent", {
    collateral: "ETH, wBTC, wstETH, and other crypto assets via LLAMMA (Lending-Liquidating AMM)",
    pegMechanism: "Peg keepers use centralized stablecoins (USDC, USDT, USDP) to stabilize price via Curve pools",
  }),
  usd("310", "Solstice USX", "USX", "crypto-backed", "centralized-dependent", {
    collateral: "Delta-neutral positions in BTC, ETH, SOL plus USDC/USDT and tokenized treasuries",
    pegMechanism: "Delta-neutral hedging on centralized exchanges via Ceffu custody with Chainlink Proof of Reserve",
  }),

  // ── Rank 31-40 ───────────────────────────────────────────────────────
  usd("220", "Avalon USDa", "USDA", "crypto-backed", "centralized-dependent", {
    collateral: "BTC and BTC LSTs via CDP; pegged to USDT with $2B institutional credit lines",
    pegMechanism: "1:1 USDT convertibility; CEX liquidation via HFT algorithms through Ceffu/Coinbase Prime custody",
  }),
  usd("153", "Binance Peg BUSD", "BUSD", "crypto-backed", "centralized", {
    collateral: "BUSD tokens held in reserve on Binance",
    pegMechanism: "Pegged 1:1 to BUSD on BNB Chain via Binance bridge",
  }),
  usd("6", "Frax", "FRAX", "algorithmic", "centralized-dependent", {
    collateral: "Mix of USDC reserves and algorithmic expansion/contraction (now 100% USDC-collateralized)",
    pegMechanism: "Fractional-algorithmic: fully collateralized by USDC with algorithmic supply adjustment",
  }),
  usd("15", "Dola", "DOLA", "crypto-backed", "centralized-dependent", {
    collateral: "Various crypto assets in Inverse Finance lending markets, including USDC",
    pegMechanism: "Fed contracts manage supply via lending markets; relies on USDC for stability mechanisms",
  }),
  usd("205", "Agora Dollar", "AUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar deposits, U.S. Treasury bills, and overnight reverse repos",
    pegMechanism: "Direct 1:1 redemption through Agora",
  }),
  usd("298", "infiniFi USD", "IUSD", "crypto-backed", "centralized-dependent", {
    collateral: "USDC deposits allocated across Aave, Pendle, and Ethena yield strategies",
    pegMechanism: "1:1 mint/redeem against USDC; fractional reserve model with yield optimization",
  }),
  usd("219", "Astherus", "USDF", "crypto-backed", "centralized-dependent", {
    collateral: "USDT deposits deployed in delta-neutral strategies exclusively on Binance",
    pegMechanism: "1:1 USDT convertibility; yield from delta-neutral trading on Binance",
  }),
  usd("21", "flexUSD", "FLEXUSD", "crypto-backed", "centralized", {
    collateral: "BCH and other assets on SmartBCH platform",
    pegMechanism: "Direct redemption through CoinFLEX (centralized exchange, now restructured)",
  }),
  usd("252", "StandX DUSD", "DUSD", "crypto-backed", "centralized-dependent", {
    collateral: "USDT/USDC deposits converted to hedged crypto positions (BTC, ETH, SOL) via Ceffu",
    pegMechanism: "Delta-neutral hedging on centralized exchanges; 1:1 USDT/USDC redemption",
  }),
  usd("218", "River Stablecoin", "satUSD", "crypto-backed", "centralized-dependent", {
    collateral: "BTC, ETH, BNB, and liquid staking tokens; no centralized stablecoin collateral accepted",
    pegMechanism: "Overcollateralized CDP with on-chain liquidation and redemption for $1 of collateral; operates on BNB Chain (not Ethereum or a Stage 1 L2)",
  }),

  // ── Rank 41-50 ───────────────────────────────────────────────────────
  other("249", "Brazilian Digital", "BRZ", "rwa-backed", "centralized", "BRL", {
    collateral: "Brazilian real-denominated reserves",
    pegMechanism: "Direct redemption for BRL through Transfero",
  }),
  usd("306", "Gate USD", "GUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves held by Gate.io",
    pegMechanism: "Direct 1:1 redemption through Gate.io",
  }),
  usd("235", "Frax USD", "FRXUSD", "rwa-backed", "centralized-dependent", {
    collateral: "U.S. dollar deposits and T-bills managed by Frax Finance",
    pegMechanism: "Direct redemption backed by fiat reserves; depends on centralized banking partners",
  }),
  usd("340", "rwaUSDi", "rwaUSDi", "crypto-backed", "centralized-dependent", {
    rwa: true,
    collateral: "Tokenized real-world assets (treasuries and fixed-income instruments)",
    pegMechanism: "NAV-based pricing with centralized RWA custodian backing",
  }),
  usd("271", "Avant USD", "avUSD", "rwa-backed", "centralized", {
    collateral: "Cash and cash equivalents",
    pegMechanism: "Direct 1:1 redemption through Avant",
  }),
  usd("341", "Pleasing USD", "PUSD", "rwa-backed", "centralized-dependent", {
    collateral: "USDT reserves and tokenized gold (PGOLD) exposure",
    pegMechanism: "1:1 redeemability into USDT",
  }),
  usd("339", "Re Protocol reUSD", "reUSD", "crypto-backed", "centralized-dependent", {
    collateral: "Crypto assets deposited in vaults managed via crvUSD and Curve ecosystem",
    pegMechanism: "Depends on crvUSD peg stability which itself relies on centralized stablecoin peg keepers",
  }),
  usd("332", "pmUSD", "pmUSD", "rwa-backed", "centralized-dependent", {
    collateral: "Tokenized precious metals (gold) via RAAC protocol with Chainlink proof-of-reserves",
    pegMechanism: "Overcollateralized CDP backed by tokenized gold held by centralized custodian (I-ON Digital)",
  }),
  usd("202", "Anzen USDz", "USDz", "rwa-backed", "centralized", {
    rwa: true,
    collateral: "Tokenized private credit and real-world asset portfolio",
    pegMechanism: "NAV-based pricing with RWA portfolio backing",
  }),
  usd("316", "CASH", "CASH", "rwa-backed", "centralized", {
    collateral: "Cash and cash equivalents",
    pegMechanism: "Direct 1:1 redemption through issuer",
  }),

  // ── Rank 51-60 ───────────────────────────────────────────────────────
  usd("284", "MNEE USD", "MNEE", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves held in regulated accounts",
    pegMechanism: "Direct 1:1 redemption through MNEE",
  }),
  // TBILL removed — yield-bearing token that deviates from peg due to accrued yield
  // USPD removed — price data unavailable
  other("66", "Frax Price Index", "FPI", "algorithmic", "centralized-dependent", "VAR", {
    collateral: "FRAX and algorithmic mechanisms via Frax Finance",
    pegMechanism: "Algorithmic adjustment tied to CPI; depends on FRAX which depends on USDC",
  }),
  usd("283", "Unitas", "USDU", "crypto-backed", "centralized-dependent", {
    collateral: "USDC deposits routed into Jupiter LP tokens (JLP) and hedged via CEX perpetual shorts",
    pegMechanism: "Delta-neutral hedging on Binance via Ceffu/Copper custody; USDC mint/redeem",
  }),
  usd("210", "Elixir deUSD", "DEUSD", "crypto-backed", "centralized-dependent", {
    collateral: "Was backed by stETH, sDAI, and ~65% USDC reserves via Stream Finance; now defunct",
    pegMechanism: "Delta-neutral ETH shorting; collapsed when Stream Finance failed (Nov 2025)",
  }),
  usd("321", "USDH Stablecoin", "USDH", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves",
    pegMechanism: "Direct 1:1 redemption through issuer",
  }),
  usd("79", "Lista USD", "LISUSD", "crypto-backed", "centralized-dependent", {
    collateral: "BNB, ETH, and LSTs via CDPs; USDT/USDC/FDUSD via Peg Stability Module",
    pegMechanism: "PSM enabling 1:1 swaps with centralized stablecoins; CDP overcollateralization and liquidation",
  }),
  usd("241", "OpenDollar USDO", "USDO", "rwa-backed", "centralized", {
    collateral: "RWA-backed reserves",
    pegMechanism: "Direct redemption through issuer",
  }),
  usd("166", "Cygnus Finance Global USD", "cgUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves via Cygnus Finance",
    pegMechanism: "Direct 1:1 redemption through Cygnus",
  }),

  // ── Rank 61-70 ───────────────────────────────────────────────────────
  eur("254", "EUR CoinVertible", "EURCV", "rwa-backed", "centralized", {
    collateral: "Euro-denominated bank deposits at Societe Generale",
    pegMechanism: "Direct 1:1 redemption through SG-FORGE",
  }),
  usd("97", "USP Stablecoin", "USP", "crypto-backed", "centralized-dependent", {
    collateral: "LP tokens from Platypus stableswap pools (USDC, USDT, DAI deposits); protocol defunct",
    pegMechanism: "Stableswap AMM with centralized stablecoin pools; exploited in 2023, ceased operations",
  }),
  eur("147", "Anchored Coins AEUR", "AEUR", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves held in Swiss bank accounts",
    pegMechanism: "Direct 1:1 redemption through Anchored Coins",
  }),
  usd("4", "Binance USD", "BUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves held by Paxos (minting ceased Feb 2023)",
    pegMechanism: "Direct 1:1 redemption through Paxos",
  }),
  usd("275", "Quantoz USDQ", "USDQ", "rwa-backed", "centralized", {
    collateral: "Euro/USD reserves held in regulated accounts",
    pegMechanism: "Direct 1:1 redemption through Quantoz",
  }),
  usd("256", "Resupply USD", "REUSD", "crypto-backed", "centralized-dependent", {
    collateral: "crvUSD lending positions and Curve LP tokens",
    pegMechanism: "Depends on crvUSD ecosystem which relies on centralized stablecoin peg keepers",
  }),
  eur("325", "Eurite", "EURI", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through Eurite (Binance)",
  }),
  usd("19", "Gemini Dollar", "GUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar deposits held at State Street Bank",
    pegMechanism: "Direct 1:1 redemption through Gemini",
  }),
  usd("11", "Pax Dollar", "USDP", "rwa-backed", "centralized", {
    collateral: "U.S. dollar deposits and T-bills held in bankruptcy-remote accounts",
    pegMechanism: "Direct 1:1 redemption through Paxos",
  }),
  usd("263", "Hex Trust USDX", "USDX", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves",
    pegMechanism: "Direct 1:1 redemption through Hex Trust",
  }),

  // ── Rank 71-80 ───────────────────────────────────────────────────────
  usd("290", "StraitsX XUSD", "XUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves held in regulated accounts",
    pegMechanism: "Direct 1:1 redemption through StraitsX",
  }),
  usd("313", "Metamask USD", "MUSD", "rwa-backed", "centralized", {
    collateral: "U.S. Treasury bills in bankruptcy-remote accounts via Bridge (Stripe) and Blackstone",
    pegMechanism: "Direct fiat on/off-ramp redemption through Bridge/Stripe",
  }),
  usd("255", "Aegis YUSD", "YUSD", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves",
    pegMechanism: "Direct 1:1 redemption through Aegis",
  }),
  usd("22", "sUSD", "SUSD", "crypto-backed", "centralized-dependent", {
    collateral: "SNX, ETH, and USDC/stataUSDC via Synthetix V3; V2 was SNX-only",
    pegMechanism: "Overcollateralization via C-ratio (200%+); V3 added USDC as core collateral on Base",
  }),
  usd("269", "Liquity BOLD", "BOLD", "crypto-backed", "decentralized", {
    collateral: "ETH and ETH liquid staking tokens (wstETH, rETH) only",
    pegMechanism: "Overcollateralized CDPs with on-chain redemption for $1 of ETH collateral",
  }),
  usd("302", "Hylo HYUSD", "HYUSD", "crypto-backed", "centralized-dependent", {
    collateral: "Diversified basket of Solana LSTs (mSOL, jitoSOL, bSOL, JupSOL)",
    pegMechanism: "Overcollateralization (160%+) with companion leveraged token (xSOL) absorbing SOL volatility; operates on Solana (not Ethereum or a Stage 1 L2)",
  }),
  usd("8", "Liquity USD", "LUSD", "crypto-backed", "decentralized", {
    collateral: "ETH only; minimum 110% collateralization ratio",
    pegMechanism: "Overcollateralized CDP with direct ETH redemption at $1 face value",
  }),
  usd("168", "fxUSD", "fxUSD", "crypto-backed", "centralized-dependent", {
    collateral: "wstETH and WBTC split into stable (fxUSD) and leveraged components",
    pegMechanism: "Stability Pool uses USDC to buy fxUSD below peg and sell above; ETH collateral redemption",
  }),
  usd("67", "Bean", "BEAN", "algorithmic", "decentralized", {
    collateral: "None; purely credit-based algorithmic stablecoin using debt instruments (Pods)",
    pegMechanism: "Credit-based system with adjustable interest rates (Temperature); BEAN:ETH and BEAN:3CRV pools",
  }),
  usd("282", "Noble Dollar", "USDN", "rwa-backed", "centralized", {
    collateral: "U.S. Treasury securities via M0 protocol",
    pegMechanism: "Direct redemption backed by T-bills through Noble/M0",
  }),

  // ── Rank 81-90 ───────────────────────────────────────────────────────
  usd("10", "Magic Internet Money", "MIM", "crypto-backed", "centralized-dependent", {
    collateral: "Interest-bearing tokens (yvDAI, xSUSHI, yvUSDT) via Abracadabra CDPs",
    pegMechanism: "Overcollateralized lending with yield-bearing collateral; depends on underlying stablecoin positions",
  }),
  usd("307", "USD CoinVertible", "USDCV", "rwa-backed", "centralized", {
    collateral: "U.S. dollar reserves via Societe Generale FORGE",
    pegMechanism: "Direct 1:1 redemption through SG-FORGE",
  }),
  usd("231", "Honey", "HONEY", "crypto-backed", "centralized-dependent", {
    collateral: "1:1 basket of USDC, USDT0, pyUSD, and USDe on Berachain",
    pegMechanism: "Direct 1:1 mint/redeem against centralized stablecoin collateral with Basket Mode safety",
  }),
  other("226", "Frankencoin", "ZCHF", "crypto-backed", "decentralized", "CHF", {
    collateral: "WBTC and ETH in oracle-free overcollateralized positions (~230%)",
    pegMechanism: "Auction-based collateral valuation with veto governance; no price oracle dependency",
  }),
  usd("172", "USDB Blast", "USDB", "crypto-backed", "centralized-dependent", {
    yieldBearing: true,
    collateral: "USDC and USDT bridged to Blast L2; yield from Maker DSR and T-bills",
    pegMechanism: "Automatic rebasing with yield from underlying centralized stablecoin strategies",
  }),
  usd("225", "Zoth ZeUSD", "ZeUSD", "rwa-backed", "centralized", {
    rwa: true,
    collateral: "Tokenized RWA (treasuries and fixed-income instruments)",
    pegMechanism: "NAV-based pricing with RWA backing",
  }),
  eur("101", "Monerium EUR emoney", "EURE", "rwa-backed", "centralized", {
    collateral: "Euro-denominated bank deposits in licensed European institutions",
    pegMechanism: "Direct 1:1 redemption through Monerium",
  }),
  usd("230", "Noon USN", "USN", "crypto-backed", "centralized-dependent", {
    collateral: "USDC/USDT deposits and short-term U.S. Treasury bills via custodians (Ceffu, Alpaca)",
    pegMechanism: "1:1 mint/redeem against USDC/USDT; delta-neutral yield strategies on centralized exchanges",
  }),
  usd("185", "Gyroscope GYD", "GYD", "crypto-backed", "centralized-dependent", {
    collateral: "Diversified reserve of sDAI, USDC, LUSD, and crvUSD in yield-generating vaults",
    pegMechanism: "Primary-market AMM (PAMM) adjusts redemption prices based on reserve ratio",
  }),
  usd("329", "Nectar", "NECT", "crypto-backed", "centralized-dependent", {
    collateral: "Berachain-native assets: pumpBTC, uniBTC, beraETH, iBGT, iBERA, and LP positions",
    pegMechanism: "Overcollateralized CDP with redemption for collateral at $1 face value (Liquity-style); operates on Berachain (not Ethereum or a Stage 1 L2)",
  }),

  // ── Rank 91-100 ──────────────────────────────────────────────────────
  usd("106", "Electronic USD", "EUSD", "crypto-backed", "centralized-dependent", {
    collateral: "ETH LSTs (stETH, rETH, WBETH, swETH) with 150% minimum collateral ratio",
    pegMechanism: "Overcollateralized CDP with Curve eUSD/3CRV pool and USDC premium suppression mechanism",
  }),
  usd("154", "Bucket Protocol BUCK", "BUCK", "crypto-backed", "centralized-dependent", {
    collateral: "SUI, BTC, ETH, and LSTs via CDPs; USDC/USDT via Peg Stability Module",
    pegMechanism: "Overcollateralized CDPs plus PSM enabling 1:1 swaps with USDC/USDT",
  }),
  eur("55", "EURA", "EURA", "crypto-backed", "centralized-dependent", {
    collateral: "Crypto assets and over-collateralized positions via Angle Protocol",
    pegMechanism: "Hedging agents and standard LPs maintain EUR peg; depends on USDC/DAI liquidity",
  }),
  usd("303", "Mezo USD", "MUSD", "crypto-backed", "centralized-dependent", {
    collateral: "Bitcoin only; minimum 110% collateral ratio",
    pegMechanism: "BTC-only overcollateralized CDP with direct $1 BTC redemption; operates on Mezo (Bitcoin L2, not Ethereum or a Stage 1 L2)",
  }),
  usd("305", "XSY UTY", "UTY", "crypto-backed", "centralized-dependent", {
    collateral: "Delta-neutral positions pairing long AVAX spot with short perpetual futures",
    pegMechanism: "Automated delta-neutral rebalancing of AVAX spot vs perpetual futures positions",
  }),
  eur("51", "Stasis Euro", "EURS", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves verified by independent auditors",
    pegMechanism: "Direct 1:1 redemption through Stasis",
  }),
  usd("46", "USD+", "USD+", "crypto-backed", "centralized-dependent", {
    yieldBearing: true,
    collateral: "USDC deposited into low-risk DeFi strategies (Aave, Compound)",
    pegMechanism: "1:1 USDC-backed with yield from DeFi lending; daily rebase",
  }),
  usd("63", "Fantom USD", "FUSD", "crypto-backed", "centralized-dependent", {
    collateral: "Staked FTM tokens only; 300-500% overcollateralization ratio",
    pegMechanism: "Overcollateralized CDP with FTM-only collateral and liquidation auctions; operates on Fantom/Sonic (not Ethereum or a Stage 1 L2)",
  }),
  usd("326", "Metronome Synth USD", "MSUSD", "crypto-backed", "centralized-dependent", {
    collateral: "USDC, FRAX, DAI, ETH, WBTC, and yield-bearing versions (vaUSDC, vaFRAX)",
    pegMechanism: "Inter-synth arbitrage swaps with mintage caps tied to stablecoin deposit limits",
  }),
  usd("31", "SpiceUSD", "USDS", "algorithmic", "centralized-dependent", {
    collateral: "SPICE tokens and USDC in a hybrid algorithmic/collateralized model",
    pegMechanism: "Arbitrage via minting (SPICE+USDC) above peg and redeeming below peg",
  }),

  // ── Gold-Pegged (not in DefiLlama stablecoins API — data via DefiLlama coins/protocol APIs) ──
  // goldOunces: troy ounces of gold per token (used for peg deviation normalization)
  other("gold-xaut", "Tether Gold", "XAUT", "rwa-backed", "centralized", "GOLD", {
    rwa: true, goldOunces: 1,
    collateral: "Physical gold bars held in Swiss vaults by Tether",
    pegMechanism: "Direct redemption for physical gold through Tether",
  }),
  other("gold-paxg", "PAX Gold", "PAXG", "rwa-backed", "centralized", "GOLD", {
    rwa: true, goldOunces: 1,
    collateral: "Physical gold bars held in London Brink's vaults by Paxos (NYDFS-regulated)",
    pegMechanism: "Direct redemption for physical gold through Paxos",
  }),
  other("gold-kau", "Kinesis Gold", "KAU", "rwa-backed", "centralized", "GOLD", {
    rwa: true, goldOunces: 1 / 31.1035,
    collateral: "Investment-grade physical gold bullion (1 KAU = 1 gram)",
    pegMechanism: "Direct redemption for physical gold through Kinesis; yield via transaction fee sharing",
  }),
  other("gold-xaum", "Matrixdock Gold", "XAUm", "rwa-backed", "centralized", "GOLD", {
    rwa: true, goldOunces: 1,
    collateral: "LBMA-certified 99.99% pure gold bars held in Asian vaults",
    pegMechanism: "Direct redemption for physical gold through Matrixdock (Matrixport)",
  }),

  // ── Additional EUR-pegged ────────────────────────────────────────────
  eur("49", "Euro Tether", "EURT", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves held by Tether",
    pegMechanism: "Direct 1:1 redemption through Tether",
  }),
  eur("52", "Celo Euro", "CEUR", "algorithmic", "centralized-dependent", {
    collateral: "Mento reserve containing USDC, DAI, USDT, plus BTC, ETH, and CELO (110%+ ratio)",
    pegMechanism: "Constant-product market maker arbitrage against reserve assets including centralized stablecoins",
  }),
  eur("56", "Parallel", "PAR", "crypto-backed", "centralized-dependent", {
    collateral: "WETH, WBTC, and USDC via Mimo Protocol CDPs",
    pegMechanism: "Overcollateralized CDPs plus PAR-USDC liquidity pools for peg stability",
  }),
  eur("91", "Iron Bank EURO", "IBEUR", "crypto-backed", "centralized-dependent", {
    collateral: "ETH, wBTC, and stablecoins via Iron Bank lending; permanently depegged since Dec 2023",
    pegMechanism: "ibEUR/USDC Curve pool (failed: pool drained, causing 60% depeg with no recovery path)",
  }),
  eur("98", "EUROe Stablecoin", "EUROe", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves in European regulated banks",
    pegMechanism: "Direct 1:1 redemption through Membrane Finance",
  }),
  eur("158", "VNX EURO", "VEUR", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through VNX",
  }),
  eur("239", "StablR Euro", "EURR", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through StablR",
  }),
  eur("247", "Schuman EUROP", "EUROP", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves under French regulatory oversight",
    pegMechanism: "Direct 1:1 redemption through Schuman Financial",
  }),
  eur("319", "AllUnity EUR", "EURAU", "rwa-backed", "centralized", {
    collateral: "Euro-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through AllUnity",
  }),

  // ── Additional CHF-pegged ────────────────────────────────────────────
  other("157", "VNX Swiss Franc", "VCHF", "rwa-backed", "centralized", "CHF", {
    collateral: "CHF-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through VNX",
  }),

  // ── GBP-pegged ───────────────────────────────────────────────────────
  other("292", "VNX British Pound", "VGBP", "rwa-backed", "centralized", "GBP", {
    collateral: "GBP-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through VNX",
  }),
  other("317", "Tokenised GBP", "tGBP", "rwa-backed", "centralized", "GBP", {
    collateral: "GBP-denominated reserves",
    pegMechanism: "Direct 1:1 redemption through issuer",
  }),
];

// --- Lookup helpers ---

export function getTrackedIds(): Set<string> {
  return new Set(TRACKED_STABLECOINS.map((s) => s.id));
}

export function findStablecoinMeta(id: string): StablecoinMeta | undefined {
  return TRACKED_STABLECOINS.find((s) => s.id === id);
}

export function filterByTag(tag: FilterTag): StablecoinMeta[] {
  return TRACKED_STABLECOINS.filter((s) => getFilterTags(s).includes(tag));
}
