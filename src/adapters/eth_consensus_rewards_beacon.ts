import type { AdapterContext } from "./base.js";
import {
  calculateEthConsensusRewards,
  EthConsensusRewardsDomainError,
  epochSlots,
  formatExactSignedGweiAmount,
  type NormalizedAttestationTotalReward,
  type NormalizedBlockProposerRewardComponents,
  type NormalizedCanonicalHeaderIdentity,
  type NormalizedEthConsensusRewardsEvidence,
  type NormalizedSyncCommitteeRewards,
} from "../eth_consensus_rewards/metrics.js";
import type {
  EthConsensusRewardsGapCode,
  EthConsensusRewardsMetrics,
  EthConsensusRewardsCrossCheckSnapshot,
} from "../eth_consensus_rewards/types.js";

const CACHE_SPEC = { name: "eth_consensus_rewards_beacon", ttlMs: 30 * 60_000, max: 32 };
const CONCURRENCY = 8;
const ROOT_PATTERN = /^0x[0-9a-f]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-f]{192}$/;
const UINT64_PATTERN = /^(?:0|[1-9]\d*)$/;
const INT64_PATTERN = /^(?:0|-?[1-9]\d*)$/;
const UINT64_MAX = (1n << 64n) - 1n;
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const providerByContext = new WeakMap<AdapterContext, string>();

export interface EthConsensusRewardsBeaconInput {
  epoch: number;
  includeBlocks: boolean;
  /** Internal-only provider configuration. Never expose this value. */
  beaconUrl?: string;
}

type FailureKind = Exclude<EthConsensusRewardsGapCode, "beacon_not_configured" | "source_stale" | "consensus_issuance_incomplete" | "net_issuance_requires_burn_alignment">;

class BeaconFailure extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind);
  }
}

function emptyMetrics(): EthConsensusRewardsMetrics {
  return {
    attestation_net_reward: null,
    sync_committee_net_reward: null,
    block_proposer_reward: null,
    observed_consensus_reward: null,
    consensus_issuance: null,
    net_issuance: null,
  };
}

function configuredBeaconUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bindProvider(ctx: AdapterContext, beaconUrl: string): boolean {
  const bound = providerByContext.get(ctx);
  if (bound !== undefined && bound !== beaconUrl) return false;
  if (bound === undefined) providerByContext.set(ctx, beaconUrl);
  return true;
}

function assertInput(input: EthConsensusRewardsBeaconInput): void {
  if (typeof input.includeBlocks !== "boolean") throw new TypeError("includeBlocks must be a boolean.");
  epochSlots(input.epoch);
}

function unavailable(input: EthConsensusRewardsBeaconInput, code: Exclude<EthConsensusRewardsGapCode, "source_stale" | "consensus_issuance_incomplete" | "net_issuance_requires_burn_alignment">): EthConsensusRewardsCrossCheckSnapshot {
  const configured = configuredBeaconUrl(input.beaconUrl) !== null;
  const detail = {
    beacon_not_configured: "Ethereum Beacon API is not configured.",
    beacon_access_gap: "Ethereum Beacon reward evidence could not be retrieved.",
    beacon_finality_gap: "Ethereum Beacon API could not verify the requested finalized epoch.",
    beacon_schema_drift: "Ethereum Beacon API returned malformed evidence.",
    beacon_evidence_mismatch: "Ethereum Beacon reward evidence did not reconcile.",
  }[code];
  const { startSlot, endSlot } = epochSlots(input.epoch);
  return {
    status: "unavailable",
    summary: "Ethereum consensus reward evidence is unavailable.",
    methodology: "eth-consensus-rewards-cross-check-v1",
    requested_epoch: { epoch: input.epoch, slots_per_epoch: 32, max_epochs: 1 },
    verified_epoch: null,
    metrics: emptyMetrics(),
    identities: null,
    coverage: {
      attestation_rewards_complete: false,
      sync_committee_rewards_complete: false,
      block_proposer_rewards_complete: false,
      slashing_penalties_complete: false,
      deposit_withdrawal_reconciliation_complete: false,
      consensus_issuance_complete: false,
      net_issuance_complete: false,
    },
    sources: configured ? ["ethereum_beacon_api"] : [],
    source_status: configured ? [{ source: "ethereum_beacon_api", role: "finalized_consensus_reward_evidence", as_of: null, stale: false }] : [],
    gaps: [{ code, detail }],
    capabilities: { ethereum_beacon_api_active: configured },
  };
}

function staleSnapshot(snapshot: EthConsensusRewardsCrossCheckSnapshot): EthConsensusRewardsCrossCheckSnapshot {
  return {
    ...snapshot,
    summary: "Cached finalized Ethereum consensus reward evidence was used after refresh failure.",
    source_status: snapshot.source_status.map((source) => ({ ...source, stale: true })),
    gaps: snapshot.gaps.some((gap) => gap.code === "source_stale")
      ? snapshot.gaps
      : [...snapshot.gaps, { code: "source_stale", detail: "Ethereum Beacon reward refresh failed; verified finalized evidence was cached." }],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BeaconFailure("beacon_schema_drift");
  return value as Record<string, unknown>;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new BeaconFailure("beacon_schema_drift");
  return value;
}

function root(value: unknown): string {
  if (typeof value !== "string" || !ROOT_PATTERN.test(value)) throw new BeaconFailure("beacon_schema_drift");
  return value;
}

function signature(value: unknown): void {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) throw new BeaconFailure("beacon_schema_drift");
}

function uint64(value: unknown): bigint {
  if (typeof value !== "string" || !UINT64_PATTERN.test(value)) throw new BeaconFailure("beacon_schema_drift");
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) throw new BeaconFailure("beacon_schema_drift");
  return parsed;
}

function safeUint64(value: unknown): number {
  const parsed = uint64(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new BeaconFailure("beacon_schema_drift");
  return Number(parsed);
}

function int64(value: unknown): bigint {
  if (typeof value !== "string" || !INT64_PATTERN.test(value)) throw new BeaconFailure("beacon_schema_drift");
  const parsed = BigInt(value);
  if (parsed < INT64_MIN || parsed > INT64_MAX) throw new BeaconFailure("beacon_schema_drift");
  return parsed;
}

function envelope(value: unknown, requireFinalized: boolean): Record<string, unknown> {
  const parsed = record(value);
  if (boolean(parsed.execution_optimistic)) throw new BeaconFailure("beacon_finality_gap");
  const finalized = boolean(parsed.finalized);
  if (requireFinalized && !finalized) throw new BeaconFailure("beacon_finality_gap");
  if (!("data" in parsed)) throw new BeaconFailure("beacon_schema_drift");
  return parsed;
}

function join(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function request(ctx: AdapterContext, beaconUrl: string, path: string, method: "GET" | "POST"): Promise<unknown> {
  let response: Response;
  try {
    response = await ctx.fetch(join(beaconUrl, path), { method });
  } catch {
    throw new BeaconFailure("beacon_access_gap");
  }
  if (!response.ok) throw new BeaconFailure("beacon_access_gap");
  try {
    return await response.json();
  } catch {
    throw new BeaconFailure("beacon_access_gap");
  }
}

async function finalityCheckpoints(ctx: AdapterContext, beaconUrl: string): Promise<number> {
  const parsed = envelope(await request(ctx, beaconUrl, "/eth/v1/beacon/states/head/finality_checkpoints", "GET"), false);
  const data = record(parsed.data);
  for (const checkpoint of [data.previous_justified, data.current_justified]) {
    const value = record(checkpoint);
    safeUint64(value.epoch);
    root(value.root);
  }
  const finalized = record(data.finalized);
  root(finalized.root);
  return safeUint64(finalized.epoch);
}

function parseAttestationRow(value: unknown): NormalizedAttestationTotalReward {
  const row = record(value);
  const inclusionDelay = "inclusion_delay" in row ? uint64(row.inclusion_delay) : undefined;
  return {
    validatorIndex: safeUint64(row.validator_index),
    head: int64(row.head),
    target: int64(row.target),
    source: int64(row.source),
    inactivity: int64(row.inactivity),
    ...(inclusionDelay === undefined ? {} : { inclusionDelay }),
  };
}

function parseIdealAttestationRow(value: unknown): void {
  const row = record(value);
  uint64(row.effective_balance);
  int64(row.head); int64(row.target); int64(row.source); int64(row.inactivity);
  if ("inclusion_delay" in row) uint64(row.inclusion_delay);
}

async function attestationRewards(ctx: AdapterContext, beaconUrl: string, epoch: number): Promise<NormalizedAttestationTotalReward[]> {
  const parsed = envelope(await request(ctx, beaconUrl, `/eth/v1/beacon/rewards/attestations/${epoch}`, "POST"), true);
  const data = record(parsed.data);
  if (!Array.isArray(data.ideal_rewards) || !Array.isArray(data.total_rewards)) throw new BeaconFailure("beacon_schema_drift");
  data.ideal_rewards.forEach(parseIdealAttestationRow);
  return data.total_rewards.map(parseAttestationRow);
}

function parseCanonicalHeader(value: unknown, expectedSlot: number): NormalizedCanonicalHeaderIdentity | null {
  const candidate = record(value);
  const canonical = boolean(candidate.canonical);
  if (!canonical) return null;
  const header = record(candidate.header);
  const message = record(header.message);
  signature(header.signature);
  const slot = safeUint64(message.slot);
  if (slot !== expectedSlot) throw new BeaconFailure("beacon_evidence_mismatch");
  root(message.parent_root); root(message.state_root); root(message.body_root);
  return { slot, blockRoot: root(candidate.root), proposerIndex: safeUint64(message.proposer_index) };
}

async function headerAtSlot(ctx: AdapterContext, beaconUrl: string, slot: number): Promise<{ header?: NormalizedCanonicalHeaderIdentity; missedSlot?: number }> {
  const parsed = envelope(await request(ctx, beaconUrl, `/eth/v1/beacon/headers?slot=${slot}`, "GET"), true);
  if (!Array.isArray(parsed.data)) throw new BeaconFailure("beacon_schema_drift");
  if (parsed.data.length === 0) return { missedSlot: slot };
  const canonical = parsed.data.map((entry) => parseCanonicalHeader(entry, slot)).filter((entry): entry is NormalizedCanonicalHeaderIdentity => entry !== null);
  if (canonical.length !== 1) throw new BeaconFailure("beacon_evidence_mismatch");
  return { header: canonical[0] };
}

function parseBlockRewards(value: unknown, blockRoot: string): NormalizedBlockProposerRewardComponents {
  const data = record(envelope(value, true).data);
  return {
    blockRoot,
    proposerIndex: safeUint64(data.proposer_index),
    total: uint64(data.total),
    attestations: uint64(data.attestations),
    syncAggregate: uint64(data.sync_aggregate),
    proposerSlashings: uint64(data.proposer_slashings),
    attesterSlashings: uint64(data.attester_slashings),
  };
}

function parseSyncRewards(value: unknown, blockRoot: string): NormalizedSyncCommitteeRewards {
  const data = envelope(value, true).data;
  if (!Array.isArray(data)) throw new BeaconFailure("beacon_schema_drift");
  return { blockRoot, rewards: data.map((raw) => {
    const reward = record(raw);
    return { validatorIndex: safeUint64(reward.validator_index), reward: int64(reward.reward) };
  }) };
}

async function mapBounded<T, R>(values: readonly T[], work: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const current = next;
      next += 1;
      if (current >= values.length) return;
      results[current] = await work(values[current]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, () => worker()));
  return results;
}

async function blockEvidence(ctx: AdapterContext, beaconUrl: string, header: NormalizedCanonicalHeaderIdentity): Promise<{ proposer: NormalizedBlockProposerRewardComponents; sync: NormalizedSyncCommitteeRewards }> {
  const block = await request(ctx, beaconUrl, `/eth/v1/beacon/rewards/blocks/${header.blockRoot}`, "GET");
  const sync = await request(ctx, beaconUrl, `/eth/v1/beacon/rewards/sync_committee/${header.blockRoot}`, "POST");
  return { proposer: parseBlockRewards(block, header.blockRoot), sync: parseSyncRewards(sync, header.blockRoot) };
}

async function fetchVerified(input: EthConsensusRewardsBeaconInput, ctx: AdapterContext, beaconUrl: string): Promise<EthConsensusRewardsCrossCheckSnapshot> {
  const finalizedEpoch = await finalityCheckpoints(ctx, beaconUrl);
  if (input.epoch >= finalizedEpoch) throw new BeaconFailure("beacon_finality_gap");
  const attestations = await attestationRewards(ctx, beaconUrl, input.epoch);
  const { startSlot, endSlot } = epochSlots(input.epoch);
  const slots = Array.from({ length: 32 }, (_, offset) => startSlot + offset);
  const slotResults = await mapBounded(slots, (slot) => headerAtSlot(ctx, beaconUrl, slot));
  const headers = slotResults.flatMap((result) => result.header === undefined ? [] : [result.header]);
  const missedSlots = slotResults.flatMap((result) => result.missedSlot === undefined ? [] : [result.missedSlot]);
  const rewards = await mapBounded(headers, (header) => blockEvidence(ctx, beaconUrl, header));
  const evidence: NormalizedEthConsensusRewardsEvidence = {
    epoch: input.epoch,
    finalizedEpoch,
    attestationRewards: attestations,
    headers,
    blockProposerRewards: rewards.map((reward) => reward.proposer),
    syncCommitteeRewards: rewards.map((reward) => reward.sync),
    missedSlots,
  };
  let calculation;
  try {
    calculation = calculateEthConsensusRewards(evidence, input.includeBlocks);
  } catch (error) {
    if (error instanceof EthConsensusRewardsDomainError) {
      throw new BeaconFailure(error.category === "schema" ? "beacon_schema_drift" : "beacon_evidence_mismatch");
    }
    throw error;
  }
  return {
    status: "verified",
    summary: "Ethereum consensus reward components were verified against a finalized epoch.",
    methodology: "eth-consensus-rewards-cross-check-v1",
    requested_epoch: { epoch: input.epoch, slots_per_epoch: 32, max_epochs: 1 },
    verified_epoch: {
      epoch: input.epoch,
      start_slot: calculation.startSlot,
      end_slot: calculation.endSlot,
      finalized_epoch: finalizedEpoch,
      proposed_block_count: calculation.proposedBlockCount,
      missed_slot_count: calculation.missedSlotCount,
      attestation_validator_count: calculation.attestationValidatorCount,
      sync_reward_entry_count: calculation.syncRewardEntryCount,
    },
    metrics: {
      attestation_net_reward: formatExactSignedGweiAmount(calculation.attestationNetReward),
      sync_committee_net_reward: formatExactSignedGweiAmount(calculation.syncCommitteeNetReward),
      block_proposer_reward: formatExactSignedGweiAmount(calculation.blockProposerReward),
      observed_consensus_reward: formatExactSignedGweiAmount(calculation.observedConsensusReward),
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
    ...(calculation.blocks === undefined ? {} : { blocks: calculation.blocks.map((block) => ({
      slot: block.slot,
      block_root: block.blockRoot,
      proposer_index: block.proposerIndex,
      block_proposer_reward: formatExactSignedGweiAmount(block.blockProposerReward),
      sync_committee_net_reward: formatExactSignedGweiAmount(block.syncCommitteeNetReward),
    })) }),
    sources: ["ethereum_beacon_api"],
    source_status: [{ source: "ethereum_beacon_api", role: "finalized_consensus_reward_evidence", as_of: `epoch:${finalizedEpoch}`, stale: false }],
    gaps: [
      { code: "consensus_issuance_incomplete", detail: "Exposed reward components do not prove complete consensus issuance." },
      { code: "net_issuance_requires_burn_alignment", detail: "Net issuance requires an exactly aligned execution burn boundary." },
    ],
    capabilities: { ethereum_beacon_api_active: true },
  };
}

export async function fetchEthConsensusRewardsBeacon(input: EthConsensusRewardsBeaconInput, ctx: AdapterContext): Promise<EthConsensusRewardsCrossCheckSnapshot> {
  assertInput(input);
  const beaconUrl = configuredBeaconUrl(input.beaconUrl);
  if (beaconUrl === null) return unavailable(input, "beacon_not_configured");
  if (!bindProvider(ctx, beaconUrl)) return unavailable(input, "beacon_access_gap");
  const cache = ctx.cacheFor<EthConsensusRewardsCrossCheckSnapshot>(CACHE_SPEC);
  const key = `${input.epoch}:${input.includeBlocks}`;
  try {
    return await cache.getOrLoad(key, () => fetchVerified(input, ctx, beaconUrl));
  } catch (error) {
    const stale = cache.getStale(key);
    if (stale !== undefined) return staleSnapshot(stale);
    if (error instanceof BeaconFailure) return unavailable(input, error.kind);
    return unavailable(input, "beacon_access_gap");
  }
}
