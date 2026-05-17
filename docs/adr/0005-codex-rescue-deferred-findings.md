# ADR-0005: Codex Plan Review — Deferred Findings Triage

- **Status**: Accepted (deferred MEDIUM/LOW + non-structural HIGH findings applied to plan this commit)
- **Date**: 2026-05-09
- **Decider**: Kim Kyung-jun
- **Reviewer**: Codex CLI (GPT-5.4) via `/codex:rescue`, original review same-day
- **Plan reviewed**: `plans/2026-05-08-onchain-pulse-mcp.md` (post-ADR-0004 state)
- **Companion to**: ADR-0002 (Opus phase), ADR-0004 (Codex phase HIGH structural). Together with this ADR, the cross-model plan review is complete.

## Context

ADR-0004 applied the 5 most structural HIGH-severity Codex findings (golden-value lock, history persistence vs spec §2 N5, per-adapter cache isolation, warmup CLI per-key contract, env path resolution) plus deferred 21 lower-severity or domain-bound findings to a follow-up triage. This ADR is that triage. After this commit, the plan is implementation-ready and the HANDOFF.md gate's "ADR-0005" item becomes ☑.

## Findings applied (this commit)

| ID  | Severity | Task             | Resolution                                                                                                       |
|-----|----------|------------------|------------------------------------------------------------------------------------------------------------------|
| F1  | MEDIUM   | 5 (cache)        | TTLCache adds in-flight coalescing (`Map<string, Promise<V>>`); 3 new tests; failed loaders clear in-flight to allow retry. |
| F3  | MEDIUM   | 7 (config)       | `parsePulseConfig` now validates `reading_buckets` for inversion / gap / overlap / [0,100] coverage; 4 new tests. |
| F4  | LOW      | 8 (formatter)    | `formatSummary` regex matchers replaced with 7 exact-string assertions covering en/ko, ETF-only, no-input, signed dollar rounding. |
| F8(M)| MEDIUM  | 9 (score)        | Hardcoded `hist.length >= 5` replaced with `cfg.history?.min_samples_for_zscore ?? 5`; 3 new tests verify config drives behaviour. |
| F9  | HIGH     | 10 (derivatives) | `safe()` per-source partial-failure helper. Tests for Coinglass 401 (BYOK omitted, free preserved), ETH funding 503, full Deribit failure → stale fallback. |
| F10 | MEDIUM   | 10 (derivatives) | `recordingFetch` test helper. BTC/ETH per-symbol URL assertions; `CG-API-KEY` header presence/absence assertions. |
| F11 | HIGH     | 11 (macro_rwa)   | Regex parser → `cheerio` (~150KB runtime dep added to `package.json`). Three fixture variants: clean, realistic (class attrs, &minus;, comma grouping, footnote sup, footer "Cumulative" row), broken (JS-rendered fallback). Explicit fallback contract: `< 7 rows` → omit `etf_7d_net_usd` + annotate `farside.co.uk:parse_failed`. |
| F12 | MEDIUM   | 10/11/12/13/15   | New `AdapterResult.stale_data: string[]` field with machine-readable per-source reason codes (`*:auth_rejected`, `*:rate_limited`, `*:http_<n>`, `*:parse_failed`, `*:network_error`, `*:schema_drift`, `*:empty_series`, `*:adapter_threw`, `*:stale_fallback`). Tool layer propagates to `ToolResponse.stale_data`. |
| F13 | HIGH     | 12 (onchain_wallet) | `fetchJson` returns `{ data?, stale? }` outcome; Nansen 401/403/429/network failures never throw, omit `smart_money_net_usd`, drop `nansen` from sources, annotate `stale_data`. 3 new fail-safe tests. |
| F14 | MEDIUM   | 13 (cex_flow)    | Same outcome-shaped fetchJson. Glassnode 401/429/empty-series/schema-drift tests; strict shape check rejects non-array or missing `v` field. |
| F15 | MEDIUM   | 14 (kr_premium)  | Bithumb deferred to v0.2. Endpoint removed from v0.1 endpoints list; rationale documented (Upbit holds dominant KRW share; Bithumb adds redundancy not new score input). v0.2 will introduce volume-weighted `kr_premium_btc`. |
| F16 | HIGH     | 15 (wallet_id)   | Nansen path implemented (was previously advertised in `capabilities` but absent from code). Merge logic: Arkham `entity` wins on conflict; Nansen `category` always preserved. 3 new tests (Nansen-only, merged, Nansen 401 fail-safe). |
| F17 | HIGH     | 16 → 16a/b/c     | Adapter fan-out logic now has its own task (16a) with 4 dedicated tests covering parallel execution, partial failure, stale_data merge, stale fallback bubble-up. |
| F18 | MEDIUM   | 16 → 16a/b/c     | Task 16 split into 16a (`fanOutAdapters`), 16b (`toScoreInputs`), 16c (`getMarketPulse` ToolResponse). Each sub-task has its own red→green→commit cycle. Pipeline arrow: ctx → 16a → 16b → 16c → ToolResponse. |
| F19 | MEDIUM   | 17 (etf_flow)    | Schema narrowed to `window: "7d"` literal. v0.2 will widen to 1d/30d when adapter exposes those keys. New rejection test. |
| F20 | MEDIUM   | 18 (stablecoin)  | Same as F19 for stablecoin. Schema narrowed to `"7d"` literal. |
| F21 | LOW      | 21 (rwa_pulse)   | 3 new tests: unavailable path (no tvl), stale propagation, ko locale exact-match. |
| F22 | HIGH     | 22 (server)      | Decision: keep manual `inputSchema` literals; do NOT add `zod-to-json-schema` dep. Plan text updated to remove the misleading "via zod-to-JSONSchema" mention. |
| F26 | MEDIUM   | 23 (CI/README)   | Acceptance criterion "6 reference YAML rules" corrected to 5 (matches the 5 example rules listed in Task 23 Step 1). |

## Decisions and rationale

### Why split Task 16 (F17 + F18)

The original Task 16 hid four conceptually distinct steps inside one task: adapter fan-out, value mapping, BYOK aggregation, and ToolResponse formatting. With no test for the fan-out step, a regression in Task 22's server wiring (the only place the fan-out lived) would silently produce wrong score inputs. The 16a/16b/16c split makes the data flow auditable; each layer has a documented input/output contract that downstream changes cannot quietly invalidate.

The cost is one additional file each for fan-out and score-input mapping, plus two additional test files. Worth it.

### Why cheerio over a tighter regex (F11)

A tighter regex would have to handle: `&minus;`, `&#8722;`, U+2212 minus, comma grouping, optional `<sup>` markers, `class="…"` attributes, leading/trailing whitespace, header row exclusion, footer row exclusion. By the time the regex covers all of those it's harder to read than the cheerio version, and it remains fragile against shape changes (e.g. column reorder) that cheerio handles via DOM traversal. The 150KB runtime cost is acceptable for a Node-side MCP server.

If npm bundle size becomes a concern in v0.2 (e.g. browser distribution), revisit. For v0.1's `npx`-based distribution, no concern.

### Why `stale_data: string[]` over a typed enum (F12)

A typed enum (`type StaleReason = "auth_rejected" | "rate_limited" | …`) was considered. Rejected because:
- The set of reasons is open-ended (new upstream APIs introduce new failure modes).
- The string format `"<source>:<reason>"` is debuggable in logs and parseable by clients with simple `split(":")`.
- The cost of getting the enum exhaustively right outweighs its safety benefit when the data is informational, not control-flow-affecting.

The convention is **stable suffixes** (`:auth_rejected`, `:rate_limited`, `:http_<n>`, `:parse_failed`, `:network_error`, `:schema_drift`, `:empty_series`, `:adapter_threw`, `:stale_fallback`). Adapters must use these suffixes so client consumers can pattern-match without per-adapter knowledge.

### Why v0.1 v0.2 deferrals (F15, F19, F20)

Bithumb (F15), 1d/30d ETF (F19), and 1d/30d stablecoin (F20) all share a pattern: the user-visible API surface (schema enum) advertised support before the data layer (adapter) had it. The fix in each case is to narrow the schema to what the adapter delivers, plus a v0.2 plan note. This is a **honesty** fix, not a feature reduction — clients calling `window: "1d"` against the original draft would receive `unavailable` summaries and confusing scores.

### Why no `zod-to-json-schema` (F22)

See plan note in Task 22. Net: 6 tools × ~4 lines of schema literal each = 24 lines, vs. ~30 lines of imports + transformer config + dep entry. Not worth it. Revisit at v0.2 if surface grows.

## Test count deltas

| Task   | Before | After | Delta |
|--------|-------:|------:|------:|
| 3      | 4      | 7     | +3    |
| 5      | 4      | 8     | +4    |
| 6      | 5      | 8     | +3    |
| 7      | 3      | 7     | +4    |
| 8      | 8      | 12    | +4    |
| 8.5    | 8      | 11    | +3    |
| 9      | 5      | 8     | +3    |
| 10     | 3      | 6     | +3    |
| 11     | 2      | 7     | +5    |
| 12     | 3      | 6     | +3    |
| 13     | 2      | 6     | +4    |
| 15     | 3      | 6     | +3    |
| 16a    | -      | 4     | +4 (new task) |
| 16b    | -      | 4     | +4 (new task) |
| 17     | 2      | 3     | +1    |
| 18     | 2      | 3     | +1    |
| 21     | 1      | 4     | +3    |
| **Total new tests added** | | | **~55** |

## Consequences

- Codex implementation start is ungated. HANDOFF.md gate now has all three pre-handoff cross-model review items ☑ (Opus / Codex / ADR-0005 triage).
- New runtime dependency: `cheerio` (in `package.json` `dependencies`) — must be added in Task 11's commit alongside `package.json` changes.
- New optional `AdapterResult.stale_data: string[]` field — Task 2 (`src/types.ts`) must add this when constructing the `AdapterResultSchema`. Other adapters (Tasks 10–15) must populate it consistently using the suffix conventions above.
- Task 16 renumbering: existing Tasks 17–23 are unchanged; the split adds **16a**, **16b**, **16c** instead of pushing existing numbers.
- Cross-model review value evidence: Opus and Codex caught largely disjoint findings (Opus surfaced A1/A2 architecture; Codex surfaced F9/F11/F13/F23/F25 robustness/feasibility). The ADR-0002 + ADR-0004 + ADR-0005 record makes this explicit for future contributors deciding whether to invest in cross-model review for v0.2.

## Follow-up

- [ ] Mark HANDOFF.md gate "ADR-0005 triage" as ☑ in this commit.
- [ ] Update `package.json` dependencies before Task 1 scaffolding consumer (Codex's first commit) hits `npm install`. The dependency list now includes: `@modelcontextprotocol/sdk`, `zod`, `lru-cache`, `yaml`, `cheerio`.
- [ ] During code review (post-Codex implementation), spot-check that `stale_data` suffix conventions were followed across all adapters; misuse here breaks client pattern matching across sources.
- [ ] If Codex finds a HIGH-severity item during implementation that this plan didn't anticipate, append findings to `docs/adr/0006-implementation-findings.md` rather than amending this ADR.
