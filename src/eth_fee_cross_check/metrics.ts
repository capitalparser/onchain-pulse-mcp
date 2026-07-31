import type { ExactEthAmount } from "./types.js";

const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

export type EthFeeCrossCheckDomainErrorCategory = "schema" | "evidence_mismatch";

export class EthFeeCrossCheckDomainError extends Error {
  constructor(
    public readonly category: EthFeeCrossCheckDomainErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "EthFeeCrossCheckDomainError";
  }
}

export interface NormalizedEthFeeReceipt {
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  blobGasUsed?: bigint;
  blobGasPrice?: bigint;
}

export interface NormalizedEthFeeBlock {
  number: number;
  hash: string;
  baseFeePerGas: bigint;
  gasUsed: bigint;
  blobGasUsed?: bigint;
  transactions: string[];
  receipts: NormalizedEthFeeReceipt[];
}

export interface FeeMetrics {
  executionFee: bigint;
  baseFeeBurn: bigint;
  priorityFee: bigint;
  blobFeeBurn: bigint;
  grossFee: bigint;
  totalBurn: bigint;
}

export interface EthFeeCrossCheckCalculationBlock {
  number: number;
  hash: string;
  transactionCount: number;
  metrics: FeeMetrics;
}

export interface EthFeeCrossCheckCalculation {
  transactionCount: number;
  blocks: EthFeeCrossCheckCalculationBlock[];
  metrics: FeeMetrics;
}

function schema(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EthFeeCrossCheckDomainError("schema", message);
}

function mismatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EthFeeCrossCheckDomainError("evidence_mismatch", message);
}

function isSafeBlockNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isUnsigned(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

function emptyMetrics(): FeeMetrics {
  return {
    executionFee: 0n,
    baseFeeBurn: 0n,
    priorityFee: 0n,
    blobFeeBurn: 0n,
    grossFee: 0n,
    totalBurn: 0n,
  };
}

function addMetrics(left: FeeMetrics, right: FeeMetrics): FeeMetrics {
  return {
    executionFee: left.executionFee + right.executionFee,
    baseFeeBurn: left.baseFeeBurn + right.baseFeeBurn,
    priorityFee: left.priorityFee + right.priorityFee,
    blobFeeBurn: left.blobFeeBurn + right.blobFeeBurn,
    grossFee: left.grossFee + right.grossFee,
    totalBurn: left.totalBurn + right.totalBurn,
  };
}

function validateBlockShape(block: NormalizedEthFeeBlock): void {
  schema(isSafeBlockNumber(block.number), "Block number must be a non-negative safe integer.");
  schema(HASH_PATTERN.test(block.hash), "Block hash must be a 32-byte hex hash.");
  schema(isUnsigned(block.baseFeePerGas), "Block base fee must be unsigned.");
  schema(isUnsigned(block.gasUsed), "Block gas used must be unsigned.");
  schema(block.blobGasUsed === undefined || isUnsigned(block.blobGasUsed), "Block blob gas used must be unsigned.");
  schema(Array.isArray(block.transactions), "Block transactions must be an array.");
  schema(Array.isArray(block.receipts), "Block receipts must be an array.");

  for (const transactionHash of block.transactions) {
    schema(HASH_PATTERN.test(transactionHash), "Transaction hash must be a 32-byte hex hash.");
  }
  for (const receipt of block.receipts) {
    schema(isSafeBlockNumber(receipt.blockNumber), "Receipt block number must be a non-negative safe integer.");
    schema(HASH_PATTERN.test(receipt.blockHash), "Receipt block hash must be a 32-byte hex hash.");
    schema(HASH_PATTERN.test(receipt.transactionHash), "Receipt transaction hash must be a 32-byte hex hash.");
    schema(Number.isSafeInteger(receipt.transactionIndex) && receipt.transactionIndex >= 0, "Receipt transaction index must be a non-negative safe integer.");
    schema(isUnsigned(receipt.gasUsed), "Receipt gas used must be unsigned.");
    schema(isUnsigned(receipt.effectiveGasPrice), "Receipt effective gas price must be unsigned.");
    schema(
      (receipt.blobGasUsed === undefined) === (receipt.blobGasPrice === undefined),
      "Receipt blob gas fields must be both present or both absent.",
    );
    schema(receipt.blobGasUsed === undefined || isUnsigned(receipt.blobGasUsed), "Receipt blob gas used must be unsigned.");
    schema(receipt.blobGasPrice === undefined || isUnsigned(receipt.blobGasPrice), "Receipt blob gas price must be unsigned.");
  }
}

function calculateBlock(block: NormalizedEthFeeBlock): EthFeeCrossCheckCalculationBlock {
  validateBlockShape(block);
  mismatch(block.receipts.length === block.transactions.length, "Receipt count must equal transaction count.");

  const transactionHashes = new Set(block.transactions);
  mismatch(transactionHashes.size === block.transactions.length, "Transaction hashes must be unique.");

  let receiptGasUsed = 0n;
  let receiptBlobGasUsed = 0n;
  let executionFee = 0n;
  let priorityFee = 0n;
  let blobFeeBurn = 0n;

  for (let index = 0; index < block.receipts.length; index += 1) {
    const receipt = block.receipts[index]!;
    mismatch(receipt.blockNumber === block.number, "Receipt block number must match its block.");
    mismatch(receipt.blockHash === block.hash, "Receipt block hash must match its block.");
    mismatch(receipt.transactionIndex === index, "Receipt transaction indices must be contiguous.");
    mismatch(receipt.transactionHash === block.transactions[index], "Receipt transaction hash must match its block transaction.");
    mismatch(receipt.effectiveGasPrice >= block.baseFeePerGas, "Receipt effective gas price must not be below block base fee.");

    receiptGasUsed += receipt.gasUsed;
    executionFee += receipt.gasUsed * receipt.effectiveGasPrice;
    priorityFee += receipt.gasUsed * (receipt.effectiveGasPrice - block.baseFeePerGas);

    if (receipt.blobGasUsed !== undefined && receipt.blobGasPrice !== undefined) {
      receiptBlobGasUsed += receipt.blobGasUsed;
      blobFeeBurn += receipt.blobGasUsed * receipt.blobGasPrice;
    }
  }

  mismatch(receiptGasUsed === block.gasUsed, "Receipt gas totals must equal block gas used.");
  if (block.blobGasUsed === undefined) {
    mismatch(receiptBlobGasUsed === 0n, "Blob receipts require block blob gas used.");
  } else {
    mismatch(receiptBlobGasUsed === block.blobGasUsed, "Receipt blob gas totals must equal block blob gas used.");
  }

  const baseFeeBurn = block.gasUsed * block.baseFeePerGas;
  const metrics: FeeMetrics = {
    executionFee,
    baseFeeBurn,
    priorityFee,
    blobFeeBurn,
    grossFee: executionFee + blobFeeBurn,
    totalBurn: baseFeeBurn + blobFeeBurn,
  };
  mismatch(metrics.executionFee === metrics.baseFeeBurn + metrics.priorityFee, "Execution fee identity failed.");
  mismatch(metrics.grossFee === metrics.executionFee + metrics.blobFeeBurn, "Gross fee identity failed.");
  mismatch(metrics.totalBurn === metrics.baseFeeBurn + metrics.blobFeeBurn, "Total burn identity failed.");

  return {
    number: block.number,
    hash: block.hash,
    transactionCount: block.transactions.length,
    metrics,
  };
}

export function calculateEthFeeCrossCheck(evidence: NormalizedEthFeeBlock[]): EthFeeCrossCheckCalculation {
  schema(Array.isArray(evidence) && evidence.length > 0, "Evidence must contain at least one block.");

  const blocks = evidence.map(calculateBlock);
  const blockHashes = new Set<string>();
  const transactionHashes = new Set<string>();
  let metrics = emptyMetrics();
  let transactionCount = 0;

  for (let index = 0; index < evidence.length; index += 1) {
    const block = evidence[index]!;
    if (index > 0) mismatch(block.number === evidence[index - 1]!.number + 1, "Block numbers must be consecutive.");
    mismatch(!blockHashes.has(block.hash), "Block hashes must be unique.");
    blockHashes.add(block.hash);
    for (const transactionHash of block.transactions) {
      mismatch(!transactionHashes.has(transactionHash), "Transaction hashes must be unique across the range.");
      transactionHashes.add(transactionHash);
    }
    metrics = addMetrics(metrics, blocks[index]!.metrics);
    transactionCount += block.transactions.length;
  }

  mismatch(metrics.executionFee === metrics.baseFeeBurn + metrics.priorityFee, "Aggregate execution fee identity failed.");
  mismatch(metrics.grossFee === metrics.executionFee + metrics.blobFeeBurn, "Aggregate gross fee identity failed.");
  mismatch(metrics.totalBurn === metrics.baseFeeBurn + metrics.blobFeeBurn, "Aggregate total burn identity failed.");

  return { transactionCount, blocks, metrics };
}

export function formatExactEthAmount(wei: bigint): ExactEthAmount {
  schema(isUnsigned(wei), "Wei amount must be unsigned.");
  const whole = wei / WEI_PER_ETH;
  const fraction = (wei % WEI_PER_ETH).toString().padStart(18, "0").replace(/0+$/, "");
  return {
    wei: wei.toString(),
    eth: fraction === "" ? whole.toString() : `${whole}.${fraction}`,
  };
}
