# ADR-0001: Domain Frame and Ubiquitous Language

- **Status**: Accepted
- **Date**: 2026-05-08
- **Decider**: Kim Kyung-jun

## Decision

`onchain-pulse-mcp` is a **query interface to onchain market state**, not a recommender. The server reports — never prescribes. The composite Pulse score and bucketed Reading are convenience derivations; raw inputs are always exposed alongside so consumers can re-interpret without trusting the server's aggregation.

This frame governs the language. Key terms (full glossary in `CONTEXT.md`):

- **Pulse** = composite 0–100 measurement (top-level concept; replaces `mood`).
- **Reading** = bucketed label `risk-off | neutral | risk-on | unknown` (replaces `verdict`).
- **Snapshot** = one tool response (always stateless; no server-side memory across calls).
- **Adapter** = code unit wrapping one or more **Sources** (external endpoints).
- **BYOK** keys appear as `capabilities.byok_active: string[]` (not a single boolean `enriched`).
- Korea-specific premium uses `kr_premium` everywhere in code; "kimchi premium" is allowed in human-facing prose only.
- Composite-input metric keys follow `{concept}_{window}_{aggregation}_{assets?}` (flat form, e.g., `etf_7d_net_flow_btc_eth`).

## Context

The original spec (`docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`) used `mood` as the top-level concept and `verdict` as the bucketed label. Both terms carry prescriptive overtones inconsistent with the project's actual surface area: a read-only MCP tool that returns structured market data plus a derived score. AI agents and humans then act on that data. The server holds no opinion on whether to trade.

A `/grill-with-docs` session surfaced the inconsistency along with several smaller drift points (`enriched` boolean too coarse; `kr_layer`/`kimchi_premium`/`kr_premium` triple-naming; `adapter` vs `source` conflated).

## Considered options

- **Recommender frame** (keep `verdict`, `mood`): natural for retail "tell me what to do" use cases. Rejected: increases liability surface, contradicts the agent-primary persona, would constrain B/A view (screening, timing) tools later, and most agents are smart enough to interpret raw data.
- **Pure query frame, drop the bucketed label** (`Reading` field removed): purist option. Rejected: the bucketed Reading is a useful convenience for cron/alert rules and is exactly the kind of derived feature that belongs in the server (computed once, used many).
- **Hybrid frame** (recommender for `get_market_pulse`, pure query for the rest): rejected as inconsistent and likely to drift.

## Consequences

- The plan (`plans/2026-05-08-onchain-pulse-mcp.md`) and design spec must be updated to use the new language: `mood` → `pulse`, `verdict` → `reading`, `kr_layer`/`kimchi_btc` → `kr_premium`/`kr_premium_btc`, `enriched: boolean` → `byok_active: string[]`. Followed up in a subsequent commit; this is mechanical and does not affect Task 1 scaffolding.
- The composite scoring formula and weights are unchanged — only names move.
- README's BYOK env-var section becomes a list of names visible in `byok_active`, which improves transparency.
- v0.2 (screening) and v0.3 (timing) tools must follow this same query-interface frame: report observed state, surface raw inputs, never prescribe.

## Follow-ups

- ADR-0002 — plan cross-model review findings (after Opus `/plan-eng-review` + `/codex:rescue`).
- ADR-{NNNN} — code cross-model review findings (post-Codex).
- Spec & plan rename pass — separate commit before plan-review handoff.
