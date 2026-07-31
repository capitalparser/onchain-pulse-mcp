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
const CACHE_KEY = "eigenlayer-lst-eth-quotes:mainnet-v7";
const SOURCE = "ethereum_rpc" as const;
const ROLE = "eigenlayer_finalized_lst_eth_quote_evidence" as const;
const WORD = /^0x[0-9a-f]{64}$/;
const ADDRESS_WORD = /^0x0{24}[0-9a-f]{40}$/;
const COVERED_BASE_STRATEGY_INDICES = [0, 1, 2, 3, 5, 6, 7, 10, 11] as const;
const ETHX_TOKEN = "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b";
const ETHX_STADER_CONFIG = "0x4ABEF2263d5A5ED582FC9A9789a41D85b68d69DB";
const ETHX_STAKE_POOLS_MANAGER = "0xcf5EA1b38380f6aF39068375516Daf40Ed70D299";
const ETHX_STADER_ORACLE = "0xF64bAe65f6f2a5277571143A24FaaFDFC0C2a737";
const OSETH_CONTROLLER = "0x2A261e60FB14586B474C208b1B7AC6D0f5000306";
const OETH_TOKEN = "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3";
const OETH_VAULT = "0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab";
const WETH_TOKEN = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";
const SWETH_TOKEN = "0xf951E335afb289353dc249e82926178EaC7DEd78";
const METH_STAKING = "0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f";
const METH_ORACLE = "0x8735049F496727f824Cc0f2B174d826f5c408192";
const SELECTORS = {
  rethGetEthValue: "0x8b32fa23",
  cbethExchangeRate: "0x3ba0b9a9",
  osethConvertToAssets: "0x07a2d13a",
  meth: "0x29e84867",
  oracle: "0x7dc0d1d0",
  methToEth: "0x5890c11c",
  lsethUnderlyingBalanceFromShares: "0xf79c3f02",
  lsethLastCompletedEpochId: "0x89896aef",
  ethxStaderConfig: "0x490ffa35",
  ethxGetToken: "0xcc45dabe",
  ethxGetStakePoolsManager: "0x2ec5e018",
  ethxGetStaderOracle: "0xdefd024d",
  ethxConvertToAssets: "0x07a2d13a",
  ethxGetExchangeRate: "0xe6aa216c",
  swethToEthRate: "0xd68b2cb6",
  swethLastRepriceUnix: "0xfbda759b",
  oethVaultAddress: "0x430bf08a",
  oethVaultOToken: "0x1a32aad6",
  oethVaultAsset: "0x38d52e0f",
  oethLastRebase: "0x78f353a1",
  oethRebasePaused: "0x53ca9f24",
  oethWithdrawalClaimDelay: "0x45e4213b",
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
  lsethLastCompletedEpochId: bigint;
  ethxOracleReportingBlockNumber: bigint;
  swethLastRepriceUnix: bigint;
  oethLastRebaseUnix: bigint;
  oethRebasePaused: boolean;
  oethWithdrawalClaimDelaySeconds: bigint;
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

function decodeUint64(value: unknown): bigint {
  const decoded = decodeUint(value);
  if (decoded > (2n ** 64n) - 1n) throw new QuoteRpcFailure("rpc_schema_drift");
  return decoded;
}

function decodeBool(value: unknown): boolean {
  const decoded = decodeUint(value);
  if (decoded !== 0n && decoded !== 1n) throw new QuoteRpcFailure("rpc_schema_drift");
  return decoded === 1n;
}

function decodeAddress(value: unknown): string {
  if (typeof value !== "string" || !ADDRESS_WORD.test(value)) throw new QuoteRpcFailure("rpc_schema_drift");
  return `0x${value.slice(-40)}`;
}

function expectedAddress(value: string, expected: string): void {
  if (value.toLowerCase() !== expected.toLowerCase()) throw new QuoteRpcFailure("rpc_evidence_mismatch");
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
  if (requests.length !== 28 || requests.some((request, index) => request.id !== 92 + index)
    || new Set(requests.map((request) => request.id)).size !== requests.length) {
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

function decodeEthxExchangeRate(value: unknown): readonly [bigint, bigint, bigint] {
  if (typeof value !== "string" || !/^0x[0-9a-f]{192}$/.test(value)) throw new QuoteRpcFailure("rpc_schema_drift");
  return [BigInt(`0x${value.slice(2, 66)}`), BigInt(`0x${value.slice(66, 130)}`), BigInt(`0x${value.slice(130, 194)}`)];
}

function ethxExpectedQuote(amount: bigint, totalEthBalance: bigint, totalEthxSupply: bigint): bigint {
  return totalEthxSupply === 0n ? amount : (amount * totalEthBalance) / totalEthxSupply;
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
    lsethLastCompletedEpochId: evidence.lsethLastCompletedEpochId,
    ethxOracleReportingBlockNumber: evidence.ethxOracleReportingBlockNumber,
    swethLastRepriceUnix: evidence.swethLastRepriceUnix,
    oethLastRebaseUnix: evidence.oethLastRebaseUnix,
    oethRebasePaused: evidence.oethRebasePaused,
    oethWithdrawalClaimDelaySeconds: evidence.oethWithdrawalClaimDelaySeconds,
  });
}

function cloneEvidence(evidence: CombinedEvidence): CombinedEvidence {
  return {
    block: { ...evidence.block },
    quotes: evidence.quotes.map((quote) => ({ ...quote })),
    lsethLastCompletedEpochId: evidence.lsethLastCompletedEpochId,
    ethxOracleReportingBlockNumber: evidence.ethxOracleReportingBlockNumber,
    swethLastRepriceUnix: evidence.swethLastRepriceUnix,
    oethLastRebaseUnix: evidence.oethLastRebaseUnix,
    oethRebasePaused: evidence.oethRebasePaused,
    oethWithdrawalClaimDelaySeconds: evidence.oethWithdrawalClaimDelaySeconds,
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
    const actual = base.strategies[COVERED_BASE_STRATEGY_INDICES[index]!];
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
    ethCall(95, OSETH_CONTROLLER,
      `${SELECTORS.osethConvertToAssets}${uintArgument(BigInt(covered[5]!.share_accounting_underlying))}`, blockTag),
    ethCall(96, OSETH_CONTROLLER,
      `${SELECTORS.osethConvertToAssets}${uintArgument(BigInt(covered[5]!.token_custody))}`, blockTag),
    ethCall(97, METH_STAKING, SELECTORS.meth, blockTag),
    ethCall(98, METH_STAKING, SELECTORS.oracle, blockTag),
    ethCall(99, METH_STAKING,
      `${SELECTORS.methToEth}${uintArgument(BigInt(covered[8]!.share_accounting_underlying))}`, blockTag),
    ethCall(100, METH_STAKING,
      `${SELECTORS.methToEth}${uintArgument(BigInt(covered[8]!.token_custody))}`, blockTag),
    ethCall(101, EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token,
      `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArgument(BigInt(covered[7]!.share_accounting_underlying))}`, blockTag),
    ethCall(102, EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token,
      `${SELECTORS.lsethUnderlyingBalanceFromShares}${uintArgument(BigInt(covered[7]!.token_custody))}`, blockTag),
    ethCall(103, EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token, SELECTORS.lsethLastCompletedEpochId, blockTag),
    ethCall(104, ETHX_TOKEN, SELECTORS.ethxStaderConfig, blockTag),
    ethCall(105, ETHX_STAKE_POOLS_MANAGER, SELECTORS.ethxStaderConfig, blockTag),
    ethCall(106, ETHX_STADER_CONFIG, SELECTORS.ethxGetToken, blockTag),
    ethCall(107, ETHX_STADER_CONFIG, SELECTORS.ethxGetStakePoolsManager, blockTag),
    ethCall(108, ETHX_STADER_CONFIG, SELECTORS.ethxGetStaderOracle, blockTag),
    ethCall(109, ETHX_STAKE_POOLS_MANAGER,
      `${SELECTORS.ethxConvertToAssets}${uintArgument(BigInt(covered[3]!.share_accounting_underlying))}`, blockTag),
    ethCall(110, ETHX_STAKE_POOLS_MANAGER,
      `${SELECTORS.ethxConvertToAssets}${uintArgument(BigInt(covered[3]!.token_custody))}`, blockTag),
    ethCall(111, ETHX_STADER_ORACLE, SELECTORS.ethxGetExchangeRate, blockTag),
    ethCall(112, SWETH_TOKEN, SELECTORS.swethToEthRate, blockTag),
    ethCall(113, SWETH_TOKEN, SELECTORS.swethLastRepriceUnix, blockTag),
    ethCall(114, OETH_TOKEN, SELECTORS.oethVaultAddress, blockTag),
    ethCall(115, OETH_VAULT, SELECTORS.oethVaultOToken, blockTag),
    ethCall(116, OETH_VAULT, SELECTORS.oethVaultAsset, blockTag),
    ethCall(117, OETH_VAULT, SELECTORS.oethLastRebase, blockTag),
    ethCall(118, OETH_VAULT, SELECTORS.oethRebasePaused, blockTag),
    ethCall(119, OETH_VAULT, SELECTORS.oethWithdrawalClaimDelay, blockTag),
  ];
  const results = await postQuoteBatch(ctx, rpcUrl, requests);
  expectedAddress(decodeAddress(results.get(97)), EIGENLAYER_COVERED_LST_STRATEGIES[8].underlying_token);
  expectedAddress(decodeAddress(results.get(98)), METH_ORACLE);
  expectedAddress(decodeAddress(results.get(104)), ETHX_STADER_CONFIG);
  expectedAddress(decodeAddress(results.get(105)), ETHX_STADER_CONFIG);
  expectedAddress(decodeAddress(results.get(106)), ETHX_TOKEN);
  expectedAddress(decodeAddress(results.get(107)), ETHX_STAKE_POOLS_MANAGER);
  expectedAddress(decodeAddress(results.get(108)), ETHX_STADER_ORACLE);
  expectedAddress(decodeAddress(results.get(114)), OETH_VAULT);
  expectedAddress(decodeAddress(results.get(115)), OETH_TOKEN);
  expectedAddress(decodeAddress(results.get(116)), WETH_TOKEN);
  const [ethxReportingBlockNumber, ethxTotalEthBalance, ethxTotalEthxSupply] = decodeEthxExchangeRate(results.get(111));
  if (ethxReportingBlockNumber > BigInt(base.verified_block.number)) throw new QuoteRpcFailure("rpc_evidence_mismatch");
  const ethxShareQuote = decodeUint(results.get(109));
  const ethxCustodyQuote = decodeUint(results.get(110));
  if (ethxShareQuote !== ethxExpectedQuote(BigInt(covered[3]!.share_accounting_underlying), ethxTotalEthBalance, ethxTotalEthxSupply)
    || ethxCustodyQuote !== ethxExpectedQuote(BigInt(covered[3]!.token_custody), ethxTotalEthBalance, ethxTotalEthxSupply)) {
    throw new QuoteRpcFailure("rpc_evidence_mismatch");
  }
  const swethRate = decodeUint(results.get(112));
  const swethLastRepriceUnix = decodeUint(results.get(113));
  if (swethRate === 0n || swethLastRepriceUnix > BigInt(base.verified_block.timestamp)
    || (swethLastRepriceUnix === 0n && swethRate !== 10n ** 18n)) {
    throw new QuoteRpcFailure("rpc_evidence_mismatch");
  }
  const oethLastRebaseUnix = decodeUint64(results.get(117));
  const oethRebasePaused = decodeBool(results.get(118));
  const oethWithdrawalClaimDelaySeconds = decodeUint(results.get(119));
  if (oethLastRebaseUnix > BigInt(base.verified_block.timestamp)) {
    throw new QuoteRpcFailure("rpc_evidence_mismatch");
  }
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
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[3],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[3].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[3]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[3]!.token_custody),
      directShareAccountingEthQuote: ethxShareQuote,
      directTokenCustodyEthQuote: ethxCustodyQuote,
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[4],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[4].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[4]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[4]!.token_custody),
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[5],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[5].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[5]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[5]!.token_custody),
      directShareAccountingEthQuote: decodeUint(results.get(95)),
      directTokenCustodyEthQuote: decodeUint(results.get(96)),
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[6],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[6].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[6]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[6]!.token_custody),
      swethToEthRate: swethRate,
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[7],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[7].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[7]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[7]!.token_custody),
      directShareAccountingEthQuote: decodeUint(results.get(101)),
      directTokenCustodyEthQuote: decodeUint(results.get(102)),
    },
    {
      ...EIGENLAYER_COVERED_LST_STRATEGIES[8],
      underlyingToken: EIGENLAYER_COVERED_LST_STRATEGIES[8].underlying_token,
      shareAccountingTokenAmount: BigInt(covered[8]!.share_accounting_underlying),
      tokenCustodyTokenAmount: BigInt(covered[8]!.token_custody),
      directShareAccountingEthQuote: decodeUint(results.get(99)),
      directTokenCustodyEthQuote: decodeUint(results.get(100)),
    },
  ];
  const evidence: CombinedEvidence = {
    block: { ...base.verified_block },
    quotes,
    lsethLastCompletedEpochId: decodeUint(results.get(103)),
    ethxOracleReportingBlockNumber: ethxReportingBlockNumber,
    swethLastRepriceUnix,
    oethLastRebaseUnix,
    oethRebasePaused,
    oethWithdrawalClaimDelaySeconds,
  };
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
