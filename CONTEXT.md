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

**Lido Pooled ETH Backing Snapshot**:
A read-only, protocol-specific measurement of Lido stETH pooled ETH backing at
one finalized Ethereum block. It reports verified internal/external pooled ETH,
the accounted internal components, and shares. It is not all Ethereum native
stake, unique net ETH locked, downstream DeFi collateral, a combined
Aave/Spark/Lido demand total, or a rehypothecation ratio; those five broader
metrics remain `null` with explicit gaps.

**Sky ETH Adapter Custody Snapshot**:
A read-only measurement of legacy Maker/Sky ETH-family tokens held by the six
fixed ETH-A/B/C, WSTETH-A/B, and RETH-A adapter contracts at one finalized
Ethereum block. It resolves the official fixed Chainlog and runtime contracts,
then reports adapter-held token custody only. It is never active Vault
collateral, actual user collateral, unique or net ETH locked, combined
Aave/Spark/Lido/Sky demand, or rehypothecation; all five broader metrics remain
`null` with explicit gaps.

**EigenLayer ETH Restaking Exposure Snapshot**:
A read-only measurement of fixed legacy EigenLayer ETH-family LST strategy
token-unit exposure plus native-restaking diagnostics at one finalized
Ethereum block. It preserves each of the twelve heterogeneous strategy tokens
independently, including uint8 decimals, whitelist state, shares, custody, and
the strategy share-accounting conversion. It does not sum token-native units
or treat the share conversion as executable withdrawal capacity.

**EigenLayer native-restaking diagnostics**:
Exact core-manager coherence, virtual Beacon Chain ETH strategy identity,
`numPods`, and burnable ETH shares. These diagnostics are not a native-restaked
ETH total. The snapshot also does not establish an ETH-equivalent LST total,
unique or net ETH locked, combined Aave/Spark/Lido/Sky/EigenLayer demand, or a
rehypothecation ratio; all six broader metrics remain `null` with explicit
gaps.

**EigenLayer Covered LST ETH Quotes Snapshot**:
A separate read-only bounded accounting quote view for exactly 9 of the
12 fixed legacy strategies, in this fixed order: stETH, rETH, cbETH, ETHx,
oETH, osETH, swETH, lsETH, and mETH. The base authority is EigenLayer release `v1.12.0`, commit
`d302f65042164c8d8d0a983c1540d85a8710030b`. The 18-decimal token identities
are stETH `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`, rETH
`0xae78736Cd615f374D3085123A210448E74Fc6393`, cbETH
`0xBe9895146f7AF43049ca1c1AE358B0541Ea49704`, ETHx
`0xA35b1B31Ce002FBF2058D22F30f95D405200A15b`, oETH
`0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3`, osETH
`0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38`, swETH
`0xf951E335afb289353dc249e82926178EaC7DEd78`, lsETH
`0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549`, and mETH
`0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa`. The exact unquoted list is
ankrETH, wBETH, sfrxETH.

**Covered partial metrics**:
`covered_share_accounting_eth_equivalent_wei` and
`covered_token_custody_eth_equivalent_wei` are distinct partial sums across
only the nine covered strategy amounts. They are not full LST, native-restaked,
or total EigenLayer exposure, independent backing, or downstream-reuse views.

**Covered LST quote trust basis**:
stETH semantics are pinned to Lido core `v4.0.0` commit
`17005714f151e5502c559932319a3f2f74ac2436`; rETH to Rocket Pool commit
`fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88` with direct `getEthValue(uint256)`
(`0x8b32fa23`); and cbETH to Coinbase `wrapped-tokens-os` commit
`5697a90f4c47e8d801cedce81444a8464019fe08` with `exchangeRate()`
(`0x3ba0b9a9`) at `10**18` scale. cbETH has no bounded rate-timestamp proof.

osETH is pinned to StakeWise v3-core release `v5.0.1`, commit
`fc70cbe1b3d41bc5f78434830d837aa270ca33bc`: direct non-proxy controller
`0x2A261e60FB14586B474C208b1B7AC6D0f5000306` receives two
`convertToAssets(uint256)` calls (`0x07a2d13a`). PriceFeed
`0x8023518b2192FB5384DAdc596765B3dD1cdFe471` and
`osTokenVaultController()` (`0xabed451d`) are documentary-only, never runtime
calls. mETH is pinned to Mantle mantle-lsp/contracts release `v1.4.1`, commit
`bbc4e8bf7d3e3b4ca0c5be07aba409ac66611c76`: Staking
`0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f` verifies `mETH()`
(`0x29e84867`) and `oracle()` (`0x7dc0d1d0`) against Oracle
`0x8735049F496727f824Cc0f2B174d826f5c408192`; Staking—not Oracle—receives
both `mETHToETH(uint256)` (`0x5890c11c`) calls.

swETH semantics are pinned to official Swell `v3-core-public` commit
`5827c4f1294b00f2939e582b1d3ac448f87fa218`: `swETHToETHRate()`
(`0xd68b2cb6`) returns the stored WAD rate or `1e18` when stored zero, and
`lastRepriceUNIX()` (`0xfbda759b`) is report context only. Official
`Pendle-Market-Deployment` commit `2036c371dceff085b2eb30a8e06b13819d4a835b`
corroborates only the token address; it and Etherscan are not strategy-pair
authority. The pair is fixed by the EigenLayer legacy universe and finalized
base verifier binding. Both quotes are `floor(amount * rate / 1e18)` with a
full-precision intermediate; `(rate=1e18,timestamp=0)` is valid, proves no
activity, and has no freshness cutoff.

OETH strategy authority is EigenLayer v1.12.0 commit
`d302f65042164c8d8d0a983c1540d85a8710030b`; immutable Origin commit
`07a7fcb052d715409014dd69e69e3c680ee8ae47` separately pins the OETH proxy,
Vault proxy, and WETH addresses. It is historical source and does not prove
live proxy/source correspondence. The OETH quote is nominal token-unit identity,
not backing, ETH spot value, immediate redemption, liquidity, or executable
exit. The three pointer bindings are verified; last rebase, rebase pause, and
withdrawal delay are context only. Zero values and paused rebase are valid,
delay zero means async withdrawals disabled, and there is no freshness cutoff.

ETHx conversion/oracle semantics are pinned to Stader `ethx` v1.1.0 commit
`1939e6c36087bf7cb437e4323f426219df6313b4`. Its deployed mainnet token
`0xA35b1B31Ce002FBF2058D22F30f95D405200A15b`, StaderConfig
`0x4ABEF2263d5A5ED582FC9A9789a41D85b68d69DB`, StakePoolsManager
`0xcf5EA1b38380f6aF39068375516Daf40Ed70D299`, and StaderOracle
`0xF64bAe65f6f2a5277571143A24FaaFDFC0C2a737` are separately pinned to the
official current README commit `9d4a9211431d6c0cdf014bd64d3718cba4ce96ab`,
because the v1.1.0 README does not enumerate deployed addresses. The adapter
verifies all five configuration pointers, then recomputes two manager
`convertToAssets(uint256)` values against the Oracle's exact 96-byte
`(reportingBlockNumber,totalETHBalance,totalETHXSupply)` tuple with
full-precision floor arithmetic (or identity when supply is zero).

lsETH is pinned to Liquid Collective `liquid-collective-protocol` release
`v1.3.0`, commit `964f0e363fbaec8955af430888838a1666a1c6ba`: the mainnet
River/LsETH proxy `0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549` receives two
`underlyingBalanceFromShares(uint256)` calls (`0xf79c3f02`) and one
`getLastCompletedEpochId()` call (`0x89896aef`). The direct conversion is the
protocol's exact zero-or-floor share accounting; the epoch is report context
only, not freshness proof. The bounded target does not independently verify
proxy implementation/source correspondence or backing.

**Covered LST quote acquisition boundary**:
One cold verification is exactly 5 JSON-RPC batches, 119 logical requests, 117
`eth_call` requests, and contiguous IDs 1--119 at one numeric finalized block.
IDs 92--103 preserve existing calls; IDs 104--111 verify ETHx configuration
pointers, two conversions, and its Oracle tuple; IDs 112--113 read the swETH
rate and reprice context; IDs 114--119 verify OETH/Vault/WETH bindings and read
OETH context. The sole v6 30-minute combined cache neither consumes the base public cache nor
accepts a stale base; stale fallback requires prior complete nine-token verified
evidence.

The seven broader fields `lst_restaked_eth_equivalent_wei`,
`native_restaked_eth_wei`, `eigenlayer_eth_family_exposure_eth_wei`,
`unique_net_eth_locked`, `combined_aave_spark_lido_sky_eigenlayer_demand`,
`rehypothecation_ratio`, and `executable_withdrawal_capacity_eth_wei` remain
`null`. The snapshot does not establish full LST/native/EigenLayer totals,
unique/net locked ETH, combined Aave/Spark/Lido/Sky/EigenLayer demand,
rehypothecation, independent backing reconciliation, cbETH exchange-rate
freshness, OETH rebase freshness, osETH virtual-reward-input freshness, swETH reprice freshness, mETH oracle-record freshness,
lsETH report freshness, proxy implementation/source correspondence, or backing;
nor executable withdrawal/liquidity. ETHx's oracle reporting block is context
only and must not exceed the verified block; it does not establish report
freshness, proxy implementation/source correspondence, or backing reconciliation.
Permanent gaps are
`lst_quote_coverage_partial`, `native_restaked_eth_not_measured`,
`lst_restaked_eth_equivalent_not_measured`,
`eigenlayer_eth_family_exposure_not_measured`,
`unique_net_eth_locked_not_reconciled`,
`combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled`,
`rehypothecation_ratio_not_measured`, `executable_withdrawal_capacity_not_measured`,
`cbeth_exchange_rate_freshness_not_verified`,
`oseth_virtual_rewards_freshness_not_verified`, `oseth_backing_not_reconciled`,
`meth_oracle_record_freshness_not_verified`, `meth_backing_not_reconciled`,
`lseth_oracle_report_freshness_not_verified`,
`lseth_proxy_upgradeability_not_verified`, and `lseth_backing_not_reconciled`.
Additional v6 gaps are `ethx_oracle_report_freshness_not_verified`,
`ethx_proxy_upgradeability_not_verified`, `ethx_backing_not_reconciled`,
`oeth_rebase_freshness_not_verified`, `oeth_proxy_upgradeability_not_verified`,
`oeth_backing_not_reconciled`, `oeth_async_withdrawal_liquidity_not_verified`,
`sweth_reprice_freshness_not_verified`, `sweth_proxy_upgradeability_not_verified`,
and `sweth_backing_not_reconciled`.

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
