import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcGetLogsMulti, rpcGetTxStrict } from "../rpc";

const reply = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));

afterEach(() => vi.unstubAllGlobals());

describe("strict rpc", () => {
  it("returns logs", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: [{ address: "0x1" }] });
    await expect(rpcGetLogsMulti("u", ["0x1"], 1, 2)).resolves.toHaveLength(1);
  });
  it("throws on the RouteMesh HTTP 200 fault body", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: { success: false, message: "gateway_timeout" } });
    await expect(rpcGetLogsMulti("u", ["0x1"], 1, 2)).rejects.toThrow(/not an array/);
  });
  it("throws when a tx is missing", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: null });
    await expect(rpcGetTxStrict("u", "0xabc")).rejects.toThrow(/0xabc/);
  });
});
