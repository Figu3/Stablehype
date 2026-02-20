/**
 * Simple in-memory sliding-window rate limiter for Cloudflare Workers.
 *
 * Limitations:
 * - State is per-isolate (not shared across Workers instances).
 *   This is adequate for preventing abuse but won't be globally precise.
 * - Entries are lazily evicted to prevent memory growth.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // ms timestamp
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60_000; // run cleanup every 60s
let lastCleanup = 0;

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * Check if a request should be rate-limited.
 * @returns null if allowed, or a Response (429) if rate-limited.
 */
export function checkRateLimit(
  ip: string,
  windowMs = 60_000,
  maxRequests = 120
): Response | null {
  const now = Date.now();
  cleanup(now);

  const entry = store.get(ip);
  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    });
  }

  return null;
}
