import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  fetchFinalizedAaveV3Market,
  type FinalizedAaveV3MarketSpec,
} from "../../src/adapters/aave_v3_market_rpc.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const PROVIDER = "0x2f39d218133afab8f2b819b1066c7e434ad94e9e";
const DATA_PROVIDER = "0x1111111111111111111111111111111111111111";
const ORACLE = "0x2222222222222222222222222222222222222222";
const WETH = "0xc02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase();

function assets(count: number): FinalizedAaveV3MarketSpec["assets"] {
  return Array.from({ length: count }, (_, index) => ({
    symbol: index === 0 ? "WETH" : `ETH${index}`,
    underlying: index === 0
      ? WETH
      : `0x${(index + 1).toString(16).padStart(40, "0")}`,
  }));
}

function spec(marketId: string, count: number, cacheName = `aave_v3_market_rpc_${marketId}`): FinalizedAaveV3MarketSpec {
  return { marketId, cacheName, poolAddressesProvider: PROVIDER, assets: assets(count) };
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return "0".repeat(24) + address.slice(2).toLowerCase();
}

function configuration(options: { decimals?: bigint; collateral?: bigint; active?: bigint; frozen?: bigint } = {}): string {
  const words = Array.from({ length: 10 }, () => word(0n));
  words[0] = word(options.decimals ?? 18n);
  words[5] = word(options.collateral ?? 1n);
  words[8] = word(options.active ?? 1n);
  words[9] = word(options.frozen ?? 0n);
  return `0x${words.join("")}`;
}

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
      if (call.to === PROVIDER && call.data === "0xe860accb") return { jsonrpc: "2.0", id: request.id, result: `0x${addressWord(DATA_PROVIDER)}` };
      if (call.to === PROVIDER && call.data === "0xfca513a8") return { jsonrpc: "2.0", id: request.id, result: `0x${addressWord(ORACLE)}` };
      if (call.to === DATA_PROVIDER && call.data.startsWith("0x3e150141")) return { jsonrpc: "2.0", id: request.id, result: configuration() };
      if (call.to === DATA_PROVIDER && call.data.startsWith("0x51460e25")) return { jsonrpc: "2.0", id: request.id, result: `0x${word(call.data.endsWith(WETH.slice(2)) ? 2n : 0n)}` };
      if (call.to === ORACLE && call.data.startsWith("0xb3596f07")) return { jsonrpc: "2.0", id: request.id, result: `0x${word(2n)}` };
      throw new Error("unexpected test request");
    });
    return response((mutate?.(round, items) ?? items).reverse());
  });
}

describe("fetchFinalizedAaveV3Market", () => {
  it("uses the exact official Aave V3 Core PoolAddressesProvider literal", () => {
    expect(PROVIDER).toBe("0x2f39d218133afab8f2b819b1066c7e434ad94e9e");
  });

  it.each([[10, 35, [2, 2, 20, 11]], [6, 23, [2, 2, 12, 7]]])(
    "verifies %i fixed assets in exactly four rounds and %i logical calls",
    async (count, calls, rounds) => {
      const fetchImpl = finalizedFetch();
      const result = await fetchFinalizedAaveV3Market(spec(`market-${count}`, count), { rpcUrl: "https://rpc.example/secret" }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
      expect(result.status).toBe("verified");
      if (result.status === "verified") {
        expect(result.evidence.reserves).toHaveLength(count);
        expect(result.evidence.block).toEqual({ number: 256, hash: `0x${"a".repeat(64)}`, timestamp: 101 });
        expect(result.stale).toBe(false);
      }
      const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
      expect(bodies.map((body) => body.length)).toEqual(rounds);
      expect(bodies.flat()).toHaveLength(calls);
    },
  );

  it.each([
    ["empty assets", { ...spec("empty", 1), assets: [] }],
    ["duplicate underlying", { ...spec("duplicate", 2), assets: [assets(1)[0]!, { symbol: "ETH1", underlying: WETH }] }],
    ["malformed provider", { ...spec("bad-provider", 1), poolAddressesProvider: "nope" }],
    ["missing WETH", { ...spec("no-weth", 1), assets: [{ symbol: "ETH1", underlying: WETH }] }],
  ])("fails closed before fetching for %s specs", async (_name, badSpec) => {
    const fetchImpl = vi.fn();
    const result = await fetchFinalizedAaveV3Market(badSpec, { rpcUrl: "https://rpc.example/secret" }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toEqual({ status: "unavailable", code: "rpc_evidence_mismatch" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a NUL-delimited alias symbol", `ETH1\u0000${"0x0000000000000000000000000000000000000003"}\u0000ETH2`],
    ["a control-character symbol", "ETH\u0001"],
    ["a delimiter symbol", "ETH\u0000NEXT"],
    ["an oversized symbol", "A".repeat(17)],
  ])("rejects %s before cache identity or fetch", async (_name, symbol) => {
    const fetchImpl = vi.fn();
    const badSpec = { ...spec("symbol-validation", 2), assets: [assets(1)[0]!, { symbol, underlying: "0x0000000000000000000000000000000000000002" }] };
    const result = await fetchFinalizedAaveV3Market(badSpec, { rpcUrl: "https://rpc.example/secret" }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toEqual({ status: "unavailable", code: "rpc_evidence_mismatch" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("isolates provider binding and raw caches by market in one context", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(fetchFinalizedAaveV3Market(spec("aave", 10, "same-cache"), { rpcUrl: "https://rpc.example/first" }, ctx)).resolves.toMatchObject({ status: "verified" });
    await expect(fetchFinalizedAaveV3Market(spec("spark", 6, "same-cache"), { rpcUrl: "https://rpc.example/second" }, ctx)).resolves.toMatchObject({ status: "verified" });
    const rejected = await fetchFinalizedAaveV3Market(spec("aave", 10, "same-cache"), { rpcUrl: "https://rpc.example/rejected" }, ctx);
    expect(rejected).toEqual({ status: "unavailable", code: "rpc_access_gap" });
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(JSON.stringify(rejected)).not.toContain("rejected");
  });

  it("rejects a same-market spec drift and never exposes cached raw evidence to caller mutation", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const stableSpec = spec("immutable", 6, "shared-cache");
    const first = await fetchFinalizedAaveV3Market(stableSpec, { rpcUrl: "https://rpc.example/secret" }, ctx);
    expect(first.status).toBe("verified");
    if (first.status !== "verified") return;
    (first.evidence.reserves[0] as { suppliedRaw: bigint }).suppliedRaw = 999n;
    const second = await fetchFinalizedAaveV3Market(stableSpec, { rpcUrl: "https://rpc.example/secret" }, ctx);
    expect(second).toMatchObject({ status: "verified", stale: false });
    if (second.status === "verified") expect(second.evidence.reserves[0]?.suppliedRaw).toBe(2n);
    const drifted = await fetchFinalizedAaveV3Market(
      { ...stableSpec, assets: [{ ...stableSpec.assets[0]!, underlying: "0x0000000000000000000000000000000000000009" }, ...stableSpec.assets.slice(1)] },
      { rpcUrl: "https://rpc.example/secret" },
      ctx,
    );
    expect(drifted).toEqual({ status: "unavailable", code: "rpc_evidence_mismatch" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not alias distinct same-market accepted asset symbols", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const stableSpec = spec("symbol-drift", 2, "symbol-cache");
    await expect(fetchFinalizedAaveV3Market(stableSpec, { rpcUrl: "https://rpc.example/secret" }, ctx)).resolves.toMatchObject({ status: "verified" });
    const drifted = await fetchFinalizedAaveV3Market(
      { ...stableSpec, assets: [stableSpec.assets[0]!, { ...stableSpec.assets[1]!, symbol: "stETH" }] },
      { rpcUrl: "https://rpc.example/secret" },
      ctx,
    );
    expect(drifted).toEqual({ status: "unavailable", code: "rpc_evidence_mismatch" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["malformed batch envelope", 1, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: 99 }, items[1]!], "rpc_access_gap"],
    ["missing finalized block", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as Record<string, unknown>), result: null }], "rpc_finality_gap"],
    ["noncanonical ABI bool", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: configuration({ frozen: 2n }) }, ...items.slice(1)], "rpc_schema_drift"],
  ])("returns a bounded no-partial failure for %s", async (_name, round, mutate, code) => {
    const result = await fetchFinalizedAaveV3Market(spec("failure", 6), { rpcUrl: "https://rpc.example/secret" }, makeContext({ env, fetchImpl: finalizedFetch((actualRound, items) => actualRound === round ? mutate(items) : items) as unknown as typeof fetch }));
    expect(result).toEqual({ status: "unavailable", code });
  });

  it("coalesces verified work and returns stale normalized evidence after an expired refresh failure", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      await expect(Promise.all([
        fetchFinalizedAaveV3Market(spec("coalesce", 6), { rpcUrl: "https://rpc.example/secret" }, ctx),
        fetchFinalizedAaveV3Market(spec("coalesce", 6), { rpcUrl: "https://rpc.example/secret" }, ctx),
      ])).resolves.toHaveLength(2);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider credential detail"));
      const stale = await fetchFinalizedAaveV3Market(spec("coalesce", 6), { rpcUrl: "https://rpc.example/secret" }, ctx);
      expect(stale).toMatchObject({ status: "verified", stale: true });
      expect(JSON.stringify(stale, (_key, value) => typeof value === "bigint" ? value.toString() : value)).not.toContain("credential detail");
    } finally {
      vi.useRealTimers();
    }
  });
});
