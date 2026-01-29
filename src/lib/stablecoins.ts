import type { StablecoinMeta, FilterTag } from "./types";
import { getFilterTags } from "./types";

// Helper to reduce boilerplate
function usd(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"], opts?: { yieldBearing?: boolean; rwa?: boolean }): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency: "USD", governance, yieldBearing: opts?.yieldBearing ?? false, rwa: opts?.rwa ?? false } };
}
function eur(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"]): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency: "EUR", governance, yieldBearing: false, rwa: false } };
}
function other(id: string, name: string, symbol: string, backing: StablecoinMeta["flags"]["backing"], governance: StablecoinMeta["flags"]["governance"], pegCurrency: StablecoinMeta["flags"]["pegCurrency"], opts?: { yieldBearing?: boolean; rwa?: boolean }): StablecoinMeta {
  return { id, name, symbol, flags: { backing, pegCurrency, governance, yieldBearing: opts?.yieldBearing ?? false, rwa: opts?.rwa ?? false } };
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
  usd("1",   "Tether",                       "USDT",   "rwa-backed",   "centralized"),
  usd("2",   "USD Coin",                     "USDC",   "rwa-backed",   "centralized"),
  usd("146", "Ethena USDe",                  "USDe",   "crypto-backed", "centralized-dependent", { yieldBearing: true }),
  usd("209", "Sky Dollar",                   "USDS",   "crypto-backed", "centralized-dependent"),
  usd("262", "World Liberty Financial USD",  "USD1",   "rwa-backed",   "centralized"),
  usd("5",   "Dai",                          "DAI",    "crypto-backed", "centralized-dependent"),
  usd("120", "PayPal USD",                   "PYUSD",  "rwa-backed",   "centralized"),
  usd("246", "Falcon USD",                   "USDf",   "crypto-backed", "centralized-dependent"),
  // USYC removed — yield-bearing token that deviates from peg due to accrued yield
  usd("286", "Global Dollar",                "USDG",   "rwa-backed",   "centralized"),

  // ── Rank 11-20 ───────────────────────────────────────────────────────
  usd("250", "Ripple USD",                   "RLUSD",  "rwa-backed",   "centralized"),
  // USDY removed — yield-bearing token that deviates from peg due to accrued yield
  usd("173", "BlackRock USD",                "BUIDL",  "rwa-backed",   "centralized",   { yieldBearing: true, rwa: true }),
  usd("14",  "USDD",                         "USDD",   "crypto-backed", "centralized-dependent"),
  usd("221", "Ethena USDtb",                 "USDTB",  "rwa-backed",   "centralized",   { rwa: true }),
  usd("213", "M by M0",                      "M",      "rwa-backed",   "centralized-dependent", { rwa: true }),
  usd("336", "United Stables",               "U",      "crypto-backed", "decentralized"),
  usd("309", "USD.AI",                       "USDai",  "crypto-backed", "decentralized"),
  usd("195", "Usual USD",                    "USD0",   "rwa-backed",   "centralized-dependent", { rwa: true }),
  usd("118", "GHO",                          "GHO",    "crypto-backed", "centralized-dependent"),

  // ── Rank 21-30 ───────────────────────────────────────────────────────
  other("258", "A7A5",                       "A7A5",   "rwa-backed",   "centralized",   "RUB"),
  usd("7",    "TrueUSD",                     "TUSD",   "rwa-backed",   "centralized"),
  usd("119",  "First Digital USD",           "FDUSD",  "rwa-backed",   "centralized"),
  usd("296",  "Cap cUSD",                    "CUSD",   "crypto-backed", "decentralized"),
  usd("12",   "Neutrino USD",                "USDN",   "algorithmic",   "decentralized"),
  eur("50",   "EURC",                        "EURC",   "rwa-backed",   "centralized"),
  usd("197",  "Resolv USD",                  "USR",    "crypto-backed", "decentralized"),
  usd("272",  "YLDS",                        "YLDS",   "rwa-backed",   "centralized",   { yieldBearing: true, rwa: true }),
  usd("110",  "crvUSD",                      "crvUSD", "crypto-backed", "decentralized"),
  usd("310",  "Solstice USX",                "USX",    "crypto-backed", "decentralized"),

  // ── Rank 31-40 ───────────────────────────────────────────────────────
  usd("220",  "Avalon USDa",                 "USDA",   "crypto-backed", "decentralized"),
  usd("153",  "Binance Peg BUSD",            "BUSD",   "crypto-backed", "centralized"),
  usd("6",    "Frax",                        "FRAX",   "algorithmic",   "centralized-dependent"),
  usd("15",   "Dola",                        "DOLA",   "crypto-backed", "centralized-dependent"),
  usd("205",  "Agora Dollar",                "AUSD",   "rwa-backed",   "centralized"),
  usd("298",  "infiniFi USD",                "IUSD",   "crypto-backed", "decentralized"),
  usd("219",  "Astherus",                    "USDF",   "crypto-backed", "decentralized"),
  usd("21",   "flexUSD",                     "FLEXUSD","crypto-backed", "centralized"),
  usd("252",  "StandX DUSD",                 "DUSD",   "crypto-backed", "decentralized"),
  usd("218",  "River Stablecoin",            "satUSD", "crypto-backed", "decentralized"),

  // ── Rank 41-50 ───────────────────────────────────────────────────────
  other("249","Brazilian Digital",            "BRZ",    "rwa-backed",   "centralized",   "BRL"),
  usd("306",  "Gate USD",                    "GUSD",   "rwa-backed",   "centralized"),
  usd("235",  "Frax USD",                    "FRXUSD", "rwa-backed",   "centralized-dependent"),
  usd("340",  "rwaUSDi",                     "rwaUSDi","crypto-backed", "centralized-dependent", { rwa: true }),
  usd("271",  "Avant USD",                   "avUSD",  "rwa-backed",   "centralized"),
  usd("341",  "Pleasing USD",                "PUSD",   "crypto-backed", "decentralized"),
  usd("339",  "Re Protocol reUSD",           "reUSD",  "crypto-backed", "decentralized"),
  usd("332",  "pmUSD",                       "pmUSD",  "crypto-backed", "decentralized"),
  usd("202",  "Anzen USDz",                  "USDz",   "rwa-backed",   "centralized",   { rwa: true }),
  usd("316",  "CASH",                        "CASH",   "rwa-backed",   "centralized"),

  // ── Rank 51-60 ───────────────────────────────────────────────────────
  usd("284",  "MNEE USD",                    "MNEE",   "rwa-backed",   "centralized"),
  // TBILL removed — yield-bearing token that deviates from peg due to accrued yield
  usd("315",  "US Permissionless Dollar",    "USPD",   "crypto-backed", "decentralized"),
  other("66", "Frax Price Index",            "FPI",    "algorithmic",   "centralized-dependent", "VAR"),
  usd("283",  "Unitas",                      "USDU",   "crypto-backed", "decentralized"),
  usd("210",  "Elixir deUSD",                "DEUSD",  "crypto-backed", "decentralized"),
  usd("321",  "USDH Stablecoin",             "USDH",   "rwa-backed",   "centralized"),
  usd("79",   "Lista USD",                   "LISUSD", "crypto-backed", "decentralized"),
  usd("241",  "OpenDollar USDO",             "USDO",   "rwa-backed",   "centralized"),
  usd("166",  "Cygnus Finance Global USD",   "cgUSD",  "rwa-backed",   "centralized"),

  // ── Rank 61-70 ───────────────────────────────────────────────────────
  eur("254",  "EUR CoinVertible",            "EURCV",  "rwa-backed",   "centralized"),
  usd("97",   "USP Stablecoin",              "USP",    "crypto-backed", "decentralized"),
  eur("147",  "Anchored Coins AEUR",         "AEUR",   "rwa-backed",   "centralized"),
  usd("4",    "Binance USD",                 "BUSD",   "rwa-backed",   "centralized"),
  usd("275",  "Quantoz USDQ",               "USDQ",   "rwa-backed",   "centralized"),
  usd("256",  "Resupply USD",                "REUSD",  "crypto-backed", "decentralized"),
  eur("325",  "Eurite",                      "EURI",   "rwa-backed",   "centralized"),
  usd("19",   "Gemini Dollar",               "GUSD",   "rwa-backed",   "centralized"),
  usd("11",   "Pax Dollar",                  "USDP",   "rwa-backed",   "centralized"),
  usd("263",  "Hex Trust USDX",              "USDX",   "rwa-backed",   "centralized"),

  // ── Rank 71-80 ───────────────────────────────────────────────────────
  usd("290",  "StraitsX XUSD",               "XUSD",   "rwa-backed",   "centralized"),
  usd("313",  "Metamask USD",                "MUSD",   "crypto-backed", "decentralized"),
  usd("255",  "Aegis YUSD",                  "YUSD",   "rwa-backed",   "centralized"),
  usd("22",   "sUSD",                        "SUSD",   "crypto-backed", "decentralized"),
  usd("269",  "Liquity BOLD",                "BOLD",   "crypto-backed", "decentralized"),
  usd("302",  "Hylo HYUSD",                  "HYUSD",  "crypto-backed", "decentralized"),
  usd("8",    "Liquity USD",                 "LUSD",   "crypto-backed", "decentralized"),
  usd("168",  "fxUSD",                       "fxUSD",  "crypto-backed", "decentralized"),
  usd("67",   "Bean",                        "BEAN",   "algorithmic",   "decentralized"),
  usd("282",  "Noble Dollar",                "USDN",   "rwa-backed",   "centralized"),

  // ── Rank 81-90 ───────────────────────────────────────────────────────
  usd("10",   "Magic Internet Money",        "MIM",    "crypto-backed", "centralized-dependent"),
  usd("307",  "USD CoinVertible",            "USDCV",  "rwa-backed",   "centralized"),
  usd("231",  "Honey",                       "HONEY",  "crypto-backed", "decentralized"),
  other("226","Frankencoin",                  "ZCHF",   "crypto-backed", "decentralized", "CHF"),
  usd("172",  "USDB Blast",                  "USDB",   "crypto-backed", "centralized-dependent", { yieldBearing: true }),
  usd("225",  "Zoth ZeUSD",                  "ZeUSD",  "rwa-backed",   "centralized",   { rwa: true }),
  eur("101",  "Monerium EUR emoney",         "EURE",   "rwa-backed",   "centralized"),
  usd("230",  "Noon USN",                    "USN",    "crypto-backed", "decentralized"),
  usd("185",  "Gyroscope GYD",               "GYD",    "crypto-backed", "decentralized"),
  usd("329",  "Nectar",                      "NECT",   "crypto-backed", "decentralized"),

  // ── Rank 91-100 ──────────────────────────────────────────────────────
  usd("106",  "Electronic USD",              "EUSD",   "crypto-backed", "decentralized"),
  usd("154",  "Bucket Protocol BUCK",        "BUCK",   "crypto-backed", "decentralized"),
  eur("55",   "EURA",                        "EURA",   "crypto-backed", "centralized-dependent"),
  usd("303",  "Mezo USD",                    "MUSD",   "crypto-backed", "decentralized"),
  usd("305",  "XSY UTY",                     "UTY",    "crypto-backed", "decentralized"),
  eur("51",   "Stasis Euro",                 "EURS",   "rwa-backed",   "centralized"),
  usd("46",   "USD+",                        "USD+",   "crypto-backed", "centralized-dependent", { yieldBearing: true }),
  usd("63",   "Fantom USD",                  "FUSD",   "crypto-backed", "decentralized"),
  usd("326",  "Metronome Synth USD",         "MSUSD",  "crypto-backed", "decentralized"),
  usd("31",   "SpiceUSD",                    "USDS",   "algorithmic",   "decentralized"),

  // ── Gold-Pegged (not in DefiLlama stablecoins API — data via CoinGecko) ──
  other("gold-xaut", "Tether Gold",              "XAUT",   "rwa-backed",   "centralized",   "GOLD", { rwa: true }),
  other("gold-paxg", "PAX Gold",                 "PAXG",   "rwa-backed",   "centralized",   "GOLD", { rwa: true }),

  // ── Additional EUR-pegged ────────────────────────────────────────────
  eur("49",   "Euro Tether",                     "EURT",   "rwa-backed",   "centralized"),
  eur("52",   "Celo Euro",                       "CEUR",   "algorithmic",   "decentralized"),
  eur("56",   "Parallel",                        "PAR",    "crypto-backed", "decentralized"),
  eur("91",   "Iron Bank EURO",                  "IBEUR",  "crypto-backed", "decentralized"),
  eur("98",   "EUROe Stablecoin",                "EUROe",  "rwa-backed",   "centralized"),
  eur("158",  "VNX EURO",                        "VEUR",   "rwa-backed",   "centralized"),
  eur("239",  "StablR Euro",                     "EURR",   "rwa-backed",   "centralized"),
  eur("247",  "Schuman EUROP",                   "EUROP",  "rwa-backed",   "centralized"),
  eur("319",  "AllUnity EUR",                    "EURAU",  "rwa-backed",   "centralized"),

  // ── Additional CHF-pegged ────────────────────────────────────────────
  other("157","VNX Swiss Franc",                  "VCHF",   "rwa-backed",   "centralized",   "CHF"),

  // ── GBP-pegged ───────────────────────────────────────────────────────
  other("292","VNX British Pound",                "VGBP",   "rwa-backed",   "centralized",   "GBP"),
  other("317","Tokenised GBP",                    "tGBP",   "rwa-backed",   "centralized",   "GBP"),
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
