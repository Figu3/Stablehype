/**
 * GET /api/reset-sync-cursor?key=<sync-key>&block=<block-number>
 *
 * Admin endpoint to reset a sync cursor to a specific block.
 * Used to re-sync events that were skipped due to cursor jump-ahead bugs.
 *
 * Valid sync keys: "clear-rebalance-volume", "clear-swap-volume", "safe-gsm-fees"
 */

import { setLastBlock, getLastBlock } from "../lib/db";

const VALID_KEYS = new Set(["clear-rebalance-volume", "clear-swap-volume", "safe-gsm-fees"]);

export async function handleResetSyncCursor(db: D1Database, url: URL): Promise<Response> {
  const key = url.searchParams.get("key");
  const blockStr = url.searchParams.get("block");

  if (!key || !VALID_KEYS.has(key)) {
    return new Response(
      JSON.stringify({ error: `Invalid key. Valid keys: ${[...VALID_KEYS].join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!blockStr || isNaN(Number(blockStr))) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid block parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const newBlock = Number(blockStr);
  const currentBlock = await getLastBlock(db, key);

  await setLastBlock(db, key, newBlock);

  return new Response(
    JSON.stringify({
      key,
      previousBlock: currentBlock,
      newBlock,
      message: `Cursor reset. Will re-sync from block ${newBlock + 1} on next cron run.`,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
