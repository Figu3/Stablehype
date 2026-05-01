/**
 * HMAC SHA-256 verification using Web Crypto. Used by /api/seve/event
 * to authenticate the bot's telemetry pushes without a long-lived
 * bearer token.
 *
 * The bot signs `request.body` (raw bytes, exactly as serialized) with
 * a shared secret. The signature is the lowercase hex digest, sent in
 * the `X-Seve-Signature` header. We recompute and compare with
 * crypto.subtle.timingSafeEqual.
 */

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifyHmacHex(
  body: string,
  signatureHex: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signatureHex) return false;
  // Hex must be 64 chars (32 bytes). Reject anything else early.
  if (signatureHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(signatureHex)) {
    return false;
  }
  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(body)),
  );
  const provided = hexToBytes(signatureHex);
  if (provided.byteLength !== expected.byteLength) return false;
  return crypto.subtle.timingSafeEqual(expected, provided);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
