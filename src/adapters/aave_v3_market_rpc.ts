import type { AdapterContext, CacheSpec } from "./base.js";

const CACHE_TTL_MS = 30 * 60_000;
const MAX_ASSETS = 32;
const MAX_MARKETS_PER_CACHE = 8;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const WORD_PATTERN = /^0x[0-9a-f]{64}$/;
const CONFIGURATION_PATTERN = /^0x[0-9a-f]{640}$/;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const ASSET_SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,15}$/;
const bindingByContext = new WeakMap<AdapterContext, Map<string, { fingerprint: string; provider: string }>>();

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

export interface FinalizedAaveV3MarketSpec {
  marketId: string;
  cacheName: string;
  poolAddressesProvider: string;
  assets: readonly { symbol: string; underlying: string }[];
}

export interface FinalizedAaveV3MarketEvidence {
  block: { number: number; hash: string; timestamp: number };
  reserves: readonly {
    symbol: string;
    underlying: string;
    decimals: number;
    active: boolean;
    collateralEnabled: boolean;
    suppliedRaw: bigint;
    oraclePrice: bigint;
  }[];
}

export type AaveV3MarketRpcFailureCode =
  | "rpc_not_configured"
  | "rpc_access_gap"
  | "rpc_chain_mismatch"
  | "rpc_finality_gap"
  | "rpc_schema_drift"
  | "rpc_evidence_mismatch";

export type FinalizedAaveV3MarketResult =
  | { status: "verified"; evidence: FinalizedAaveV3MarketEvidence; stale: boolean }
  | { status: "unavailable"; code: AaveV3MarketRpcFailureCode };

export interface FinalizedAaveV3MarketInput {
  /** Internal-only provider configuration. It is never returned or cached. */
  rpcUrl?: unknown;
}

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: "eth_chainId" | "eth_getBlockByNumber" | "eth_call";
  params: unknown[];
}

class RpcFailure extends Error {
  constructor(readonly code: Exclude<AaveV3MarketRpcFailureCode, "rpc_not_configured">) {
    super(code);
  }
}

function configuredRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizedSpec(spec: FinalizedAaveV3MarketSpec): FinalizedAaveV3MarketSpec | null {
  if (typeof spec !== "object" || spec === null || typeof spec.marketId !== "string" || spec.marketId.trim() === ""
    || typeof spec.cacheName !== "string" || spec.cacheName.trim() === "" || !IDENTIFIER_PATTERN.test(spec.marketId)
    || !IDENTIFIER_PATTERN.test(spec.cacheName) || !ADDRESS_PATTERN.test(spec.poolAddressesProvider)
    || !Array.isArray(spec.assets) || spec.assets.length === 0 || spec.assets.length > MAX_ASSETS) return null;
  const symbols = new Set<string>();
  const addresses = new Set<string>();
  const assets: { symbol: string; underlying: string }[] = [];
  let wethCount = 0;
  for (const asset of spec.assets) {
    if (typeof asset !== "object" || asset === null || typeof asset.symbol !== "string" || !ASSET_SYMBOL_PATTERN.test(asset.symbol)
      || typeof asset.underlying !== "string" || !ADDRESS_PATTERN.test(asset.underlying)) return null;
    const address = asset.underlying.toLowerCase();
    if (symbols.has(asset.symbol) || addresses.has(address) || address === ZERO_ADDRESS) return null;
    symbols.add(asset.symbol);
    addresses.add(address);
    assets.push({ symbol: asset.symbol, underlying: address });
    if (asset.symbol === "WETH") wethCount += 1;
  }
  if (wethCount !== 1) return null;
  return {
    marketId: spec.marketId,
    cacheName: spec.cacheName,
    poolAddressesProvider: spec.poolAddressesProvider.toLowerCase(),
    assets,
  };
}

function specFingerprint(spec: FinalizedAaveV3MarketSpec): string {
  return [spec.marketId, spec.cacheName, spec.poolAddressesProvider, ...spec.assets.flatMap((asset) => [asset.symbol, asset.underlying])].join("\u0000");
}

function bindProvider(
  ctx: AdapterContext,
  spec: FinalizedAaveV3MarketSpec,
  rpcUrl: string,
): { fingerprint: string } | { code: "rpc_access_gap" | "rpc_evidence_mismatch" } {
  const fingerprint = specFingerprint(spec);
  let bindings = bindingByContext.get(ctx);
  if (bindings === undefined) {
    bindings = new Map();
    bindingByContext.set(ctx, bindings);
  }
  const existing = bindings.get(spec.marketId);
  if (existing !== undefined && existing.fingerprint !== fingerprint) return { code: "rpc_evidence_mismatch" };
  if (existing !== undefined && existing.provider !== rpcUrl) return { code: "rpc_access_gap" };
  bindings.set(spec.marketId, { fingerprint, provider: rpcUrl });
  return { fingerprint };
}

function freezeEvidence(evidence: FinalizedAaveV3MarketEvidence): FinalizedAaveV3MarketEvidence {
  const reserves = evidence.reserves.map((reserve) => Object.freeze({ ...reserve }));
  return Object.freeze({ block: Object.freeze({ ...evidence.block }), reserves: Object.freeze(reserves) });
}

function cloneEvidence(evidence: FinalizedAaveV3MarketEvidence): FinalizedAaveV3MarketEvidence {
  return { block: { ...evidence.block }, reserves: evidence.reserves.map((reserve) => ({ ...reserve })) };
}

function record(value: unknown, code: RpcFailure["code"] = "rpc_schema_drift"): Record<string, unknown> {
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
  return { decimals: Number(decimals), collateralEnabled: bools[0]!, active: bools[3]! };
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
      || !expectedIds.has(envelope.id) || values.has(envelope.id)) throw new RpcFailure("rpc_access_gap");
    values.set(envelope.id, envelope.result);
  }
  if (values.size !== expectedIds.size) throw new RpcFailure("rpc_access_gap");
  return values;
}

function finalizedBlock(value: unknown): { number: number; hash: string; timestamp: number } {
  if (value === null) throw new RpcFailure("rpc_finality_gap");
  const block = record(value);
  if (typeof block.hash !== "string" || !HASH_PATTERN.test(block.hash)) throw new RpcFailure("rpc_schema_drift");
  return { number: safeNumber(block.number), hash: block.hash, timestamp: safeNumber(block.timestamp) };
}

async function fetchVerified(
  spec: FinalizedAaveV3MarketSpec,
  ctx: AdapterContext,
  rpcUrl: string,
): Promise<FinalizedAaveV3MarketEvidence> {
  let nextId = 1;
  const initial: RpcRequest[] = [
    { jsonrpc: "2.0", id: nextId++, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: nextId++, method: "eth_getBlockByNumber", params: ["finalized", false] },
  ];
  const initialResults = await postBatch(ctx, rpcUrl, initial);
  if (canonicalQuantity(initialResults.get(initial[0]!.id)) !== 1n) throw new RpcFailure("rpc_chain_mismatch");
  const block = finalizedBlock(initialResults.get(initial[1]!.id));
  const blockTag = `0x${block.number.toString(16)}`;

  const providerCalls = [
    ethCall(nextId++, spec.poolAddressesProvider, GET_POOL_DATA_PROVIDER, blockTag),
    ethCall(nextId++, spec.poolAddressesProvider, GET_PRICE_ORACLE, blockTag),
  ];
  const providerResults = await postBatch(ctx, rpcUrl, providerCalls);
  const dataProvider = decodeAddress(providerResults.get(providerCalls[0]!.id));
  const oracle = decodeAddress(providerResults.get(providerCalls[1]!.id));

  const evidenceCalls = spec.assets.flatMap((asset) => [
    ethCall(nextId++, dataProvider, addressArgument(GET_RESERVE_CONFIGURATION_DATA, asset.underlying), blockTag),
    ethCall(nextId++, dataProvider, addressArgument(GET_A_TOKEN_TOTAL_SUPPLY, asset.underlying), blockTag),
  ]);
  const evidenceResults = await postBatch(ctx, rpcUrl, evidenceCalls);
  const configurations = spec.assets.map((_, index) => decodeConfiguration(evidenceResults.get(evidenceCalls[index * 2]!.id)));
  const supplies = spec.assets.map((_, index) => decodeUint(evidenceResults.get(evidenceCalls[index * 2 + 1]!.id)));

  const weth = spec.assets.find((asset) => asset.symbol === "WETH")!;
  const priceAssets = [...spec.assets, weth];
  const priceCalls = priceAssets.map((asset) => ethCall(nextId++, oracle, addressArgument(GET_ASSET_PRICE, asset.underlying), blockTag));
  const priceResults = await postBatch(ctx, rpcUrl, priceCalls);
  const prices = spec.assets.map((_, index) => decodeUint(priceResults.get(priceCalls[index]!.id)));
  const referenceWethPrice = decodeUint(priceResults.get(priceCalls[priceCalls.length - 1]!.id));
  const wethIndex = spec.assets.findIndex((asset) => asset.symbol === "WETH");
  if (prices[wethIndex] !== referenceWethPrice) throw new RpcFailure("rpc_evidence_mismatch");

  const reserves = spec.assets.map((asset, index) => ({
    symbol: asset.symbol,
    underlying: asset.underlying.toLowerCase(),
    decimals: configurations[index]!.decimals,
    active: configurations[index]!.active,
    collateralEnabled: configurations[index]!.collateralEnabled,
    suppliedRaw: supplies[index]!,
    oraclePrice: prices[index]!,
  }));
  if (reserves.some((reserve) => reserve.decimals !== 18 || !reserve.active || reserve.oraclePrice <= 0n || reserve.suppliedRaw < 0n)) {
    throw new RpcFailure("rpc_evidence_mismatch");
  }
  return { block, reserves };
}

export async function fetchFinalizedAaveV3Market(
  spec: FinalizedAaveV3MarketSpec,
  input: FinalizedAaveV3MarketInput,
  ctx: AdapterContext,
): Promise<FinalizedAaveV3MarketResult> {
  const normalized = normalizedSpec(spec);
  if (normalized === null) return { status: "unavailable", code: "rpc_evidence_mismatch" };
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return { status: "unavailable", code: "rpc_not_configured" };
  const binding = bindProvider(ctx, normalized, rpcUrl);
  if ("code" in binding) return { status: "unavailable", code: binding.code };
  const cacheSpec: CacheSpec = { name: normalized.cacheName, ttlMs: CACHE_TTL_MS, max: MAX_MARKETS_PER_CACHE };
  const cache = ctx.cacheFor<FinalizedAaveV3MarketEvidence>(cacheSpec);
  const key = `finalized-aave-v3-market:${binding.fingerprint}`;
  try {
    const evidence = await cache.getOrLoad(key, async () => freezeEvidence(await fetchVerified(normalized, ctx, rpcUrl)));
    return { status: "verified", evidence: cloneEvidence(evidence), stale: false };
  } catch (error) {
    const stale = cache.getStale(key);
    if (stale !== undefined) return { status: "verified", evidence: cloneEvidence(stale), stale: true };
    if (error instanceof RpcFailure) return { status: "unavailable", code: error.code };
    return { status: "unavailable", code: "rpc_access_gap" };
  }
}
