# Canonical history write-safety review

Reviewed baseline: `dc62eeb8b18e2b67820e09ee5ac6135e2d156434`.

This bounded change addresses defects in the canonical JSONL and generic forward
collection contracts. It does not change MCP schemas, HTTP routes, provider
adapters, feature definitions, source-license policy, dependencies, workflows,
backfill manifests, or existing observations. Open PRs #44 and #46 have no
changed-file overlap with this patch as inspected at review time.

## Findings and corrections

| Severity | Baseline failure | Correction / regression |
| --- | --- | --- |
| HIGH | Two store instances/processes can both pass the duplicate-ID check, then append the same ID. Subsequent reads reject the entire persisted history. | A canonical-path sidecar lock covers the persisted-data read, duplicate check, and append. Tests cover independent instances, another Node process, aliases, and an existing lock. |
| HIGH | A valid final JSONL row without a newline passes `readAll`, but a subsequent append concatenates two JSON objects and corrupts replay. | Insert one separator only when needed; preserve all existing bytes, including CRLF and trailing whitespace. |
| HIGH | `runForwardCollection` writes a valid prefix before rejecting a later out-of-cutoff row. Duplicate IDs and invalid result metadata can likewise fail after persistence begins. | Validate the complete batch, unique IDs, result bounds/metadata, and pre-write lifecycle times first; prefer `appendMany` when implemented. Record final completion after persistence. |
| MEDIUM | ISO offsets are accepted by the schema, but history helpers compare timestamp strings. Mixed offsets can invert a manifest range, misorder exports, and misreport quality coverage. | Compare epoch milliseconds, retain deterministic tie-breakers, and preserve original timestamp strings. Test manifest ranges/fingerprints, export ingestion ordering, and coverage endpoints. |

## Writer lock contract

The sidecar is `<canonical-history-path>.lock`, created exclusively with `wx`
and mode `0600`. It contains the owner PID and creation time for diagnosis.
Contention fails immediately with `metric observation store is locked`; there is
no unbounded wait, polling, lock expiry, or automatic stale-lock takeover.

Existing final-file symlinks and symlinked parent directories resolve to the same
canonical target before locking. A dangling final symlink, non-regular target,
or hard-linked file is rejected. Hard links are not supported because separate
path locks cannot guarantee one owner of the shared inode. Use a single-link
regular history file, or a symlink to that file.

Only the invocation that successfully acquires a lock removes it, including on
validation/operation failure. An existing lock is never deleted by a contender.
An empty or schema-invalid append batch creates no directory or lock. Readers
remain read-only, including when the history path does not exist.

If a writer is killed, the sidecar can remain. Quiesce **all** writers, investigate
the recorded owner (a PID alone is not proof of liveness or death), and back up
and validate the JSONL before an operator removes the orphaned sidecar. Corrupt
history is rejected; this patch does not silently repair or discard records.

## Explicit limits

- This is cooperative local-filesystem exclusion, not distributed locking. Every
  writer must use this version/protocol; old binaries and unrelated file editors
  do not acquire the lock. The directory and path aliases must be trusted and
  stable during an operation. Network filesystems are not claimed as supported.
- JSONL remains physically append-only. This change does **not** make filesystem
  I/O transactional, provide power-loss durability, or make a concurrent reader
  see an all-or-nothing batch. A short/failed write can still require operator
  recovery; strict replay rejects malformed persisted records.
- Generic stores with only `append` retain their compatibility path. Input
  preflight is not a rollback mechanism for adapter I/O failures or concurrent
  mutation. `completed_at` is still obtained after persistence, with an additional
  clock sample now used for preflight; callers supplying a test clock must allow
  that sample. A clock failure after persistence cannot roll back appended rows.
- Whole-file validation remains O(history size); query pagination/indexing and
  a transactional backend need a separate design before high-volume/public use.
- Existing immutable manifests are not regenerated. New mixed-offset manifests
  use chronological ordering; ordinary canonical-UTC ordering is unchanged.

## Verification

New offline regressions are in `store_write_safety.test.ts` and
`history_write_safety.test.ts`. They use temporary paths and synthetic
observations only; the child-process test imports the dependency-free lock module
using the repository's Node 24 runtime.

Required integration checks remain the existing CI lane: `npm ci`,
`npm run typecheck`, `npm run test`, and `npm run build`. Execution results belong
in the PR, not in this document as an unverified passing claim. No live provider
request or repository data write is required by the new tests.
