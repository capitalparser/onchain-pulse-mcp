import { describe, expect, it } from "vitest";
import {
  calculateEthFeeCrossCheck,
  EthFeeCrossCheckDomainError,
  formatExactEthAmount,
  type NormalizedEthFeeBlock,
} from "../../src/eth_fee_cross_check/metrics.js";

function hash(seed: number): string {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function validBlock(): NormalizedEthFeeBlock {
  return {
    number: 100,
    hash: hash(100),
    baseFeePerGas: 10n,
    gasUsed: 5n,
    transactions: [hash(1), hash(2)],
    receipts: [
      {
        blockNumber: 100,
        blockHash: hash(100),
        transactionHash: hash(1),
        transactionIndex: 0,
        gasUsed: 2n,
        effectiveGasPrice: 13n,
      },
      {
        blockNumber: 100,
        blockHash: hash(100),
        transactionHash: hash(2),
        transactionIndex: 1,
        gasUsed: 3n,
        effectiveGasPrice: 12n,
      },
    ],
  };
}

function validBlobBlock(): NormalizedEthFeeBlock {
  return {
    number: 101,
    hash: hash(101),
    baseFeePerGas: 20n,
    gasUsed: 4n,
    blobGasUsed: 7n,
    transactions: [hash(3)],
    receipts: [
      {
        blockNumber: 101,
        blockHash: hash(101),
        transactionHash: hash(3),
        transactionIndex: 0,
        gasUsed: 4n,
        effectiveGasPrice: 21n,
        blobGasUsed: 7n,
        blobGasPrice: 3n,
      },
    ],
  };
}

function expectDomainError(
  mutate: (block: NormalizedEthFeeBlock) => void,
  category: "schema" | "evidence_mismatch",
): void {
  const block = validBlock();
  mutate(block);
  try {
    calculateEthFeeCrossCheck([block]);
    throw new Error("Expected calculation to reject invalid evidence.");
  } catch (error) {
    expect(error).toBeInstanceOf(EthFeeCrossCheckDomainError);
    expect((error as EthFeeCrossCheckDomainError).category).toBe(category);
  }
}

describe("formatExactEthAmount", () => {
  it.each([
    [0n, { wei: "0", eth: "0" }],
    [1n, { wei: "1", eth: "0.000000000000000001" }],
    [1_234_500_000_000_000_000n, { wei: "1234500000000000000", eth: "1.2345" }],
    [1_000_000_000_000_000_001n, { wei: "1000000000000000001", eth: "1.000000000000000001" }],
  ])("formats %s wei without floating point", (wei, expected) => {
    expect(formatExactEthAmount(wei)).toEqual(expected);
  });

  it("rejects negative wei instead of exposing a signed ETH amount", () => {
    expect(() => formatExactEthAmount(-1n)).toThrow(EthFeeCrossCheckDomainError);
  });
});

describe("calculateEthFeeCrossCheck", () => {
  it("computes one block's exact base burn, priority fee, execution fee, gross fee, and total burn", () => {
    const result = calculateEthFeeCrossCheck([validBlock()]);

    expect(result.transactionCount).toBe(2);
    expect(result.blocks).toEqual([
      {
        number: 100,
        hash: hash(100),
        transactionCount: 2,
        metrics: {
          executionFee: 62n,
          baseFeeBurn: 50n,
          priorityFee: 12n,
          blobFeeBurn: 0n,
          grossFee: 62n,
          totalBurn: 50n,
        },
      },
    ]);
    expect(result.metrics).toEqual({
      executionFee: 62n,
      baseFeeBurn: 50n,
      priorityFee: 12n,
      blobFeeBurn: 0n,
      grossFee: 62n,
      totalBurn: 50n,
    });
  });

  it("aggregates consecutive blob and non-blob blocks with literal exact totals", () => {
    const result = calculateEthFeeCrossCheck([validBlock(), validBlobBlock()]);

    expect(result.transactionCount).toBe(3);
    expect(result.metrics).toEqual({
      executionFee: 146n,
      baseFeeBurn: 130n,
      priorityFee: 16n,
      blobFeeBurn: 21n,
      grossFee: 167n,
      totalBurn: 151n,
    });
  });

  it("rejects malformed normalized evidence as schema-shaped failure", () => {
    expectDomainError((block) => {
      block.hash = "0x1234";
    }, "schema");
  });

  it.each([
    ["non-consecutive block numbers", (blocks: NormalizedEthFeeBlock[]) => { blocks.push({ ...validBlobBlock(), number: 102 }); }],
    ["duplicate block hashes", (blocks: NormalizedEthFeeBlock[]) => { blocks.push({ ...validBlobBlock(), hash: hash(100) }); }],
    ["duplicate transaction hashes", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.transactions[1] = hash(1); }],
    ["receipt count mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts.pop(); }],
    ["receipt block number mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts[0]!.blockNumber = 99; }],
    ["receipt block hash mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts[0]!.blockHash = hash(99); }],
    ["non-contiguous receipt index", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts[1]!.transactionIndex = 2; }],
    ["receipt transaction hash mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts[0]!.transactionHash = hash(9); }],
    ["receipt gas total mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.gasUsed = 6n; }],
    ["effective price below base fee", (blocks: NormalizedEthFeeBlock[]) => { blocks[0]!.receipts[0]!.effectiveGasPrice = 9n; }],
    ["blob gas total mismatch", (blocks: NormalizedEthFeeBlock[]) => { blocks.push({ ...validBlobBlock(), blobGasUsed: 8n }); }],
    ["blob fields with no block blob gas", (blocks: NormalizedEthFeeBlock[]) => { const block = validBlobBlock(); delete block.blobGasUsed; blocks.push(block); }],
  ])("rejects %s as an evidence mismatch", (_name, mutate) => {
    const blocks = [validBlock()];
    mutate(blocks);
    expect(() => calculateEthFeeCrossCheck(blocks)).toThrow(EthFeeCrossCheckDomainError);
    try {
      calculateEthFeeCrossCheck(blocks);
    } catch (error) {
      expect((error as EthFeeCrossCheckDomainError).category).toBe("evidence_mismatch");
    }
  });

  it("rejects a receipt with only one blob field as schema-shaped evidence", () => {
    expectDomainError((block) => {
      block.receipts[0]!.blobGasUsed = 1n;
    }, "schema");
  });
});
