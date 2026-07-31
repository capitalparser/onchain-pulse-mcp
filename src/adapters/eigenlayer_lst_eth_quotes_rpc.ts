import type { AdapterContext, CacheSpec } from "./base.js";
import {
  bindEigenLayerEthRestakingProvider,
  fetchFreshEigenLayerEthRestakingExposure,
} from "./eigenlayer_eth_restaking_rpc.js";
import {
  buildUnavailableEigenLayerLstEthQuotesSnapshot,
  buildVerifiedEigenLayerLstEthQuotesSnapshot,
  EigenLayerLstEthQuotesDomainError,
} from "../eigenlayer_lst_eth_quotes/metrics.js";
import {
  EIGENLAYER_COVERED_LST_STRATEGIES,
  type BuildVerifiedEigenLayerLstEthQuotesInput,
  type EigenLayerCoveredLstQuoteInput,
  type EigenLayerLstEthQuotesSnapshot,
} from "../eigenlayer_lst_eth_quotes/types.js";

const CACHE_SPEC: CacheSpec = { name: "eigenlayer_lst_eth_quotes", ttlMs: 30 * 60_000, max: 1 };
const CACHE_KEY = "eigenlayer-lst-eth-quotes:mainnet-v1";
const SOURCE = "ethereum_rpc" as const;
const ROLE = "eigenlayer_finalized_lst_eth_quote_evidence" as const;
const WORD = /^0x[0-9a-f]{64}$/;
const SELECTORS = {
  rethGetEthValue: "0x8b32fa23",
  cbethExchangeRate: "0x3ba0b9a9",
} as const;

export interface EigenLayerLstEthQuotesRpcInput {
  /** Internal-only provider configuration. It is never returned or used as a cache key. */
  rpcUrl?: unknown;
}

type FailureCode = "rpc_not_configured" | "rpc_access_gap" | "rpc_chain_mismatch" | "rpc_finality_gap" | "rpc_schema_drift" | "rpc_evidence_mismatch";
class QuoteRpcFailure extends Error {
  constructor(readonly code: Exclude<FailureCode, "rpc_not_configured">) { super(code); }
}
interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: "eth_call";
  params: unknown[];
}
interface CombinedEvidence {
  block: BuildVerifiedEigenLayerLstEthQuotesInput["block"];
  quotes: readonly EigenLayerCoveredLstQuoteInput[];
}

function configuredRpcUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new QuoteRpcFailure("rpc_access_gap");
  return value as Record<string, unknown>;
}

function exactEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === "id" && keys[1] === "jsonrpc" && keys[2] === "result";
}

function decodeUint(value: unknown): bigint {
  if (typeof value !== "string" || !WORD.test(value)) throw new QuoteRpcFailure("rpc_schema_drift");
  return BigInt(value);
}

function uintArgument(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function ethCall(id: number, to: string, data: string, blockTag: string): RpcRequest {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, blockTag] };
}

async function postQuoteBatch(
  ctx: AdapterContext,
  rpcUrl: string,
  requests: readonly RpcRequest[],
): Promise<Map<number, unknown>> {
  if (requests.length !== 3 || new Set(requests.map((request) => request.id)).size !== requests.length) {
    throw new QuoteRpcFailure("rpc_schema_drift");
  }
  let response: Response;
  try {
    response = await ctx.fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
    });
  } catch {
    throw new QuoteRpcFailure("rpc_access_gap");
  }
  if (!response.ok) throw new QuoteRpcFailure("rpc_access_gap");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new QuoteRpcFailure("rpc_access_gap"); }
  if (!Array.isArray(payload) || payload.length !== requests.length) throw new QuoteRpcFailure("rpc_access_gap");
  const expected = new Set(requests.map((request) => request.id));
  const results = new Map<number, unknown>();
  for (const item of payload) {
    const envelope = record(item);
    if (!exactEnvelope(envelope) || envelope.jsonrpc !== "2.0" || typeof envelope.id !== "number"
      || !Number.isSafeInteger(envelope.id) || !expected.has(envelope.id) || results.has(envelope.id)) {
      throw new QuoteRpcFailure("rpc_access_gap");
    }
    results.set(envelope.id, envelope.result);
  }
  if (results.size !== expected.size) throw new QuoteRpcFailure("rpc_access_gap");
  return results;
}

function unavailable(configured: boolean, code: FailureCode): EigenLayerLstEthQuotesSnapshot {
  const details: Record<FailureCode, string> = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  };
  return buildUnavailableEigenLayerLstEthQuotesSnapshot({
    summary: "EigenLayer covered LST ETH quote evidence is unavailable.",
    gaps: [{ code, detail: details[code] }],
    sources: configured ? [SOURCE] : [],
    sourceStatus: configured ? [{ source: SOURCE, role: ROLE, stale: false }] : [],
  });
}

function freezeEvidence(evidence: CombinedEvidence): CombinedEvidence {
  return Object.freeze({
    block: Object.freeze({ ...evidence.block }),
    quotes: Object.freeze(evidence.quotes.map((quote) => Object.freeze({ ...quote }))),
  });
}

function cloneEvidence(evidence: CombinedEvidence): CombinedEvidence {
  return {
    block: { ...evidence.block },
    quotes: evidence.quotes.map((quote) => ({ ...quote })),
  };
}

function verified(evidence: CombinedEvidence, stale: boolean): EigenLayerLstEthQuotesSnapshot {
  return buildVerifiedEigenLayerLstEthQuotesSnapshot({
    ...cloneEvidence(evidence),
    sources: [SOURCE],
    sourceStatus: [{ source: SOURCE, role: ROLE, stale: false }],
    stale,
  });
}

function baseFailureCode(
  snapshot: Awaited<ReturnType<typeof fetchFreshEigenLayerEthRestakingExposure>>,
): Exclude<FailureCode, "rpc_not_configured"> {
  const code = snapshot.gaps[0]?.code;
  if (code === "rpc_access_gap" || code === "rpc_chain_mismatch"
    || code === "rpc_finality_gap" || code === "rpc_schema_drift" || code === "rpc_evidence_mismatch") return code;
  return code === "rpc_not_configured" ? "rpc_access_gap" : "rpc_evidence_mismatch";
}

async function loadCombinedEvidence(ctx: AdapterContext, rpcUrl: string): Promise<CombinedEvidence> {
  const base = await fetchFreshEigenLayerEthRestakingExposure({ rpcUrl }, ctx);
  if (base.status !== "verified" || base.verified_block === null
    || base.source_status.some((status) => status.stale)
    || base.gaps.some((gap) => gap.code === "source_stale")) {
    throw new QuoteRpcFailure(baseFailureCode(base));
  }
  if (base.strategies.length !== 12) throw new QuoteRpcFailure("rpc_evidence_mismatch");
  const covered = EIGENLAYER_COVERED_LST_STRATEGIES.map((expected, index) => {
    const actual = base.strategies[index];
    if (actual === undefined || actual.label !== expected.label || actual.strategy !== expected.strategy
      || actual.underlying_token.toLowerCase() !== expected.underlying_token.toLowerCase() || actual.decimals !== 18) {
      throw new QuoteRpcFailure("rpc_evidence_mismatch");
    }
    return actual;
  });
  const blockTag = `0x${base.verified_block.number.toString(16)}`;
  const requests = [
    ethCall(92, EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token,
      `${SELECTORS.rethGetEthValue}${uintArgument(BigInt(covered[1]!.share_accounting_underlying))}`, blockTag),
    ethCall(93, EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token,
      `${SELECTORS.rethGetEthValue}${uintArgument(BigInt(covered[1]!.token_custody))}`, blockTag),
    ethCall(94, EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token, SELECTORS.cbethExchangeRate, blockTag),
  ];
  const results = await postQuoteBatch(ctx, rpcUrl, requests);
  const quotes: EigenLayerCoveredLstQuoteInput[] = [
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[0],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[0].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[0]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[0]!.token_custody),
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[1],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[1].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[1]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[1]!.token_custody),
      directShareAccountingEthQuote: decodeUint(results.get(92)),
      directTokenCustodyEthQuote: decodeUint(results.get(93)),
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[2],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[2].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[2]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[2]!.token_custody),
      cbethExchangeRate: decodeUint(results.get(94)),
    },
  ];
  const evidence: CombinedEvidence = { block: { ...base.verified_block }, quotes };
  verified(evidence, false);
  return evidence;
}

export async function fetchEigenLayerLstEthQuotes(
  input: EigenLayerLstEthQuotesRpcInput,
  ctx: AdapterContext,
): Promise<EigenLayerLstEthQuotesSnapshot> {
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return unavailable(false, "rpc_not_configured");
  const binding = bindEigenLayerEthRestakingProvider(ctx, rpcUrl);
  if (binding !== null) return unavailable(true, binding);
  const cache = ctx.cacheFor<CombinedEvidence>(CACHE_SPEC);
  try {
    const evidence = await cache.getOrLoad(CACHE_KEY, async () => freezeEvidence(await loadCombinedEvidence(ctx, rpcUrl)));
    return verified(evidence, false);
  } catch (error) {
    const stale = cache.getStale(CACHE_KEY);
    if (stale !== undefined) {
      try { return verified(stale, true); } catch { return unavailable(true, "rpc_schema_drift"); }
    }
    if (error instanceof QuoteRpcFailure) return unavailable(true, error.code);
    if (error instanceof EigenLayerLstEthQuotesDomainError) {
      return unavailable(true, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    return unavailable(true, "rpc_access_gap");
  }
}
