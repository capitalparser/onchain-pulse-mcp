import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEigenLayerEthRestakingExposure } from "../../src/adapters/eigenlayer_eth_restaking_rpc.js";
import { fetchEigenLayerLstEthQuotes } from "../../src/adapters/eigenlayer_lst_eth_quotes_rpc.js";
import { EIGENLAYER_CORE_CONTRACTS, EIGENLAYER_ETH_LST_STRATEGIES } from "../../src/eigenlayer_eth_restaking/types.js";
import { EIGENLAYER_COVERED_LST_STRATEGIES } from "../../src/eigenlayer_lst_eth_quotes/types.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const RPC_URL = "https://rpc.example/credential-secret";
const SUBSTITUTE_TOKEN = `0x${"f".repeat(40)}`;
const COVERED_BASE_INDICES = [0, 1, 2, 6, 10, 11] as const;
const OSETH_CONTROLLER = "0x2A261e60FB14586B474C208b1B7AC6D0f5000306";
const METH_STAKING = "0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f";
const METH_ORACLE = "0x8735049F496727f824Cc0f2B174d826f5c408192";
const LSETH_RIVER = "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549";
const PRICE_FEED = "0x8023518b2192FB5384DAdc596765B3dD1cdFe471";
const TOKENS = EIGENLAYER_ETH_LST_STRATEGIES.map((_, baseIndex) => {
  const coveredIndex = COVERED_BASE_INDICES.indexOf(baseIndex as (typeof COVERED_BASE_INDICES)[number]);
  return coveredIndex >= 0 ? EIGENLAYER_COVERED_LST_STRATEGIES[coveredIndex]!.underlying_token
    : `0x${(baseIndex + 104).toString(16).padStart(40, "0")}`;
});
const SELECTORS = {
  smDelegation: "0xdf5cf723", epmDelegationManager: "0xea4d3c9b", beaconChainEthStrategy: "0x9104c319",
  numPods: "0xa6a509be", burnableEthShares: "0xf5d4fed3", whitelisted: "0x663c1de4",
  strategyManager: "0x39b70e38", underlyingToken: "0x2495a599", totalShares: "0x3a98ef39",
  decimals: "0x313ce567", balanceOf: "0x70a08231", sharesToUnderlying: "0x7a8b2637",
  rethGetEthValue: "0x8b32fa23", cbethExchangeRate: "0x3ba0b9a9", osethConvertToAssets: "0x07a2d13a",
  meth: "0x29e84867", oracle: "0x7dc0d1d0", methToEth: "0x5890c11c", priceFeedController: "0xabed451d",
  lsethUnderlyingBalanceFromShares: "0xf79c3f02", lsethLastCompletedEpochId: "0x89896aef",
} as const;

interface RequestShape { jsonrpc: string; id: number; method: string; params: unknown[] }
function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return `0x${value.toString(16).padStart(64, "0")}`; }
function addressWord(value: string): string { return `0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`; }
function addressArg(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function uintArg(value: bigint): string { return value.toString(16).padStart(64, "0"); }
function baseShare(index: number): bigint { return BigInt(index === 0 ? 21 : index + 15); }
function baseCustody(index: number): bigint { return BigInt(index + 20); }

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
      [SELECTORS.numPods]: word(12n), [SELECTORS.burnableEthShares]: word(3n),
    };
    if (values[call.data] !== undefined) return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
  }
  const strategyIndex = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((item) => item.strategy.toLowerCase() === to);
  if (strategyIndex >= 0) {
    const values: Record<string, string> = {
      [SELECTORS.strategyManager]: addressWord(EIGENLAYER_CORE_CONTRACTS.strategy_manager),
      [SELECTORS.underlyingToken]: addressWord(TOKENS[strategyIndex]!),
      [SELECTORS.totalShares]: word(BigInt(strategyIndex + 10)),
      [`${SELECTORS.sharesToUnderlying}${uintArg(BigInt(strategyIndex + 10))}`]: word(baseShare(strategyIndex)),
    };
    if (values[call.data] !== undefined) return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
  }
  const tokenIndex = TOKENS.findIndex((token) => token.toLowerCase() === to);
  if (tokenIndex >= 0) {
    if (call.data === SELECTORS.decimals) return { jsonrpc: "2.0", id: request.id, result: word(18n) };
    const balanceIndex = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((fixed) => call.data === `${SELECTORS.balanceOf}${addressArg(fixed.strategy)}`);
    if (balanceIndex >= 0) return { jsonrpc: "2.0", id: request.id, result: word(baseCustody(balanceIndex)) };
  }
  if (to === SUBSTITUTE_TOKEN.toLowerCase()) {
    if (call.data === SELECTORS.decimals) return { jsonrpc: "2.0", id: request.id, result: word(18n) };
    const index = EIGENLAYER_ETH_LST_STRATEGIES.findIndex((fixed) => call.data === `${SELECTORS.balanceOf}${addressArg(fixed.strategy)}`);
    if (index >= 0) return { jsonrpc: "2.0", id: request.id, result: word(baseCustody(index)) };
  }
  if (to === EIGENLAYER_COVERED_LST_STRATEGIES[1]!.underlying_token.toLowerCase()) {
    if (call.data === `${SELECTORS.rethGetEthValue}${uintArg(16n)}`) return { jsonrpc: "2.0", id: request.id, result: word(20n) };
    if (call.data === `${SELECTORS.rethGetEthValue}${uintArg(21n)}`) return { jsonrpc: "2.0", id: request.id, result: word(26n) };
  }
  if (to === EIGENLAYER_COVERED_LST_STRATEGIES[2]!.underlying_token.toLowerCase() && call.data === SELECTORS.cbethExchangeRate) {
    return { jsonrpc: "2.0", id: request.id, result: word(1_500_000_000_000_000_000n) };
  }
  if (to === OSETH_CONTROLLER.toLowerCase()) {
    if (call.data === `${SELECTORS.osethConvertToAssets}${uintArg(21n)}`) return { jsonrpc: "2.0", id: request.id, result: word(31n) };
    if (call.data === `${SELECTORS.osethConvertToAssets}${uintArg(26n)}`) return { jsonrpc: "2.0", id: request.id, result: word(38n) };
  }
  if (to === METH_STAKING.toLowerCase()) {
    if (call.data === SELECTORS.meth) return { jsonrpc: "2.0", id: request.id, result: addressWord(EIGENLAYER_COVERED_LST_STRATEGIES[5]!.underlying_token) };
    if (call.data === SELECTORS.oracle) return { jsonrpc: "2.0", id: request.id, result: addressWord(METH_ORACLE) };
    if (call.data === `${SELECTORS.methToEth}${uintArg(26n)}`) return { jsonrpc: "2.0", id: request.id, result: word(46n) };
    if (call.data === `${SELECTORS.methToEth}${uintArg(31n)}`) return { jsonrpc: "2.0", id: request.id, result: word(57n) };
  }
  if (to === LSETH_RIVER.toLowerCase()) {
    if (call.data === `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArg(25n)}`) return { jsonrpc: "2.0", id: request.id, result: word(37n) };
    if (call.data === `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArg(30n)}`) return { jsonrpc: "2.0", id: request.id, result: word(42n) };
    if (call.data === SELECTORS.lsethLastCompletedEpochId) return { jsonrpc: "2.0", id: request.id, result: word(123n) };
  }
  throw new Error(`unexpected test request ${request.id}`);
}

function finalizedCombinedFetch(mutate?: (round: number, items: unknown[], requests: RequestShape[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as RequestShape[];
    const items = requests.map(resultFor);
    return response((mutate?.(round, items, requests) ?? items).reverse());
  });
}
function expectAtomicUnavailable(result: Awaited<ReturnType<typeof fetchEigenLayerLstEthQuotes>>): void {
  expect(result).toMatchObject({ status: "unavailable", verified_block: null, covered_quotes: [], report_context: null, identities: null, coverage: null,
    metrics: { covered_share_accounting_eth_equivalent_wei: null, covered_token_custody_eth_equivalent_wei: null } });
}

describe("fetchEigenLayerLstEthQuotes", () => {
  it("verifies the noncontiguous six-strategy base subset and exact finalized direct River batch", async () => {
    const fetchImpl = finalizedCombinedFetch();
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status, JSON.stringify(result.gaps)).toBe("verified");
    expect(result.covered_quotes.map((quote) => quote.label)).toEqual(["stETH", "rETH", "cbETH", "osETH", "lsETH", "mETH"]);
    expect(result.covered_quotes.map((quote) => [quote.share_accounting_token_amount, quote.token_custody_token_amount, quote.share_accounting_eth_quote_wei, quote.token_custody_eth_quote_wei])).toEqual([
      ["21", "20", "21", "20"], ["16", "21", "20", "26"], ["17", "22", "25", "33"], ["21", "26", "31", "38"], ["25", "30", "37", "42"], ["26", "31", "46", "57"],
    ]);
    expect(result.metrics).toMatchObject({ covered_share_accounting_eth_equivalent_wei: "180", covered_token_custody_eth_equivalent_wei: "216" });
    expect(result.report_context).toEqual({ lseth_last_completed_epoch_id: "123" });
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as RequestShape[]);
    expect(rounds.map((round) => round.length)).toEqual([2, 5, 48, 36, 12]);
    expect(rounds.flat()).toHaveLength(103);
    expect(rounds.flat().map((request) => request.id)).toEqual(Array.from({ length: 103 }, (_, index) => index + 1));
    expect(rounds.slice(1).flat()).toHaveLength(101);
    expect(rounds.slice(1).flat().every((request) => request.method === "eth_call" && request.params[1] === "0x100")).toBe(true);
    const byId = (id: number) => rounds.flat().find((request) => request.id === id)!;
    expect(byId(95).params[0]).toEqual({ to: OSETH_CONTROLLER, data: `${SELECTORS.osethConvertToAssets}${uintArg(21n)}` });
    expect(byId(96).params[0]).toEqual({ to: OSETH_CONTROLLER, data: `${SELECTORS.osethConvertToAssets}${uintArg(26n)}` });
    expect(byId(97).params[0]).toEqual({ to: METH_STAKING, data: SELECTORS.meth });
    expect(byId(98).params[0]).toEqual({ to: METH_STAKING, data: SELECTORS.oracle });
    expect(byId(99).params[0]).toEqual({ to: METH_STAKING, data: `${SELECTORS.methToEth}${uintArg(26n)}` });
    expect(byId(100).params[0]).toEqual({ to: METH_STAKING, data: `${SELECTORS.methToEth}${uintArg(31n)}` });
    expect(byId(101).params[0]).toEqual({ to: LSETH_RIVER, data: `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArg(25n)}` });
    expect(byId(102).params[0]).toEqual({ to: LSETH_RIVER, data: `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArg(30n)}` });
    expect(byId(103).params[0]).toEqual({ to: LSETH_RIVER, data: SELECTORS.lsethLastCompletedEpochId });
    const calls = rounds.flat().filter((request) => request.method === "eth_call");
    expect(calls.some((request) => (request.params[0] as { to: string; data: string }).to.toLowerCase() === PRICE_FEED.toLowerCase()
      || (request.params[0] as { to: string; data: string }).data === SELECTORS.priceFeedController)).toBe(false);
  });

  it("returns bounded unavailable without an RPC URL and makes no request", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchEigenLayerLstEthQuotes({}, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_not_configured"); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["extra envelope", (items: unknown[]) => [...items, { jsonrpc: "2.0", id: 999, result: word(0n) }], "rpc_access_gap"],
    ["missing envelope", (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["duplicate response id", (items: unknown[]) => [{ ...(items[0] as object), id: (items[1] as { id: number }).id }, ...items.slice(1)], "rpc_access_gap"],
    ["extra envelope key", (items: unknown[]) => [{ ...(items[0] as object), extra: true }, ...items.slice(1)], "rpc_access_gap"],
    ["wrong JSON-RPC version", (items: unknown[]) => [{ ...(items[0] as object), jsonrpc: "1.0" }, ...items.slice(1)], "rpc_access_gap"],
    ["nonnumeric response id", (items: unknown[]) => [{ ...(items[0] as object), id: "95" }, ...items.slice(1)], "rpc_access_gap"],
    ["short scalar", (items: unknown[]) => [{ ...(items[0] as object), result: "0x1" }, ...items.slice(1)], "rpc_schema_drift"],
    ["257-bit scalar", (items: unknown[]) => [{ ...(items[0] as object), result: `0x1${"0".repeat(64)}` }, ...items.slice(1)], "rpc_schema_drift"],
    ["zero cbETH rate", (items: unknown[]) => items.map((item) => (item as { id: number }).id === 94 ? { ...(item as object), result: word(0n) } : item), "rpc_evidence_mismatch"],
  ] as const)("fails closed on a quote batch with %s", async (_name, mutate, code) => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? mutate(items) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe(code); expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["mETH token pointer mismatch", 97, addressWord(SUBSTITUTE_TOKEN)],
    ["mETH oracle pointer mismatch", 98, addressWord(SUBSTITUTE_TOKEN)],
  ] as const)("fails closed on %s", async (_name, id, resultWord) => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => (item as { id: number }).id === id ? { ...(item as object), result: resultWord } : item) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_evidence_mismatch");
  });

  it("rejects a covered token substitution before direct calls", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 3 ? items.map((item) => (item as { id: number }).id === 34 ? { ...(item as object), result: addressWord(SUBSTITUTE_TOKEN) } : item) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_evidence_mismatch"); expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("binds direct results to their IDs and rejects swapped amount responses", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => {
      const envelope = item as { id: number; result: string };
      if (envelope.id === 95) return { ...envelope, result: word(38n) };
      if (envelope.id === 96) return { ...envelope, result: word(31n) };
      return envelope;
    }) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status).toBe("verified");
    expect(result.covered_quotes[3]).toMatchObject({ share_accounting_eth_quote_wei: "38", token_custody_eth_quote_wei: "31" });
  });

  it("binds separate direct River results and completed epoch context to their exact IDs", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => {
      const envelope = item as { id: number; result: string };
      if (envelope.id === 101) return { ...envelope, result: word(42n) };
      if (envelope.id === 102) return { ...envelope, result: word(37n) };
      if (envelope.id === 103) return { ...envelope, result: word(0n) };
      return envelope;
    }) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status).toBe("verified");
    expect(result.covered_quotes[4]).toMatchObject({ share_accounting_eth_quote_wei: "42", token_custody_eth_quote_wei: "37" });
    expect(result.report_context).toEqual({ lseth_last_completed_epoch_id: "0" });
  });

  it("fails closed when the required direct River epoch evidence is malformed", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => (item as { id: number }).id === 103
      ? { ...(item as object), result: "0x1" } : item) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_schema_drift");
  });

  it.each([
    ["wrong chain", 1, [{ jsonrpc: "2.0", id: 1, result: "0x2" }, { jsonrpc: "2.0", id: 2, result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" } }], "rpc_chain_mismatch"],
    ["no finalized block", 1, [{ jsonrpc: "2.0", id: 1, result: "0x1" }, { jsonrpc: "2.0", id: 2, result: null }], "rpc_finality_gap"],
  ] as const)("maps fresh base %s without a direct batch", async (_name, round, replacement, code) => {
    const fetchImpl = finalizedCombinedFetch((actualRound, items) => actualRound === round ? [...replacement] : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe(code); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["duplicate covered token", 3, (items: unknown[]) => items.map((item) => (item as { id: number }).id === 34 ? { ...(item as object), result: addressWord(TOKENS[1]!) } : item)],
    ["wrong covered decimal", 4, (items: unknown[]) => items.map((item) => (item as { id: number }).id === 74 ? { ...(item as object), result: word(17n) } : item)],
  ] as const)("rejects %s before a direct batch", async (_name, round, mutate) => {
    const fetchImpl = finalizedCombinedFetch((actualRound, items) => actualRound === round ? mutate(items) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_evidence_mismatch"); expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("sanitizes quote transport and JSON failures without retaining partial evidence", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => { if (round === 5) throw new Error("private quote credential-secret"); return items; });
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_access_gap"); expect(JSON.stringify(result)).not.toMatch(/private|credential-secret/);
  });

  it.each(["HTTP failure", "invalid JSON"] as const)("maps a direct-batch %s to sanitized atomic unavailable", async (kind) => {
    let round = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      round += 1;
      if (round === 5 && kind === "HTTP failure") return response([], false);
      if (round === 5) return { ok: true, json: async () => { throw new Error("private malformed body"); } } as unknown as Response;
      const requests = JSON.parse(init.body as string) as RequestShape[];
      return response(requests.map(resultFor).reverse());
    });
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_access_gap"); expect(JSON.stringify(result)).not.toMatch(/private|malformed/);
  });

  it("rejects a malformed mETH pointer word before constructing direct evidence", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => (item as { id: number }).id === 97 ? { ...(item as object), result: `0x${"f".repeat(64)}` } : item) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expectAtomicUnavailable(result); expect(result.gaps[0]?.code).toBe("rpc_schema_drift");
  });

  it("preserves valid zero direct quote outputs without inventing a rate", async () => {
    const zeroDirectIds = new Set([92, 93, 95, 96, 99, 100, 101, 102]);
    const fetchImpl = finalizedCombinedFetch((round, items) => round === 5 ? items.map((item) => zeroDirectIds.has((item as { id: number }).id) ? { ...(item as object), result: word(0n) } : item) : items);
    const result = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status).toBe("verified");
    expect(result.covered_quotes.slice(1).map((quote) => [quote.share_accounting_eth_quote_wei, quote.token_custody_eth_quote_wei])).toEqual([["0", "0"], ["25", "33"], ["0", "0"], ["0", "0"], ["0", "0"]]);
  });

  it("does not cache failed direct evidence", async () => {
    const fetchImpl = finalizedCombinedFetch((round, items) => round % 5 === 0 ? items.map((item) => (item as { id: number }).id === 94 ? { ...(item as object), result: word(0n) } : item) : items);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    const second = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
    expectAtomicUnavailable(first); expectAtomicUnavailable(second); expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("coalesces, v3-caches verified evidence, returns clones, and only uses complete v3 stale evidence", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedCombinedFetch(); const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      const [first, second] = await Promise.all([fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx), fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)]);
      expect(first.status).toBe("verified"); expect(second.status).toBe("verified"); expect(fetchImpl).toHaveBeenCalledTimes(5);
      (first.covered_quotes[3] as { share_accounting_eth_quote_wei: string }).share_accounting_eth_quote_wei = "999";
      expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).covered_quotes[3]?.share_accounting_eth_quote_wei).toBe("31");
      vi.advanceTimersByTime(30 * 60_000 + 1); fetchImpl.mockRejectedValueOnce(new Error("private provider detail"));
      const stale = await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx);
      expect(stale.status).toBe("verified"); expect(stale.source_status[0]?.stale).toBe(true); expect(stale.covered_quotes).toHaveLength(6); expect(stale.report_context).toEqual({ lseth_last_completed_epoch_id: "123" });
    } finally { vi.useRealTimers(); }
  });

  it("enforces context provider binding and never consumes the public base cache", async () => {
    const fetchImpl = finalizedCombinedFetch(); const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await fetchEigenLayerEthRestakingExposure({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified"); expect(fetchImpl).toHaveBeenCalledTimes(4);
    const rejected = await fetchEigenLayerLstEthQuotes({ rpcUrl: "https://rpc.example/other-secret" }, ctx);
    expect(rejected.gaps[0]?.code).toBe("rpc_access_gap"); expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect((await fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx)).status).toBe("verified"); expect(fetchImpl).toHaveBeenCalledTimes(9);
  });

  it("vetoes a concurrent provider mismatch without poisoning a verified v3 load", async () => {
    const fetchImpl = finalizedCombinedFetch(); const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [accepted, rejected] = await Promise.all([
      fetchEigenLayerLstEthQuotes({ rpcUrl: RPC_URL }, ctx),
      fetchEigenLayerLstEthQuotes({ rpcUrl: "https://rpc.example/other-secret" }, ctx),
    ]);
    expect(accepted.status).toBe("verified"); expectAtomicUnavailable(rejected); expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(rejected)).not.toMatch(/other-secret/); expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
