import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthCollateralSpark } from "../../src/adapters/eth_collateral_spark.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const PROVIDER = "0x02c3ea4e34c0cbd694d2adfa2c690eecbc1793ee";
const DATA_PROVIDER = "0x1111111111111111111111111111111111111111";
const ORACLE = "0x2222222222222222222222222222222222222222";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }
function addressWord(address: string): string { return "0".repeat(24) + address.slice(2).toLowerCase(); }
function configuration(options: { decimals?: bigint; collateral?: bigint; active?: bigint } = {}): string {
  const words = Array.from({ length: 10 }, () => word(0n));
  words[0] = word(options.decimals ?? 18n);
  words[5] = word(options.collateral ?? 1n);
  words[8] = word(options.active ?? 1n);
  return `0x${words.join("")}`;
}

function finalizedFetch(mutate?: (round: number, results: unknown[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as Array<{ id: number; method: string; params: unknown[] }>;
    const results = requests.map((request) => {
      if (request.method === "eth_chainId") return { jsonrpc: "2.0", id: request.id, result: "0x1" };
      if (request.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: request.id, result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" } };
      const call = request.params[0] as { to: string; data: string };
      if (call.to === PROVIDER && call.data === "0xe860accb") return { jsonrpc: "2.0", id: request.id, result: `0x${addressWord(DATA_PROVIDER)}` };
      if (call.to === PROVIDER && call.data === "0xfca513a8") return { jsonrpc: "2.0", id: request.id, result: `0x${addressWord(ORACLE)}` };
      if (call.to === DATA_PROVIDER && call.data.startsWith("0x3e150141")) return { jsonrpc: "2.0", id: request.id, result: configuration() };
      if (call.to === DATA_PROVIDER && call.data.startsWith("0x51460e25")) return { jsonrpc: "2.0", id: request.id, result: `0x${word(call.data.endsWith(WETH.slice(2)) ? 2n : 0n)}` };
      if (call.to === ORACLE && call.data.startsWith("0xb3596f07")) return { jsonrpc: "2.0", id: request.id, result: `0x${word(2n)}` };
      throw new Error("unexpected request");
    });
    return response((mutate?.(round, results) ?? results).reverse());
  });
}

describe("fetchEthCollateralSpark", () => {
  it("verifies exactly six Spark reserves in four rounds and 23 calls", async () => {
    const fetchImpl = finalizedFetch();
    const result = await fetchEthCollateralSpark({ rpcUrl: "https://rpc.example/secret" }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status).toBe("verified");
    expect(result.assets).toHaveLength(6);
    expect(result.metrics).toMatchObject({ combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null, gross_eth_collateral: null, rehypothecation_ratio: null });
    expect(result.gaps.map((gap) => gap.code)).toContain("aave_spark_overlap_not_reconciled");
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds.map((items) => items.length)).toEqual([2, 2, 12, 7]);
    expect(rounds.flat()).toHaveLength(23);
  });

  it.each([
    ["missing configuration", undefined, "rpc_not_configured"],
    ["a malformed reserve tuple", finalizedFetch((round, items) => round === 3 ? [{ ...(items[0] as Record<string, unknown>), result: "0x1234" }, ...items.slice(1)] : items), "rpc_schema_drift"],
    ["a zero price", finalizedFetch((round, items) => round === 4 ? [{ ...(items[0] as Record<string, unknown>), result: `0x${word(0n)}` }, ...items.slice(1)] : items), "rpc_evidence_mismatch"],
  ])("returns no partial Spark snapshot for %s", async (_name, fetchImpl, code) => {
    const result = await fetchEthCollateralSpark({ rpcUrl: fetchImpl === undefined ? undefined : "https://rpc.example/secret" }, makeContext({ env, fetchImpl: (fetchImpl ?? vi.fn()) as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, assets: [], identities: null });
    expect(result.gaps[0]?.code).toBe(code);
  });

  it("coalesces raw work and translates stale evidence without provider details", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      await expect(Promise.all([
        fetchEthCollateralSpark({ rpcUrl: "https://rpc.example/secret" }, ctx),
        fetchEthCollateralSpark({ rpcUrl: "https://rpc.example/secret" }, ctx),
      ])).resolves.toHaveLength(2);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider secret detail"));
      const stale = await fetchEthCollateralSpark({ rpcUrl: "https://rpc.example/secret" }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
      expect(JSON.stringify(stale)).not.toContain("secret detail");
    } finally { vi.useRealTimers(); }
  });
});
