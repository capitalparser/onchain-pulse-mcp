# onchain-pulse-mcp

> Read-only MCP server exposing onchain market pulse signals — CEX flow, on-chain wallets, derivatives, ETF/RWA macro, and Korea-market premium — designed for AI agents, retail, and institutions.

**Status**: `v0.1` implementation branch active. Core adapters, MCP tools, stdio server, and warmup CLI are implemented.

See the design spec at [`docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`](docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md).

## Why

Existing onchain intelligence tools (Nansen, Arkham, Coinglass) are dashboards built for humans. AI agents need structured, queryable, decision-unit-bundled data — and most macro signals (ETF flow, stablecoin supply, RWA TVL, KR premium) live in fragmented sources. This server consolidates them behind a small, opinionated MCP surface.

## Design Highlights

- **Read-only · snapshot-oriented**: idempotent MCP responses, no write actions, local-only history materialisation for composite z-scores.
- **Source adapters**: free and BYOK-backed market, Ethereum, RWA, derivatives, and Korea data paths.
- **16 MCP tools**: the six original macro tools, token forensics, ETH value capture, bounded Ethereum execution-fee and consensus-reward cross-checks, finalized Aave V3 Core and SparkLend supplied-capacity views, Lido pooled ETH backing, legacy Maker/Sky ETH-family adapter-held token custody, fixed legacy EigenLayer ETH-family LST strategy token-unit exposure with native-restaking diagnostics, and bounded quotes for stETH/rETH/cbETH/ETHx/oETH/osETH/swETH/lsETH/mETH.
- **BYOK enrichment**: free defaults work out of the box; paid keys (Nansen/Glassnode/Arkham/Coinglass/CryptoQuant/Laevitas) are auto-detected via env vars.
- **Composite pulse score**: 7-input weighted z-score with weights externalized to `config/pulse.yaml` — tweak to your thesis.
- **Graceful degradation**: partial source failures yield reduced-confidence answers, never silent failure.
- **Korea-aware**: Upbit netflow proxy and KR premium (commonly known as kimchi premium) are first-class inputs.

## Quickstart

```bash
npx onchain-pulse-mcp
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "onchain-pulse": {
      "command": "npx",
      "args": ["-y", "onchain-pulse-mcp"]
    }
  }
}
```

Seed local history for composite z-scores:

```bash
npx onchain-pulse-mcp warmup
```

### BYOK enrichment

Set any of these env vars to enrich responses with paid data sources. The server detects them automatically:

| Env var | Source | What it adds |
|---|---|---|
| `NANSEN_API_KEY` | Nansen | Smart-money 7d net flow |
| `GLASSNODE_API_KEY` | Glassnode | Exchange inflow series |
| `COINGLASS_API_KEY` | Coinglass | Cross-venue OI for BTC/ETH |
| `ARKHAM_API_KEY` | Arkham | Wallet entity labels |
| `CRYPTOQUANT_API_KEY` | CryptoQuant | Reserved for v0.2 |
| `LAEVITAS_API_KEY` | Laevitas | Reserved for v0.2 |
| `DUNE_API_KEY` | Dune | ETH fee burn and labelled L2 rent through direct SQL execution |
| `ETHEREUM_RPC_URL` | Ethereum Execution API | Optional finalized-block fee, collateral/backing/custody, EigenLayer restaking-exposure, and covered 9-of-12 LST quote transport; internal only and never returned |
| `ETHEREUM_BEACON_API_URL` | Ethereum Beacon API | Optional finalized-epoch reward-component cross-check transport; internal only and never returned |

`DUNE_API_KEY` is used only when a caller explicitly selects
`paid_mode="byok_allowed"`. Dune direct SQL is usage-based and consumes credits
from the key owner's account. The default `free_only` mode never starts a Dune
execution.

### Locale

Set `OPM_LANG=ko` for Korean `summary` strings. Default is `en`.

### Tools

| Tool | Args | Description |
|---|---|---|
| `get_market_pulse` | none | Composite pulse score 0-100 plus reading |
| `get_etf_flow` | `window?` (`7d` only in v0.1) | ETF net flow |
| `get_stablecoin_pulse` | `window?` (`7d` only in v0.1) | Stablecoin supply delta |
| `get_funding_oi` | `asset` (`BTC` or `ETH`) | Funding/PCR/OI |
| `get_kr_premium` | `asset?` (`BTC`, `ETH`, or `all`) | KR premium for BTC/ETH/all |
| `get_rwa_pulse` | `window?` (`1d`, `7d`, `30d`) | RWA TVL pulse |
| `get_token_forensics` | `chain`, `token_address`, `pool_address?`, `max_wallets?`, `paid_mode?` | Phase 1 token-level forensic snapshot with pool discovery, non-prescriptive flow reading, confidence, and explicit gaps |
| `get_eth_value_capture` | `window?`, `paid_mode?`, `include_rollups?` | ETH fee burn, execution tips, L2 rent, supply change, and aligned issuance |
| `get_eth_fee_cross_check` | `start_block`, `end_block`, `include_blocks?` | Exact finalized Ethereum execution-fee and burn verification for a bounded block range |
| `get_eth_collateral_demand` | none | Exact finalized Aave V3 Core ETH-family supplied capacity; broader collateral and lock metrics stay null |
| `get_spark_eth_collateral_capacity` | none | Exact finalized SparkLend ETH-family supplied capacity; Aave/Spark overlap and broader collateral metrics stay null |
| `get_lido_pooled_eth_backing` | none | Exact finalized Lido pooled ETH backing; all-native-stake, net-locked, DeFi-collateral, and combined-demand metrics stay null |
| `get_sky_eth_collateral_custody` | none | Exact finalized legacy Maker/Sky ETH-family adapter-held token custody; active Vault/user/net-locked/combined-demand/rehypothecation metrics stay null |
| `get_eigenlayer_eth_restaking_exposure` | none | Exact finalized fixed legacy EigenLayer ETH-family LST token-unit exposure and native-restaking diagnostics; all broader totals stay null |
| `get_eigenlayer_lst_eth_quotes` | none | Finalized bounded quotes for 9 of 12 fixed strategies; OETH is nominal unit accounting, not redeemability, and only two distinct partial sums are non-null |
| `get_eth_consensus_rewards_cross_check` | `epoch`, `include_blocks?` | Exact finalized Ethereum consensus reward-component verification for one epoch |

`get_token_forensics` is Phase 1. It discovers the best pool through DexScreener
and returns a `ForensicsSnapshot` with `thin-data` or `unknown` flow reading
until wallet-flow providers are wired. It does not prescribe trades.

### ETH value capture

`get_eth_value_capture` uses completed UTC-day boundaries and compares the
selected window with the immediately preceding equal-length window.

| Argument | Values | Default |
|---|---|---|
| `window` | `7d`, `30d`, `90d` | `30d` |
| `paid_mode` | `free_only`, `byok_allowed` | `free_only` |
| `include_rollups` | `true`, `false` | `false` |

Free request:

```json
{
  "name": "get_eth_value_capture",
  "arguments": {
    "window": "30d"
  }
}
```

In `free_only`, the server fetches Coin Metrics supply boundaries and
GrowThePie total L2 rent. This returns a partial snapshot because fee and
decomposed-rent values remain `null`:

```json
{
  "status": "partial",
  "window": "30d",
  "metrics": {
    "base_fee_burn_eth": {
      "current": null,
      "previous": null,
      "delta": null,
      "pct_change": null,
      "unit": "ETH"
    },
    "net_issuance_eth": {
      "current": -12000.5,
      "previous": 8300.25,
      "delta": -20300.75,
      "pct_change": -2.4458,
      "unit": "ETH"
    }
  },
  "sources": [
    "coinmetrics-community:SplyCur",
    "growthepie:rent_paid_eth"
  ],
  "confidence": 0.4
}
```

Explicit Dune request:

```json
{
  "name": "get_eth_value_capture",
  "arguments": {
    "window": "30d",
    "paid_mode": "byok_allowed",
    "include_rollups": true
  }
}
```

Dune remains explicitly authorized and is preferred for fee and decomposed L2
rent data. GrowThePie rollups contain total rent only; their calldata, blob,
and verification components remain unavailable. Its full-history export
endpoint supports every comparison window, including 90 days. Source precedence
selects a complete Dune or GrowThePie rent pair and never adds or averages
their rent values.

The Dune cache key includes cutoff day, window, and rollup detail. Fresh results
remain in process for 30 minutes; concurrent identical requests share one
execution. Failed and timed-out executions are not automatically resubmitted
during that cache interval. API keys are sent only in the
`X-DUNE-API-KEY` header and are never returned or persisted.

Metric identities and overlap:

- gross L1 fees = base fee burn + priority fee + blob fee burn;
- total burn = base fee burn + blob fee burn;
- consensus issuance = net issuance + total burn only for identical boundaries;
- priority fees exclude MEV and builder payments;
- L2 rent is already contained in gross L1 fees, and its blob component
  overlaps blob fee burn.

Do not add burn and L2 rent into a synthetic total. The response reports
measurements, provenance, freshness, confidence, and explicit gaps—not a price
forecast or investment recommendation.

Opt-in live source verification:

```bash
npm run test:live:eth-value
```

The live Coin Metrics and GrowThePie checks are free. The Dune check consumes
Dune credits and runs only when both `DUNE_API_KEY` is present and
`RUN_LIVE_DUNE_ETH_VALUE=1` explicitly authorizes it. Price/ETH-BTC comparison,
ETF or treasury-company flows, and deeper user-position or cross-protocol
collateral indexing remain deferred.

### Ethereum execution fee cross-check

`get_eth_fee_cross_check` is a separate, read-only verification surface. It
does not replace the completed-UTC-day Dune aggregation used by
`get_eth_value_capture`, and full daily RPC reindexing remains deferred.

```json
{
  "name": "get_eth_fee_cross_check",
  "arguments": {
    "start_block": 23000000,
    "end_block": 23000001,
    "include_blocks": false
  }
}
```

Both block arguments are required non-negative safe integers. The range is
inclusive, ordered, consecutive, finalized-only, and capped at **64 blocks**.
The verifier first obtains the Execution API `finalized` head, then obtains
only `eth_getBlockByNumber` and `eth_getBlockReceipts` evidence for the exact
requested range. It does not fall back to one receipt request per transaction.
Every block timestamp is parsed as a canonical quantity. At and after the
Dencun mainnet activation timestamp `1710338135` (epoch 269568), the block
must explicitly include `blobGasUsed`, including `0x0` for a zero-blob block;
otherwise the full range is unavailable rather than treated as a zero. This
gate follows the [Ethereum Foundation Dencun announcement](https://blog.ethereum.org/2024/02/27/dencun-mainnet-announcement)
and the [`eth_getBlockByNumber` block object](https://ethereum.github.io/execution-apis/api/methods/eth_getBlockByNumber/).

All fee arithmetic uses exact integer wei and returns a matching exact ETH
decimal string. The response verifies these identities for every aggregate
(and every requested block when `include_blocks=true`):

- execution fee = base-fee burn + priority fee;
- gross fee = execution fee + blob-fee burn;
- total burn = base-fee burn + blob-fee burn.

Set `ETHEREUM_RPC_URL` only in the server environment. It may contain provider
credentials; it is never returned, logged, persisted, or included in cache
keys. Without it, the tool returns a bounded `rpc_not_configured` unavailable
snapshot and performs no network call. Default tests never use the endpoint.

The dedicated live check is opt-in and read-only:

```bash
npm run test:live:eth-rpc
```

It remains skipped unless both `RUN_LIVE_ETH_RPC=1` and `ETHEREUM_RPC_URL` are
set. When enabled, it resolves a finalized head and verifies no more than two
finalized blocks.

### Aave V3 Core ETH-family supplied capacity

`get_eth_collateral_demand` has no arguments. It is a read-only verifier for
the fixed Aave V3 **Ethereum Core** ETH-family reserve set: WETH, wstETH,
cbETH, rETH, weETH, osETH, ETHx, rsETH, tETH, and ezETH. It is not a user
position index and does not claim actual user collateral, unique ETH locked,
net ETH locked, gross collateral, or rehypothecation.

For each uncached request the verifier uses exactly four JSON-RPC batch rounds
and at most **35 logical calls**: mainnet chain/finalized block, provider
resolution, ten reserve configurations plus ten aToken supplies, then ten
asset prices plus a duplicate WETH reference price. Every contract read is
bound to the same exact finalized hexadecimal block tag, and `eth_chainId`
must be canonical Ethereum mainnet `0x1`.

Values use bigint-only rational ETH equivalents. Each result exposes
`wei_floor`, exact base-10 `eth_floor`, `remainder`, and `denominator`; no
value-carrying arithmetic uses JavaScript floating point. A verified response
has Aave reserve supply coverage only. `actual_user_collateral`,
`net_eth_locked`, `gross_eth_collateral`, and `rehypothecation_ratio` are
always `null` with explicit coverage gaps.

Set `ETHEREUM_RPC_URL` only in the server environment. It may contain provider
credentials and is never returned, logged, persisted, or included in cache
keys. Without it, the tool returns `rpc_not_configured` without making a
network request. The default test suite never calls the endpoint.

The single-snapshot live verifier is explicitly opt-in and read-only:

```bash
npm run test:live:eth-collateral
```

It remains skipped unless both `RUN_LIVE_ETH_COLLATERAL=1` and
`ETHEREUM_RPC_URL` are set.

### SparkLend ETH-family supplied capacity

`get_spark_eth_collateral_capacity` has no arguments. It is a read-only,
protocol-specific verifier for SparkLend Ethereum WETH, wstETH, rETH, weETH,
rsETH, and ezETH reserve supply. It reports supplied capacity and the
market-level collateral-eligible subset; it does not claim actual user
collateral, unique or net ETH locked, gross collateral, rehypothecation, or a
combined Aave/Spark amount. Those five broader metrics remain `null` with
explicit gaps until overlap reconciliation exists.

The verifier reuses the finalized Aave V3 market RPC module but resolves the
official Spark PoolAddressesProvider. Each uncached request is four JSON-RPC
batch rounds and exactly **23 logical calls**: chain/finalized block, provider
resolution, six configurations plus six aToken supplies, then six prices plus
one duplicate WETH reference price. All contract calls use the same finalized
block tag. Values are bigint-only exact rational ETH equivalents; RPC URLs stay
environment-only and never appear in outputs, errors, logs, or cache keys.

The read-only live verifier is opt-in:

```bash
npm run test:live:spark-collateral
```

It remains skipped unless both `RUN_LIVE_SPARK_COLLATERAL=1` and a nonblank
`ETHEREUM_RPC_URL` are set.

### Lido pooled ETH backing

`get_lido_pooled_eth_backing` has no arguments. It is a read-only verifier for
Lido stETH protocol-level pooled ETH backing at one finalized Ethereum block.
It is pinned to Lido core `v4.0.0` commit
`17005714f151e5502c559932319a3f2f74ac2436` and reads only the official mainnet
stETH/Lido proxy `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`.

Each uncached verification has exactly two JSON-RPC batch rounds and nine
logical requests: mainnet chain/finalized-block evidence, then seven contract
calls at that exact block tag. It recomputes the internal/external pooled ETH
and share identities using bigint-only values. This reports Lido pooled ETH
backing only; it does not establish all Ethereum native stake, unique net ETH
locked, downstream DeFi collateral, a combined Aave/Spark/Lido demand total, or
a rehypothecation ratio. Those five metrics remain `null` with explicit gaps.

Set `ETHEREUM_RPC_URL` only in the server environment. It may contain provider
credentials and is never returned, logged, persisted, or used as a cache key.
Without it, the tool returns `rpc_not_configured` without a network request.
The read-only live verifier is explicitly opt-in:

```bash
npm run test:live:lido-backing
```

It remains skipped unless both `RUN_LIVE_LIDO_BACKING=1` and a nonblank
`ETHEREUM_RPC_URL` are set.

### Legacy Maker/Sky ETH-family adapter-held token custody

`get_sky_eth_collateral_custody` has no arguments. It is a read-only verifier
for legacy Maker/Sky ETH-family tokens held by six adapter contracts at one
finalized Ethereum block: ETH-A, ETH-B, ETH-C, WSTETH-A, WSTETH-B, and RETH-A.
It is adapter-held token custody only: it never represents active Vault
collateral, actual user collateral, unique or net ETH locked, combined
Aave/Spark/Lido/Sky demand, or rehypothecation. Those five metrics remain
`null` with explicit gaps.

The verifier starts from the official fixed mainnet Maker/Sky Chainlog
`0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F`, then resolves its runtime
contracts at the same finalized block: `MCD_VAT`, `ETH`, `WSTETH`, `RETH`, and
the six fixed join keys. It checks each join's Vat, ilk, token, decimals,
live flag, and token balance; wstETH and rETH are quoted from the aggregate
adapter-held amounts. Each uncached verification has exactly four JSON-RPC
batch rounds and **50 logical requests**: chain/finalized-block evidence (2),
Chainlog resolution (10), six join evidence groups (36), and two aggregate
quotes. Every contract call uses the same finalized block tag.

Set `ETHEREUM_RPC_URL` only in the server environment. It may contain provider
credentials and is never returned, logged, persisted, or used as a cache key.
Without it, the tool returns `rpc_not_configured` without a network request.
The read-only live verifier is explicitly opt-in:

```bash
npm run test:live:sky-eth-custody
```

It remains skipped unless both `RUN_LIVE_SKY_ETH_CUSTODY=1` and a nonblank
`ETHEREUM_RPC_URL` are set.

### Fixed legacy EigenLayer ETH-family restaking exposure

`get_eigenlayer_eth_restaking_exposure` has no arguments. It is a read-only
verifier for the twelve official legacy EigenLayer Ethereum LST strategies:
stETH, rETH, cbETH, ETHx, ankrETH, oETH, osETH, swETH, wBETH, sfrxETH, lsETH,
and mETH. The source boundary is EigenLayer's official
`Layr-Labs/eigenlayer-contracts` release `v1.12.0`, commit
`d302f65042164c8d8d0a983c1540d85a8710030b`.

At one finalized block, each strategy preserves its current deposit-whitelist
boolean (including valid `false`), fixed StrategyManager binding, unique
runtime underlying token, canonical uint8 decimals value from 0 through 255,
total shares, token custody, and `sharesToUnderlyingView(totalShares)` result.
The last field is a token-native strategy accounting conversion, not
executable withdrawal capacity. It remains independent of custody, and a
quote above custody is retained as a diagnostic rather than rejected. The
twelve heterogeneous token units are never summed or silently converted to
ETH.

Native restaking is limited to diagnostics: exact core-manager coherence, the
virtual Beacon Chain ETH strategy identity, `numPods`, and burnable ETH shares.
It is not a native-restaked ETH total. Each uncached verification uses exactly
four JSON-RPC batches and **91 logical requests**: chain/finalized block (2),
core and native diagnostics (5), twelve four-call identity/accounting groups
(48), and twelve three-call token/share evidence groups (36). All **89**
contract calls use the same numeric finalized block tag. The virtual Beacon
strategy is verified from EigenPodManager and is never called directly.

The snapshot does not measure a native-restaked ETH total, an ETH-equivalent
LST total, unique or net ETH locked, combined Aave/Spark/Lido/Sky/EigenLayer
demand, or a rehypothecation ratio. All six metrics remain `null` with explicit
gaps.

Set `ETHEREUM_RPC_URL` only in the server environment. It may contain provider
credentials and is never returned, logged, persisted, or used as a cache key.
Without it, the tool returns `rpc_not_configured` without a network request.
The read-only live verifier is explicitly opt-in:

```bash
npm run test:live:eigenlayer-restaking
```

It remains skipped unless both `RUN_LIVE_EIGENLAYER_ETH_RESTAKING=1` and a
nonblank `ETHEREUM_RPC_URL` are set.

### EigenLayer covered LST ETH accounting quotes

`get_eigenlayer_lst_eth_quotes` has no arguments. It quotes exactly 9 of the
12 fixed legacy EigenLayer strategies at one finalized Ethereum block. The
covered order is fixed: stETH, rETH, cbETH, ETHx, oETH, osETH, swETH, lsETH, mETH.

| Label | Official token/proxy | Exact quote basis |
|---|---|---|
| stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | token wei is pooled-ETH accounting wei; identity conversion |
| rETH | `0xae78736Cd615f374D3085123A210448E74Fc6393` | two separate `getEthValue(uint256)` aggregate calls, selector `0x8b32fa23` |
| cbETH | `0xBe9895146f7AF43049ca1c1AE358B0541Ea49704` | one `exchangeRate()` call, selector `0x3ba0b9a9`, scaled by `10**18` |
| ETHx | `0xA35b1B31Ce002FBF2058D22F30f95D405200A15b` | two Stader StakePoolsManager `convertToAssets(uint256)` calls, selector `0x07a2d13a`, reconciled against `getExchangeRate()` |
| oETH | `0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3` | nominal OETH token-unit identity; vault pointers and rebase/withdrawal context only, not redeemability |
| osETH | `0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38` | two direct controller `convertToAssets(uint256)` calls, selector `0x07a2d13a` |
| swETH | `0xf951E335afb289353dc249e82926178EaC7DEd78` | one `swETHToETHRate()` stored WAD rate, selector `0xd68b2cb6`, with full-precision floors |
| lsETH | `0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549` | two direct River `underlyingBalanceFromShares(uint256)` calls, selector `0xf79c3f02` |
| mETH | `0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa` | two direct Staking `mETHToETH(uint256)` calls, selector `0x5890c11c` |

The base strategy identities remain pinned to EigenLayer
`Layr-Labs/eigenlayer-contracts` release `v1.12.0`, commit
`d302f65042164c8d8d0a983c1540d85a8710030b`. Quote semantics are pinned to
Lido core `v4.0.0` commit
`17005714f151e5502c559932319a3f2f74ac2436`
(`contracts/0.4.24/StETH.sol`), Rocket Pool commit
`fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88`
(`contracts/contract/token/RocketTokenRETH.sol`), and Coinbase
`wrapped-tokens-os` commit
`5697a90f4c47e8d801cedce81444a8464019fe08`
(`contracts/wrapped-tokens/staking/StakedTokenV1.sol`), together with
Coinbase's official cbETH page and whitepaper. StakeWise v3-core release
`v5.0.1`, commit `fc70cbe1b3d41bc5f78434830d837aa270ca33bc`, pins osETH and
the direct non-proxy osTokenVaultController
`0x2A261e60FB14586B474C208b1B7AC6D0f5000306`. Mantle mantle-lsp/contracts
release `v1.4.1`, commit `bbc4e8bf7d3e3b4ca0c5be07aba409ac66611c76`, pins
mETH, the Staking proxy `0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f`, and
Oracle `0x8735049F496727f824Cc0f2B174d826f5c408192`.
Liquid Collective's official
[`liquid-collective-protocol` v1.3.0 source](https://github.com/liquid-collective/liquid-collective-protocol/tree/964f0e363fbaec8955af430888838a1666a1c6ba)
pins the mainnet River/LsETH proxy and its `SharesManagerV1` implementation.
ETHx conversion/oracle semantics are pinned to Stader `ethx` v1.1.0 commit
`1939e6c36087bf7cb437e4323f426219df6313b4`; the separately pinned official
current README commit `9d4a9211431d6c0cdf014bd64d3718cba4ce96ab` supplies
the deployed addresses because the v1.1.0 README does not enumerate them.
Swell rate semantics are pinned to
[`v3-core-public` commit `5827c4f1294b00f2939e582b1d3ac448f87fa218`](https://github.com/SwellNetwork/v3-core-public/tree/5827c4f1294b00f2939e582b1d3ac448f87fa218):
`swETHToETHRate()` returns the stored WAD reprice rate or `1e18` when its
stored rate is zero, and `lastRepriceUNIX()` is report context only. The
official [`Pendle-Market-Deployment` commit `2036c371dceff085b2eb30a8e06b13819d4a835b`](https://github.com/SwellNetwork/Pendle-Market-Deployment/tree/2036c371dceff085b2eb30a8e06b13819d4a835b)
corroborates the swETH token address only; neither it nor Etherscan establishes
an EigenLayer strategy-token pair. The pair remains constrained by EigenLayer's
fixed legacy strategy universe and the finalized base verifier binding.
EigenLayer's official
[`v1.12.0` README at commit `d302f65042164c8d8d0a983c1540d85a8710030b`](https://github.com/Layr-Labs/eigenlayer-contracts/blob/d302f65042164c8d8d0a983c1540d85a8710030b/README.md)
names strategy `0xa4C637e0F704745D182e4D38cAb7E7485321d059` as OETH. Origin's official
[`origin-dollar` commit `07a7fcb052d715409014dd69e69e3c680ee8ae47`](https://github.com/OriginProtocol/origin-dollar/tree/07a7fcb052d715409014dd69e69e3c680ee8ae47)
deployment artifacts pin OETH proxy `0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3`,
Vault proxy `0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab`, and WETH
`0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2`. This historical source does not
prove the live proxy implementation corresponds to that source.

stETH must not be passed to `getPooledEthByShares`: the observed values are
stETH token units, not Lido share units. rETH share-accounting and custody
amounts are each sent directly to `getEthValue`; deriving both from a rounded
one-token rate would add a second floor. cbETH quotes are recomputed as
`floor(token amount * exchangeRate / 10**18)`. Its upgradeable, Coinbase-
controlled oracle exposes no timestamp, so
`cbeth_exchange_rate_freshness_not_verified` is permanent and the result is
an accounting quote, not independently reconciled backing. osETH sends each
aggregate directly to the pinned controller's `convertToAssets`; it does not
derive a rounded rate. PriceFeed `0x8023518b2192FB5384DAdc596765B3dD1cdFe471`
and its documentary `osTokenVaultController()` selector `0xabed451d` are not
runtime calls. mETH verifies Staking's `mETH()` (`0x29e84867`) and `oracle()`
(`0x7dc0d1d0`) pointers at the finalized block, then calls Staking—not the
Oracle—via `mETHToETH` for each input.

swETH sends no per-amount call: both aggregates use
`floor(tokenAmount * swETHToETHRate / 10**18)` with full-precision arithmetic.
The default `(rate=1e18,lastRepriceUNIX=0)` is valid but proves no activity;
there is no freshness cutoff. The reprice timestamp, proxy/source
correspondence, and backing reconciliation remain explicitly unverified.

OETH preserves each observed OETH token amount as the same nominal quote unit.
The adapter verifies `vaultAddress()`, `oToken()`, and `asset()` bindings, then
retains `lastRebase()`, `rebasePaused()`, and `withdrawalClaimDelay()` as context.
Zero rebase and delay, or paused rebase, are valid. Delay zero means async
withdrawals are disabled; none of these values proves backing, ETH spot value,
immediate redemption, liquidity, or executable exit capacity. There is no
freshness cutoff and no `totalValue`, queue metadata, `capitalPaused`, or
redemption call.

lsETH sends its two distinct aggregate share amounts directly to the River
proxy's `underlyingBalanceFromShares`. The official implementation returns zero
when total shares are zero, otherwise `floor(shares * assetBalance /
totalShares)`; the two direct return values are retained without a rounded
rate. `getLastCompletedEpochId()` (`0x89896aef`) is returned only as report
context. It does not prove report freshness. The bounded call also does not
prove current proxy implementation/source correspondence, issuer backing,
liquidity, or executable redemption.

ETHx verifies the token and StakePoolsManager `staderConfig()` pointers, then
StaderConfig's token, manager, and oracle pointers. Its two direct manager
`convertToAssets` values are recomputed against the Oracle's exact 96-byte
`(reportingBlockNumber,totalETHBalance,totalETHXSupply)` result with
full-precision floor arithmetic (or identity when supply is zero). The report
block is context only and must not be after the finalized block; no bounded
call proves report freshness, proxy/source correspondence, or backing.

A cold verification uses exactly 5 JSON-RPC batches, 119 logical requests,
117 `eth_call` requests, and contiguous IDs 1--119; every contract call uses
the same numeric finalized block tag. IDs 92--103 preserve prior evidence;
IDs 104--111 verify ETHx pointers, two conversions, and its Oracle tuple; IDs
112--113 read swETH's rate and `lastRepriceUNIX()` context; IDs 114--119 verify
OETH/Vault/WETH pointers and read OETH context. The sole v7 quote cache is the 30-minute
combined cache; it never nests or consumes the base public cache, never accepts
a stale base result, and may stale-fallback only from prior complete nine-token
verified evidence after refresh failure.

The v7 methodology mechanically fixes the accounting ceiling at 9/12. Coverage
contains the exact ordered blockers `ankrETH`, `wBETH`, and `sfrxETH`: Ankr has
mutable official docs but no immutable official source/deployment artifact,
same-finalized proxy-to-source binding, or ratio freshness getter; wBETH's known
official EigenLayer strategy and BNB Chain token address do not establish an
issuer immutable source/release, same-finalized proxy binding, or timestamp/epoch
freshness; and Frax `convertToAssets` returns frxETH wei, so sfrxETH terminates
in frxETH rather than ETH. These are fail-closed NO-GOs; offchain rate, backing,
redemption, and market price remain distinct for wBETH.

The only non-null aggregates are explicitly partial:
`covered_share_accounting_eth_equivalent_wei` and
`covered_token_custody_eth_equivalent_wei`. They are distinct partials for 9
of 12 only. The exact unquoted list is ankrETH, wBETH, sfrxETH.
These seven broader metrics remain `null`:
`lst_restaked_eth_equivalent_wei`, `native_restaked_eth_wei`,
`eigenlayer_eth_family_exposure_eth_wei`, `unique_net_eth_locked`,
`combined_aave_spark_lido_sky_eigenlayer_demand`, `rehypothecation_ratio`, and
`executable_withdrawal_capacity_eth_wei`. The snapshot therefore does not
establish a full LST/native/EigenLayer total, unique or net locked ETH,
combined protocol demand, rehypothecation, independent backing reconciliation,
cbETH exchange-rate freshness, OETH rebase freshness, osETH virtual-reward-input freshness, swETH
reprice freshness, or mETH
oracle-record freshness; lsETH report freshness, proxy implementation/source
correspondence, backing, or executable withdrawal/liquidity.
ETHx oracle-report freshness, proxy implementation/source correspondence, and
backing reconciliation are likewise not established.
Permanent gaps are `lst_quote_coverage_partial`,
`native_restaked_eth_not_measured`, `lst_restaked_eth_equivalent_not_measured`,
`eigenlayer_eth_family_exposure_not_measured`,
`unique_net_eth_locked_not_reconciled`,
`combined_aave_spark_lido_sky_eigenlayer_demand_not_reconciled`,
`rehypothecation_ratio_not_measured`, `executable_withdrawal_capacity_not_measured`,
`cbeth_exchange_rate_freshness_not_verified`,
`oseth_virtual_rewards_freshness_not_verified`, `oseth_backing_not_reconciled`,
`meth_oracle_record_freshness_not_verified`, `meth_backing_not_reconciled`,
`lseth_oracle_report_freshness_not_verified`,
`lseth_proxy_upgradeability_not_verified`, and `lseth_backing_not_reconciled`.
Additional v7 gaps are `ethx_oracle_report_freshness_not_verified`,
`ethx_proxy_upgradeability_not_verified`, `ethx_backing_not_reconciled`,
`oeth_rebase_freshness_not_verified`, `oeth_proxy_upgradeability_not_verified`,
`oeth_backing_not_reconciled`, `oeth_async_withdrawal_liquidity_not_verified`,
`sweth_reprice_freshness_not_verified`, `sweth_proxy_upgradeability_not_verified`,
and `sweth_backing_not_reconciled`. The three v7 ceiling gaps are
`ankreth_official_immutable_source_and_freshness_not_verified`,
`wbeth_official_immutable_source_proxy_and_freshness_not_verified`, and
`sfrxeth_quote_terminates_in_frxeth_not_eth`, for exactly 29 permanent gaps.

Set `ETHEREUM_RPC_URL` only in the server environment. Caller-supplied URLs are
rejected, credentials and provider errors never enter public fields, and an
unconfigured server returns `rpc_not_configured` without a network request.
The live verifier is explicitly opt-in:

```bash
npm run test:live:eigenlayer-lst-quotes
```

It remains skipped unless both `RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` and a
nonblank `ETHEREUM_RPC_URL` are set.

### Ethereum consensus reward-component cross-check

`get_eth_consensus_rewards_cross_check` is a separate, read-only verification
surface for observed Beacon reward components. It does not feed
`get_eth_value_capture`, does not establish complete consensus issuance, and
does not establish net issuance. The latter would additionally require a
precisely aligned execution burn boundary.

```json
{
  "name": "get_eth_consensus_rewards_cross_check",
  "arguments": {
    "epoch": 400000,
    "include_blocks": false
  }
}
```

`epoch` is a required non-negative safe integer. The tool verifies exactly one
epoch (32 slots) and performs at most **98 Beacon API calls**: a finality
checkpoint, one attestation reward request, 32 slot-header requests, and up to
two reward-evidence requests for each proposed block. It accepts only
finalized, non-optimistic Beacon evidence. `include_blocks=true` exposes the
verified proposed-block rows; it does not expand the one-epoch request bound.

All reward arithmetic is exact integer gwei with a matching exact ETH decimal
string. A verified response establishes these observed-component identities:

- observed consensus reward = attestation net reward + sync committee net reward + block proposer reward;
- aggregate block proposer reward = its reported block reward components.

These are observed reward components, not a claim of complete issuance or net
issuance. Slashing penalties and deposit/withdrawal reconciliation remain
explicitly incomplete, so both issuance metrics are always `null`.

Set `ETHEREUM_BEACON_API_URL` only in the server environment. It may contain
provider credentials; it is never returned, logged, persisted, or included in
cache keys. Without it, the tool returns a bounded `beacon_not_configured`
unavailable snapshot and makes no network call. Default tests never use the
endpoint.

The dedicated live check is opt-in and read-only:

```bash
npm run test:live:eth-beacon
```

It remains skipped unless both `RUN_LIVE_ETH_BEACON=1` and
`ETHEREUM_BEACON_API_URL` are set. When enabled, it resolves a safely finalized
epoch and verifies no more than one epoch.

## Roadmap

- **v0.1**: D view (macro pulse) plus read-only forensic and ETH value-capture snapshots, stdio transport.
- **v0.2**: B view (screening) — `find_unusual_flows`, `find_whale_accumulation`, `screen_by_signal`.
- **v0.3**: A view (timing) — `should_long_short`, `position_health`.
- **v0.4**: HTTP transport + remote hosting option.
- **v0.5**: Backtesting harness for the composite pulse score.

## License

MIT — see [LICENSE](LICENSE).

---

## 한국어 (Korean)

### 무엇인가

온체인 시장의 거시 분위기, 종목 발굴, 진입·청산 타이밍에 쓰이는 신호들을 **AI 에이전트가 자연어로 쿼리할 수 있는 MCP 서버**로 노출. 리테일·기관·에이전트 모두 self-host 사용.

### 핵심 가치

- **에이전트 친화 설계** — JSON 응답에 LLM이 그대로 사용 가능한 `summary` field 동시 포함
- **무료 default + BYOK 자동 enrichment** — 키 넣으면 paid endpoint, 없으면 free fallback
- **합성 pulse score 투명 공개** — `config/pulse.yaml` 가중치 외부화, 사용자가 thesis에 맞게 조정
- **한국 시장 1급 입력** — Upbit netflow, 김프 spread를 pulse score에 정식 포함
- **부분 실패 graceful degradation** — 일부 소스 down 시 weight 재정규화 + `confidence` field

### v0.1 범위

거시 pulse (D view) 만. 종목 스크리닝(B), 진입·청산 타이밍(A)은 같은 데이터 레이어 위에 v0.2 / v0.3 단계적 추가.
