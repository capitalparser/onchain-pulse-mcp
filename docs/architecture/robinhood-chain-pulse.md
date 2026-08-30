# Robinhood Chain Pulse

## Purpose

Robinhood Chain can attract stablecoins, tokenized assets, lending activity, DEX volume, and community-token speculation at the same time. A rising community-token price alone does not prove that the chain has reached organic expansion or that onchain credit is multiplying.

The pulse therefore separates five questions:

```text
capital base
credit activation
leader-to-beta breadth
fragility
ETH value capture
```

It is a research diagnostic. It is not a token recommendation, price target, or order-execution surface.

## Official chain boundary

The registry is pinned from Robinhood Chain documentation:

```text
chain id            4663
native gas          ETH
rollup stack        Arbitrum
settlement layer    Ethereum
data availability   Ethereum blobs
explorer            Robinhood Chain Blockscout
official chain token none
```

Canonical WETH and USDG addresses are kept separate from the community research universe.

Community tokens are explicitly recorded as unaffiliated. They do not represent Robinhood equity, revenue rights, chain governance rights, or an official chain token.

## Initial community research universe

The first bounded universe uses exact contract addresses only:

```text
CASHCAT       0x020bfC650A365f8BB26819deAAbF3E21291018b4
STONKBROKER   0xe934e36a439c94017b64a3fece66af12099abf50
MANCER        0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A
```

Ticker search is prohibited because duplicate and impersonating contracts exist. A token is eligible for breadth only when:

- the exact address appears as the DexScreener base token on Robinhood Chain;
- Blockscout successfully returns explorer metadata for the exact address and its symbol matches the registry;
- primary-pool liquidity is at least USD 25,000;
- market cap is at least USD 100,000;
- 24-hour price change and volume are both available.

Holder count is informative rather than a numeric eligibility threshold. An explorer outage leaves holder count null, marks the token partial, and excludes it from breadth instead of converting missing verification into zero or trusting a DexScreener ticker.

## Data sources

### Robinhood official documentation

Used only for chain identity, gas asset, rollup/settlement boundary, explorer, and canonical contracts.

```text
source prefix: robinhood-chain-docs
commercial status: attribution_required
```

### DefiLlama

Used for current chain capital and activity:

- TVL;
- stablecoin supply;
- DEX volume;
- application fees.

Missing endpoints remain null. A failed source is not replaced with zero.

```text
source prefixes: defillama, defillama-stablecoins
commercial status: internal_research_ok
```

### Morpho public GraphQL API

Used for chain-id-4663 listed-market supply, borrow, liquidity, collateral, and utilisation.

The adapter collects all listed markets in bounded pages of 100 using `first` and `skip`. It validates `pageInfo.countTotal` across pages, rejects duplicate market IDs, and fails closed above the explicit 1,000-market limit. Missing collateral USD on any otherwise valid row leaves aggregate collateral null and marks the result partial while preserving valid supply, borrow, and liquidity totals.

Stock-token collateral classification is deliberately null until an effective-dated official stock-token registry is consumed. Symbol heuristics are not used to call a collateral token an equity token.

```text
source prefix: morpho-api
commercial status: commercial_review_required
```

### DexScreener

Used only for exact registered token addresses. The most liquid matching base-token pair is the primary pair. Fake ticker matches and unregistered addresses are ignored.

```text
source prefix: dexscreener
commercial status: commercial_review_required
```

### Robinhood Chain Blockscout

Used for exact-address token symbol and holder metadata.

```text
source prefix: robinhood-blockscout
commercial status: commercial_review_required
```

No raw provider response is returned by the pulse.

## Axes

### Capital base

Available trend signals:

- TVL 1-day change;
- stablecoin supply 7-day change;
- DEX volume 7-day change.

Initial illustrative thresholds:

```text
expanding   at least two positive signals
contracting at least two negative signals
mixed       positive and negative signals coexist
stable      enough signals but no directional threshold
unknown     fewer than two signals
```

These thresholds are research parameters and must be backtested before being treated as predictive.

### Credit activation

```text
active
  Morpho supply >= USD 50m
  aggregate utilisation >= 60%

forming
  Morpho supply >= USD 10m
  aggregate utilisation >= 25%

inactive
  valid data below the forming thresholds

unknown
  supply or utilisation unavailable
```

Stablecoin supply alone is capital base, not credit activation.

### Leader-beta breadth

The market-cap leader is identified within the eligible registered universe. Diffusion requires:

```text
eligible tokens >= 3
leader 24h return >= 5%
beta median 24h return >= 3%
positive-token share >= 2/3
```

A strong leader with a non-positive beta median is `leader_only`.

### Fragility

Initial warning thresholds use:

- median market-cap/liquidity;
- median 24-hour volume/liquidity;
- leader share of eligible-universe market cap.

A diffusion phase with high fragility becomes `fragile_blowoff` rather than a bullish upgrade.

### ETH value capture

Robinhood Chain uses ETH gas and settles to Ethereum with Ethereum blob data availability. This establishes a protocol link, but not a quantified ETH value-capture rate.

The pulse returns:

```text
protocol_link_present_unquantified
```

until chain-specific L1 settlement rent and ETH collateral use are measured. Chain growth is not automatically interpreted as proportional ETH value accrual.

## Overall classifications

```text
capital_formation
credit_activation
leader_concentration
leader_beta_diffusion
fragile_blowoff
mixed
data_warning
unavailable
```

Precedence:

1. no core evidence -> `unavailable`;
2. diffusion plus high fragility -> `fragile_blowoff`;
3. diffusion -> `leader_beta_diffusion`;
4. leader-only -> `leader_concentration`;
5. active credit without capital contraction -> `credit_activation`;
6. expanding capital -> `capital_formation`;
7. two or more unavailable source families -> `data_warning`;
8. otherwise -> `mixed`.

## Interfaces

The MCP server registers `get_robinhood_chain_pulse` with a strict empty-object input schema. Callers cannot provide URLs, token addresses, thresholds, or source modes that alter the fixed research universe.

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

### CLI

```bash
npm run robinhood-chain-pulse
```

The CLI fetches the three source families in parallel and emits one strict `robinhood-chain-pulse-v1` snapshot.

All three adapters retain the last successful cache entry. When a full refresh fails after TTL expiry, the snapshot exposes the cached result as partial and stale; without a cached value, it returns a bounded unavailable result.

## Limitations

- The initial community universe is curated and small; it is not an exhaustive Robinhood Chain token list.
- Twenty-four-hour breadth is descriptive, not yet a leading indicator.
- Net bridge flows, perps open interest, liquidations, gas-subsidy share, and chain-specific L1 rent are not yet included.
- Morpho stock-token collateral classification remains unknown until an official effective-dated registry is integrated.
- Public API rights do not imply commercial redistribution rights.
- Blockscout or another required explorer-verification outage can reduce the breadth universe to thin data even while DexScreener market data remains available.
- Current snapshots are not point-in-time history until canonical collection and history contracts are added.

## Falsification gates

Revise or reject the module if:

- exact-address market data is too sparse for a three-token breadth universe;
- leader-beta classifications are driven by one shallow pool;
- credit activation does not improve persistence beyond stablecoin inflow alone;
- breadth has no forward relation to chain activity, ETH/L2 risk appetite, or drawdown risk;
- source licensing prevents the intended internal research use;
- the module cannot distinguish incentive-driven activity from organic retention.
