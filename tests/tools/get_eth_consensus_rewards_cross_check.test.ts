import { describe, expect, it } from "vitest";
import {
  EthConsensusRewardsCrossCheckSnapshotSchema,
  type EthConsensusRewardsCrossCheckSnapshot,
} from "../../src/eth_consensus_rewards/types.js";
import { getEthConsensusRewardsCrossCheck } from "../../src/tools/get_eth_consensus_rewards_cross_check.js";

function verifiedSnapshot(): EthConsensusRewardsCrossCheckSnapshot {
  return {
    status: "verified",
    summary: "https://beacon.example/credential must never be returned",
    methodology: "eth-consensus-rewards-cross-check-v1",
    requested_epoch: { epoch: 10, slots_per_epoch: 32, max_epochs: 1 },
    verified_epoch: {
      epoch: 10, start_slot: 320, end_slot: 351, finalized_epoch: 11,
      proposed_block_count: 1, missed_slot_count: 31,
      attestation_validator_count: 1, sync_reward_entry_count: 1,
    },
    metrics: {
      attestation_net_reward: { gwei: "13", eth: "0.000000013" },
      sync_committee_net_reward: { gwei: "-2", eth: "-0.000000002" },
      block_proposer_reward: { gwei: "10", eth: "0.00000001" },
      observed_consensus_reward: { gwei: "21", eth: "0.000000021" },
      consensus_issuance: null,
      net_issuance: null,
    },
    identities: {
      observed_equals_attestation_plus_sync_plus_proposer: true,
      proposer_total_equals_reported_components: true,
    },
    coverage: {
      attestation_rewards_complete: true,
      sync_committee_rewards_complete: true,
      block_proposer_rewards_complete: true,
      slashing_penalties_complete: false,
      deposit_withdrawal_reconciliation_complete: false,
      consensus_issuance_complete: false,
      net_issuance_complete: false,
    },
    sources: ["ethereum_beacon_api"],
    source_status: [{ source: "ethereum_beacon_api", role: "finalized_consensus_reward_evidence", as_of: "epoch:11", stale: false }],
    gaps: [
      { code: "consensus_issuance_incomplete", detail: "Components are not complete issuance." },
      { code: "net_issuance_requires_burn_alignment", detail: "Needs an aligned burn boundary." },
    ],
    capabilities: { ethereum_beacon_api_active: true },
  };
}

describe("getEthConsensusRewardsCrossCheck", () => {
  it("localizes verified reward components without claiming complete issuance", () => {
    const result = getEthConsensusRewardsCrossCheck({ lang: "en", adapterSnapshot: verifiedSnapshot() });

    expect(result.summary).toBe("Ethereum consensus reward components were verified against a finalized epoch.");
    expect(result.summary).not.toMatch(/issuance/i);
    expect(result.metrics.consensus_issuance).toBeNull();
    expect(result.metrics.net_issuance).toBeNull();
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(result)).toEqual(result);
  });

  it("localizes unavailable output and strips an adapter secret", () => {
    const result = getEthConsensusRewardsCrossCheck({
      lang: "ko",
      adapterSnapshot: {
        ...verifiedSnapshot(),
        status: "unavailable",
        summary: "https://beacon.example/credential must never be returned",
        verified_epoch: null,
        identities: null,
        metrics: {
          attestation_net_reward: null, sync_committee_net_reward: null,
          block_proposer_reward: null, observed_consensus_reward: null,
          consensus_issuance: null, net_issuance: null,
        },
        coverage: {
          ...verifiedSnapshot().coverage,
          attestation_rewards_complete: false,
          sync_committee_rewards_complete: false,
          block_proposer_rewards_complete: false,
        },
        sources: [], source_status: [],
        gaps: [{ code: "beacon_access_gap", detail: "sanitized" }],
      },
    });

    expect(result.summary).toBe("이더리움 합의 보상 증거를 현재 사용할 수 없습니다.");
    expect(JSON.stringify(result)).not.toContain("beacon.example");
  });

  it("rejects an adapter snapshot that presents partial reward coverage as verified", () => {
    const partial = verifiedSnapshot();
    partial.coverage.attestation_rewards_complete = false;

    expect(() => getEthConsensusRewardsCrossCheck({ lang: "en", adapterSnapshot: partial })).toThrow();
  });
});
