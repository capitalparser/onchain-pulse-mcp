import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthCollateralAaveV3 } from "../../src/adapters/eth_collateral_aave_v3.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const PROVIDER = "0x2f39d218133afab8f2b819b1066c7e434ad94e9e";
const DATA_PROVIDER = "0x1111111111111111111111111111111111111111";
const ORACLE = "0x2222222222222222222222222222222222222222";
const WETH = "0xc02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase();
const ASSETS = [
  WETH,
  "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0".toLowerCase(),
  "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704".toLowerCase(),
  "0xae78736Cd615f374D3085123A210448E74Fc6393".toLowerCase(),
  "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee".toLowerCase(),
  "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38".toLowerCase(),
  "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b".toLowerCase(),
  "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7".toLowerCase(),
  "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8".toLowerCase(),
  "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110".toLowerCase(),
] as const;

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return "0".repeat(24) + address.slice(2).toLowerCase();
}

function configuration(options: {
  decimals?: bigint;
  collateral?: bigint;
  borrowingEnabled?: bigint;
  stableBorrowingEnabled?: bigint;
  active?: bigint;
  frozen?: bigint;
} = {}): string {
  const words = Array.from({ length: 10 }, () => word(0n));
  words[0] = word(options.decimals ?? 18n);
  words[5] = word(options.collateral ?? 1n);
  words[6] = word(options.borrowingEnabled ?? 0n);
  words[7] = word(options.stableBorrowingEnabled ?? 0n);
  words[8] = word(options.active ?? 1n);
  words[9] = word(options.frozen ?? 0n);
  return `0x${words.join("")}`;
}

function batchResult(request: Array<{ id: number; method: string; params: unknown[] }>, mutate?: (items: unknown[]) => unknown[]): unknown[] {
  const items = request.map((item) => {
    if (item.method === "eth_chainId") return { jsonrpc: "2.0", id: item.id, result: "0x1" };
    if (item.method === "eth_getBlockByNumber") {
      return {
        jsonrpc: "2.0", id: item.id,
        result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" },
      };
    }
    const call = item.params[0] as { to: string; data: string };
    if (call.to === PROVIDER && call.data === "0xe860accb") return { jsonrpc: "2.0", id: item.id, result: `0x${addressWord(DATA_PROVIDER)}` };
    if (call.to === PROVIDER && call.data === "0xfca513a8") return { jsonrpc: "2.0", id: item.id, result: `0x${addressWord(ORACLE)}` };
    if (call.to === DATA_PROVIDER && call.data.startsWith("0x3e150141")) return { jsonrpc: "2.0", id: item.id, result: configuration() };
    if (call.to === DATA_PROVIDER && call.data.startsWith("0x51460e25")) {
      const asset = `0x${call.data.slice(-40)}`;
      return { jsonrpc: "2.0", id: item.id, result: `0x${word(asset === WETH ? 2n : 0n)}` };
    }
    if (call.to === ORACLE && call.data.startsWith("0xb3596f07")) return { jsonrpc: "2.0", id: item.id, result: `0x${word(2n)}` };
    throw new Error("unexpected test request");
  });
  return (mutate?.(items) ?? items).reverse();
}

function finalizedFetch(mutate?: (round: number, items: unknown[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const body = JSON.parse(init.body as string) as Array<{ id: number; method: string; params: unknown[] }>;
    return response(batchResult(body, (items) => mutate?.(round, items) ?? items));
  });
}

describe("fetchEthCollateralAaveV3", () => {
  it("returns rpc_not_configured without fetching for absent or blank internal RPC configuration", async () => {
    for (const rpcUrl of [undefined, "", "   "]) {
      const fetchImpl = vi.fn();
      const result = await fetchEthCollateralAaveV3(
        { rpcUrl },
        makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
      );
      expect(result.status).toBe("unavailable");
      expect(result.gaps[0]?.code).toBe("rpc_not_configured");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("verifies one finalized mainnet snapshot in four exact bounded batch rounds", async () => {
    const fetchImpl = finalizedFetch();
    const result = await fetchEthCollateralAaveV3(
      { rpcUrl: "https://rpc.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    expect(result.verified_block).toEqual({ number: 256, hash: `0x${"a".repeat(64)}`, timestamp: 101 });
    expect(result.assets).toHaveLength(10);
    expect(result.metrics.eth_family_supplied).toEqual({ wei_floor: "2", eth_floor: "0.000000000000000002", remainder: "0", denominator: "1" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds.map((round) => round.length)).toEqual([2, 2, 20, 11]);
    expect(rounds.flat().map((request: { id: number }) => request.id)).toHaveLength(35);
    expect(new Set(rounds.flat().map((request: { id: number }) => request.id)).size).toBe(35);
  });

  it("uses independently asserted canonical selectors, calldata, offsets, and one exact finalized tag", async () => {
    const fetchImpl = finalizedFetch();
    await fetchEthCollateralAaveV3(
      { rpcUrl: "https://rpc.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "eth_chainId", params: [] }),
      expect.objectContaining({ method: "eth_getBlockByNumber", params: ["finalized", false] }),
    ]));
    expect(rounds[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "eth_call", params: [{ to: PROVIDER, data: "0xe860accb" }, "0x100"] }),
      expect.objectContaining({ method: "eth_call", params: [{ to: PROVIDER, data: "0xfca513a8" }, "0x100"] }),
    ]));
    expect(rounds[2]).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "eth_call", params: [{ to: DATA_PROVIDER, data: `0x3e150141${WETH.slice(2).padStart(64, "0")}` }, "0x100"] }),
      expect.objectContaining({ method: "eth_call", params: [{ to: DATA_PROVIDER, data: `0x51460e25${WETH.slice(2).padStart(64, "0")}` }, "0x100"] }),
    ]));
    expect(rounds[3].filter((request: { params: [{ data: string }] }) => request.params[0].data === `0xb3596f07${WETH.slice(2).padStart(64, "0")}`)).toHaveLength(2);
    expect(rounds.slice(1).flat().every((request: { params: unknown[] }) => request.params[1] === "0x100")).toBe(true);
  });

  it.each([
    ["a non-mainnet chain", 1, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: "0x89" }, items[1]!], "rpc_chain_mismatch"],
    ["a null finalized block", 1, (items: unknown[]) => [{ ...(items[1] as Record<string, unknown>), result: null }, items[0]!], "rpc_finality_gap"],
    ["a duplicate batch id", 3, (items: unknown[]) => [items[0]!, { ...(items[1] as Record<string, unknown>), id: (items[0] as { id: number }).id }, ...items.slice(2)], "rpc_access_gap"],
    ["a malformed used configuration bool word", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: configuration({ collateral: 2n }) }, ...items.slice(1)], "rpc_schema_drift"],
    ["a malformed unused configuration bool word", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: configuration({ frozen: 2n }) }, ...items.slice(1)], "rpc_schema_drift"],
  ])("rejects %s without producing a partial aggregate", async (_name, failedRound, mutation, expectedCode) => {
    const fetchImpl = finalizedFetch((round, items) => round === failedRound ? mutation(items) : items);
    const result = await fetchEthCollateralAaveV3(
      { rpcUrl: "https://rpc.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.status).toBe("unavailable");
    expect(result.gaps[0]?.code).toBe(expectedCode);
    expect(result.metrics.eth_family_supplied).toBeNull();
    expect(result.assets).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(failedRound);
  });

  it.each([
    ["a missing batch result", 3, (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["an unknown batch id", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: 999 }, ...items.slice(1)], "rpc_access_gap"],
    ["a JSON-RPC error", 3, (items: unknown[]) => [{ jsonrpc: "2.0", id: (items[0] as { id: number }).id, error: { message: "secret provider detail" } }, ...items.slice(1)], "rpc_access_gap"],
    ["a zero resolved data provider", 2, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: `0x${word(0n)}` }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["a malformed resolved data provider", 2, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: "0x1234" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a short configuration tuple", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: `0x${"0".repeat(64 * 9)}` }, ...items.slice(1)], "rpc_schema_drift"],
    ["an extra-word configuration tuple", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: `${configuration()}${word(0n)}` }, ...items.slice(1)], "rpc_schema_drift"],
    ["wrong reserve decimals", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: configuration({ decimals: 17n }) }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["an inactive reserve", 3, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: configuration({ active: 0n }) }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["a zero oracle price", 4, (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), result: `0x${word(0n)}` }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["a mismatched duplicate WETH reference price", 4, (items: unknown[]) => [...items.slice(0, 10), { ...(items[10] as Record<string, unknown>), result: `0x${word(3n)}` }], "rpc_evidence_mismatch"],
  ])("returns no partial total for %s", async (_name, failedRound, mutation, expectedCode) => {
    const fetchImpl = finalizedFetch((round, items) => round === failedRound ? mutation(items) : items);
    const result = await fetchEthCollateralAaveV3(
      { rpcUrl: "https://rpc.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.gaps[0]?.code).toBe(expectedCode);
    expect(result.assets).toEqual([]);
    expect(result.metrics.collateral_eligible_supplied).toBeNull();
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });

  it.each([
    ["a thrown fetch", () => Promise.reject(new Error("secret provider failure"))],
    ["an HTTP non-2xx response", () => response({ message: "secret provider failure" }, false)],
    ["invalid JSON", () => ({ ok: true, json: async () => { throw new Error("secret provider failure"); } } as unknown as Response)],
  ])("maps %s to a bounded access gap without provider details", async (_name, broken) => {
    const fetchImpl = vi.fn().mockImplementation(broken);
    const result = await fetchEthCollateralAaveV3(
      { rpcUrl: "https://rpc.example/credential-secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(result)).not.toContain("secret provider failure");
    expect(JSON.stringify(result)).not.toContain("credential-secret");
  });

  it("does not cache an unavailable failure as verified evidence", async () => {
    const goodFetch = finalizedFetch();
    const fetchImpl = vi.fn((url: string, init: RequestInit) => goodFetch(url, init));
    fetchImpl.mockRejectedValueOnce(new Error("temporary provider failure"));
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const unavailable = await fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/credential" }, ctx);
    const verified = await fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/credential" }, ctx);
    expect(unavailable.gaps[0]?.code).toBe("rpc_access_gap");
    expect(verified.status).toBe("verified");
    expect(goodFetch).toHaveBeenCalledTimes(4);
  });

  it("binds a context to one provider URL and never exposes a rejected URL", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/first-secret" }, ctx);
    const result = await fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/second-secret" }, ctx);
    expect(result.gaps[0]?.code).toBe("rpc_access_gap");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain("second-secret");
  });

  it("coalesces concurrent work and returns only a controlled stale verified fallback after expiry", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      const first = fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/credential" }, ctx);
      const second = fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/credential" }, ctx);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider secret failure"));
      const stale = await fetchEthCollateralAaveV3({ rpcUrl: "https://rpc.example/credential" }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
      expect(stale.source_status.every((status) => status.stale)).toBe(true);
      expect(JSON.stringify(stale)).not.toContain("provider secret failure");
    } finally {
      vi.useRealTimers();
    }
  });
});
