import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  fetchEigenLayerEthRestakingExposure,
  fetchFreshEigenLayerEthRestakingExposure,
} from "../../src/adapters/eigenlayer_eth_restaking_rpc.js";
import { EIGENLAYER_CORE_CONTRACTS, EIGENLAYER_ETH_LST_STRATEGIES } from "../../src/eigenlayer_eth_restaking/types.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const RPC_URL = "https://rpc.example/credential-secret";
const TOKENS = EIGENLAYER_ETH_LST_STRATEGIES.map((_, index) => `0x${(index + 101).toString(16).padStart(40, "0")}`);
const SELECTORS = {
  smDelegation: "0xdf5cf723",
  epmDelegationManager: "0xea4d3c9b",
  beaconChainEthStrategy: "0x9104c319",
  numPods: "0xa6a509be",
  burnableEthShares: "0xf5d4fed3",
  whitelisted: "0x663c1de4",
  strategyManager: "0x39b70e38",
  underlyingToken: "0x2495a599",
  totalShares: "0x3a98ef39",
  decimals: "0x313ce567",
  balanceOf: "0x70a08231",
  sharesToUnderlying: "0x7a8b2637",
} as const;

function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return `0x${value.toString(16).padStart(64, "0")}`; }
function addressWord(value: string): string { return `0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`; }
function addressArg(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function uintArg(value: bigint): string { return value.toString(16).padStart(64, "0"); }

interface RequestShape { id: number; method: string; params: unknown[] }

function resultFor(request: RequestShape): unknown {
  if (request.method === "eth_chainId") return { jsonrpc: "2.0", id: request.id, result: "0x1" };
  if (request.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: request.id, result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" } };
  const call = request.params[0] as { to: string; data: string };
  const to = call.to.toLowerCase();
  if (to === EIGENLAYER_CORE_CONTRACTS.strategy_manager.toLowerCase()) {
    if (call.data === SELECTORS.smDelegation) return { jsonrpc: "2.0", id: request.id, result: addressWord(EIGENLAYER_CORE_CONTRACTS.delegation_manager) };
    const index = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((item) => call.data === `${SELECTORS.whitelisted}${addressArg(item.strategy)}`);
    if (index >= 0) return { jsonrpc: "2.0", id: request.id, result: word(index % 2 === 0 ? 1n : 0n) };
  }
  if (to === EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager.toLowerCase()) {
    const values: Record<string, string> = {
      [SELECTORS.epmDelegationManager]: addressWord(EIGENLAYER_CORE_CONTRACTS.delegation_manager),
      [SELECTORS.beaconChainEthStrategy]: addressWord(EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy),
      [SELECTORS.numPods]: word(12n),
      [SELECTORS.burnableEthShares]: word(3n),
    };
    if (values[call.data] !== undefined) return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
  }
  const strategyIndex = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((item) => item.strategy.toLowerCase() === to);
  if (strategyIndex >= 0) {
    const values: Record<string, string> = {
      [SELECTORS.strategyManager]: addressWord(EIGENLAYER_CORE_CONTRACTS.strategy_manager),
      [SELECTORS.underlyingToken]: addressWord(TOKENS[strategyIndex]!),
      [SELECTORS.totalShares]: word(BigInt(strategyIndex + 10)),
      [`${SELECTORS.sharesToUnderlying}${uintArg(BigInt(strategyIndex + 10))}`]: word(BigInt(strategyIndex === 0 ? 21 : strategyIndex + 15)),
    };
    if (values[call.data] !== undefined) return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
  }
  const tokenIndex = TOKENS.findIndex((token) => token.toLowerCase() === to);
  if (tokenIndex >= 0) {
    if (call.data === SELECTORS.decimals) {
      return { jsonrpc: "2.0", id: request.id, result: word(BigInt(tokenIndex === 0 ? 8 : 18)) };
    }
    if (call.data.startsWith(SELECTORS.balanceOf)) {
      const strategyIndex = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((fixed) => call.data === `${SELECTORS.balanceOf}${addressArg(fixed.strategy)}`);
      if (strategyIndex >= 0) return { jsonrpc: "2.0", id: request.id, result: word(BigInt(strategyIndex + 20)) };
    }
  }
  throw new Error("unexpected test request");
}

function finalizedFetch(mutate?: (round: number, items: unknown[], requests: RequestShape[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as RequestShape[];
    const items = requests.map(resultFor);
    return response((mutate?.(round, items, requests) ?? items).reverse());
  });
}

describe("fetchEigenLayerEthRestakingExposure", () => {
  it("returns bounded unavailable output without an internal RPC URL", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchEigenLayerEthRestakingExposure({}, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toMatchObject({
      status: "unavailable",
      verified_block: null,
      core_contracts: null,
      strategies: [],
      native_diagnostics: null,
    });
    expect(result.gaps).toEqual([{ code: "rpc_not_configured", detail: "Ethereum RPC is not configured." }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies the exact finalized four-batch, ninety-one-request contract", async () => {
    const fetchImpl = finalizedFetch();
    const result = await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result).toMatchObject({
      status: "verified",
      verified_block: { number: 256, timestamp: 101 },
      native_diagnostics: { num_pods: "12", burnable_eth_shares: "3" },
    });
    expect(result.strategies).toHaveLength(12);
    expect(result.strategies[0]).toMatchObject({ decimals: 8, token_custody: "20", share_accounting_underlying: "21", share_quote_exceeds_custody: true });
    expect(result.strategies[1]?.whitelisted).toBe(false);
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as RequestShape[]);
    expect(rounds.map((round) => round.length)).toEqual([2, 5, 48, 36]);
    expect(rounds.flat()).toHaveLength(91);
    expect(rounds.flat().map((request) => request.id)).toEqual(Array.from({ length: 91 }, (_, index) => index + 1));
    expect(rounds.slice(1).flat().every((request) => request.params[1] === "0x100")).toBe(true);
    expect(rounds.slice(1).flat().every((request) => (request.params[0] as { to: string }).to.toLowerCase() !== EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy.toLowerCase())).toBe(true);
  });

  it("uses the exact selector, target, argument, and finalized-tag order", async () => {
    const fetchImpl = finalizedFetch();
    await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as RequestShape[]);
    expect(rounds[1]!.map((request) => request.params[0])).toEqual([
      { to: EIGENLAYER_CORE_CONTRACTS.strategy_manager, data: SELECTORS.smDelegation },
      { to: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, data: SELECTORS.epmDelegationManager },
      { to: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, data: SELECTORS.beaconChainEthStrategy },
      { to: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, data: SELECTORS.numPods },
      { to: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, data: SELECTORS.burnableEthShares },
    ]);
    expect(rounds[2]!.map((request) => request.params[0])).toEqual(EIGENLAYER_ETH_LST_STRATEGIES.flatMap((fixed) => [
      { to: EIGENLAYER_CORE_CONTRACTS.strategy_manager, data: `${SELECTORS.whitelisted}${addressArg(fixed.strategy)}` },
      { to: fixed.strategy, data: SELECTORS.strategyManager },
      { to: fixed.strategy, data: SELECTORS.underlyingToken },
      { to: fixed.strategy, data: SELECTORS.totalShares },
    ]));
    expect(rounds[3]!.map((request) => request.params[0])).toEqual(EIGENLAYER_ETH_LST_STRATEGIES.flatMap((fixed, index) => [
      { to: TOKENS[index], data: SELECTORS.decimals },
      { to: TOKENS[index], data: `${SELECTORS.balanceOf}${addressArg(fixed.strategy)}` },
      { to: fixed.strategy, data: `${SELECTORS.sharesToUnderlying}${uintArg(BigInt(index + 10))}` },
    ]));
    expect(rounds.slice(1).flat()).toHaveLength(89);
    expect(rounds.slice(1).flat().every((request) => request.method === "eth_call" && request.params[1] === "0x100")).toBe(true);
  });

  it.each([
    ["an extra response", 2, (items: unknown[]) => [...items, { jsonrpc: "2.0", id: 999, result: "0x0" }], "rpc_access_gap"],
    ["a missing response", 3, (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["a duplicate response id", 3, (items: unknown[]) => [{ ...(items[0] as object), id: (items[1] as { id: number }).id }, ...items.slice(1)], "rpc_access_gap"],
    ["an envelope with an extra key", 1, (items: unknown[]) => [{ ...(items[0] as object), extra: true }, items[1]!], "rpc_access_gap"],
    ["a wrong JSON-RPC version", 1, (items: unknown[]) => [{ ...(items[0] as object), jsonrpc: "1.0" }, items[1]!], "rpc_access_gap"],
    ["a nonnumeric response id", 1, (items: unknown[]) => [{ ...(items[0] as object), id: "1" }, items[1]!], "rpc_access_gap"],
    ["a non-mainnet chain", 1, (items: unknown[]) => [{ ...(items[0] as object), result: "0x2" }, items[1]!], "rpc_chain_mismatch"],
    ["a noncanonical chain quantity", 1, (items: unknown[]) => [{ ...(items[0] as object), result: "0x01" }, items[1]!], "rpc_schema_drift"],
    ["a null finalized block", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: null }], "rpc_finality_gap"],
    ["an unsafe finalized block number", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: { number: "0x20000000000000", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" } }], "rpc_schema_drift"],
    ["an unsafe finalized block timestamp", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x20000000000000" } }], "rpc_schema_drift"],
    ["a noncanonical finalized hash", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: { number: "0x100", hash: `0x${"A".repeat(64)}`, timestamp: "0x65" } }], "rpc_schema_drift"],
    ["a substituted core delegation", 2, (items: unknown[]) => [{ ...(items[0] as object), result: addressWord(TOKENS[0]!) }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["a high-nonzero address padding", 2, (items: unknown[]) => [{ ...(items[0] as object), result: `0x${"1".repeat(24)}${EIGENLAYER_CORE_CONTRACTS.delegation_manager.slice(2).toLowerCase()}` }, ...items.slice(1)], "rpc_schema_drift"],
    ["a zero core address", 2, (items: unknown[]) => [{ ...(items[0] as object), result: word(0n) }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["a non-boolean whitelist word", 3, (items: unknown[]) => [{ ...(items[0] as object), result: word(2n) }, ...items.slice(1)], "rpc_schema_drift"],
    ["a short whitelist word", 3, (items: unknown[]) => [{ ...(items[0] as object), result: "0x1" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a substituted strategy manager", 3, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: addressWord(TOKENS[0]!) }, ...items.slice(2)], "rpc_evidence_mismatch"],
    ["a duplicate underlying token", 3, (items: unknown[]) => [...items.slice(0, 6), { ...(items[6] as object), result: (items[2] as { result: string }).result }, ...items.slice(7)], "rpc_evidence_mismatch"],
    ["a zero underlying token", 3, (items: unknown[]) => [...items.slice(0, 2), { ...(items[2] as object), result: word(0n) }, ...items.slice(3)], "rpc_evidence_mismatch"],
    ["a short total-shares word", 3, (items: unknown[]) => [...items.slice(0, 3), { ...(items[3] as object), result: "0x1" }, ...items.slice(4)], "rpc_schema_drift"],
    ["decimals with nonzero uint8 high bits", 4, (items: unknown[]) => [{ ...(items[0] as object), result: word(256n) }, ...items.slice(1)], "rpc_schema_drift"],
    ["a short decimals word", 4, (items: unknown[]) => [{ ...(items[0] as object), result: "0x12" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a short custody word", 4, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: "0x14" }, ...items.slice(2)], "rpc_schema_drift"],
    ["a short share-accounting word", 4, (items: unknown[]) => [...items.slice(0, 2), { ...(items[2] as object), result: "0x15" }, ...items.slice(3)], "rpc_schema_drift"],
  ] as const)("fails closed with no partial evidence for %s", async (_name, round, mutate, code) => {
    const result = await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: RPC_URL },
      makeContext({
        env,
        fetchImpl: finalizedFetch((actualRound, items) => actualRound === round ? mutate(items) : items) as unknown as typeof fetch,
      }),
    );
    expect(result).toMatchObject({
      status: "unavailable",
      verified_block: null,
      core_contracts: null,
      strategies: [],
      native_diagnostics: null,
    });
    expect(result.gaps).toEqual([{ code, detail: expect.any(String) }]);
  });

  it("coalesces concurrent loads and reuses only verified fresh evidence", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [first, second] = await Promise.all([
      fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx),
      fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx),
    ]);
    expect(first.status).toBe("verified");
    expect(second.status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const cached = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(cached.status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("keeps the shared fresh-only verifier outside the unchanged public cache and stale fallback", async () => {
    const fetchImpl = finalizedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const fresh = await fetchFreshEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(fresh.status).toBe("verified");
    expect(fresh.source_status[0]?.stale).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(8);

    const rejectedProvider = await fetchFreshEigenLayerEthRestakingExposure(
      { rpcUrl: "https://rpc.example/other-secret" },
      ctx,
    );
    expect(rejectedProvider).toMatchObject({ status: "unavailable", strategies: [], native_diagnostics: null });
    expect(rejectedProvider.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejectedProvider)).not.toContain("other-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(8);

    fetchImpl.mockRejectedValueOnce(new Error("private refresh failure"));
    const failedFresh = await fetchFreshEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(failedFresh).toMatchObject({ status: "unavailable", strategies: [], native_diagnostics: null });
    expect(failedFresh.gaps[0]?.code).toBe("rpc_access_gap");
    expect(failedFresh.gaps.some((gap) => gap.code === "source_stale")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(9);

    const stillPublicCached = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(stillPublicCached.status).toBe("verified");
    expect(stillPublicCached.source_status[0]?.stale).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(9);
  });

  it("accepts the full canonical uint8 decimals range", async () => {
    const fetchImpl = finalizedFetch((round, items) => round === 4
      ? [{ ...(items[0] as object), result: word(255n) }, ...items.slice(1)]
      : items);
    const result = await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.status).toBe("verified");
    expect(result.strategies[0]?.decimals).toBe(255);
  });

  it("binds providers per context while suppressing provider URLs and error text", async () => {
    const firstFetch = finalizedFetch();
    const firstContext = makeContext({ env, fetchImpl: firstFetch as unknown as typeof fetch });
    expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, firstContext)).status).toBe("verified");
    const rejected = await fetchEigenLayerEthRestakingExposure({ rpcUrl: "https://rpc.example/other-secret" }, firstContext);
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejected)).not.toMatch(/credential-secret|other-secret/);
    expect(firstFetch).toHaveBeenCalledTimes(4);

    const secondFetch = finalizedFetch();
    const isolated = await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: "https://rpc.example/other-secret" },
      makeContext({ env, fetchImpl: secondFetch as unknown as typeof fetch }),
    );
    expect(isolated.status).toBe("verified");
    expect(secondFetch).toHaveBeenCalledTimes(4);

    const privateError = "provider private detail credential-secret";
    const failed = await fetchEigenLayerEthRestakingExposure(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: vi.fn(async () => { throw new Error(privateError); }) as unknown as typeof fetch }),
    );
    expect(failed.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(failed)).not.toMatch(/private detail|credential-secret/);
  });

  it("returns stale verified evidence only after a verified cache entry expires", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider private detail"));
      const stale = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.source_status[0]?.stale).toBe(true);
      expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
      expect(JSON.stringify(stale)).not.toContain("private detail");
      expect(fetchImpl).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache evidence rejected by the final Task 1 domain assertion", async () => {
    const fetchImpl = finalizedFetch((round, items) => {
      const attemptRound = ((round - 1) % 4) + 1;
      return attemptRound === 3
        ? [...items.slice(0, 6), { ...(items[6] as object), result: (items[2] as { result: string }).result }, ...items.slice(7)]
        : items;
    });
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    const second = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(first).toMatchObject({ status: "unavailable", strategies: [], native_diagnostics: null });
    expect(second).toMatchObject({ status: "unavailable", strategies: [], native_diagnostics: null });
    expect(first.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(second.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it("does not cache a final-batch uint256 overflow", async () => {
    const fetchImpl = finalizedFetch((round, items) => {
      const attemptRound = ((round - 1) % 4) + 1;
      return attemptRound === 4
        ? [...items.slice(0, 2), { ...(items[2] as object), result: `0x1${"0".repeat(64)}` }, ...items.slice(3)]
        : items;
    });
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    const second = await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx);
    expect(first.gaps[0]?.code).toBe("rpc_schema_drift");
    expect(second.gaps[0]?.code).toBe("rpc_schema_drift");
    expect(first.strategies).toEqual([]);
    expect(second.strategies).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });
});
