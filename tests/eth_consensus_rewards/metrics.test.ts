import { describe, expect, it } from "vitest";
import {
  calculateEthConsensusRewards,
  epochSlots,
  EthConsensusRewardsDomainError,
  formatExactSignedGweiAmount,
  type NormalizedEthConsensusRewardsEvidence,
} from "../../src/eth_consensus_rewards/metrics.js";

function root(seed: number): string {
  return `0x${seed.toString(16).padStart(64, "0")}`;
}

function validEvidence(): NormalizedEthConsensusRewardsEvidence {
  return {
    epoch: 10,
    finalizedEpoch: 11,
    attestationRewards: [
      { validatorIndex: 1, head: 10n, target: -3n, source: 2n, inactivity: -1n, inclusionDelay: 4n },
      { validatorIndex: 2, head: -5n, target: 4n, source: 0n, inactivity: 1n },
    ],
    headers: [{ slot: 320, blockRoot: root(1), proposerIndex: 7 }],
    blockProposerRewards: [{
      blockRoot: root(1), proposerIndex: 7, total: 10n,
      attestations: 4n, syncAggregate: 3n, proposerSlashings: 2n, attesterSlashings: 1n,
    }],
    syncCommitteeRewards: [{ blockRoot: root(1), rewards: [{ validatorIndex: 3, reward: -2n }, { validatorIndex: 4, reward: 7n }] }],
    missedSlots: Array.from({ length: 31 }, (_, index) => 321 + index),
  };
}

function expectDomainError(
  mutate: (evidence: NormalizedEthConsensusRewardsEvidence) => void,
  category: "schema" | "evidence_mismatch",
): void {
  const evidence = validEvidence();
  mutate(evidence);
  expect(() => calculateEthConsensusRewards(evidence)).toThrow(EthConsensusRewardsDomainError);
  try { calculateEthConsensusRewards(evidence); } catch (error) {
    expect((error as EthConsensusRewardsDomainError).category).toBe(category);
  }
}

describe("formatExactSignedGweiAmount", () => {
  it("formats a negative sub-one-ETH signed Gwei total exactly", () => {
    expect(formatExactSignedGweiAmount(-1n)).toEqual({
      gwei: "-1",
      eth: "-0.000000001",
    });
  });

  it.each([
    [0n, { gwei: "0", eth: "0" }],
    [1n, { gwei: "1", eth: "0.000000001" }],
    [1_234_500_000n, { gwei: "1234500000", eth: "1.2345" }],
    [-1_000_000_001n, { gwei: "-1000000001", eth: "-1.000000001" }],
  ])("formats %s signed Gwei without floating point", (gwei, expected) => {
    expect(formatExactSignedGweiAmount(gwei)).toEqual(expected);
  });

  it("rejects non-bigint values as typed schema errors", () => {
    expect(() => (formatExactSignedGweiAmount as (value: unknown) => unknown)(1)).toThrow(EthConsensusRewardsDomainError);
  });
});

describe("calculateEthConsensusRewards", () => {
  it("sums literal positive and negative reward components and optional phase0 inclusion delay", () => {
    const result = calculateEthConsensusRewards(validEvidence());

    expect(result).toMatchObject({
      startSlot: 320,
      endSlot: 351,
      proposedBlockCount: 1,
      missedSlotCount: 31,
      attestationValidatorCount: 2,
      syncRewardEntryCount: 2,
      attestationNetReward: 12n,
      syncCommitteeNetReward: 5n,
      blockProposerReward: 10n,
      observedConsensusReward: 27n,
    });
    expect(result.blocks).toBeUndefined();
  });

  it("includes verified block rows only when the caller requests them", () => {
    expect(calculateEthConsensusRewards(validEvidence(), true).blocks).toEqual([
      { slot: 320, blockRoot: root(1), proposerIndex: 7, blockProposerReward: 10n, syncCommitteeNetReward: 5n },
    ]);
  });

  it("computes the exact 32-slot epoch range and rejects safe-integer overflow", () => {
    expect(epochSlots(10)).toEqual({ startSlot: 320, endSlot: 351 });
    expect(() => epochSlots(Math.floor((Number.MAX_SAFE_INTEGER - 31) / 32) + 1)).toThrow(EthConsensusRewardsDomainError);
  });

  it.each([
    ["a duplicate attestation validator", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.attestationRewards[1]!.validatorIndex = 1; }],
    ["a malformed attestation bigint", (evidence: NormalizedEthConsensusRewardsEvidence) => { (evidence.attestationRewards[0] as unknown as { head: unknown }).head = 1; }],
  ])("rejects %s as schema-shaped or evidence mismatch evidence", (_name, mutate) => {
    const evidence = validEvidence();
    mutate(evidence);
    expect(() => calculateEthConsensusRewards(evidence)).toThrow(EthConsensusRewardsDomainError);
  });

  it.each([
    ["a duplicate attestation validator", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.attestationRewards[1]!.validatorIndex = 1; }, "evidence_mismatch"],
    ["a header proposer mismatch", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.blockProposerRewards[0]!.proposerIndex = 8; }, "evidence_mismatch"],
    ["a duplicate canonical root", (evidence: NormalizedEthConsensusRewardsEvidence) => {
      evidence.headers.push({ slot: 321, blockRoot: root(1), proposerIndex: 8 });
      evidence.missedSlots = evidence.missedSlots.slice(1);
      evidence.blockProposerRewards.push({ blockRoot: root(1), proposerIndex: 8, total: 0n, attestations: 0n, syncAggregate: 0n, proposerSlashings: 0n, attesterSlashings: 0n });
      evidence.syncCommitteeRewards.push({ blockRoot: root(1), rewards: [] });
    }, "evidence_mismatch"],
    ["unordered canonical header slots", (evidence: NormalizedEthConsensusRewardsEvidence) => {
      evidence.headers = [{ slot: 321, blockRoot: root(2), proposerIndex: 8 }, evidence.headers[0]!];
      evidence.missedSlots = evidence.missedSlots.filter((slot) => slot !== 321);
      evidence.blockProposerRewards.push({ blockRoot: root(2), proposerIndex: 8, total: 0n, attestations: 0n, syncAggregate: 0n, proposerSlashings: 0n, attesterSlashings: 0n });
      evidence.syncCommitteeRewards.push({ blockRoot: root(2), rewards: [] });
    }, "evidence_mismatch"],
    ["a header outside the epoch", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.headers[0]!.slot = 319; }, "evidence_mismatch"],
    ["a missing slot", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.missedSlots.pop(); }, "evidence_mismatch"],
    ["a block component decomposition mismatch", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.blockProposerRewards[0]!.total = 11n; }, "evidence_mismatch"],
    ["a sync response for a noncanonical root", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.syncCommitteeRewards[0]!.blockRoot = root(9); }, "evidence_mismatch"],
    ["an epoch that is not finalized", (evidence: NormalizedEthConsensusRewardsEvidence) => { evidence.finalizedEpoch = 10; }, "evidence_mismatch"],
  ] as const)("rejects %s with the exact typed category", (_name, mutate, category) => {
    expectDomainError(mutate, category);
  });

  it("rejects malformed normalized root evidence as a schema error", () => {
    expectDomainError((evidence) => { evidence.headers[0]!.blockRoot = "0x1234"; }, "schema");
  });
});
