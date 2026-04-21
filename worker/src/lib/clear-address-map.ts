/**
 * Address → label mapping for Clear Protocol volume source classification.
 * Used by the API layer to group per-tx rows by source.
 *
 * Swap sources: classified by tx.to (which contract the user called),
 * except CowSwap which is detected by tx.from prefix.
 *
 * Rebalance types: classified by tx.from (who initiated).
 *
 * Type/label/color definitions live in the shared module so the frontend
 * can render the same metadata — see @shared/lib/clear-classification.
 */

import {
  type SwapSource,
  type RebalanceType,
} from "@shared/lib/clear-classification";

export {
  type SwapSource,
  type RebalanceType,
  SWAP_SOURCE_LABELS,
  SWAP_SOURCE_COLORS,
  REBALANCE_TYPE_LABELS,
  REBALANCE_TYPE_COLORS,
} from "@shared/lib/clear-classification";

// ── Swap Source Classification ──────────────────────────────────────────────

/** Map of tx.to address → swap source label */
const SWAP_TO_MAP: Record<string, SwapSource> = {
  // KyberSwap
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "kyberswap", // MetaAggregationRouterV2
  "0x958c09b8c862548de60e21eaf4fd0c1d45fd6cae": "kyberswap", // KyberSwap executor

  // Velora (ParaSwap rebrand)
  "0x6a000f20005980200259b80c5102003040001068": "velora", // Augustus v6
  "0xdef171fe48cf0115b1d80b88dc8eab59176fee57": "velora", // Paraswap v5

  // LI.FI
  "0x89c6340b1a1f4b25d36cd8b063d49045caf3f818": "lifi", // LI.FI Permit2 Proxy 2
  "0xcec212eeaa691850ef307782915d336120b01faf": "lifi", // LI.FI v1
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": "lifi", // LI.FI v2

  // Odos
  "0x365084b05fa7d5028346bd21d842ed0601bab5b8": "odos",       // Odos v2
  "0xcf5540fffcdc3d510b18bfca6d2b9987b0772559": "odos",       // Odos v1
  "0xe08d97e151473a848c3d9ca3f323cb720472d015": "odos",       // Odos v2 Router (6818b contract)

  // 0x Protocol
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x",         // 0x Exchange Proxy
  "0xe66b31678d6c16e9ebf358268a790b763c133750": "0x",         // 0x Settler
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x",         // 0x Allowance Holder

  // 1inch
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch", // 1inch v6
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch", // 1inch v5
  "0x11111112542d85b3ef69ae05771c2dccff4faa26": "1inch", // 1inch v4

  // OKX
  "0x00c600b30fb0400701010f4b080409018b9006e0": "okx", // OKX DEX

  // Bebop
  "0x80eba3855878739f4710233a8a19d89bdd2ffb8e": "bebop", // Bebop

  // OpenOcean
  "0x6352a56caadc4f1e25cd6c75970fa768a3304e64": "openocean", // OpenOcean

  // MetaMask
  "0x881d40237659c251811cec9c364ef91dc08d300c": "metamask", // Metamask Swap
  "0x74de5d4fcbf63e00296fd95d33236b9794016631": "metamask", // Metamask Router

  // Uniswap
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "uniswap", // Uniswap Universal
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "uniswap", // Uniswap SwapRouter02
  "0xe592427a0aece92de3edee1f18e0157c05861564": "uniswap", // Uniswap SwapRouter
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "uniswap", // Uniswap Universal (old)

  // Maverick
  "0x7251febeabb01ec9de53ece7a96f1c951f886dd2": "maverick", // Maverick V2

  // SushiSwap
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "sushiswap", // SushiSwap
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": "sushiswap", // SushiSwap v2

  // DeFiSaver
  "0x8278da54b4a47c0f6f4a0a4b00b6f31678f30181": "defisaver", // DeFiSaver
  "0xc6efe8a67a31e5e1d5a25eedaa7bafcc7e2371b1": "defisaver", // DeFiSaver Recipes
  "0x287778f121f134c66212fb16c9b53ec991d32f5b": "defisaver", // DeFiSaver Exchange

  // Enso
  "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0": "enso", // Enso

  // Beefy
  "0x5cc9400ffb4da168cf271e912f589462c3a00d1f": "beefy", // Beefy Zap Router

  // Synapse
  "0x512000a034e154908efb1ec48579f4ffdb000512": "synapse", // Synapse Intent Router

  // IPOR Fusion (PlasmaVault yield strategies routing swaps through Clear)
  "0x604117f0c94561231060f56cd2ddd16245d434c5": "ipor", // AavEthena Loop Mainnet

  // Direct (Clear Swap contract + known user multisigs)
  "0x35e22bcc2c60c8a721cb36ce47ad562860a2d9cb": "direct", // Clear Swap
  "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d": "direct", // User multisig (Safe)

  // MEV bots (EIP-1167 proxies → 0x26f8fae1... implementation)
  "0x602918c8421e9c1beff8131f80dc3ec818000c76": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x0e18f4a671f241a557e6f760be8c7b97abcb6950": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xecbff987f4c89539570d0c0e6f5809a63ebf3a6e": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xca0240d9ff5180cb2f25499a707033ec25b3ea8e": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x6de6087aa0f1be23e93caf5a5ad89098fff356f5": "mev",  // EIP-1167 proxy → 0x26f8fae1... (routes via KyberSwap)
  "0xe9da86864952e4fbcbd3c3a76174791b26df1f3a": "mev",  // EIP-1167 proxy MEV bot
  "0x856aa2e81503d79960bd25c262e8d7f62cbcc5b7": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xae2fc483527b8ef99eb5d9b44875f005ba1fae13": "mev",  // jaredfromsubway.eth
  "0x56178a0d5f301baf6cf3e1cd53d9863437345bf9": "mev",  // MEV Bot
  "0x00000000003b3cc22af3ae1eac0440bcee416b40": "mev",  // Flashbots
  "0x98c3d3183c4b8a650614ad179a1a98be0a8d6b8e": "mev",  // Sandwich
  "0x6b75d8af000000e20b7a7ddf000ba900b4009a80": "mev",  // Searcher
  "0x280027dd00ee0050d3f9d168efd6b40090009246": "mev",  // MEV Bot
  "0x3b17056cc4439c61cea41fe002a5f5cf7b6f5cce": "mev",  // Arbitrage
  "0xd050e0a4838d74769228b49dff97241b4ef3805d": "mev",  // Flashloan
  "0x74a0121dc0ab16d697b79b59cedeffc626d5e28f": "mev",  // DeFiSaver Bot
  "0xa6b724eb76fd08ceb0f9cf8fe78ba20048c64456": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x6e44412cb3daba84c67addf18cf93736edf3c2cb": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x0328e0b3342d967594dd787add17297e0830aacc": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x2d25ea29a5035f8e9664358cd6542552fb44e0b2": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xd10c6a3ebdc2e309154bf80001747fc2e2985ff8": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x62669b557baf66c273a93a042b92b7279d26fd34": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x2757b9bf327e5234fbd5663851b3f0b88cd96818": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xafa58e2a6ecbce827450a26896d2fa4f01f197f7": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x00eb00c6f847740000884d00e03f00c761998feb": "mev",  // MEV Bot (vanity address)
  "0xb6f54caed61c318027c022c47b94baf139a99dab": "mev",  // MEV Bot
  "0xce4bbe02710ef5d93eb4444859a9ca5bf5ca3da9": "mev",  // MEV Bot (minimal proxy)
  "0xb60d994ad55807cde18a228a513741c17bf0d5c8": "mev",  // MEV Bot (repeated arb)
  "0x1a602bb78af1b9fab3cd073304f0b0786307a781": "mev",  // EIP-1167 proxy → 0x26f8fae1... (MEV factory 0x5300...)
  "0x57d2e4643017f3ba220a1d750293159381d2ee8e": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x59e215fe5b8f97f32a4bd873d6a5def1a3adfa92": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x94a9e3f48e1e01795d60abcdb83604f57302af5a": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xe6a686642eb6e8ef3525875d8ec27236e7f6f815": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x62c0ffef560536aeaccda63c79a683de178e7ab4": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x8b53534eee76a9944b4d892e61406bf2594c06cc": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xadc8fd1d8f32e04790c94da1ed63b564a70f02ae": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x0060afcd2710d2ed03198d062a8f8a07c3833620": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xf4f2b7886cd9d5a9be0b70601ecb64ba31f64cff": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x422618a29c06f56b315060131e19f55e38c88f5d": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xc320d583fca5846d595e0ee19820a04b73ab4bad": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x09616f69b45c103a616207f065b6b48c9c21794d": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x4708c1c2a3e7da6ef78494b258377588aeda5411": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x75e814a3dc5a5352d259007b2a5c8b269c9f0212": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x656c71cc0a16c3f452fd415e0e22af6cbf94f149": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x402905bc98a61e12600bcc9bbd032b2b864578b1": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x5f5a69c717f18fd29ded8bb76f85ab0e31629b3f": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0xfcc92310a0587f5af26d99331b334cc5345469c2": "mev",  // Unverified custom UniV4 arb bot
  "0x58629edffc16825d0ebe66a46bc242e2174f29e9": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x005d5b2969189d63798a1301660682310b2c63af": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x34032f9fb323308521352414a4bfe94cfaaed120": "mev",  // EIP-1167 proxy → 0x26f8fae1...
  "0x262ddd86d213da477cb4c78743905e2cf46708ef": "mev",  // EIP-1167 proxy → 0x26f8fae1...

  // Binance
  "0xb300000b72deaeb607a12d5f54773d1c19c7028d": "binance", // Binance DEX Router

  // deBridge
  "0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251": "debridge", // deBridge Crosschain Forwarder

  // Socket / Bungee
  "0xae68b7117be0026cbd4366303f74eecbb19e4042": "socket", // Socket/Bungee Solver

  // Direct (cont.)
  "0x6af0d71ebd49239058e97901ae92df23ab08f860": "direct", // MetaMask EIP-7702 delegated EOA
};

/**
 * CowSwap solver drivers have addresses starting with 0xc0ffee.
 * However, CoffeeBabe MEV bots also start with 0xc0ffee — we exclude known MEV addresses.
 */
const COWSWAP_FROM_PREFIX = "0xc0ffee";
const COWSWAP_FALSE_POSITIVES: Set<string> = new Set([
  "0xc0ffeebabe5d496b2dde509f9fa189c25cf29671", // Bot using Odos (not a CowSwap solver)
]);

/** Heuristic: addresses with many leading zeros are likely MEV bots */
function looksLikeMevBot(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith("0x00000000")) return true;
  return false;
}

export function classifySwapSource(
  txTo: string,
  txFrom: string,
  dynamicMap?: ReadonlyMap<string, SwapSource>,
): SwapSource {
  // CowSwap check: solver driver address starts with 0xc0ffee (exclude known MEV bots)
  const fromLower = txFrom.toLowerCase();
  if (fromLower.startsWith(COWSWAP_FROM_PREFIX) && !COWSWAP_FALSE_POSITIVES.has(fromLower)) return "cowswap";
  const toLower = txTo.toLowerCase();
  // Known router/aggregator check
  const known = SWAP_TO_MAP[toLower];
  if (known) return known;
  // Bytecode-derived classifications populated by the sync cron
  // (see syncSwapVolume → classifyUnknownAddresses)
  const dynamic = dynamicMap?.get(toLower);
  if (dynamic) return dynamic;
  // Heuristic MEV bot detection for unlisted addresses
  if (looksLikeMevBot(txTo)) return "mev";
  return "other";
}

/** True when `classifySwapSource` would fall through to "other" without extra info. */
export function isAddressUnclassified(txTo: string): boolean {
  const toLower = txTo.toLowerCase();
  if (SWAP_TO_MAP[toLower]) return false;
  if (looksLikeMevBot(toLower)) return false;
  return true;
}

// ── Rebalance Type Classification ───────────────────────────────────────────

/** Addresses that trigger external rebalances */
const EXTERNAL_REBALANCE_FROM: Set<string> = new Set([
  "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d", // Clear team Safe
  "0xfd86faef607a67ed68f7c29042e022196f21de10", // External rebalance Agent
]);

export function classifyRebalanceType(txFrom: string): RebalanceType {
  return EXTERNAL_REBALANCE_FROM.has(txFrom.toLowerCase()) ? "external" : "internal";
}
