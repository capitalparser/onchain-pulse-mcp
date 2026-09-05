# Codex validation: UTC history and collection completion

Repository: `capitalparser/onchain-pulse-mcp`  
Branch: `fix/history-utc-completion`  
Base inspected by the implementation: `dc62eeb8b18e2b67820e09ee5ac6135e2d156434`

Use the selected repository or an existing Codex-managed worktree. Do not
create another repository, use a hardcoded user-directory path, or discard
uncommitted work. Verify the Git remote, PR head, branch, and clean worktree
before running. Fetch current remote metadata; do not silently rebase, merge,
or overwrite a branch changed by another task.

Read `AGENTS.md` and
`docs/implementation/2026-09-05-time-contract-hardening.md` first.

## Boundaries

- Validate/fix this existing PR only. Do not modify or merge PR #58, #44, #46,
  the console repository, or any trading/execution repository.
- Do not dispatch, enable, add, or rerun GitHub Actions. Use `[skip ci]` for
  publication commits. Keep existing workflow and deployment files unchanged.
- Preserve MCP/HTTP schemas, observation IDs, persisted histories, source
  policies, financial classifications, and ingestion-time semantics.
- Do not remove/weaken tests, use force dependency installation, or claim that
  a mocked/isolated test validates actual external providers.

## Required Node 24 validation

```bash
node --version
npm --version
npm ci
npm run typecheck
npx vitest run tests/frontend_contract/eth_history_time.test.ts tests/robinhood_chain_pulse/collection_time.test.ts
npm test
npm run build
npm audit --omit=dev
git diff --check
```

Run only the default offline tests; do not enable opt-in live tests or collect
into a real history file. The new cases use in-memory stores and injected
source results. No RPC key or trading credential is required.

Inspect the following invariants independently of test counts:

1. Positive/negative offsets, UTC midnight, and leap day use the correct UTC
   day, while selected original timestamp strings remain unchanged.
2. Observed/ingested/source timestamps compare by epoch milliseconds, not text.
   Equal instants with equal evidence do not become ambiguous; true conflicts
   still remove the day and reconcile discarded counts.
3. Both observed and ingested cutoff gates, metric/window predicates, actual
   zero handling, and existing browser secrecy/licensing behavior remain intact.
4. Robinhood completion is sampled after all awaited batch/append-only writes.
   Failed reads/writes cannot return a completion receipt. Idempotent retries
   preserve existing rows and ingestion times.
5. Invalid/backwards clocks fail explicitly. Post-write clock failure or a
   partial append failure does NOT imply a rollback; tests must retain that fact.
6. A mutable Date clock cannot overwrite earlier samples. Three successful
   clock calls are the deliberate injected-clock compatibility change.

## Output

Fix defects on the same branch and repeat focused AND full validation after any
source/test change. Commit
`docs/CODEX_TIME_CONTRACT_VALIDATION_REPORT.md` with exact commands, outputs,
Node/npm versions, validated code/test SHA, focused/full counts, build/audit
results, residual risks, and `ready_for_owner_review` or `not_ready`.

Publish to the existing PR branch without merging. Report exact PR URL and head
SHA. A later report-only commit must be identified as such; do not claim a
changed source/test tree was validated by an earlier run. Keep the PR Draft
when the Node 24 gate is incomplete. Never use previous PR test counts as proof
for this change.
