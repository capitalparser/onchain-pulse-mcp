import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  LIDO_STETH_PROXY,
  fetchLidoPooledEthBacking,
} from "../../src/adapters/lido_pooled_eth_rpc.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const RPC_URL = "https://rpc.example/secret";
const SELECTORS = ["0x18160ddd", "0x37cfdaca", "0xd5002f2e", "0xe16a9065", "0x63021d8b", "0x47b714e0", "0x38ac3c55"];

function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }

function finalizedFetch(mutate?: (round: number, items: unknown[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as Array<{ id: number; method: string; params: unknown[] }>;
    const items = requests.map((request) => {
      if (request.method === "eth_chainId") return { jsonrpc: "2.0", id: request.id, result: "0x1" };
      if (request.method === "eth_getBlockByNumber") return {
        jsonrpc: "2.0", id: request.id,
        result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" },
      };
      const call = request.params[0] as { to: string; data: string };
      if (call.to !== LIDO_STETH_PROXY) throw new Error("unexpected proxy");
      const values: Record<string, string> = {
        "0x18160ddd": `0x${word(37n)}`,
        "0x37cfdaca": `0x${word(37n)}`,
        "0xd5002f2e": `0x${word(50n)}`,
        "0xe16a9065": `0x${word(7n)}`,
        "0x63021d8b": `0x${word(10n)}`,
        "0x47b714e0": `0x${word(3n)}`,
        "0x38ac3c55": `0x${[20n, 4n, 3n, 2n].map(word).join("")}`,
      };
      if (values[call.data] === undefined) throw new Error("unexpected selector");
      return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
    });
    return response((mutate?.(round, items) ?? items).reverse());
  });
}

describe("fetchLidoPooledEthBacking", () => {
  it("pins the official Lido stETH proxy literal", () => {
    expect(LIDO_STETH_PROXY).toBe("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
  });

  it("uses exactly two batches, nine logical requests, seven selectors, and one finalized block tag", async () => {
    const fetchImpl = finalizedFetch();
    const result = await fetchLidoPooledEthBacking({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "verified", verified_block: { number: 256, timestamp: 101 } });
    expect(result.metrics).toMatchObject({ total_pooled_eth_wei: "37", internal_pooled_eth_wei: "30", external_pooled_eth_wei: "7" });
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds.map((batch) => batch.length)).toEqual([2, 7]);
    expect(rounds.flat()).toHaveLength(9);
    expect(rounds[1].map((request: { params: [{ to: string; data: string }, string] }) => request.params[0].data)).toEqual(SELECTORS);
    expect(rounds[1].every((request: { params: [{ to: string }, string] }) => request.params[0].to === LIDO_STETH_PROXY && request.params[1] === "0x100")).toBe(true);
  });

  it("returns a bounded unavailable snapshot without fetching when configuration is absent", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchLidoPooledEthBacking({}, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, accounting: null, identities: null });
    expect(result.gaps[0]?.code).toBe("rpc_not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed envelope", 1, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), jsonrpc: "1.0" }, items[1]!], "rpc_access_gap"],
    ["an extra batch item", 2, (items: unknown[]) => [...items, { jsonrpc: "2.0", id: 99, result: "0x0" }], "rpc_access_gap"],
    ["a duplicate id", 2, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: (items[1] as { id: number }).id }, ...items.slice(1)], "rpc_access_gap"],
    ["a missing id", 2, (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["an unknown id", 2, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: 99 }, ...items.slice(1)], "rpc_access_gap"],
    ["a short scalar ABI word", 2, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: "0x1234" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a short balance-stat ABI tuple", 2, (items: unknown[]) => [...items.slice(0, 6), { ...(items[6] as Record<string, unknown>), result: `0x${word(1n)}` }], "rpc_schema_drift"],
    ["a non-mainnet chain", 1, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: "0x2" }, items[1]!], "rpc_chain_mismatch"],
    ["a null finalized block", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as Record<string, unknown>), result: null }], "rpc_finality_gap"],
    ["an accounting identity mismatch", 2, (items: unknown[]) => [...items.slice(0, 3), { ...(items[3] as Record<string, unknown>), result: `0x${word(8n)}` }, ...items.slice(4)], "rpc_evidence_mismatch"],
  ])("fails closed without partials for %s", async (_name, round, mutate, code) => {
    const result = await fetchLidoPooledEthBacking({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: finalizedFetch((actualRound, items) => actualRound === round ? mutate(items) : items) as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, accounting: null, identities: null });
    expect(result.gaps[0]?.code).toBe(code);
  });

  it("binds one provider to a context without exposing either provider URL", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(fetchLidoPooledEthBacking({ rpcUrl: "https://rpc.example/first-secret" }, ctx)).resolves.toMatchObject({ status: "verified" });
    const rejected = await fetchLidoPooledEthBacking({ rpcUrl: "https://rpc.example/rejected-secret" }, ctx);
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejected)).not.toContain("rejected-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("coalesces verified evidence and returns only verified stale evidence after refresh failure", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      await expect(Promise.all([
        fetchLidoPooledEthBacking({ rpcUrl: RPC_URL }, ctx),
        fetchLidoPooledEthBacking({ rpcUrl: RPC_URL }, ctx),
      ])).resolves.toHaveLength(2);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider private detail"));
      const stale = await fetchLidoPooledEthBacking({ rpcUrl: RPC_URL }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
      expect(JSON.stringify(stale)).not.toContain("private detail");
    } finally {
      vi.useRealTimers();
    }
  });
});
