import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEigenLayerEthRestakingExposure } from "../../src/adapters/eigenlayer_eth_restaking_rpc.js";
import { fetchEigenLayerLstEthQuotes } from "../../src/adapters/eigenlayer_lst_eth_quotes_rpc.js";
import { EIGENLAYER_CORE_CONTRACTS, EIGENLAYER_ETH_LST_STRATEGIES } from "../../src/eigenlayer_eth_restaking/types.js";
import { EIGENLAYER_COVERED_LST_STRATEGIES } from "../../src/eigenlayer_lst_eth_quotes/types.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const RPC_URL = "https://rpc.example/credential-secret";
const SUBSTITUTE_TOKEN = `0x${"f".repeat(40)}`;
const TOKENS = EIGENLAYER_ETH_LST_STRATEGIES.map((_, index) => EIGENLAYER_COVERED_LST_STRATEGIES[index]?.underlying_token
  ?? `0x${(index + 104).toString(16).padStart(40, "0")}`);
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
  rethGetEthValue: "0x8b32fa23",
  cbethExchangeRate: "0x3ba0b9a9",
} as const;

interface RequestShape { jsonrpc: string; id: number; method: string; params: unknown[] }
function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return `0x${value.toString(16).padStart(64, "0")}`; }
function addressWord(value: string): string { return `0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`; }
function addressArg(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function uintArg(value: bigint): string { return value.toString(16).padStart(64, "0"); }

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
    if (call.data === SELECTORS.decimals) return { jsonrpc: "2.0", id: request.id, result: word(18n) };
    if (call.data.startsWith(SELECTORS.balanceOf)) {
      const index = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((fixed) => call.data === `${SELECTORS.balanceOf}${addressArg(fixed.strategy)}`);
      if (index >= 0) return { jsonrpc: "2.0", id: request.id, result: word(BigInt(index + 20)) };
    }
  }
  if (to === SUBSTITUTE_TOKEN.toLowerCase()) {
    if (call.data === SELECTORS.decimals) return { jsonrpc: "2.0", id: request.id, result: word(18n) };
    if (call.data === `${SELECTORS.balanceOf}${addressArg(EIGENLAYER_ETH_LST_STRATEGIES[0].strategy)}`) {
      return { jsonrpc: "2.0", id: request.id, result: word(20n) };
    }
  }
  if (to === EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token.toLowerCase()) {
    if (call.data === `${SELECTORS.rethGetEthValue}${uintArg(16n)}`) return { jsonrpc: "2.0", id: request.id, result: word(20n) };
    if (call.data === `${SELECTORS.rethGetEthValue}${uintArg(21n)}`) return { jsonrpc: "2.0", id: request.id, result: word(26n) };
  }
  if (to === EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token.toLowerCase()
    && call.data === SELECTORS.cbethExchangeRate) {
    return { jsonrpc: "2.0", id: request.id, result: word(1_500_000_000_000_000_000n) };
  }
  throw new Error("unexpected test request");
}

function finalizedCombinedFetch(
  mutate?: (round: number, items: unknown[], requests: RequestShape[]) => unknown[],
): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as RequestShape[];
    const items = requests.map(resultFor);
    return response((mutate?.(round, items, requests) ?? items).reverse());
  });
}

function expectAtomicUnavailable(result: Awaited<ReturnType<typeof fetchEigenLayerLstEthQuotes>>): void {
  expect(result).toMatchObject({
    status: "unavailable",
    verified_block: null,
    covered_quotes: [],
    identities: null,
    coverage: null,
    metrics: {
      covered_share_accounting_eth_equivalent_wei: null,
      covered_token_custody_eth_equivalent_wei: null,
    },
  });
}

describe("fetchEigenLayerLstEthQuotes", () => {
  it("returns atomic bounded unavailable output without an internal RPC URL", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchEigenLayerLstEthQuotes(
      {},
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result).toMatchObject({
      status: "unavailable",
      verified_block: null,
      covered_quotes: [],
      identities: null,
      coverage: null,
      metrics: {
        covered_share_accounting_eth_equivalent_wei: null,
        covered_token_custody_eth_equivalent_wei: null,
      },
    });
    expect(result.gaps).toEqual([{ code: "rpc_not_configured", detail: "Ethereum RPC is not configured." }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies one exact cold five-batch, ninety-four-request combined snapshot", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expect(result.status, JSON.stringify({ gaps: result.gaps, batches: fetchImpl.mock.calls.length })).toBe("verified");
    expect(result).toMatchObject({
      status: "verified",
      verified_block: { number: 256, timestamp: 101 },
      metrics: {
        covered_share_accounting_eth_equivalent_wei: "66",
        covered_token_custody_eth_equivalent_wei: "79",
      },
      coverage: { quoted_strategy_count: 3, fixed_strategy_count: 12 },
    });
    expect(result.covered_quotes.map((quote) => ({
      label: quote.label,
      token: quote.underlying_token,
      share: quote.share_accounting_token_amount,
      custody: quote.token_custody_token_amount,
      shareQuote: quote.share_accounting_eth_quote_wei,
      custodyQuote: quote.token_custody_eth_quote_wei,
    }))).toEqual([
      { label: "stETH", token: TOKENS[0], share: "21", custody: "20", shareQuote: "21", custodyQuote: "20" },
      { label: "rETH", token: TOKENS[1], share: "16", custody: "21", shareQuote: "20", custodyQuote: "26" },
      { label: "cbETH", token: TOKENS[2], share: "17", custody: "22", shareQuote: "25", custodyQuote: "33" },
    ]);

    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as RequestShape[]);
    expect(rounds.map((round) => round.length)).toEqual([2, 5, 48, 36, 3]);
    expect(rounds.flat()).toHaveLength(94);
    expect(rounds.flat().map((request) => request.id)).toEqual(Array.from({ length: 94 }, (_, index) => index + 1));
    expect(rounds.slice(1).flat()).toHaveLength(92);
    expect(rounds.slice(1).flat().every((request) => request.method === "eth_call" && request.params[1] === "0x100")).toBe(true);
    expect(rounds[4]!.map((request) => request.params[0])).toEqual([
      { to: EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token, data: `${SELECTORS.rethGetEthValue}${uintArg(16n)}` },
      { to: EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token, data: `${SELECTORS.rethGetEthValue}${uintArg(21n)}` },
      { to: EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token, data: SELECTORS.cbethExchangeRate },
    ]);
  });

  it.each([
    ["missing covered evidence", 3, (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["duplicate covered token", 3, (items: unknown[]) => [
      ...items.slice(0, 2),
      { ...(items[2] as object), result: addressWord(TOKENS[1]!) },
      ...items.slice(3),
    ], "rpc_evidence_mismatch"],
    ["reordered covered tokens", 3, (items: unknown[]) => [
      ...items.slice(0, 2),
      { ...(items[2] as object), result: (items[6] as { result: string }).result },
      ...items.slice(3, 6),
      { ...(items[6] as object), result: (items[2] as { result: string }).result },
      ...items.slice(7),
    ], "rpc_evidence_mismatch"],
    ["substituted covered token", 3, (items: unknown[]) => [
      ...items.slice(0, 2),
      { ...(items[2] as object), result: addressWord(SUBSTITUTE_TOKEN) },
      ...items.slice(3),
    ], "rpc_evidence_mismatch"],
    ["non-18 covered decimals", 4, (items: unknown[]) => [
      { ...(items[0] as object), result: word(17n) },
      ...items.slice(1),
    ], "rpc_evidence_mismatch"],
  ] as const)("rejects %s before the quote batch", async (_name, round, mutate, code) => {
    const fetchImpl = finalizedCombinedFetch((actualRound, items) => actualRound === round ? mutate(items) : items);
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expectAtomicUnavailable(result);
    expect(result.gaps[0]?.code).toBe(code);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("maps a bounded fresh-base failure without attempting a quote batch", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 1
      ? [{ ...(items[0] as object), result: "0x2" }, items[1]!]
      : items);
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expectAtomicUnavailable(result);
    expect(result.gaps[0]?.code).toBe("rpc_chain_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an extra response", (items: unknown[]) => [...items, { jsonrpc: "2.0", id: 999, result: word(0n) }], "rpc_access_gap"],
    ["a missing response", (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["a duplicate response id", (items: unknown[]) => [{ ...(items[0] as object), id: (items[1] as { id: number }).id }, ...items.slice(1)], "rpc_access_gap"],
    ["an envelope extra key", (items: unknown[]) => [{ ...(items[0] as object), extra: true }, ...items.slice(1)], "rpc_access_gap"],
    ["a wrong JSON-RPC version", (items: unknown[]) => [{ ...(items[0] as object), jsonrpc: "1.0" }, ...items.slice(1)], "rpc_access_gap"],
    ["a nonnumeric id", (items: unknown[]) => [{ ...(items[0] as object), id: "92" }, ...items.slice(1)], "rpc_access_gap"],
    ["a short ABI scalar", (items: unknown[]) => [{ ...(items[0] as object), result: "0x1" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a 257-bit ABI scalar", (items: unknown[]) => [{ ...(items[0] as object), result: `0x1${"0".repeat(64)}` }, ...items.slice(1)], "rpc_schema_drift"],
    ["a zero cbETH rate", (items: unknown[]) => [...items.slice(0, 2), { ...(items[2] as object), result: word(0n) }], "rpc_evidence_mismatch"],
  ] as const)("returns no partial evidence for %s", async (_name, mutate, code) => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? mutate(items) : items);
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expectAtomicUnavailable(result);
    expect(result.gaps[0]?.code).toBe(code);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["cbETH multiplication overflow", 8, word((2n ** 256n) - 1n), 2n],
    ["covered partial-sum overflow", 2, word((2n ** 256n) - 1n), 1_500_000_000_000_000_000n],
  ] as const)("fails atomically for %s", async (_name, fourthIndex, amountWord, rate) => {
    const fetchImpl = finalizedCombinedFetch((round, items) => {
      if (round === 4) return items.map((item, index) => index === fourthIndex ? { ...(item as object), result: amountWord } : item);
      if (round === 5) return [...items.slice(0, 2), { ...(items[2] as object), result: word(rate) }];
      return items;
    });
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expectAtomicUnavailable(result);
    expect(result.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("does not cache malformed or partial combined evidence", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => ((round - 1) % 5) + 1 === 5
      ? [...items.slice(0, 2), { ...(items[2] as object), result: word(0n) }]
      : items);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    const second = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    expectAtomicUnavailable(first);
    expectAtomicUnavailable(second);
    expect(first.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(second.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("sanitizes a quote-batch transport failure without returning partial numbers", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => {
      if (round === 5) throw new Error("private quote provider credential-secret");
      return items;
    });
    const result = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );
    expectAtomicUnavailable(result);
    expect(result.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(result)).not.toMatch(/private|credential-secret/);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("coalesces cold loads, caches only verified combined evidence, and returns immutable clones", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [first, second] = await Promise.all([
      fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx),
      fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx),
    ]);
    expect(first.status).toBe("verified");
    expect(second.status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    (first.covered_quotes[0] as { share_accounting_token_amount: string }).share_accounting_token_amount = "999";
    const cached = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    expect(cached.status).toBe("verified");
    expect(cached.covered_quotes[0]?.share_accounting_token_amount).toBe("21");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("returns stale only from previously verified full combined evidence", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedCombinedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider private detail"));
      const stale = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.source_status[0]?.stale).toBe(true);
      expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
      expect(JSON.stringify(stale)).not.toContain("private detail");
      expect(fetchImpl).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds one provider per context and suppresses provider URLs and private errors", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
    const rejected = await fetchEigenLayerLstEthQuotes({ rpcUrl: "https://rpc.example/other-secret" }, ctx);
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejected)).not.toMatch(/credential-secret|other-secret/);
    expect(fetchImpl).toHaveBeenCalledTimes(5);

    const failed = await fetchEigenLayerLstEthQuotes(
      { rpcUrl: RPC_URL },
      makeContext({ env, fetchImpl: vi.fn(async () => { throw new Error("private credential-secret"); }) as unknown as typeof fetch }),
    );
    expect(failed.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(failed)).not.toMatch(/private|credential-secret/);
  });

  it("shares public provider authority without poisoning the combined binding after a mismatch", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const rejected = await fetchEigenLayerLstEthQuotes({ rpcUrl: "https://rpc.example/other-secret" }, ctx);
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const accepted = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    expect(accepted.status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(9);
  });

  it("vetoes a concurrent provider mismatch without contaminating the accepted combined load", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [accepted, rejected] = await Promise.all([
      fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx),
      fetchEigenLayerLstEthQuotes({ rpcUrl: "https://rpc.example/other-secret" }, ctx),
    ]);
    expect(accepted.status).toBe("verified");
    expect(rejected.status).toBe("unavailable");
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejected)).not.toContain("other-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("does not consume or extend the existing public base cache", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedCombinedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      vi.advanceTimersByTime(29 * 60_000);
      expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
      expect(fetchImpl).toHaveBeenCalledTimes(9);
      expect(fetchImpl.mock.calls.slice(4).map(([, init]) => JSON.parse((init as RequestInit).body as string).length)).toEqual([2, 5, 48, 36, 3]);
      vi.advanceTimersByTime(2 * 60_000);
      expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified");
      expect(fetchImpl).toHaveBeenCalledTimes(9);
    } finally {
      vi.useRealTimers();
    }
  });
});
