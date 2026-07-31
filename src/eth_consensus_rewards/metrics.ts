import type { ExactSignedGweiAmount } from "./types.js";

const GWEI_PER_ETH = 1_000_000_000n;
const ROOT_PATTERN = /^0x[0-9a-f]{64}$/;

export type EthConsensusRewardsDomainErrorCategory = "schema" | "evidence_mismatch";

export class EthConsensusRewardsDomainError extends Error {
  constructor(public readonly category: EthConsensusRewardsDomainErrorCategory, message: string) {
    super(message);
    this.name = "EthConsensusRewardsDomainError";
  }
}

export interface NormalizedAttestationTotalReward {
  validatorIndex: number;
  head: bigint;
  target: bigint;
  source: bigint;
  inactivity: bigint;
  inclusionDelay?: bigint;
}

export interface NormalizedCanonicalHeaderIdentity {
  slot: number;
  blockRoot: string;
  proposerIndex: number;
}

export interface NormalizedBlockProposerRewardComponents {
  blockRoot: string;
  proposerIndex: number;
  total: bigint;
  attestations: bigint;
  syncAggregate: bigint;
  proposerSlashings: bigint;
  attesterSlashings: bigint;
}

export interface NormalizedSyncCommitteeReward {
  validatorIndex: number;
  reward: bigint;
}

export interface NormalizedSyncCommitteeRewards {
  blockRoot: string;
  rewards: NormalizedSyncCommitteeReward[];
}

export interface NormalizedEthConsensusRewardsEvidence {
  epoch: number;
  finalizedEpoch: number;
  attestationRewards: NormalizedAttestationTotalReward[];
  headers: NormalizedCanonicalHeaderIdentity[];
  blockProposerRewards: NormalizedBlockProposerRewardComponents[];
  syncCommitteeRewards: NormalizedSyncCommitteeRewards[];
  missedSlots: number[];
}

export interface EthConsensusRewardsCalculationBlock {
  slot: number;
  blockRoot: string;
  proposerIndex: number;
  blockProposerReward: bigint;
  syncCommitteeNetReward: bigint;
}

export interface EthConsensusRewardsCalculation {
  startSlot: number;
  endSlot: number;
  proposedBlockCount: number;
  missedSlotCount: number;
  attestationValidatorCount: number;
  syncRewardEntryCount: number;
  attestationNetReward: bigint;
  syncCommitteeNetReward: bigint;
  blockProposerReward: bigint;
  observedConsensusReward: bigint;
  blocks?: EthConsensusRewardsCalculationBlock[];
}

function schema(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EthConsensusRewardsDomainError("schema", message);
}
function mismatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EthConsensusRewardsDomainError("evidence_mismatch", message);
}
function safeNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function signed(value: unknown): value is bigint { return typeof value === "bigint"; }
function unsigned(value: unknown): value is bigint { return typeof value === "bigint" && value >= 0n; }
function root(value: unknown): value is string { return typeof value === "string" && ROOT_PATTERN.test(value); }
function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function epochSlots(epoch: number): { startSlot: number; endSlot: number } {
  schema(safeNonNegativeInteger(epoch), "Epoch must be a non-negative safe integer.");
  schema(epoch <= Math.floor((Number.MAX_SAFE_INTEGER - 31) / 32), "Epoch slot bounds exceed safe integers.");
  const startSlot = epoch * 32;
  return { startSlot, endSlot: startSlot + 31 };
}

export function formatExactSignedGweiAmount(gwei: bigint): ExactSignedGweiAmount {
  schema(signed(gwei), "Gwei amount must be bigint.");
  const negative = gwei < 0n;
  const magnitude = negative ? -gwei : gwei;
  const whole = magnitude / GWEI_PER_ETH;
  const fraction = (magnitude % GWEI_PER_ETH).toString().padStart(9, "0").replace(/0+$/, "");
  const eth = fraction === "" ? whole.toString() : `${whole}.${fraction}`;
  return { gwei: gwei.toString(), eth: negative && magnitude !== 0n ? `-${eth}` : eth };
}

function validateAttestation(row: unknown): asserts row is NormalizedAttestationTotalReward {
  schema(plainObject(row), "Attestation reward evidence must be a non-null plain object.");
  schema(safeNonNegativeInteger(row.validatorIndex), "Attestation validator index must be a non-negative safe integer.");
  schema(signed(row.head) && signed(row.target) && signed(row.source) && signed(row.inactivity), "Attestation reward fields must be signed bigint.");
  schema(row.inclusionDelay === undefined || unsigned(row.inclusionDelay), "Attestation inclusion delay must be an unsigned bigint.");
}
function validateHeader(header: unknown): asserts header is NormalizedCanonicalHeaderIdentity {
  schema(plainObject(header), "Canonical header evidence must be a non-null plain object.");
  schema(safeNonNegativeInteger(header.slot), "Canonical header slot must be a non-negative safe integer.");
  schema(root(header.blockRoot), "Canonical block root must be lower-case 32-byte hex.");
  schema(safeNonNegativeInteger(header.proposerIndex), "Header proposer index must be a non-negative safe integer.");
}
function validateProposer(reward: unknown): asserts reward is NormalizedBlockProposerRewardComponents {
  schema(plainObject(reward), "Proposer reward evidence must be a non-null plain object.");
  schema(root(reward.blockRoot), "Proposer reward root must be lower-case 32-byte hex.");
  schema(safeNonNegativeInteger(reward.proposerIndex), "Proposer index must be a non-negative safe integer.");
  schema(unsigned(reward.total) && unsigned(reward.attestations) && unsigned(reward.syncAggregate) && unsigned(reward.proposerSlashings) && unsigned(reward.attesterSlashings), "Block proposer reward components must be unsigned bigint.");
}
function validateSync(entry: unknown): asserts entry is NormalizedSyncCommitteeRewards {
  schema(plainObject(entry), "Sync committee evidence must be a non-null plain object.");
  schema(root(entry.blockRoot) && Array.isArray(entry.rewards), "Sync committee evidence must bind a root to an array.");
  mismatch(entry.rewards.length > 0, "Every canonical block requires non-empty sync committee reward evidence.");
  const validatorIndices = new Set<number>();
  for (const reward of entry.rewards) {
    schema(plainObject(reward), "Sync committee reward entries must be non-null plain objects.");
    schema(safeNonNegativeInteger(reward.validatorIndex) && signed(reward.reward), "Sync committee rewards must have a safe validator index and signed bigint reward.");
    mismatch(!validatorIndices.has(reward.validatorIndex), "Sync committee reward response validator indices must be unique.");
    validatorIndices.add(reward.validatorIndex);
  }
}

export function calculateEthConsensusRewards(evidence: NormalizedEthConsensusRewardsEvidence, includeBlocks = false): EthConsensusRewardsCalculation {
  schema(plainObject(evidence), "Normalized evidence must be a non-null plain object.");
  schema(typeof includeBlocks === "boolean", "includeBlocks must be boolean.");
  const { startSlot, endSlot } = epochSlots(evidence.epoch);
  schema(safeNonNegativeInteger(evidence.finalizedEpoch), "Finalized epoch must be a non-negative safe integer.");
  mismatch(evidence.epoch < evidence.finalizedEpoch, "Requested epoch must precede the finalized epoch.");
  schema(Array.isArray(evidence.attestationRewards) && Array.isArray(evidence.headers) && Array.isArray(evidence.blockProposerRewards) && Array.isArray(evidence.syncCommitteeRewards) && Array.isArray(evidence.missedSlots), "Normalized evidence collections must be arrays.");

  let attestationNetReward = 0n;
  const attestationValidators = new Set<number>();
  mismatch(evidence.attestationRewards.length > 0, "Attestation reward evidence must not be empty.");
  for (const row of evidence.attestationRewards) {
    validateAttestation(row);
    mismatch(!attestationValidators.has(row.validatorIndex), "Attestation validator indices must be unique.");
    attestationValidators.add(row.validatorIndex);
    attestationNetReward += row.head + row.target + row.source + row.inactivity + (row.inclusionDelay ?? 0n);
  }

  const headerRoots = new Set<string>();
  const headerByRoot = new Map<string, NormalizedCanonicalHeaderIdentity>();
  const occupiedSlots = new Set<number>();
  for (let index = 0; index < evidence.headers.length; index += 1) {
    const header = evidence.headers[index]!;
    validateHeader(header);
    mismatch(header.slot >= startSlot && header.slot <= endSlot, "Canonical header slots must be within the requested epoch.");
    mismatch(index === 0 || header.slot > evidence.headers[index - 1]!.slot, "Canonical headers must be ordered by slot.");
    mismatch(!headerRoots.has(header.blockRoot), "Canonical block roots must be unique.");
    headerRoots.add(header.blockRoot); headerByRoot.set(header.blockRoot, header); occupiedSlots.add(header.slot);
  }
  for (let index = 0; index < evidence.missedSlots.length; index += 1) {
    const slot = evidence.missedSlots[index]!;
    schema(safeNonNegativeInteger(slot), "Missed slots must be non-negative safe integers.");
    mismatch(slot >= startSlot && slot <= endSlot, "Missed slots must be within the requested epoch.");
    mismatch(index === 0 || slot > evidence.missedSlots[index - 1]!, "Missed slots must be ordered.");
    mismatch(!occupiedSlots.has(slot), "Slots cannot be both proposed and missed.");
    occupiedSlots.add(slot);
  }
  mismatch(evidence.headers.length + evidence.missedSlots.length === 32 && occupiedSlots.size === 32, "Proposed plus missed slots must equal 32 exactly once.");

  const proposerByRoot = new Map<string, NormalizedBlockProposerRewardComponents>();
  let blockProposerReward = 0n;
  for (const reward of evidence.blockProposerRewards) {
    validateProposer(reward);
    mismatch(headerByRoot.has(reward.blockRoot), "Proposer reward must bind a canonical header root.");
    mismatch(!proposerByRoot.has(reward.blockRoot), "Canonical blocks require one proposer reward response.");
    const header = headerByRoot.get(reward.blockRoot)!;
    mismatch(header.proposerIndex === reward.proposerIndex, "Proposer reward proposer index must match canonical header.");
    mismatch(reward.total === reward.attestations + reward.syncAggregate + reward.proposerSlashings + reward.attesterSlashings, "Block proposer total must equal reported components.");
    proposerByRoot.set(reward.blockRoot, reward); blockProposerReward += reward.total;
  }
  mismatch(proposerByRoot.size === headerByRoot.size, "Every canonical block requires proposer reward evidence.");

  const syncByRoot = new Map<string, bigint>();
  let syncCommitteeNetReward = 0n;
  let syncRewardEntryCount = 0;
  for (const entry of evidence.syncCommitteeRewards) {
    validateSync(entry);
    mismatch(headerByRoot.has(entry.blockRoot), "Sync committee rewards must bind canonical header roots.");
    mismatch(!syncByRoot.has(entry.blockRoot), "Canonical blocks require one sync committee reward response.");
    const total = entry.rewards.reduce((sum, reward) => sum + reward.reward, 0n);
    syncByRoot.set(entry.blockRoot, total); syncCommitteeNetReward += total; syncRewardEntryCount += entry.rewards.length;
  }
  mismatch(syncByRoot.size === headerByRoot.size, "Every canonical block requires sync committee reward evidence.");

  const observedConsensusReward = attestationNetReward + syncCommitteeNetReward + blockProposerReward;
  const blocks = evidence.headers.map((header) => ({
    slot: header.slot,
    blockRoot: header.blockRoot,
    proposerIndex: header.proposerIndex,
    blockProposerReward: proposerByRoot.get(header.blockRoot)!.total,
    syncCommitteeNetReward: syncByRoot.get(header.blockRoot)!,
  }));
  return {
    startSlot, endSlot, proposedBlockCount: evidence.headers.length, missedSlotCount: evidence.missedSlots.length,
    attestationValidatorCount: attestationValidators.size, syncRewardEntryCount, attestationNetReward,
    syncCommitteeNetReward, blockProposerReward, observedConsensusReward,
    ...(includeBlocks ? { blocks } : {}),
  };
}
