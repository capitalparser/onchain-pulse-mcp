import type { AdapterContext } from "./base.js";
import {
  buildUnavailableEthCollateralSnapshot,
  buildVerifiedEthCollateralSnapshot,
  EthCollateralDomainError,
} from "../eth_collateral_demand/metrics.js";
import {
  ETH_COLLATERAL_ASSETS,
  type EthCollateralDemandSnapshot,
  type EthCollateralGapCode,
} from "../eth_collateral_demand/types.js";

const CACHE_SPEC = { name: "eth_collateral_aave_v3", ttlMs: 30 * 60_000, max: 1 };
const CACHE_KEY = "aave-v3-ethereum-core-finalized";
const POOL_ADDRESSES_PROVIDER = "0x2f39d218133afa8f2b819b1066c7e434ad94e9e";
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const WORD_PATTERN = /^0x[0-9a-f]{64}$/;
const CONFIGURATION_PATTERN = /^0x[0-9a-f]{640}$/;
const providerByContext = new WeakMap<AdapterContext, string>();

/** IPoolAddressesProvider.getPoolDataProvider(). */
const GET_POOL_DATA_PROVIDER = "0xe860accb";
/** IPoolAddressesProvider.getPriceOracle(). */
const GET_PRICE_ORACLE = "0xfca513a8";
/** IPoolDataProvider.getReserveConfigurationData(address). */
const GET_RESERVE_CONFIGURATION_DATA = "0x3e150141";
/** IPoolDataProvider.getATokenTotalSupply(address). */
const GET_A_TOKEN_TOTAL_SUPPLY = "0x51460e25";
/** IAaveOracle.getAssetPrice(address). */
const GET_ASSET_PRICE = "0xb3596f07";

export interface EthCollateralAaveV3Input {
  /** Internal-only provider configuration. It is never returned or cached. */
  rpcUrl?: unknown;
}

type FailureCode = Extract<EthCollateralGapCode,
  "rpc_access_gap" | "rpc_chain_mismatch" | "rpc_finality_gap" | "rpc_schema_drift" | "rpc_evidence_mismatch"
>;
type UnavailableCode = FailureCode | "rpc_not_configured";

class RpcFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: "eth_chainId" | "eth_getBlockByNumber" | "eth_call";
  params: unknown[];
}

function configuredRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bindProvider(ctx: AdapterContext, rpcUrl: string): boolean {
  const existing = providerByContext.get(ctx);
  if (existing !== undefined && existing !== rpcUrl) return false;
  if (existing === undefined) providerByContext.set(ctx, rpcUrl);
  return true;
}

function unavailable(input: EthCollateralAaveV3Input, code: UnavailableCode): EthCollateralDemandSnapshot {
  const configured = configuredRpcUrl(input.rpcUrl) !== null;
  const detail = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  }[code];
  return buildUnavailableEthCollateralSnapshot({
    summary: "Aave V3 Ethereum collateral capacity evidence is unavailable.",
    gaps: [{ code, detail }],
    sources: configured ? ["ethereum_rpc"] : [],
    sourceStatus: configured
      ? [{ source: "ethereum_rpc", role: "aave_v3_finalized_reserve_evidence", stale: false }]
      : [],
  });
}

function record(value: unknown, code: FailureCode = "rpc_schema_drift"): Record<string, unknown> {
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

function fixedWord(value: unknown): string {
  if (typeof value !== "string" || !WORD_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return value;
}

function decodeUint(value: unknown): bigint {
  return BigInt(fixedWord(value));
}

function decodeAddress(value: unknown): string {
  const word = fixedWord(value);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(word)) throw new RpcFailure("rpc_schema_drift");
  const address = `0x${word.slice(-40)}`;
  if (address === ZERO_ADDRESS) throw new RpcFailure("rpc_evidence_mismatch");
  return address;
}

function decodeBoolWord(value: string): boolean {
  if (value === `0x${"0".repeat(64)}`) return false;
  if (value === `0x${"0".repeat(63)}1`) return true;
  throw new RpcFailure("rpc_schema_drift");
}

function decodeConfiguration(value: unknown): { decimals: number; collateralEnabled: boolean; active: boolean } {
  if (typeof value !== "string" || !CONFIGURATION_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  const words = Array.from({ length: 10 }, (_, index) => `0x${value.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
  const decimals = BigInt(words[0]!);
  if (decimals > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcFailure("rpc_schema_drift");
  const bools = [5, 6, 7, 8, 9].map((index) => decodeBoolWord(words[index]!));
  return {
    decimals: Number(decimals),
    collateralEnabled: bools[0]!,
    active: bools[3]!,
  };
}

function addressArgument(selector: string, address: string): string {
  return `${selector}${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function ethCall(id: number, to: string, data: string, blockTag: string): RpcRequest {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to, data }, blockTag] };
}

async function postBatch(ctx: AdapterContext, rpcUrl: string, requests: RpcRequest[]): Promise<Map<number, unknown>> {
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
  const values = new Map<number, unknown>();
  for (const item of payload) {
    const envelope = record(item, "rpc_access_gap");
    if (envelope.jsonrpc !== "2.0" || typeof envelope.id !== "number" || !Number.isSafeInteger(envelope.id)
      || Object.prototype.hasOwnProperty.call(envelope, "error") || !Object.prototype.hasOwnProperty.call(envelope, "result")
      || !expectedIds.has(envelope.id) || values.has(envelope.id)) {
      throw new RpcFailure("rpc_access_gap");
    }
    values.set(envelope.id, envelope.result);
  }
  if (values.size !== expectedIds.size) throw new RpcFailure("rpc_access_gap");
  return values;
}

function finalizedBlock(value: unknown): { number: number; hash: string; timestamp: number } {
  if (value === null) throw new RpcFailure("rpc_finality_gap");
  const block = record(value);
  const hash = block.hash;
  if (typeof hash !== "string" || !HASH_PATTERN.test(hash)) throw new RpcFailure("rpc_schema_drift");
  return { number: safeNumber(block.number), hash, timestamp: safeNumber(block.timestamp) };
}

function staleSnapshot(snapshot: EthCollateralDemandSnapshot): EthCollateralDemandSnapshot {
  if (snapshot.status !== "verified" || snapshot.verified_block === null) throw new RpcFailure("rpc_evidence_mismatch");
  return buildVerifiedEthCollateralSnapshot({
    block: snapshot.verified_block,
    reserves: snapshot.assets.map((asset) => ({
      symbol: asset.symbol,
      underlying: asset.underlying,
      decimals: asset.decimals,
      active: asset.active,
      collateralEnabled: asset.collateral_enabled,
      suppliedRaw: BigInt(asset.supplied_raw),
      oraclePrice: BigInt(asset.oracle_price),
    })),
    sources: snapshot.sources,
    sourceStatus: snapshot.source_status,
    stale: true,
  });
}

async function fetchVerified(ctx: AdapterContext, rpcUrl: string): Promise<EthCollateralDemandSnapshot> {
  let nextId = 1;
  const initial = [
    { jsonrpc: "2.0" as const, id: nextId++, method: "eth_chainId" as const, params: [] },
    { jsonrpc: "2.0" as const, id: nextId++, method: "eth_getBlockByNumber" as const, params: ["finalized", false] },
  ];
  const initialResults = await postBatch(ctx, rpcUrl, initial);
  if (canonicalQuantity(initialResults.get(initial[0]!.id)) !== 1n) throw new RpcFailure("rpc_chain_mismatch");
  const block = finalizedBlock(initialResults.get(initial[1]!.id));
  const blockTag = `0x${block.number.toString(16)}`;

  const providerCalls = [
    ethCall(nextId++, POOL_ADDRESSES_PROVIDER, GET_POOL_DATA_PROVIDER, blockTag),
    ethCall(nextId++, POOL_ADDRESSES_PROVIDER, GET_PRICE_ORACLE, blockTag),
  ];
  const providerResults = await postBatch(ctx, rpcUrl, providerCalls);
  const dataProvider = decodeAddress(providerResults.get(providerCalls[0]!.id));
  const oracle = decodeAddress(providerResults.get(providerCalls[1]!.id));

  const evidenceCalls = ETH_COLLATERAL_ASSETS.flatMap((asset) => [
    ethCall(nextId++, dataProvider, addressArgument(GET_RESERVE_CONFIGURATION_DATA, asset.underlying), blockTag),
    ethCall(nextId++, dataProvider, addressArgument(GET_A_TOKEN_TOTAL_SUPPLY, asset.underlying), blockTag),
  ]);
  const evidenceResults = await postBatch(ctx, rpcUrl, evidenceCalls);
  const configurations = ETH_COLLATERAL_ASSETS.map((_, index) => decodeConfiguration(evidenceResults.get(evidenceCalls[index * 2]!.id)));
  const supplies = ETH_COLLATERAL_ASSETS.map((_, index) => decodeUint(evidenceResults.get(evidenceCalls[index * 2 + 1]!.id)));

  const priceAssets = [...ETH_COLLATERAL_ASSETS, ETH_COLLATERAL_ASSETS[0]!];
  const priceCalls = priceAssets.map((asset) => ethCall(
    nextId++, oracle, addressArgument(GET_ASSET_PRICE, asset.underlying), blockTag,
  ));
  const priceResults = await postBatch(ctx, rpcUrl, priceCalls);
  const prices = ETH_COLLATERAL_ASSETS.map((_, index) => decodeUint(priceResults.get(priceCalls[index]!.id)));
  const referenceWethPrice = decodeUint(priceResults.get(priceCalls[10]!.id));
  if (prices[0] !== referenceWethPrice) throw new RpcFailure("rpc_evidence_mismatch");

  try {
    return buildVerifiedEthCollateralSnapshot({
      block,
      reserves: ETH_COLLATERAL_ASSETS.map((asset, index) => ({
        symbol: asset.symbol,
        underlying: asset.underlying,
        decimals: configurations[index]!.decimals,
        active: configurations[index]!.active,
        collateralEnabled: configurations[index]!.collateralEnabled,
        suppliedRaw: supplies[index]!,
        oraclePrice: prices[index]!,
      })),
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "aave_v3_finalized_reserve_evidence", stale: false }],
    });
  } catch (error) {
    if (error instanceof EthCollateralDomainError) {
      throw new RpcFailure(error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    throw error;
  }
}

export async function fetchEthCollateralAaveV3(
  input: EthCollateralAaveV3Input,
  ctx: AdapterContext,
): Promise<EthCollateralDemandSnapshot> {
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return unavailable(input, "rpc_not_configured");
  if (!bindProvider(ctx, rpcUrl)) return unavailable(input, "rpc_access_gap");
  const cache = ctx.cacheFor<EthCollateralDemandSnapshot>(CACHE_SPEC);
  try {
    return await cache.getOrLoad(CACHE_KEY, () => fetchVerified(ctx, rpcUrl));
  } catch (error) {
    const stale = cache.getStale(CACHE_KEY);
    if (stale !== undefined) {
      try {
        return staleSnapshot(stale);
      } catch {
        return unavailable(input, "rpc_evidence_mismatch");
      }
    }
    if (error instanceof RpcFailure) return unavailable(input, error.code);
    return unavailable(input, "rpc_access_gap");
  }
}
