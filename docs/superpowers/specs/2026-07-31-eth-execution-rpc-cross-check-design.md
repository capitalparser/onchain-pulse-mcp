# Ethereum Execution RPC Fee Cross-Check Design

## Goal

Add a bounded, read-only verifier that independently recomputes Ethereum
execution fees, base-fee burn, priority fees, blob-fee burn, gross fees, and
total burn from finalized Execution API evidence.

This is a validation surface for explicit block ranges. It is not a replacement
for the existing Dune 7/30/90-day aggregation and must not silently expand into
an unbounded receipt indexer.

## Scope

This slice adds:

- an optional `ETHEREUM_RPC_URL` configuration value;
- a strict Execution JSON-RPC adapter;
- exact bigint fee arithmetic and decimal ETH formatting;
- a `get_eth_fee_cross_check` MCP tool;
- finalized-head and evidence-consistency gates;
- unit, adapter, server, documentation, and opt-in live tests.

This slice does not add:

- rolling 7/30/90-day RPC indexing;
- a fallback to one `eth_getTransactionReceipt` call per transaction;
- Beacon reward or consensus issuance indexing;
- Dune-versus-RPC percentage comparisons inside `get_eth_value_capture`;
- MEV, builder payments, proposer-builder separation, or relay payments;
- L2 contract labelling or ETH collateral demand.

## Source Contracts

The implementation follows the official Ethereum Execution API contracts:

- `eth_getBlockByNumber`:
  https://ethereum.github.io/execution-apis/api/methods/eth_getBlockByNumber/
- `eth_getBlockReceipts`:
  https://ethereum.github.io/execution-apis/api/methods/eth_getBlockReceipts/

The verifier first requests `eth_getBlockByNumber("finalized", false)`.
Requested blocks must be at or below that returned finalized head. Providers
that do not support the finalized tag or block-receipt method are unavailable;
the verifier does not degrade into a potentially explosive transaction-by-
transaction crawl.

## Public MCP Contract

Register:

```ts
get_eth_fee_cross_check({
  start_block: number,
  end_block: number,
  include_blocks?: boolean, // default false
})
```

`start_block` and `end_block` are non-negative safe integers. The range is
inclusive, ordered, consecutive, and capped at 64 blocks.

Successful output:

```ts
interface EthFeeCrossCheckSnapshot {
  status: "verified" | "unavailable";
  summary: string;
  methodology: "eth-execution-fee-cross-check-v1";
  requested_range: {
    start_block: number;
    end_block: number;
    max_blocks: 64;
  };
  verified_range: {
    start_block: number;
    end_block: number;
    finalized_block: number;
    block_count: number;
    transaction_count: number;
  } | null;
  metrics: {
    execution_fee: ExactEthAmount | null;
    base_fee_burn: ExactEthAmount | null;
    priority_fee: ExactEthAmount | null;
    blob_fee_burn: ExactEthAmount | null;
    gross_fee: ExactEthAmount | null;
    total_burn: ExactEthAmount | null;
  };
  identities: {
    execution_equals_base_plus_priority: true;
    gross_equals_execution_plus_blob: true;
    total_burn_equals_base_plus_blob: true;
  } | null;
  blocks?: EthFeeCrossCheckBlock[];
  sources: string[];
  source_status: EthFeeCrossCheckSourceStatus[];
  gaps: EthFeeCrossCheckGap[];
  capabilities: {
    ethereum_rpc_active: boolean;
  };
}

interface ExactEthAmount {
  wei: string; // unsigned base-10 integer
  eth: string; // exact base-10 decimal, at most 18 fractional digits
}
```

`blocks` is omitted unless `include_blocks` is true. A successful snapshot
contains one ordered block row per requested block. An unavailable snapshot
contains no partial metrics or block rows.

## Exact Fee Identities

For each receipt:

```text
execution fee = gasUsed * effectiveGasPrice
priority fee = gasUsed * (effectiveGasPrice - block.baseFeePerGas)
blob fee = blobGasUsed * blobGasPrice
```

For each block and the aggregate:

```text
base fee burn = block.gasUsed * block.baseFeePerGas
execution fee = base fee burn + priority fee
gross fee = execution fee + blob fee burn
total burn = base fee burn + blob fee burn
```

All parsing and arithmetic use `bigint`. Public quantities are exact decimal
strings; no `number` or floating-point conversion is used for wei values.

## Evidence Validation

Ethereum quantities must be canonical `0x` quantities with no leading zero.
Hashes must be 32-byte hex data. Every requested block must satisfy:

1. returned block number equals the requested block;
2. block hash is present and unique across the range;
3. transaction hashes are valid and unique;
4. receipt count equals transaction count;
5. receipt block number and hash match the block;
6. receipt transaction indices are exactly contiguous from zero;
7. receipt transaction hash equals the block transaction hash at that index;
8. receipt gas totals equal `block.gasUsed`;
9. `effectiveGasPrice >= baseFeePerGas`;
10. blob gas fields are either both present or both absent on a receipt;
11. receipt blob-gas totals equal `block.blobGasUsed`;
12. every per-block and aggregate fee identity holds exactly.

Pre-blob blocks may omit `block.blobGasUsed` only when no receipt has blob
fields. Blocks in the requested range must be consecutive. Any malformed,
missing, duplicated, inconsistent, or unexpected JSON-RPC evidence invalidates
the complete requested range.

## RPC Transport

The adapter performs:

1. one JSON-RPC request for the finalized block;
2. ordered chunks of at most 20 block numbers;
3. one JSON-RPC batch per chunk containing paired
   `eth_getBlockByNumber` and `eth_getBlockReceipts` calls.

The largest evidence batch therefore has 40 calls. JSON-RPC response order is
not trusted: responses are matched by exact numeric ids. Missing, duplicate,
unexpected, error, or malformed response entries fail the range.

Requests use `POST`, `content-type: application/json`, and no retries. The RPC
URL may contain provider credentials. It is environment-only and must never
appear in output, error details, cache keys, logs, or tests.

## Failure Semantics

The adapter maps failures to bounded gap codes:

- `rpc_not_configured`: `ETHEREUM_RPC_URL` is absent;
- `rpc_access_gap`: fetch, HTTP, JSON, JSON-RPC, or unsupported-method failure;
- `rpc_finality_gap`: finalized head is unavailable or the range is newer;
- `rpc_schema_drift`: malformed quantities, hashes, blocks, or receipts;
- `rpc_evidence_mismatch`: cross-object or fee-identity mismatch.

The public tool returns `status: "unavailable"`, null metrics, and the relevant
gap. It never returns a partial total and never exposes raw provider errors or
response bodies. Invalid caller arguments remain MCP input errors rather than
source gaps.

## Cache and Reorganizations

Only finalized ranges are accepted. Verified results are cached in process for
30 minutes with a key composed solely of start block, end block, and
`include_blocks`. The key never includes the RPC URL.

A failed refresh may use an already verified finalized-range result because
the block hashes and exact evidence are part of the cached result. It is marked
with a `source_stale` gap and retains `status: "verified"`. No unavailable or
partially validated result is cached.

## Security and Operational Boundaries

- The server stays read-only and sends only standard public Execution API
  methods.
- `ETHEREUM_RPC_URL` is treated as a secret even when it points to a public
  node.
- Default tests make no network calls.
- The live test requires both `ETHEREUM_RPC_URL` and
  `RUN_LIVE_ETH_RPC=1`.
- The tool is descriptive verification, not a trading recommendation.

## Verification

All production behavior follows strict RED, GREEN, REFACTOR. Required final
checks are:

```bash
npm test
npm run typecheck
npm run build
```

The opt-in live check verifies a small finalized range and is reported
separately from the default suite.
