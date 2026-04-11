/**
 * Run async tasks with a concurrency limit.
 * Designed for Etherscan API calls (5 req/s free tier).
 */
export async function batchFetch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 5
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

/** Maximum block range per getLogs call to avoid Etherscan silent truncation at 1000 results. */
export const MAX_BLOCKS_PER_SYNC = 5000;
