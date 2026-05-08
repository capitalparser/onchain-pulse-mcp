# onchain-pulse-mcp

A read-only MCP server that exposes onchain market-state signals — CEX flow, on-chain wallets, derivatives, ETF/RWA macro, Korea premium — as a **query interface** for AI agents and humans.

## Frame

This is a **query interface**, not a recommender. The server reports the state of the market — never prescribes a trade. The composite Pulse score and bucketed Reading are convenience derivations; the raw inputs are always exposed alongside so consumers can re-interpret. The summary line is a description of the snapshot, not an instruction.

## Language

### Domain measurement

**Pulse**:
The composite onchain market-state measurement. A 0–100 score derived from seven weighted-z inputs. The top-level concept this server reports.
_Avoid_: mood, regime, state.

**Score**:
The numeric 0–100 form of the Pulse.

**Reading**:
The bucketed label of the current Score — one of `risk-off | neutral | risk-on | unknown`. A snapshot value, not a recommendation; consumers interpret it.
_Avoid_: verdict, judgment, call (all imply prescription).

**Confidence**:
The 0–1 ratio of input weight present vs total weight in this Pulse computation. 1.0 means all seven inputs contributed; lower values reflect missing or stale inputs (re-normalised weights).

**Funding reverse**:
A sign-flip of the funding-rate contribution to the Pulse when its z-score exceeds the configured threshold. Models the "extreme positioning is contrarian" effect.

### Data plumbing

**Adapter**:
A code unit that wraps one or more **Sources** behind a uniform `AdapterResult` interface. Six adapters in v0.1: derivatives, macro_rwa, onchain_wallet, cex_flow, kr_premium, wallet_id. An Adapter is the deployment unit; a Source is a single external endpoint.

**Source**:
An external API or data origin (e.g., `deribit`, `coinglass`, `defillama`, `farside.co.uk`, `upbit`). One Adapter wraps 1–3 Sources. Sources appear in tool responses under `sources: [...]`.

**BYOK** (Bring-Your-Own-Key):
Env-var-supplied paid API keys (`NANSEN_API_KEY`, `GLASSNODE_API_KEY`, etc.) that a consumer provides to enrich responses with paid-tier data. The server never persists keys.

**byok_active**:
The list of BYOK keys actually used during a tool call (e.g., `["coinglass", "nansen"]`). Empty list ↔ free-only path. Reported in `capabilities.byok_active` so consumers see which paid sources contributed.
_Avoid_: `enriched` (single boolean — too coarse).

**Stale data**:
The list of Sources whose response was a cached or fallback value rather than a fresh fetch. Surfaced per response as `stale_data: [...]` so consumers can downgrade trust on those fields.

**Snapshot**:
A complete tool response — Score, Reading, raw inputs, sources, stale_data, confidence, capabilities, all with a single `as_of` timestamp. Snapshots are stateless.

### Korea layer

**KR Premium**:
The price spread between the Korean (Upbit/Bithumb) BTC or ETH price and the global USD price (proxied through USDT/KRW). Always expressed as a fractional delta. The corresponding code surface is `kr_premium_btc` / `kr_premium_eth` and the adapter is `kr_premium`.
_Avoid_: `kimchi_premium` in code keys (informal alias). Use "(commonly known as kimchi premium)" only in human-facing prose.

**Upbit netflow**:
A 7d proxy for Korean retail buying pressure, currently approximated by Upbit BTC/ETH 24h trading volume relative to global volume. v0.1 limitation: not a true wallet-level netflow.

### Metric key convention

Composite-input keys follow `{concept}_{window}_{aggregation}_{assets?}`:

- `etf_7d_net_flow_btc_eth` — concept: ETF flow, window: 7d, aggregation: net, assets: BTC+ETH
- `stablecoin_7d_supply_delta` — concept: stablecoin supply, window: 7d, aggregation: delta
- `funding_avg_btc_eth` — concept: funding rate, window: instant, aggregation: avg, assets: BTC+ETH
- `btc_dominance_7d_delta`, `options_put_call_ratio`, `rwa_tvl_7d_delta`, `upbit_netflow_7d_kr`

Flat key form is intentional: yaml legibility, zod validation, golden test fixtures all benefit from a single-string identifier.

## Relationships

- A **Tool call** produces one **Snapshot**.
- A **Snapshot** contains exactly one **Score** and one **Reading**.
- A **Score** is computed from up to seven weighted inputs (see Metric key convention).
- An **Adapter** wraps one or more **Sources**; the Snapshot's `sources: [...]` lists every Source that contributed.
- A **BYOK key** activates one or more **Adapter** enrichments; the Snapshot's `capabilities.byok_active: [...]` lists which keys were actually used (not just present).
- Each **Source** has its own freshness expectation (TTL); cached fallbacks appear in **Stale data**.

## Example dialogue

> **Agent:** "Query the current market Pulse."
> **Server:** *Returns Snapshot: Score 78, Reading risk-on, sources: [farside.co.uk, defillama, deribit, upbit]. capabilities.byok_active: []. confidence: 1.0.*
>
> **Agent:** "Why so high?"
> **Server:** *(no opinion — but the consumer can read the inputs: ETF +$340M, stablecoin +1.4%, funding mild, kr_premium +1.8% — and form their own narrative.)*
>
> **Agent:** "Re-query with my Coinglass key set."
> **Server:** *Returns updated Snapshot. capabilities.byok_active: ["coinglass"]. Same Score (the inputs that drive Pulse didn't change), but `inputs.options_put_call_ratio` is now from Coinglass Pro rather than the Deribit free path.*
>
> **Agent:** "Has anything changed in the last hour?"
> **Server:** *(server has no memory — the consumer must compare two Snapshots.)*

## Flagged ambiguities

- **`verdict` vs `reading`** — resolved as `reading` (query-interface frame; non-prescriptive).
- **`mood` vs `pulse`** — resolved as `pulse` (matches project name and `*_pulse` tool naming).
- **`kr_layer` vs `kr_premium` vs `kimchi_premium`** — resolved as `kr_premium` for code; "kimchi premium" allowed in human-facing prose only.
- **`capabilities.enriched: boolean`** — resolved by replacing with `capabilities.byok_active: string[]` for transparency and future multi-key compatibility.
- **`adapter` vs `source`** — resolved by keeping both as distinct concepts (Adapter = code unit; Source = external endpoint).
