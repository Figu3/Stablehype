/**
 * Fetch with retry and exponential backoff.
 * Returns null if all attempts fail.
 */
export async function fetchWithRetry(
  url: string,
  opts?: RequestInit,
  maxRetries = 2,
  options?: { passthrough404?: boolean }
): Promise<Response | null> {
  const passthrough404 = options?.passthrough404 ?? false;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (res.status === 404 && passthrough404) return res;
      console.warn(`[fetch-retry] ${url} returned ${res.status} (attempt ${i + 1}/${maxRetries + 1})`);
    } catch (err) {
      console.warn(`[fetch-retry] ${url} failed (attempt ${i + 1}/${maxRetries + 1}):`, err);
    }
    if (i < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  return null;
}
