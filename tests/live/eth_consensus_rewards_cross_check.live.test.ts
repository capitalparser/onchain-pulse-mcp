import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  fetchEthConsensusRewardsBeacon,
  fetchFinalizedEthConsensusRewardsBeaconEpoch,
} from "../../src/adapters/eth_consensus_rewards_beacon.js";
import { loadEnv } from "../../src/env.js";
import { EthConsensusRewardsCrossCheckSnapshotSchema } from "../../src/eth_consensus_rewards/types.js";
import { getEthConsensusRewardsCrossCheck } from "../../src/tools/get_eth_consensus_rewards_cross_check.js";

const env = loadEnv(process.env);
const runLive = process.env.RUN_LIVE_ETH_BEACON === "1" && Boolean(env.ethereumBeaconApiUrl?.trim());

describe.skipIf(!runLive)("Ethereum Beacon finalized reward-component cross-check", () => {
  it("verifies one safely finalized epoch through the public schema boundary", async () => {
    const ctx = makeContext({ env });
    const finalizedEpoch = await fetchFinalizedEthConsensusRewardsBeaconEpoch(
      env.ethereumBeaconApiUrl,
      ctx,
    );

    expect(finalizedEpoch).not.toBeNull();
    expect(finalizedEpoch).toBeGreaterThan(0);
    const epoch = finalizedEpoch! - 1;
    const snapshot = getEthConsensusRewardsCrossCheck({
      lang: env.lang,
      adapterSnapshot: await fetchEthConsensusRewardsBeacon(
        { epoch, includeBlocks: false, beaconUrl: env.ethereumBeaconApiUrl },
        ctx,
      ),
    });

    expect(snapshot.status).toBe("verified");
    expect(snapshot.requested_epoch).toEqual({ epoch, slots_per_epoch: 32, max_epochs: 1 });
    expect(snapshot.verified_epoch?.epoch).toBe(epoch);
    expect(snapshot.verified_epoch?.finalized_epoch).toBeGreaterThan(epoch);
    expect(snapshot.identities).toEqual({
      observed_equals_attestation_plus_sync_plus_proposer: true,
      proposer_total_equals_reported_components: true,
    });
    expect(snapshot.metrics.consensus_issuance).toBeNull();
    expect(snapshot.metrics.net_issuance).toBeNull();
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain(env.ethereumBeaconApiUrl!);
  }, 120_000);
});
