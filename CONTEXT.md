# onchain-pulse-mcp

## Project Profile
- 개요: CEX flow, 온체인 지갑, 파생상품, RWA/ETF, 김치프리미엄 등 시장 상태 신호를 읽기 전용 MCP로 제공하는 프로젝트입니다.
- 목적: 에이전트와 사람이 온체인 시장 상태를 recommendation이 아니라 해석 가능한 snapshot으로 조회하게 합니다.

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

**RWA Lifecycle Snapshot**:
A read-only response that reports tokenized asset lifecycle depth: AUM, holder
count, transfer activity, chain distribution, redemption evidence, collateral
usage evidence, official ledger evidence, gaps, sources, and stale data. It is
not a recommendation and does not prove legal rights.

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
A complete tool response with sources, stale data, confidence, capabilities, and
an `as_of` timestamp. Composite Pulse snapshots also contain Score and Reading;
specialized measurement snapshots use their own domain fields. Snapshots are
stateless.

### ETH value capture

**ETH Value Capture Snapshot**:
A read-only measurement of whether Ethereum usage accrues to ETH through fee
burn, execution tips, L2 payments to L1, and supply change. It has no composite
score or trading Reading and does not predict price.

**Gross L1 fees**:
Execution base fee plus execution priority fee plus blob fee over an exact
completed-UTC-day window.

**Total burn**:
Base fee burn plus blob fee burn. Priority fee is excluded because it is paid
to the proposer rather than burned.

**Priority fee**:
Execution-layer tips paid to block proposers. It is not total validator revenue
and excludes out-of-protocol MEV and builder payments.

**Net issuance**:
The signed change in total ETH supply between exact Coin Metrics `SplyCur`
boundary points. Negative values represent supply contraction.

**Consensus issuance**:
For identical post-Merge UTC boundaries only,
`net issuance + total burn`. A missing or mismatched boundary blocks this
derivation and returns `null`.

**L2 rent paid to Ethereum**:
Calldata, blob, and proof-verification costs paid by labelled L2 rollups on
Ethereum L1. This is a subset of gross L1 fees; L2 blob rent also overlaps blob
fee burn. L2 rent and burn must never be added into a synthetic value-capture
total.

ETH value-capture windows are half-open and exclude the current partial UTC
day: current `[cutoff - window, cutoff)`, previous
`[cutoff - 2 × window, cutoff - window)`. Missing components and missing
boundaries remain `null`, not zero.

### ETH collateral capacity

**ETH Collateral Capacity Snapshot**:
A read-only, protocol-specific measurement of ETH-family assets supplied to a
lending market and the subset whose reserve configuration permits collateral
use. It does not prove that individual users enabled the assets as collateral
or that the underlying economic ETH is unique across protocols.

**ETH-family supplied capacity**:
The aToken or equivalent reserve supply for WETH and explicitly listed
ETH-backed staking/restaking derivatives, converted to exact ETH-equivalent
fractions at one finalized block.

**Collateral-eligible supplied capacity**:
The ETH-family supplied capacity for reserves whose market-level configuration
permits collateral use. It is available capacity, not actual user collateral.

**Cross-protocol overlap gap**:
An explicit refusal to sum protocol capacities until derivative lineage,
borrowing loops, and rehypothecation are reconciled. Missing reconciliation
keeps combined, net, gross, and rehypothecation metrics `null`, never zero.

**SparkLend ETH Collateral Capacity Snapshot**:
A separate read-only SparkLend Ethereum measurement for six fixed ETH-family
reserve supplies (WETH, wstETH, rETH, weETH, rsETH, and ezETH) at one finalized
block. It reports supplied capacity and market-level collateral eligibility,
not actual user collateral or an Aave-plus-Spark total. The five broader
overlap/usage/lock metrics remain `null` with explicit gaps.

### Token forensics

**Token Forensics Snapshot**:
A token-level response that reports pool context, flow reading, wallet-flow
tables when available, sources, confidence, and explicit gaps. It is a forensic
view, not a recommendation.

**Flow Reading**:
The observed flow classification for a token snapshot:
`accumulation | distribution | mixed | thin-data | unknown`. It describes
observed data quality and flow shape, not a buy/sell/hold instruction.

**Gap**:
An explicit missing-data or trust limitation such as `source_access_gap`,
`thin_liquidity`, `rpc_gap`, or `cost_cap_gap`.

**Pool Context**:
Liquidity, volume, price, and pool identity from a DEX source. Pool context can
support market analysis but does not establish wallet intent or legal rights.

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
- A composite Pulse **Snapshot** contains one **Score** and one **Reading**.
  Specialized snapshots, including ETH Value Capture, expose domain
  measurements without inventing a score.
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
