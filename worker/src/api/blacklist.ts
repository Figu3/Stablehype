export async function handleBlacklist(db: D1Database): Promise<Response> {
  const result = await db
    .prepare("SELECT * FROM blacklist_events ORDER BY timestamp DESC")
    .all<{
      id: string;
      stablecoin: string;
      chain_id: string;
      chain_name: string;
      event_type: string;
      address: string;
      amount: number | null;
      tx_hash: string;
      block_number: number;
      timestamp: number;
      explorer_tx_url: string;
      explorer_address_url: string;
    }>();

  // Map snake_case DB columns to camelCase to match BlacklistEvent interface
  const events = result.results.map((row) => ({
    id: row.id,
    stablecoin: row.stablecoin,
    chainId: row.chain_id,
    chainName: row.chain_name,
    eventType: row.event_type,
    address: row.address,
    amount: row.amount,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    timestamp: row.timestamp,
    explorerTxUrl: row.explorer_tx_url,
    explorerAddressUrl: row.explorer_address_url,
  }));

  return new Response(JSON.stringify(events), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
