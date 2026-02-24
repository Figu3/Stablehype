/**
 * API key authentication utility for bot-facing endpoints.
 * Uses timing-safe comparison to prevent timing attacks.
 */

/** Timing-safe string comparison */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) {
    // Compare against self to keep constant time, then return false
    crypto.subtle.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

/**
 * Validates the X-Api-Key header against the configured secret.
 * Returns null if authorized, or a 401 Response if not.
 */
export function requireApiKey(
  request: Request | undefined,
  apiKey: string | undefined
): Response | null {
  const provided = request?.headers.get("X-Api-Key");
  if (!apiKey || !provided || !timingSafeCompare(provided, apiKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
