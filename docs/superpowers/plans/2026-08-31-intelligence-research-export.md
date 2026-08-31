# Intelligence Research Export Plan

## Goal

Add an offline, immutable export from the canonical append-only intelligence
history to the research contract. The export must preserve repository/commit,
feature and source-license policy snapshots, PIT observations, cutoff, gaps, and
checksums. It must never fetch data or turn an empty history into evidence.

## Tasks

1. Add an internal-research license assessment that is separate from commercial
   redistribution status.
2. Add `onchain-intelligence-research-export-v1` and deterministic canonical
   checksums for the registry snapshots and whole export.
3. Add an `intelligence-export` CLI that reads the configured JSONL store,
   applies observation and ingestion cutoffs, and refuses to overwrite output.
4. Test future/late observation exclusion, empty-history gaps, source/commit
   binding, checksum mutation, and license mapping.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.

This branch performs no live collection, paid call, credential write, trading
action, or research hypothesis selection.
