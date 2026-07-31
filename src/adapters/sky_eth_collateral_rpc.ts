import type { AdapterContext, CacheSpec } from "./base.js";
import {
  buildUnavailableSkyEthCollateralCustodySnapshot,
  buildVerifiedSkyEthCollateralCustodySnapshot,
  SkyEthCollateralCustodyDomainError,
} from "../sky_eth_collateral_custody/metrics.js";
import {
  SKY_ETH_CUSTODY_ILKS,
  type SkyEthCollateralBlock,
  type SkyEthCollateralCustodySnapshot,
  type SkyEthCustodyIlkEvidenceInput,
  type SkyResolvedContracts,
} from "../sky_eth_collateral_custody/types.js";

const CACHE_SPEC: CacheSpec = { name: "sky_eth_collateral_custody", ttlMs: 30 * 60_000, max: 1 };
const CACHE_KEY = "sky-eth-collateral-custody:mainnet-v1";
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const UINT256_MAX = (2n ** 256n) - 1n;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH = /^0x[0-9a-f]{64}$/;
const WORD = /^0x[0-9a-f]{64}$/;
const ADDRESS_WORD = /^0x0{24}[0-9a-f]{40}$/;
const providerByContext = new WeakMap<AdapterContext, string>();

/** Governance-managed Ethereum mainnet Maker/Sky Chainlog. */
export const SKY_CHAINLOG = "0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F" as const;
const GET_ADDRESS = "0x21f8a721";
const VAT = "0x36569e77";
const ILK = "0xc5ce281e";
const GEM = "0x7bd2bea7";
const DEC = "0xb3bcfa82";
const LIVE = "0x957aa58c";
const BALANCE_OF = "0x70a08231";
const WSTETH_QUOTE = "0xbb2952fc";
const RETH_QUOTE = "0x8b32fa23";
const CHAINLOG_KEYS = ["MCD_VAT", "ETH", "WSTETH", "RETH", ...SKY_ETH_CUSTODY_ILKS.map((ilk) => ilk.chainlog_key)] as const;
const SOURCE = "ethereum_rpc" as const;
const ROLE = "sky_chainlog_finalized_adapter_custody_evidence" as const;

export interface SkyEthCollateralRpcInput {
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
  block: SkyEthCollateralBlock;
  contracts: SkyResolvedContracts;
  ilks: readonly SkyEthCustodyIlkEvidenceInput[];
  wstethQuotedEthWei: bigint;
  rethQuotedEthWei: bigint;
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
function failure(code: FailureCode): never { throw new RpcFailure(code === "rpc_not_configured" ? "rpc_access_gap" : code); }
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
function decodeAddress(value: unknown): string {
  const word = fixedWord(value);
  if (!ADDRESS_WORD.test(word)) throw new RpcFailure("rpc_schema_drift");
  const address = `0x${word.slice(-40)}`;
  if (address === ZERO_ADDRESS) throw new RpcFailure("rpc_evidence_mismatch");
  return address;
}
function decodeIlk(value: unknown): string {
  const word = fixedWord(value).slice(2);
  const bytes = Buffer.from(word, "hex");
  const terminator = bytes.indexOf(0);
  const text = bytes.subarray(0, terminator === -1 ? bytes.length : terminator);
  const padding = bytes.subarray(terminator === -1 ? bytes.length : terminator);
  if (text.length === 0 || ![...text].every((byte) => byte >= 0x20 && byte <= 0x7e) || ![...padding].every((byte) => byte === 0)) throw new RpcFailure("rpc_schema_drift");
  return text.toString("ascii");
}
function sum(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (result > UINT256_MAX) throw new RpcFailure("rpc_evidence_mismatch");
  return result;
}
function bytes32Argument(value: string): string {
  const encoded = Buffer.from(value, "ascii");
  if (encoded.length === 0 || encoded.length > 32 || ![...encoded].every((byte) => byte >= 0x20 && byte <= 0x7e)) failure("rpc_evidence_mismatch");
  return encoded.toString("hex").padEnd(64, "0");
}
function uintArgument(value: bigint): string {
  if (value < 0n || value > UINT256_MAX) failure("rpc_evidence_mismatch");
  return value.toString(16).padStart(64, "0");
}
function addressArgument(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function ethCall(id: number, to: string, data: string, blockTag: string): RpcRequest {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, blockTag] };
}
function exactEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === "id" && keys[1] === "jsonrpc" && keys[2] === "result";
}
async function postBatch(ctx: AdapterContext, rpcUrl: string, requests: readonly RpcRequest[]): Promise<Map<number, unknown>> {
  if (requests.length === 0 || new Set(requests.map((request) => request.id)).size !== requests.length) throw new RpcFailure("rpc_schema_drift");
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
    if (!exactEnvelope(envelope) || envelope.jsonrpc !== "2.0" || typeof envelope.id !== "number" || !Number.isSafeInteger(envelope.id)
      || !expected.has(envelope.id) || results.has(envelope.id)) throw new RpcFailure("rpc_access_gap");
    results.set(envelope.id, envelope.result);
  }
  if (results.size !== expected.size) throw new RpcFailure("rpc_access_gap");
  return results;
}
function finalizedBlock(value: unknown): SkyEthCollateralBlock {
  if (value === null) throw new RpcFailure("rpc_finality_gap");
  const block = record(value);
  if (typeof block.hash !== "string" || !HASH.test(block.hash)) throw new RpcFailure("rpc_schema_drift");
  return { number: safeNumber(block.number), hash: block.hash, timestamp: safeNumber(block.timestamp) };
}
function expectedAddress(value: string, expected: string): void {
  if (value.toLowerCase() !== expected.toLowerCase()) throw new RpcFailure("rpc_evidence_mismatch");
}
function freezeEvidence(evidence: VerifiedEvidence): VerifiedEvidence {
  return Object.freeze({
    block: Object.freeze({ ...evidence.block }), contracts: Object.freeze({ ...evidence.contracts }),
    ilks: Object.freeze(evidence.ilks.map((ilk) => Object.freeze({ ...ilk }))),
    wstethQuotedEthWei: evidence.wstethQuotedEthWei, rethQuotedEthWei: evidence.rethQuotedEthWei,
  });
}
function cloneEvidence(evidence: VerifiedEvidence): VerifiedEvidence {
  return { block: { ...evidence.block }, contracts: { ...evidence.contracts }, ilks: evidence.ilks.map((ilk) => ({ ...ilk })), wstethQuotedEthWei: evidence.wstethQuotedEthWei, rethQuotedEthWei: evidence.rethQuotedEthWei };
}
function unavailable(configured: boolean, code: FailureCode): SkyEthCollateralCustodySnapshot {
  const details: Record<FailureCode, string> = {
    rpc_not_configured: "Ethereum RPC is not configured.", rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.", rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.", rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  };
  return buildUnavailableSkyEthCollateralCustodySnapshot({
    summary: "Sky ETH-family adapter custody evidence is unavailable.", gaps: [{ code, detail: details[code] }],
    sources: configured ? [SOURCE] : [], sourceStatus: configured ? [{ source: SOURCE, role: ROLE, stale: false }] : [],
  });
}
function verified(evidence: VerifiedEvidence, stale: boolean): SkyEthCollateralCustodySnapshot {
  const copied = cloneEvidence(evidence);
  return buildVerifiedSkyEthCollateralCustodySnapshot({
    ...copied, sources: [SOURCE], sourceStatus: [{ source: SOURCE, role: ROLE, stale: false }], stale,
  });
}
function assertDomainEvidence(evidence: VerifiedEvidence): void {
  buildVerifiedSkyEthCollateralCustodySnapshot({
    ...cloneEvidence(evidence), sources: [SOURCE], sourceStatus: [{ source: SOURCE, role: ROLE, stale: false }],
  });
}

async function fetchVerifiedEvidence(ctx: AdapterContext, rpcUrl: string): Promise<VerifiedEvidence> {
  let id = 1;
  const round1: RpcRequest[] = [
    { jsonrpc: "2.0", id: id++, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: id++, method: "eth_getBlockByNumber", params: ["finalized", false] },
  ];
  const first = await postBatch(ctx, rpcUrl, round1);
  if (quantity(first.get(1)) !== 1n) throw new RpcFailure("rpc_chain_mismatch");
  const block = finalizedBlock(first.get(2));
  const blockTag = `0x${block.number.toString(16)}`;

  const round2 = CHAINLOG_KEYS.map((key) => ethCall(id++, SKY_CHAINLOG, `${GET_ADDRESS}${bytes32Argument(key)}`, blockTag));
  const second = await postBatch(ctx, rpcUrl, round2);
  const resolved = CHAINLOG_KEYS.map((_, index) => decodeAddress(second.get(round2[index]!.id)));
  const [vat, weth, wsteth, reth, ...joins] = resolved;
  expectedAddress(weth!, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  expectedAddress(wsteth!, "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");
  expectedAddress(reth!, "0xae78736Cd615f374D3085123A210448E74Fc6393");
  if (new Set(joins.map((join) => join!.toLowerCase())).size !== SKY_ETH_CUSTODY_ILKS.length) throw new RpcFailure("rpc_evidence_mismatch");
  const tokens = [weth!, weth!, weth!, wsteth!, wsteth!, reth!];
  const round3 = joins.flatMap((join, index) => [
    ethCall(id++, join!, VAT, blockTag), ethCall(id++, join!, ILK, blockTag), ethCall(id++, join!, GEM, blockTag),
    ethCall(id++, join!, DEC, blockTag), ethCall(id++, join!, LIVE, blockTag),
    ethCall(id++, tokens[index]!, `${BALANCE_OF}${addressArgument(join!)}`, blockTag),
  ]);
  const third = await postBatch(ctx, rpcUrl, round3);
  const ilks = joins.map((join, index) => {
    const base = index * 6;
    const expected = SKY_ETH_CUSTODY_ILKS[index]!;
    const actualVat = decodeAddress(third.get(round3[base]!.id));
    const actualIlk = decodeIlk(third.get(round3[base + 1]!.id));
    const actualToken = decodeAddress(third.get(round3[base + 2]!.id));
    const decimals = decodeUint(third.get(round3[base + 3]!.id));
    const live = decodeUint(third.get(round3[base + 4]!.id));
    const rawCustody = decodeUint(third.get(round3[base + 5]!.id));
    if (actualVat !== vat || actualIlk !== expected.ilk || actualToken.toLowerCase() !== expected.expected_token.toLowerCase() || decimals !== 18n || (live !== 0n && live !== 1n)) {
      throw new RpcFailure("rpc_evidence_mismatch");
    }
    return { ...expected, join: join!, vat: actualVat, token: actualToken, decimals: 18, live: Number(live), rawCustody };
  });
  const wstethRaw = ilks.filter((ilk) => ilk.asset === "wstETH").reduce((total, ilk) => sum(total, ilk.rawCustody), 0n);
  const rethRaw = ilks.filter((ilk) => ilk.asset === "rETH").reduce((total, ilk) => sum(total, ilk.rawCustody), 0n);
  const round4 = [
    ethCall(id++, wsteth!, `${WSTETH_QUOTE}${uintArgument(wstethRaw)}`, blockTag),
    ethCall(id++, reth!, `${RETH_QUOTE}${uintArgument(rethRaw)}`, blockTag),
  ];
  const fourth = await postBatch(ctx, rpcUrl, round4);
  const evidence: VerifiedEvidence = {
    block,
    contracts: { vat: vat!, weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", reth: "0xae78736Cd615f374D3085123A210448E74Fc6393" },
    ilks,
    wstethQuotedEthWei: decodeUint(fourth.get(round4[0]!.id)), rethQuotedEthWei: decodeUint(fourth.get(round4[1]!.id)),
  };
  assertDomainEvidence(evidence);
  return evidence;
}

export async function fetchSkyEthCollateralCustody(input: SkyEthCollateralRpcInput, ctx: AdapterContext): Promise<SkyEthCollateralCustodySnapshot> {
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
    if (error instanceof SkyEthCollateralCustodyDomainError) return unavailable(true, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    return unavailable(true, "rpc_access_gap");
  }
}
