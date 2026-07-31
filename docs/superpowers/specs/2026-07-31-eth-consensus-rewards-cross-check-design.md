# Ethereum Consensus Rewards Cross-Check Design

## Goal

Add a bounded, read-only Beacon API verifier for one finalized Ethereum epoch.
It independently sums attestation rewards and penalties, sync-committee
rewards and penalties, and consensus-layer block-proposer rewards.

This is a foundation for consensus-issuance verification. It must not relabel
the verified reward components as complete ETH issuance or combine them with
execution burn into net issuance until every consensus balance flow and an
exactly aligned burn boundary are available.

## Why This Is Not Yet Complete Issuance

Post-Merge execution-layer issuance is zero and validator balances change
through consensus rewards and penalties. Deposits and withdrawals move
existing ETH between accounting domains and are not issuance. The standard
Beacon reward endpoints expose:

- attestation reward and penalty components;
- sync-committee reward and penalty components;
- block-proposer rewards from attestations, sync aggregates, and slashings.

They do not by themselves prove a complete accounting of every slashed
validator penalty or reconcile deposit and withdrawal state flows. Therefore:

- `observed_consensus_reward` is the exact sum of the exposed components;
- `consensus_issuance` remains `null`;
- `net_issuance` remains `null`;
- successful snapshots still carry explicit coverage gaps.

This boundary follows the official
[Ethereum issuance explanation](https://ethereum.org/roadmap/merge/issuance/)
and the official
[Beacon reward schemas](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/types/rewards.yaml).

## Scope

This slice adds:

- an optional `ETHEREUM_BEACON_API_URL` configuration value;
- exact signed-Gwei arithmetic and ETH decimal formatting;
- a strict finalized-epoch Beacon REST adapter;
- a `get_eth_consensus_rewards_cross_check` MCP tool;
- canonical-block enumeration for every slot in one epoch;
- evidence, finality, optimistic-execution, and decomposition gates;
- unit, adapter, server, documentation, and opt-in live tests.

This slice does not add:

- multi-epoch or daily indexing;
- validator-balance snapshots;
- deposit, withdrawal, consolidation, or pending-deposit reconciliation;
- a complete slashing-penalty index;
- complete `consensus_issuance` or `net_issuance`;
- integration into `get_eth_value_capture`;
- automatic pairing with execution-layer block ranges;
- validator identities, recommendations, or write methods.

## Official Source Contracts

The adapter uses only standard Beacon API methods:

- `GET /eth/v1/beacon/states/head/finality_checkpoints`
- `POST /eth/v1/beacon/rewards/attestations/{epoch}`
- `GET /eth/v1/beacon/headers?slot={slot}`
- `GET /eth/v1/beacon/rewards/blocks/{block_root}`
- `POST /eth/v1/beacon/rewards/sync_committee/{block_root}`

References:

- [Attestation rewards](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/apis/beacon/rewards/attestations.yaml)
- [Block rewards](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/apis/beacon/rewards/blocks.yaml)
- [Sync-committee rewards](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/apis/beacon/rewards/sync_committee.yaml)
- [Block headers by slot](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/apis/beacon/blocks/headers.yaml)
- [Finality checkpoints](https://raw.githubusercontent.com/ethereum/beacon-APIs/master/apis/beacon/states/finality_checkpoints.yaml)

`POST` reward requests omit the optional validator array so the server returns
all validators covered by the endpoint. The adapter never substitutes an empty
array because an empty filter can be interpreted as no requested validators.

Altair permits one validator to occupy more than one protocol sync-committee
position. That does not imply duplicate API rows. Standard Beacon reward
implementations aggregate those positions into one response row per validator:
[Lighthouse computes balances in a `HashMap` keyed by validator index and emits
one row per key](https://github.com/sigp/lighthouse/blob/b263df596671a2bd42bf1034e1cdc8188ba8a9b0/beacon_node/beacon_chain/src/sync_committee_rewards.rs),
while [Prysm's omitted-body path builds the unique full validator-index range,
filters it to sync-committee membership, and emits one row per selected
index](https://github.com/OffchainLabs/prysm/blob/e86f42871e69c20f08f9721e041217bfaac88e2a/beacon-chain/rpc/eth/rewards/handlers.go).
The verifier therefore treats duplicate `validator_index` rows within a single
sync-committee reward response as malformed provider evidence.

## Public MCP Contract

Register:

```ts
get_eth_consensus_rewards_cross_check({
  epoch: number,
  include_blocks?: boolean, // default false
})
```

`epoch` is a non-negative safe integer. Exactly one epoch is verified per
request. With 32 slots per epoch, the maximum fetch count is bounded at 98:
one finality request, one attestation-rewards request, 32 header requests, and
up to two reward requests for each canonical block.

Successful output:

```ts
interface EthConsensusRewardsCrossCheckSnapshot {
  status: "verified" | "unavailable";
  summary: string;
  methodology: "eth-consensus-rewards-cross-check-v1";
  requested_epoch: {
    epoch: number;
    slots_per_epoch: 32;
    max_epochs: 1;
  };
  verified_epoch: {
    epoch: number;
    start_slot: number;
    end_slot: number;
    finalized_epoch: number;
    proposed_block_count: number;
    missed_slot_count: number;
    attestation_validator_count: number;
    sync_reward_entry_count: number;
  } | null;
  metrics: {
    attestation_net_reward: ExactSignedGweiAmount | null;
    sync_committee_net_reward: ExactSignedGweiAmount | null;
    block_proposer_reward: ExactSignedGweiAmount | null;
    observed_consensus_reward: ExactSignedGweiAmount | null;
    consensus_issuance: null;
    net_issuance: null;
  };
  identities: {
    observed_equals_attestation_plus_sync_plus_proposer: true;
    proposer_total_equals_reported_components: true;
  } | null;
  coverage: {
    attestation_rewards_complete: boolean;
    sync_committee_rewards_complete: boolean;
    block_proposer_rewards_complete: boolean;
    slashing_penalties_complete: false;
    deposit_withdrawal_reconciliation_complete: false;
    consensus_issuance_complete: false;
    net_issuance_complete: false;
  };
  blocks?: EthConsensusRewardBlock[];
  sources: string[];
  source_status: EthConsensusRewardsSourceStatus[];
  gaps: EthConsensusRewardsGap[];
  capabilities: {
    ethereum_beacon_api_active: boolean;
  };
}

interface ExactSignedGweiAmount {
  gwei: string; // signed base-10 integer
  eth: string;  // exact signed base-10 decimal, at most 9 fractional digits
}
```

`blocks` is omitted unless `include_blocks` is true. Each row binds a
canonical block root and proposer index to the block proposer and sync
committee totals. An unavailable snapshot contains no partial metrics or
block rows.

## Exact Reward Identities

For each attestation reward row:

```text
validator net reward =
  head + target + source + inactivity + optional phase0 inclusion_delay
```

For each block:

```text
block proposer total =
  attestations + sync_aggregate + proposer_slashings + attester_slashings
```

For the verified epoch:

```text
observed consensus reward =
  attestation net reward
  + sync committee net reward
  + block proposer reward
```

All parsing and arithmetic use `bigint`. Public Gwei quantities and ETH
decimals are exact strings; no reward amount passes through JavaScript
floating-point arithmetic.

## Finality and Canonical-Block Rules

The adapter first reads the head state's finality checkpoints. It accepts only
`epoch < finalized_epoch`, which ensures the complete requested epoch precedes
the finalized checkpoint. Finality and every successful reward/header response
must also report `execution_optimistic: false`; reward responses and canonical
block responses must report `finalized: true`.

For each of the epoch's 32 slots, the adapter queries the headers collection
with an exact `slot` filter:

- an empty successful response proves a missed slot within the already
  finalized epoch;
- exactly one canonical header identifies the block;
- more than one canonical header, a slot mismatch, or malformed root/header
  evidence invalidates the full epoch;
- non-canonical headers are not used;
- reward endpoints are queried by the canonical block root, never by a mutable
  alias.

The block reward proposer index must match the canonical header proposer
index. Block reward components must sum to the reported total. Duplicate
attestation validator indices, duplicate sync-reward response validator
indices, and malformed signed or unsigned 64-bit decimal strings invalidate
the epoch.

## Transport and Bounds

- Requests are `GET` or `POST` with no retries.
- `POST` requests send no optional validator filter.
- Slot header calls and per-block reward calls use a fixed concurrency cap of
  eight.
- HTTP, JSON, schema, finality, or evidence failure invalidates the complete
  requested epoch.
- The Beacon URL can contain provider credentials. It is environment-only and
  never appears in output, errors, logs, cache keys, or tests.

## Failure and Coverage Semantics

Transport failures map to bounded gap codes:

- `beacon_not_configured`
- `beacon_access_gap`
- `beacon_finality_gap`
- `beacon_schema_drift`
- `beacon_evidence_mismatch`
- `source_stale`

Every verified snapshot additionally contains:

- `consensus_issuance_incomplete`
- `net_issuance_requires_burn_alignment`

These are coverage gaps, not transport failures. They keep both issuance
metrics `null` and prevent downstream code from treating the observed reward
sum as total issuance.

Invalid caller arguments remain MCP input errors rather than source gaps.
Provider errors and response bodies are never included in public details.

## Cache

Verified finalized-epoch results are cached in process for 30 minutes by
`epoch` and `include_blocks` only. A context is bound to the first configured
Beacon provider so two provider URLs cannot share one context's cache.

An already verified result may serve as a stale fallback after refresh failure.
It keeps `status: "verified"`, marks source status stale, and adds
`source_stale`. Unavailable and partially validated evidence is never cached.

## Security and Operational Boundaries

- The server remains read-only and uses public, standard Beacon API methods.
- No validator pubkeys, actor identities, or trading recommendations are
  emitted.
- Default tests make no network calls.
- The live test requires both `ETHEREUM_BEACON_API_URL` and
  `RUN_LIVE_ETH_BEACON=1`.
- The tool describes verified protocol evidence and explicit gaps only.

## Verification

Implementation follows strict RED, GREEN, REFACTOR. Required final checks:

```bash
npm test
npm run typecheck
npm run build
```

The opt-in live check is reported separately and never runs without its two
explicit environment gates.
