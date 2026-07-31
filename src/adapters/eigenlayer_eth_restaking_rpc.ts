import type { AdapterContext, CacheSpec } from "./base.js";
import {
  buildUnavailableEigenLayerEthRestakingExposureSnapshot,
  buildVerifiedEigenLayerEthRestakingExposureSnapshot,
  EigenLayerEthRestakingDomainError,
} from "../eigenlayer_eth_restaking/metrics.js";
import {
  EIGENLAYER_CORE_CONTRACTS,
  EIGENLAYER_ETH_LST_STRATEGIES,
  type EigenLayerCoreEvidenceInput,
  type EigenLayerEthRestakingExposureSnapshot,
  type EigenLayerRestakingBlock,
  type EigenLayerStrategyEvidenceInput,
} from "../eigenlayer_eth_restaking/types.js";

const CACHE_SPEC: CacheSpec = { name: "eigenlayer_eth_restaking_exposure", ttlMs: 30 * 60_000, max: 1 };
const CACHE_KEY = "eigenlayer-eth-restaking-exposure:mainnet-v1";
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH = /^0x[0-9a-f]{64}$/;
const WORD = /^0x[0-9a-f]{64}$/;
const ADDRESS_WORD = /^0x0{24}[0-9a-f]{40}$/;
const providerByContext = new WeakMap<AdapterContext, string>();

const SELECTORS = {
  strategyManagerDelegation: "0xdf5cf723",
  eigenPodManagerDelegation: "0xea4d3c9b",
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
const SOURCE = "ethereum_rpc" as const;
const ROLE = "eigenlayer_finalized_restaking_exposure_evidence" as const;

export interface EigenLayerEthRestakingRpcInput {
  /** Internal-only provider configuration. It is never returned or used as a cache key. */
  rpcUrl?: unknown;
}

type FailureCode = "rpc_not_configured" | "rpc_access_gap" | "rpc_chain_mismatch" | "rpc_finality_gap" | "rpc_schema_drift" | "rpc_evidence_mismatch";
class RpcFailure extends Error {
  constructor(readonly code: Exclude<FailureCode, "rpc_not_configured">) { super(code); }
}
interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: "eth_chainId" | "eth_getBlockByNumber" | "eth_call";
  params: unknown[];
}
interface VerifiedEvidence {
  block: EigenLayerRestakingBlock;
  core: EigenLayerCoreEvidenceInput;
  strategies: readonly EigenLayerStrategyEvidenceInput[];
  numPods: bigint;
  burnableEthShares: bigint;
}

function configuredRpcUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function bindProvider(ctx: AdapterContext, rpcUrl: string): FailureCode | null {
  const previous = providerByContext.get(ctx);
  if (previous !== undefined && previous !== rpcUrl) return "rpc_access_gap";
  providerByContext.set(ctx, rpcUrl);
  return null;
}
function record(value: unknown, code: RpcFailure["code"] = "rpc_schema_drift"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RpcFailure(code);
  return value as Record<string, unknown>;
}
function quantity(value: unknown): bigint {
  if (typeof value !== "string" || !QUANTITY.test(value)) throw new RpcFailure("rpc_schema_drift");
  return BigInt(value);
}
function safeNumber(value: unknown): number {
  const parsed = quantity(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcFailure("rpc_schema_drift");
  return Number(parsed);
}
function fixedWord(value: unknown): string {
  if (typeof value !== "string" || !WORD.test(value)) throw new RpcFailure("rpc_schema_drift");
  return value;
}
function decodeUint(value: unknown): bigint { return BigInt(fixedWord(value)); }
function decodeBool(value: unknown): boolean {
  const decoded = decodeUint(value);
  if (decoded !== 0n && decoded !== 1n) throw new RpcFailure("rpc_schema_drift");
  return decoded === 1n;
}
function decodeUint8(value: unknown): number {
  const decoded = decodeUint(value);
  if (decoded > 255n) throw new RpcFailure("rpc_schema_drift");
  return Number(decoded);
}
function decodeAddress(value: unknown): string {
  const word = fixedWord(value);
  if (!ADDRESS_WORD.test(word)) throw new RpcFailure("rpc_schema_drift");
  const address = `0x${word.slice(-40)}`;
  if (address === ZERO_ADDRESS) throw new RpcFailure("rpc_evidence_mismatch");
  return address;
}
function expectedAddress(value: string, expected: string): void {
  if (value.toLowerCase() !== expected.toLowerCase()) throw new RpcFailure("rpc_evidence_mismatch");
}
function addressArgument(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function uintArgument(value: bigint): string { return value.toString(16).padStart(64, "0"); }
function ethCall(id: number, to: string, data: string, blockTag: string): RpcRequest {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, blockTag] };
}
function exactEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === "id" && keys[1] === "jsonrpc" && keys[2] === "result";
}
async function postBatch(
  ctx: AdapterContext,
  rpcUrl: string,
  requests: readonly RpcRequest[],
  usedRequestIds: Set<number>,
): Promise<Map<number, unknown>> {
  if (requests.length === 0 || requests.some((request) => usedRequestIds.has(request.id))
    || new Set(requests.map((request) => request.id)).size !== requests.length) throw new RpcFailure("rpc_schema_drift");
  requests.forEach((request) => usedRequestIds.add(request.id));
  let response: Response;
  try {
    response = await ctx.fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requests) });
  } catch { throw new RpcFailure("rpc_access_gap"); }
  if (!response.ok) throw new RpcFailure("rpc_access_gap");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new RpcFailure("rpc_access_gap"); }
  if (!Array.isArray(payload) || payload.length !== requests.length) throw new RpcFailure("rpc_access_gap");
  const expected = new Set(requests.map((request) => request.id));
  const results = new Map<number, unknown>();
  for (const item of payload) {
    const envelope = record(item, "rpc_access_gap");
    if (!exactEnvelope(envelope) || envelope.jsonrpc !== "2.0" || typeof envelope.id !== "number"
      || !Number.isSafeInteger(envelope.id) || !expected.has(envelope.id) || results.has(envelope.id)) {
      throw new RpcFailure("rpc_access_gap");
    }
    results.set(envelope.id, envelope.result);
  }
  if (results.size !== expected.size) throw new RpcFailure("rpc_access_gap");
  return results;
}
function finalizedBlock(value: unknown): EigenLayerRestakingBlock {
  if (value === null) throw new RpcFailure("rpc_finality_gap");
  const block = record(value);
  if (typeof block.hash !== "string" || !HASH.test(block.hash)) throw new RpcFailure("rpc_schema_drift");
  return { number: safeNumber(block.number), hash: block.hash, timestamp: safeNumber(block.timestamp) };
}
function freezeEvidence(evidence: VerifiedEvidence): VerifiedEvidence {
  return Object.freeze({
    block: Object.freeze({ ...evidence.block }),
    core: Object.freeze({ ...evidence.core }),
    strategies: Object.freeze(evidence.strategies.map((strategy) => Object.freeze({ ...strategy }))),
    numPods: evidence.numPods,
    burnableEthShares: evidence.burnableEthShares,
  });
}
function cloneEvidence(evidence: VerifiedEvidence): VerifiedEvidence {
  return {
    block: { ...evidence.block },
    core: { ...evidence.core },
    strategies: evidence.strategies.map((strategy) => ({ ...strategy })),
    numPods: evidence.numPods,
    burnableEthShares: evidence.burnableEthShares,
  };
}
function unavailable(configured: boolean, code: FailureCode): EigenLayerEthRestakingExposureSnapshot {
  const details: Record<FailureCode, string> = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  };
  return buildUnavailableEigenLayerEthRestakingExposureSnapshot({
    summary: "EigenLayer ETH restaking exposure evidence is unavailable.",
    gaps: [{ code, detail: details[code] }],
    sources: configured ? [SOURCE] : [],
    sourceStatus: configured ? [{ source: SOURCE, role: ROLE, stale: false }] : [],
  });
}
function verified(evidence: VerifiedEvidence, stale: boolean): EigenLayerEthRestakingExposureSnapshot {
  return buildVerifiedEigenLayerEthRestakingExposureSnapshot({
    ...cloneEvidence(evidence),
    sources: [SOURCE],
    sourceStatus: [{ source: SOURCE, role: ROLE, stale: false }],
    stale,
  });
}
function assertDomainEvidence(evidence: VerifiedEvidence): void {
  buildVerifiedEigenLayerEthRestakingExposureSnapshot({
    ...cloneEvidence(evidence),
    sources: [SOURCE],
    sourceStatus: [{ source: SOURCE, role: ROLE, stale: false }],
  });
}

async function fetchVerifiedEvidence(ctx: AdapterContext, rpcUrl: string): Promise<VerifiedEvidence> {
  let id = 1;
  const usedRequestIds = new Set<number>();
  const round1: RpcRequest[] = [
    { jsonrpc: "2.0", id: id++, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: id++, method: "eth_getBlockByNumber", params: ["finalized", false] },
  ];
  const first = await postBatch(ctx, rpcUrl, round1, usedRequestIds);
  if (quantity(first.get(round1[0]!.id)) !== 1n) throw new RpcFailure("rpc_chain_mismatch");
  const block = finalizedBlock(first.get(round1[1]!.id));
  const blockTag = `0x${block.number.toString(16)}`;

  const round2 = [
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.strategy_manager, SELECTORS.strategyManagerDelegation, blockTag),
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, SELECTORS.eigenPodManagerDelegation, blockTag),
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, SELECTORS.beaconChainEthStrategy, blockTag),
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, SELECTORS.numPods, blockTag),
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager, SELECTORS.burnableEthShares, blockTag),
  ];
  const second = await postBatch(ctx, rpcUrl, round2, usedRequestIds);
  const strategyManagerDelegation = decodeAddress(second.get(round2[0]!.id));
  const eigenPodManagerDelegation = decodeAddress(second.get(round2[1]!.id));
  const beaconChainEthStrategy = decodeAddress(second.get(round2[2]!.id));
  expectedAddress(strategyManagerDelegation, EIGENLAYER_CORE_CONTRACTS.delegation_manager);
  expectedAddress(eigenPodManagerDelegation, EIGENLAYER_CORE_CONTRACTS.delegation_manager);
  expectedAddress(beaconChainEthStrategy, EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy);
  const numPods = decodeUint(second.get(round2[3]!.id));
  const burnableEthShares = decodeUint(second.get(round2[4]!.id));

  const round3 = EIGENLAYER_ETH_LST_STRATEGIES.flatMap((fixed) => [
    ethCall(id++, EIGENLAYER_CORE_CONTRACTS.strategy_manager, `${SELECTORS.whitelisted}${addressArgument(fixed.strategy)}`, blockTag),
    ethCall(id++, fixed.strategy, SELECTORS.strategyManager, blockTag),
    ethCall(id++, fixed.strategy, SELECTORS.underlyingToken, blockTag),
    ethCall(id++, fixed.strategy, SELECTORS.totalShares, blockTag),
  ]);
  const third = await postBatch(ctx, rpcUrl, round3, usedRequestIds);
  const identityEvidence = EIGENLAYER_ETH_LST_STRATEGIES.map((fixed, index) => {
    const base = index * 4;
    const whitelisted = decodeBool(third.get(round3[base]!.id));
    const strategyManager = decodeAddress(third.get(round3[base + 1]!.id));
    const underlyingToken = decodeAddress(third.get(round3[base + 2]!.id));
    const totalShares = decodeUint(third.get(round3[base + 3]!.id));
    expectedAddress(strategyManager, EIGENLAYER_CORE_CONTRACTS.strategy_manager);
    return {
      ...fixed,
      whitelisted,
      strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
      underlyingToken,
      totalShares,
    };
  });
  const round4 = identityEvidence.flatMap((strategy) => [
    ethCall(id++, strategy.underlyingToken, SELECTORS.decimals, blockTag),
    ethCall(id++, strategy.underlyingToken, `${SELECTORS.balanceOf}${addressArgument(strategy.strategy)}`, blockTag),
    ethCall(id++, strategy.strategy, `${SELECTORS.sharesToUnderlying}${uintArgument(strategy.totalShares)}`, blockTag),
  ]);
  const fourth = await postBatch(ctx, rpcUrl, round4, usedRequestIds);
  const strategies: EigenLayerStrategyEvidenceInput[] = identityEvidence.map((strategy, index) => {
    const base = index * 3;
    return {
      ...strategy,
      decimals: decodeUint8(fourth.get(round4[base]!.id)),
      tokenCustody: decodeUint(fourth.get(round4[base + 1]!.id)),
      shareAccountingUnderlying: decodeUint(fourth.get(round4[base + 2]!.id)),
    };
  });
  const core: EigenLayerCoreEvidenceInput = {
    strategyManager: EIGENLAYER_CORE_CONTRACTS.strategy_manager,
    eigenPodManager: EIGENLAYER_CORE_CONTRACTS.eigen_pod_manager,
    delegationManager: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
    beaconChainEthStrategy: EIGENLAYER_CORE_CONTRACTS.beacon_chain_eth_strategy,
    strategyManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
    eigenPodManagerDelegation: EIGENLAYER_CORE_CONTRACTS.delegation_manager,
  };
  const evidence: VerifiedEvidence = { block, core, strategies, numPods, burnableEthShares };
  assertDomainEvidence(evidence);
  return evidence;
}

export async function fetchEigenLayerEthRestakingExposure(
  input: EigenLayerEthRestakingRpcInput,
  ctx: AdapterContext,
): Promise<EigenLayerEthRestakingExposureSnapshot> {
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return unavailable(false, "rpc_not_configured");
  const binding = bindProvider(ctx, rpcUrl);
  if (binding !== null) return unavailable(true, binding);
  const cache = ctx.cacheFor<VerifiedEvidence>(CACHE_SPEC);
  try {
    const evidence = await cache.getOrLoad(CACHE_KEY, async () => freezeEvidence(await fetchVerifiedEvidence(ctx, rpcUrl)));
    return verified(evidence, false);
  } catch (error) {
    const stale = cache.getStale(CACHE_KEY);
    if (stale !== undefined) {
      try { return verified(stale, true); } catch { return unavailable(true, "rpc_schema_drift"); }
    }
    if (error instanceof RpcFailure) return unavailable(true, error.code);
    if (error instanceof EigenLayerEthRestakingDomainError) {
      return unavailable(true, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    return unavailable(true, "rpc_access_gap");
  }
}
