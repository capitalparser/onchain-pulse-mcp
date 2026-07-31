import type { AdapterContext } from "./base.js";
import {
  calculateEthFeeCrossCheck,
  EthFeeCrossCheckDomainError,
  formatExactEthAmount,
  type NormalizedEthFeeBlock,
  type FeeMetrics,
} from "../eth_fee_cross_check/metrics.js";
import {
  ETH_FEE_CROSS_CHECK_MAX_BLOCKS,
  type EthFeeCrossCheckBlock,
  type EthFeeCrossCheckGapCode,
  type EthFeeCrossCheckMetrics,
  type EthFeeCrossCheckSnapshot,
} from "../eth_fee_cross_check/types.js";

const CACHE_SPEC = {
  name: "eth_fee_rpc",
  ttlMs: 30 * 60_000,
  max: 32,
};
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const providerByContext = new WeakMap<AdapterContext, string>();

export interface EthFeeRpcInput {
  startBlock: number;
  endBlock: number;
  includeBlocks: boolean;
  /** Internal-only transport configuration. Do not expose this value. */
  rpcUrl?: string;
}

type FailureKind = Exclude<EthFeeCrossCheckGapCode, "rpc_not_configured" | "source_stale">;

class RpcFailure extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind);
  }
}

function emptyMetrics(): EthFeeCrossCheckMetrics {
  return {
    execution_fee: null,
    base_fee_burn: null,
    priority_fee: null,
    blob_fee_burn: null,
    gross_fee: null,
    total_burn: null,
  };
}

function cacheKey(input: EthFeeRpcInput): string {
  return `${input.startBlock}:${input.endBlock}:${input.includeBlocks}`;
}

function assertRange(input: EthFeeRpcInput): void {
  if (typeof input.includeBlocks !== "boolean") {
    throw new TypeError("includeBlocks must be a boolean.");
  }
  if (
    !Number.isSafeInteger(input.startBlock)
    || !Number.isSafeInteger(input.endBlock)
    || input.startBlock < 0
    || input.endBlock < input.startBlock
    || input.endBlock - input.startBlock + 1 > ETH_FEE_CROSS_CHECK_MAX_BLOCKS
  ) {
    throw new RangeError("Ethereum fee RPC input must be a bounded ordered block range.");
  }
}

function configuredRpcUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function unavailable(input: EthFeeRpcInput, code: Exclude<EthFeeCrossCheckGapCode, "source_stale">): EthFeeCrossCheckSnapshot {
  const configured = configuredRpcUrl(input.rpcUrl) !== null;
  const detail = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_finality_gap: "Ethereum RPC could not verify the requested finalized range.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  }[code];

  return {
    status: "unavailable",
    summary: "Ethereum execution fee evidence is unavailable.",
    methodology: "eth-execution-fee-cross-check-v1",
    requested_range: {
      start_block: input.startBlock,
      end_block: input.endBlock,
      max_blocks: ETH_FEE_CROSS_CHECK_MAX_BLOCKS,
    },
    verified_range: null,
    metrics: emptyMetrics(),
    identities: null,
    sources: configured ? ["ethereum_execution_rpc"] : [],
    source_status: configured
      ? [{ source: "ethereum_execution_rpc", role: "finalized_execution_fee_evidence", as_of: null, stale: false }]
      : [],
    gaps: [{ code, detail }],
    capabilities: { ethereum_rpc_active: configured },
  };
}

function staleSnapshot(snapshot: EthFeeCrossCheckSnapshot): EthFeeCrossCheckSnapshot {
  return {
    ...snapshot,
    summary: "Cached finalized Ethereum execution fee evidence was used after refresh failure.",
    source_status: snapshot.source_status.map((status) => ({ ...status, stale: true })),
    gaps: snapshot.gaps.some((gap) => gap.code === "source_stale")
      ? snapshot.gaps
      : [...snapshot.gaps, { code: "source_stale", detail: "Ethereum RPC refresh failed; verified finalized evidence was cached." }],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RpcFailure("rpc_schema_drift");
  return value as Record<string, unknown>;
}

function envelopeRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RpcFailure("rpc_access_gap");
  return value as Record<string, unknown>;
}

function canonicalQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return BigInt(value);
}

function safeBlockNumber(value: unknown): number {
  const quantity = canonicalQuantity(value);
  if (quantity > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcFailure("rpc_schema_drift");
  return Number(quantity);
}

function canonicalHash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new RpcFailure("rpc_schema_drift");
  return value;
}

function optionalBlobQuantities(value: Record<string, unknown>): { blobGasUsed?: bigint; blobGasPrice?: bigint } {
  const hasUsed = Object.prototype.hasOwnProperty.call(value, "blobGasUsed");
  const hasPrice = Object.prototype.hasOwnProperty.call(value, "blobGasPrice");
  if (hasUsed !== hasPrice) throw new RpcFailure("rpc_schema_drift");
  if (!hasUsed) return {};
  return { blobGasUsed: canonicalQuantity(value.blobGasUsed), blobGasPrice: canonicalQuantity(value.blobGasPrice) };
}

function parseBlock(value: unknown, requestedBlock: number): Omit<NormalizedEthFeeBlock, "receipts"> {
  const block = record(value);
  const number = safeBlockNumber(block.number);
  if (number !== requestedBlock) throw new RpcFailure("rpc_evidence_mismatch");
  if (!Array.isArray(block.transactions)) throw new RpcFailure("rpc_schema_drift");
  const transactions = block.transactions.map(canonicalHash);
  const hasBlobGas = Object.prototype.hasOwnProperty.call(block, "blobGasUsed");
  return {
    number,
    hash: canonicalHash(block.hash),
    baseFeePerGas: canonicalQuantity(block.baseFeePerGas),
    gasUsed: canonicalQuantity(block.gasUsed),
    ...(hasBlobGas ? { blobGasUsed: canonicalQuantity(block.blobGasUsed) } : {}),
    transactions,
  };
}

function parseReceipts(value: unknown): NormalizedEthFeeBlock["receipts"] {
  if (!Array.isArray(value)) throw new RpcFailure("rpc_schema_drift");
  return value.map((raw) => {
    const receipt = record(raw);
    const blob = optionalBlobQuantities(receipt);
    const index = safeBlockNumber(receipt.transactionIndex);
    return {
      blockNumber: safeBlockNumber(receipt.blockNumber),
      blockHash: canonicalHash(receipt.blockHash),
      transactionHash: canonicalHash(receipt.transactionHash),
      transactionIndex: index,
      gasUsed: canonicalQuantity(receipt.gasUsed),
      effectiveGasPrice: canonicalQuantity(receipt.effectiveGasPrice),
      ...blob,
    };
  });
}

async function postJson(ctx: AdapterContext, rpcUrl: string, request: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await ctx.fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new RpcFailure("rpc_access_gap");
  }
  if (!response.ok) throw new RpcFailure("rpc_access_gap");
  try {
    return await response.json();
  } catch {
    throw new RpcFailure("rpc_access_gap");
  }
}

function parseResponse(value: unknown, expectedIds: ReadonlySet<number>): Map<number, unknown> {
  if (!Array.isArray(value) || value.length !== expectedIds.size) throw new RpcFailure("rpc_access_gap");
  const responses = new Map<number, unknown>();
  for (const raw of value) {
    const response = envelopeRecord(raw);
    if (response.jsonrpc !== "2.0" || typeof response.id !== "number" || !Number.isSafeInteger(response.id)) {
      throw new RpcFailure("rpc_access_gap");
    }
    if (Object.prototype.hasOwnProperty.call(response, "error") || !Object.prototype.hasOwnProperty.call(response, "result")) {
      throw new RpcFailure("rpc_access_gap");
    }
    if (!expectedIds.has(response.id) || responses.has(response.id)) throw new RpcFailure("rpc_access_gap");
    responses.set(response.id, response.result);
  }
  if (responses.size !== expectedIds.size) throw new RpcFailure("rpc_access_gap");
  return responses;
}

async function finalizedBlock(ctx: AdapterContext, rpcUrl: string): Promise<number> {
  const body = await postJson(ctx, rpcUrl, { jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["finalized", false] });
  const response = envelopeRecord(body);
  if (response.jsonrpc !== "2.0" || response.id !== 1 || Object.prototype.hasOwnProperty.call(response, "error")) {
    throw new RpcFailure("rpc_access_gap");
  }
  if (!Object.prototype.hasOwnProperty.call(response, "result")) throw new RpcFailure("rpc_access_gap");
  if (response.result === null) throw new RpcFailure("rpc_finality_gap");
  return safeBlockNumber(record(response.result).number);
}

function toPublicMetrics(metrics: FeeMetrics): EthFeeCrossCheckMetrics {
  return {
    execution_fee: formatExactEthAmount(metrics.executionFee),
    base_fee_burn: formatExactEthAmount(metrics.baseFeeBurn),
    priority_fee: formatExactEthAmount(metrics.priorityFee),
    blob_fee_burn: formatExactEthAmount(metrics.blobFeeBurn),
    gross_fee: formatExactEthAmount(metrics.grossFee),
    total_burn: formatExactEthAmount(metrics.totalBurn),
  };
}

async function fetchVerified(input: EthFeeRpcInput, ctx: AdapterContext, rpcUrl: string): Promise<EthFeeCrossCheckSnapshot> {
  const finalized = await finalizedBlock(ctx, rpcUrl);
  if (input.endBlock > finalized) throw new RpcFailure("rpc_finality_gap");

  const evidence: NormalizedEthFeeBlock[] = [];
  let nextId = 2;
  for (let chunkStart = input.startBlock; chunkStart <= input.endBlock; chunkStart += 20) {
    const blockNumbers = Array.from({ length: Math.min(20, input.endBlock - chunkStart + 1) }, (_, offset) => chunkStart + offset);
    const request = blockNumbers.flatMap((blockNumber) => {
      const blockId = nextId++;
      const receiptsId = nextId++;
      return [
        { jsonrpc: "2.0", id: blockId, method: "eth_getBlockByNumber", params: [`0x${blockNumber.toString(16)}`, false] },
        { jsonrpc: "2.0", id: receiptsId, method: "eth_getBlockReceipts", params: [`0x${blockNumber.toString(16)}`] },
      ];
    });
    const responses = parseResponse(await postJson(ctx, rpcUrl, request), new Set(request.map((item) => item.id)));
    for (let offset = 0; offset < blockNumbers.length; offset += 1) {
      const blockId = request[offset * 2]!.id;
      const receiptsId = request[offset * 2 + 1]!.id;
      const block = parseBlock(responses.get(blockId), blockNumbers[offset]!);
      evidence.push({ ...block, receipts: parseReceipts(responses.get(receiptsId)) });
    }
  }

  let calculation;
  try {
    calculation = calculateEthFeeCrossCheck(evidence);
  } catch (error) {
    if (error instanceof EthFeeCrossCheckDomainError) {
      throw new RpcFailure(error.category === "schema" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    throw error;
  }

  const blocks: EthFeeCrossCheckBlock[] | undefined = input.includeBlocks
    ? calculation.blocks.map((block) => ({
        block_number: block.number,
        block_hash: block.hash,
        transaction_count: block.transactionCount,
        metrics: toPublicMetrics(block.metrics) as NonNullable<EthFeeCrossCheckBlock["metrics"]>,
      }))
    : undefined;
  return {
    status: "verified",
    summary: "Ethereum execution fee evidence was verified against finalized blocks.",
    methodology: "eth-execution-fee-cross-check-v1",
    requested_range: { start_block: input.startBlock, end_block: input.endBlock, max_blocks: ETH_FEE_CROSS_CHECK_MAX_BLOCKS },
    verified_range: {
      start_block: input.startBlock,
      end_block: input.endBlock,
      finalized_block: finalized,
      block_count: evidence.length,
      transaction_count: calculation.transactionCount,
    },
    metrics: toPublicMetrics(calculation.metrics),
    identities: {
      execution_equals_base_plus_priority: true,
      gross_equals_execution_plus_blob: true,
      total_burn_equals_base_plus_blob: true,
    },
    ...(blocks === undefined ? {} : { blocks }),
    sources: ["ethereum_execution_rpc"],
    source_status: [{ source: "ethereum_execution_rpc", role: "finalized_execution_fee_evidence", as_of: `block:${finalized}`, stale: false }],
    gaps: [],
    capabilities: { ethereum_rpc_active: true },
  };
}

export async function fetchEthFeeRpc(input: EthFeeRpcInput, ctx: AdapterContext): Promise<EthFeeCrossCheckSnapshot> {
  assertRange(input);
  const rpcUrl = configuredRpcUrl(input.rpcUrl);
  if (rpcUrl === null) return unavailable(input, "rpc_not_configured");
  const boundProvider = providerByContext.get(ctx);
  if (boundProvider !== undefined && boundProvider !== rpcUrl) return unavailable(input, "rpc_access_gap");
  if (boundProvider === undefined) providerByContext.set(ctx, rpcUrl);

  const cache = ctx.cacheFor<EthFeeCrossCheckSnapshot>(CACHE_SPEC);
  const key = cacheKey(input);
  try {
    return await cache.getOrLoad(key, async () => fetchVerified(input, ctx, rpcUrl));
  } catch (error) {
    const stale = cache.getStale(key);
    if (stale !== undefined) return staleSnapshot(stale);
    if (error instanceof RpcFailure) return unavailable(input, error.kind);
    return unavailable(input, "rpc_access_gap");
  }
}
