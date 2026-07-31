import { describe, expect, it } from "vitest";
import {
  EthConsensusRewardsCrossCheckSnapshotSchema,
  ExactSignedGweiAmountSchema,
  GetEthConsensusRewardsCrossCheckInputSchema,
  type EthConsensusRewardsCrossCheckSnapshot,
} from "../../src/eth_consensus_rewards/types.js";

function exact(gwei: string, eth: string) { return { gwei, eth }; }
function root(seed: number): string { return `0x${seed.toString(16).padStart(64, "0")}`; }

function verifiedSnapshot(): EthConsensusRewardsCrossCheckSnapshot {
  return {
    status: "verified", summary: "Verified observed finalized Beacon reward components.", methodology: "eth-consensus-rewards-cross-check-v1",
    requested_epoch: { epoch: 10, slots_per_epoch: 32, max_epochs: 1 },
    verified_epoch: { epoch: 10, start_slot: 320, end_slot: 351, finalized_epoch: 11, proposed_block_count: 1, missed_slot_count: 31, attestation_validator_count: 2, sync_reward_entry_count: 2 },
    metrics: { attestation_net_reward: exact("12", "0.000000012"), sync_committee_net_reward: exact("5", "0.000000005"), block_proposer_reward: exact("10", "0.00000001"), observed_consensus_reward: exact("27", "0.000000027"), consensus_issuance: null, net_issuance: null },
    identities: { observed_equals_attestation_plus_sync_plus_proposer: true, proposer_total_equals_reported_components: true },
    coverage: { attestation_rewards_complete: true, sync_committee_rewards_complete: true, block_proposer_rewards_complete: true, slashing_penalties_complete: false, deposit_withdrawal_reconciliation_complete: false, consensus_issuance_complete: false, net_issuance_complete: false },
    sources: ["Ethereum Beacon API"], source_status: [{ source: "ethereum_beacon_api", role: "finalized reward component evidence", as_of: "2026-07-31T00:00:00Z", stale: false }],
    gaps: [{ code: "consensus_issuance_incomplete", detail: "Exposed reward components do not prove complete consensus issuance." }, { code: "net_issuance_requires_burn_alignment", detail: "Net issuance requires an exactly aligned execution burn boundary." }],
    capabilities: { ethereum_beacon_api_active: true },
  };
}

describe("GetEthConsensusRewardsCrossCheckInputSchema", () => {
  it("defaults include_blocks to false for one safe epoch", () => {
    expect(GetEthConsensusRewardsCrossCheckInputSchema.parse({ epoch: 0 })).toEqual({
      epoch: 0,
      include_blocks: false,
    });
  });

  it.each([{ epoch: -1 }, { epoch: 1.5 }, { epoch: Number.MAX_SAFE_INTEGER + 1 }, { epoch: 1, extra: true }])("rejects invalid epoch input %j", (input) => {
    expect(GetEthConsensusRewardsCrossCheckInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("ExactSignedGweiAmountSchema", () => {
  it("accepts literal exact positive and negative signed Gwei amounts", () => {
    expect(ExactSignedGweiAmountSchema.parse(exact("-1000000001", "-1.000000001"))).toEqual(exact("-1000000001", "-1.000000001"));
  });

  it.each([exact("-0", "0"), exact("1", "1e-9"), exact("1", "0.000000002"), exact("-1", "-0"), exact("1", "0.0000000001")])("rejects non-exact signed public amount %j", (amount) => {
    expect(ExactSignedGweiAmountSchema.safeParse(amount).success).toBe(false);
  });
});

describe("EthConsensusRewardsCrossCheckSnapshotSchema", () => {
  it("accepts a verified snapshot while retaining issuance and net issuance as null", () => {
    const candidate = verifiedSnapshot();
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("accepts ordered optional block rows only when they reconcile to exposed block metrics", () => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    candidate.blocks = [{ slot: 320, block_root: root(1), proposer_index: 7, block_proposer_reward: exact("10", "0.00000001"), sync_committee_net_reward: exact("5", "0.000000005") }];
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it.each([
    ["a verified epoch with incorrect slots", (candidate: Record<string, unknown>) => { (candidate.verified_epoch as Record<string, unknown>).end_slot = 350; }],
    ["proposed and missed slots not equal to 32", (candidate: Record<string, unknown>) => { (candidate.verified_epoch as Record<string, unknown>).missed_slot_count = 30; }],
    ["an observed sum relabeled with a false identity", (candidate: Record<string, unknown>) => { (candidate.metrics as Record<string, unknown>).observed_consensus_reward = exact("28", "0.000000028"); }],
    ["false exposed coverage", (candidate: Record<string, unknown>) => { (candidate.coverage as Record<string, unknown>).sync_committee_rewards_complete = false; }],
    ["missing permanent issuance coverage gap", (candidate: Record<string, unknown>) => { candidate.gaps = (candidate.gaps as Array<Record<string, unknown>>).slice(1); }],
    ["block rows in reverse slot order", (candidate: Record<string, unknown>) => {
      (candidate.verified_epoch as Record<string, unknown>).proposed_block_count = 2; (candidate.verified_epoch as Record<string, unknown>).missed_slot_count = 30;
      (candidate.metrics as Record<string, unknown>).block_proposer_reward = exact("11", "0.000000011"); (candidate.metrics as Record<string, unknown>).sync_committee_net_reward = exact("6", "0.000000006"); (candidate.metrics as Record<string, unknown>).observed_consensus_reward = exact("29", "0.000000029");
      candidate.blocks = [{ slot: 321, block_root: root(2), proposer_index: 8, block_proposer_reward: exact("1", "0.000000001"), sync_committee_net_reward: exact("1", "0.000000001") }, { slot: 320, block_root: root(1), proposer_index: 7, block_proposer_reward: exact("10", "0.00000001"), sync_committee_net_reward: exact("5", "0.000000005") }];
    }],
  ] as const)("rejects %s", (_name, mutate) => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "beacon_not_configured",
    "beacon_access_gap",
    "beacon_finality_gap",
    "beacon_schema_drift",
    "beacon_evidence_mismatch",
  ] as const)("rejects a verified snapshot with contradictory %s", (code) => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    (candidate.gaps as Array<Record<string, unknown>>).push({ code, detail: "A verified result cannot retain a transport or evidence failure." });
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    ["aggregate proposer reward", (candidate: Record<string, unknown>) => { (candidate.metrics as Record<string, unknown>).block_proposer_reward = exact("-1", "-0.000000001"); (candidate.metrics as Record<string, unknown>).observed_consensus_reward = exact("16", "0.000000016"); }],
    ["block-row proposer reward", (candidate: Record<string, unknown>) => { candidate.blocks = [{ slot: 320, block_root: root(1), proposer_index: 7, block_proposer_reward: exact("-1", "-0.000000001"), sync_committee_net_reward: exact("5", "0.000000005") }]; (candidate.metrics as Record<string, unknown>).block_proposer_reward = exact("-1", "-0.000000001"); (candidate.metrics as Record<string, unknown>).observed_consensus_reward = exact("16", "0.000000016"); }],
  ] as const)("rejects a negative public %s", (_name, mutate) => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("permits exactly one stale fallback gap on a verified snapshot", () => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    (candidate.gaps as Array<Record<string, unknown>>).push({ code: "source_stale", detail: "A previously verified finalized epoch is stale." });
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("accepts an unavailable snapshot only with null observed metrics, no evidence, and a bounded source gap", () => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable"; candidate.verified_epoch = null; candidate.identities = null; candidate.metrics = { attestation_net_reward: null, sync_committee_net_reward: null, block_proposer_reward: null, observed_consensus_reward: null, consensus_issuance: null, net_issuance: null };
    candidate.coverage = { attestation_rewards_complete: false, sync_committee_rewards_complete: false, block_proposer_rewards_complete: false, slashing_penalties_complete: false, deposit_withdrawal_reconciliation_complete: false, consensus_issuance_complete: false, net_issuance_complete: false };
    candidate.gaps = [{ code: "beacon_access_gap", detail: "Provider is unavailable." }]; candidate.sources = []; candidate.source_status = [];
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("preserves beacon_not_configured as a valid unavailable no-config result", () => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable"; candidate.verified_epoch = null; candidate.identities = null; candidate.metrics = { attestation_net_reward: null, sync_committee_net_reward: null, block_proposer_reward: null, observed_consensus_reward: null, consensus_issuance: null, net_issuance: null };
    candidate.coverage = { attestation_rewards_complete: false, sync_committee_rewards_complete: false, block_proposer_rewards_complete: false, slashing_penalties_complete: false, deposit_withdrawal_reconciliation_complete: false, consensus_issuance_complete: false, net_issuance_complete: false };
    candidate.gaps = [{ code: "beacon_not_configured", detail: "Ethereum Beacon API is not configured." }]; candidate.sources = []; candidate.source_status = [];
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it.each([
    ["a partial observed metric", (candidate: Record<string, unknown>) => { (candidate.metrics as Record<string, unknown>).attestation_net_reward = exact("1", "0.000000001"); }],
    ["verified evidence", (candidate: Record<string, unknown>) => { candidate.verified_epoch = verifiedSnapshot().verified_epoch; }],
    ["exposed coverage", (candidate: Record<string, unknown>) => { (candidate.coverage as Record<string, unknown>).block_proposer_rewards_complete = true; }],
    ["only a permanent coverage gap", (candidate: Record<string, unknown>) => { candidate.gaps = [{ code: "consensus_issuance_incomplete", detail: "Incomplete." }]; }],
  ] as const)("rejects unavailable output with %s", (_name, mutate) => {
    const candidate = verifiedSnapshot() as unknown as Record<string, unknown>;
    candidate.status = "unavailable"; candidate.verified_epoch = null; candidate.identities = null; candidate.metrics = { attestation_net_reward: null, sync_committee_net_reward: null, block_proposer_reward: null, observed_consensus_reward: null, consensus_issuance: null, net_issuance: null };
    candidate.coverage = { attestation_rewards_complete: false, sync_committee_rewards_complete: false, block_proposer_rewards_complete: false, slashing_penalties_complete: false, deposit_withdrawal_reconciliation_complete: false, consensus_issuance_complete: false, net_issuance_complete: false };
    candidate.gaps = [{ code: "beacon_access_gap", detail: "Provider is unavailable." }]; candidate.sources = []; candidate.source_status = [];
    mutate(candidate);
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.safeParse(candidate).success).toBe(false);
  });
});
