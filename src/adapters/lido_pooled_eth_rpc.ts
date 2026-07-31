import type { AdapterContext, CacheSpec } from "./base.js";
import {
  buildUnavailableLidoPooledEthBackingSnapshot,
  buildVerifiedLidoPooledEthBackingSnapshot,
  LidoPooledEthBackingDomainError,
} from "../lido_pooled_eth_backing/metrics.js";
import {
  LIDO_POOLED_ETH_BACKING_SOURCE,
  LIDO_POOLED_ETH_BACKING_SOURCE_ROLE,
  type LidoAccountingEvidenceInput,
  type LidoPooledEthBackingBlock,
  type LidoPooledEthBackingGapCode,
  type LidoPooledEthBackingSnapshot,
} from "../lido_pooled_eth_backing/types.js";

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_SPEC: CacheSpec = { name: "lido_pooled_eth_backing", ttlMs: CACHE_TTL_MS, max: 1 };
const CACHE_KEY = "lido-pooled-eth-backing:mainnet-v4";
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const BLOCK_HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const WORD_PATTERN = /^0x[0-9a-f]{64}$/;
const FOUR_WORDS_PATTERN = /^0x[0-9a-f]{256}$/;
const providerByContext = new WeakMap<AdapterContext, string>();

/** Official Lido/stETH mainnet proxy pinned by Lido core v4.0.0. */
export const LIDO_STETH_PROXY = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" as const;
const TOTAL_SUPPLY = "0x18160ddd";
const TOTAL_POOLED_ETHER = "0x37cfdaca";
const TOTAL_SHARES = "0xd5002f2e";
const EXTERNAL_ETHER = "0xe16a9065";
const EXTERNAL_SHARES = "0x63021d8b";
const BUFFERED_ETHER = "0x47b714e0";
const BALANCE_STATS = "0x38ac3c55";

export interface LidoPooledEthRpcInput {
  /** Internal-only provider configuration. It is never returned or used as a cache key. */
  rpcUrl?: unknown;
}

type RpcFailureCode = Extract<LidoPooledEthBackingGapCode,
  "rpc_access_gap" | "rpc_chain_mismatch" | "rpc_finality_gap" | "rpc_schema_drift" | "rpc_evidence_mismatch">;

class RpcFailure extends Error {
  constructor(readonly code: RpcFailureCode) {
    super(code);
  }
}

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: "eth_chainId" | "eth_getBlockByNumber" | "eth_call";
  params: unknown[];
}

interface VerifiedLidoEvidence {
  block: LidoPooledEthBackingBlock;
  accounting: LidoAccountingEvidenceInput;
}

function configuredRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bindProvider(ctx: AdapterContext, rpcUrl: string): RpcFailureCode | null {
  const existing = providerByContext.get(ctx);
  if (existing !== undefined && existing !== rpcUrl) return "rpc_access_gap";
  providerByContext.set(ctx, rpcUrl);
  return null;
}

function record(value: unknown, code: RpcFailureCode = "rpc_schema_drift"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RpcFailure(code);
  return value as Record<string, unknown>;
}

function canonicalQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return BigInt(value);
}

function safeNumber(value: unknown): number {
  const quantity = canonicalQuantity(value);
  if (quantity > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcFailure("rpc_schema_drift");
  return Number(quantity);
}

function decodeWord(value: unknown): bigint {
  if (typeof value !== "string" || !WORD_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return BigInt(value);
}

function decodeBalanceStats(value: unknown): readonly [bigint, bigint, bigint, bigint] {
  if (typeof value !== "string" || !FOUR_WORDS_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return [0, 1, 2, 3].map((index) => BigInt(`0x${value.slice(2 + index * 64, 2 + (index + 1) * 64)}`)) as [bigint, bigint, bigint, bigint];
}

function ethCall(id: number, data: string, blockTag: string): RpcRequest {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to: LIDO_STETH_PROXY, data }, blockTag] };
}

function isCanonicalEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === "id" && keys[1] === "jsonrpc" && keys[2] === "result";
}

async function postBatch(ctx: AdapterContext, rpcUrl: string, requests: readonly RpcRequest[]): Promise<Map<number, unknown>> {
  if (new Set(requests.map((request) => request.id)).size !== requests.length) throw new RpcFailure("rpc_schema_drift");
  let response: Response;
  try {
    response = await ctx.fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
    });
  } catch {
    throw new RpcFailure("rpc_access_gap");
  }
  if (!response.ok) throw new RpcFailure("rpc_access_gap");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RpcFailure("rpc_access_gap");
  }
  if (!Array.isArray(payload) || payload.length !== requests.length) throw new RpcFailure("rpc_access_gap");
  const expectedIds = new Set(requests.map((request) => request.id));
  const results = new Map<number, unknown>();
  for (const item of payload) {
    const envelope = record(item, "rpc_access_gap");
    if (!isCanonicalEnvelope(envelope) || envelope.jsonrpc !== "2.0" || typeof envelope.id !== "number"
      || !Number.isSafeInteger(envelope.id) || !expectedIds.has(envelope.id) || results.has(envelope.id)) {
      throw new RpcFailure("rpc_access_gap");
    }
    results.set(envelope.id, envelope.result);
  }
  if (results.size !== expectedIds.size) throw new RpcFailure("rpc_access_gap");
  return results;
}

function finalizedBlock(value: unknown): LidoPooledEthBackingBlock {
  if (value === null) throw new RpcFailure("rpc_finality_gap");
  const block = record(value);
  if (typeof block.hash !== "string" || !BLOCK_HASH_PATTERN.test(block.hash)) throw new RpcFailure("rpc_schema_drift");
  return { number: safeNumber(block.number), hash: block.hash, timestamp: safeNumber(block.timestamp) };
}

function freezeEvidence(evidence: VerifiedLidoEvidence): VerifiedLidoEvidence {
  return Object.freeze({ block: Object.freeze({ ...evidence.block }), accounting: Object.freeze({ ...evidence.accounting }) });
}

function cloneEvidence(evidence: VerifiedLidoEvidence): VerifiedLidoEvidence {
  return { block: { ...evidence.block }, accounting: { ...evidence.accounting } };
}

function assertDomainEvidence(evidence: VerifiedLidoEvidence): void {
  buildVerifiedLidoPooledEthBackingSnapshot({
    block: evidence.block,
    accounting: evidence.accounting,
    sources: [LIDO_POOLED_ETH_BACKING_SOURCE],
    sourceStatus: [{ source: LIDO_POOLED_ETH_BACKING_SOURCE, role: LIDO_POOLED_ETH_BACKING_SOURCE_ROLE, stale: false }],
  });
}

async function fetchVerifiedEvidence(ctx: AdapterContext, rpcUrl: string): Promise<VerifiedLidoEvidence> {
  const initial: readonly RpcRequest[] = [
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: 2, method: "eth_getBlockByNumber", params: ["finalized", false] },
  ];
  const initialResults = await postBatch(ctx, rpcUrl, initial);
  if (canonicalQuantity(initialResults.get(1)) !== 1n) throw new RpcFailure("rpc_chain_mismatch");
  const block = finalizedBlock(initialResults.get(2));
  const blockTag = `0x${block.number.toString(16)}`;
  const calls: readonly RpcRequest[] = [
    ethCall(3, TOTAL_SUPPLY, blockTag),
    ethCall(4, TOTAL_POOLED_ETHER, blockTag),
    ethCall(5, TOTAL_SHARES, blockTag),
    ethCall(6, EXTERNAL_ETHER, blockTag),
    ethCall(7, EXTERNAL_SHARES, blockTag),
    ethCall(8, BUFFERED_ETHER, blockTag),
    ethCall(9, BALANCE_STATS, blockTag),
  ];
  const callResults = await postBatch(ctx, rpcUrl, calls);
  const [clValidatorsBalanceAtLastReport, clPendingBalanceAtLastReport, depositedSinceLastReport, depositedForCurrentReport] = decodeBalanceStats(callResults.get(9));
  const evidence: VerifiedLidoEvidence = {
    block,
    accounting: {
      totalSupply: decodeWord(callResults.get(3)), totalPooledEther: decodeWord(callResults.get(4)),
      totalShares: decodeWord(callResults.get(5)), externalEther: decodeWord(callResults.get(6)),
      externalShares: decodeWord(callResults.get(7)), bufferedEther: decodeWord(callResults.get(8)),
      clValidatorsBalanceAtLastReport, clPendingBalanceAtLastReport, depositedSinceLastReport, depositedForCurrentReport,
    },
  };
  assertDomainEvidence(evidence);
  return evidence;
}

function unavailable(configured: boolean, code: LidoPooledEthBackingGapCode): LidoPooledEthBackingSnapshot {
  const detail: Record<LidoPooledEthBackingGapCode, string> = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
    source_stale: "Previously verified finalized evidence is stale.",
    all_ethereum_native_staked_not_measured: "Not applicable.",
    unique_net_eth_locked_not_reconciled: "Not applicable.",
    defi_eth_collateral_not_indexed: "Not applicable.",
    combined_aave_spark_lido_demand_not_reconciled: "Not applicable.",
    rehypothecation_ratio_not_measurable: "Not applicable.",
  };
  return buildUnavailableLidoPooledEthBackingSnapshot({
    summary: "Lido pooled ETH backing evidence is unavailable.",
    gaps: [{ code, detail: detail[code] }],
    sources: configured ? [LIDO_POOLED_ETH_BACKING_SOURCE] : [],
    sourceStatus: configured
      ? [{ source: LIDO_POOLED_ETH_BACKING_SOURCE, role: LIDO_POOLED_ETH_BACKING_SOURCE_ROLE, stale: false }]
      : [],
  });
}

function verified(evidence: VerifiedLidoEvidence, stale: boolean): LidoPooledEthBackingSnapshot {
  const copied = cloneEvidence(evidence);
  return buildVerifiedLidoPooledEthBackingSnapshot({
    block: copied.block,
    accounting: copied.accounting,
    sources: [LIDO_POOLED_ETH_BACKING_SOURCE],
    sourceStatus: [{ source: LIDO_POOLED_ETH_BACKING_SOURCE, role: LIDO_POOLED_ETH_BACKING_SOURCE_ROLE, stale: false }],
    stale,
  });
}

export async function fetchLidoPooledEthBacking(
  input: LidoPooledEthRpcInput,
  ctx: AdapterContext,
): Promise<LidoPooledEthBackingSnapshot> {
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return unavailable(false, "rpc_not_configured");
  const bindingFailure = bindProvider(ctx, rpcUrl);
  if (bindingFailure !== null) return unavailable(true, bindingFailure);
  const cache = ctx.cacheFor<VerifiedLidoEvidence>(CACHE_SPEC);
  try {
    const evidence = await cache.getOrLoad(CACHE_KEY, async () => freezeEvidence(await fetchVerifiedEvidence(ctx, rpcUrl)));
    return verified(evidence, false);
  } catch (error) {
    const stale = cache.getStale(CACHE_KEY);
    if (stale !== undefined) {
      try {
        return verified(stale, true);
      } catch {
        return unavailable(true, "rpc_schema_drift");
      }
    }
    if (error instanceof RpcFailure) return unavailable(true, error.code);
    if (error instanceof LidoPooledEthBackingDomainError) {
      return unavailable(true, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    return unavailable(true, "rpc_access_gap");
  }
}
