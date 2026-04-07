/**
 * Fetch current Ethereum block number via public RPC.
 *
 * Used by depeg detection to attribute events to on-chain blocks.
 * Returns null on any failure — caller should continue without block attribution.
 */
export async function fetchEthBlockNumber(): Promise<number> {
  const res = await fetch("https://cloudflare-eth.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
  });
  const json = await res.json<{ result?: string }>();
  if (!json.result) throw new Error("No result from eth_blockNumber");
  return parseInt(json.result, 16);
}
