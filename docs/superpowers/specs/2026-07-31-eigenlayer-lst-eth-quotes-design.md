# EigenLayer Covered LST ETH Quotes Design

**Date:** 2026-07-31
**Base:** `21049dd62d3a18a8bbc1bd75d4bffc30a668a02b`
**Branch:** `feat/eigenlayer-lst-eth-quotes`

## Goal

Add a separate, bounded, read-only Ethereum Execution RPC snapshot that quotes
the existing EigenLayer fixed-strategy evidence for three directly verifiable
ETH-family LSTs:

- Lido stETH;
- Rocket Pool rETH; and
- Coinbase cbETH.

For each covered strategy, preserve and quote both:

- EigenLayer `sharesToUnderlyingView(totalShares)`, named the strategy
  share-accounting token amount; and
- the underlying token balance physically held by the EigenLayer strategy,
  named token custody.

The two observations remain independent. Their ETH quotes are separate partial
gross exposure views, not a full EigenLayer LST total, unique or net ETH locked,
cross-protocol demand, rehypothecation, backing reconciliation, or executable
withdrawal capacity.

## Existing EigenLayer Authority

The base evidence remains the merged
`get_eigenlayer_eth_restaking_exposure` contract:

- EigenLayer official release `v1.12.0`;
- source commit `d302f65042164c8d8d0a983c1540d85a8710030b`;
- twelve ordered fixed legacy strategies;
- one finalized Ethereum block;
- exact StrategyManager and underlying-token identities read at that block; and
- separate `share_accounting_underlying` and `token_custody` values.

The quote adapter must share the existing adapter's exact verification
implementation rather than duplicate it or consume its public cached snapshot.
Task 2 exposes a narrow internal fresh-only loader from the existing adapter.
That loader performs the same 91 logical requests, never consults or writes the
existing public adapter cache, and never returns its stale fallback. The quote
adapter accepts only its fresh verified result and then requires these exact
runtime token identities and decimals:

| Label | Expected token | Decimals |
| --- | --- | ---: |
| stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | 18 |
| rETH | `0xae78736Cd615f374D3085123A210448E74Fc6393` | 18 |
| cbETH | `0xBe9895146f7AF43049ca1c1AE358B0541Ea49704` | 18 |

Missing, duplicate, reordered, mismatched, or non-18-decimal covered evidence
invalidates the whole quote snapshot. The other nine strategy observations are
not discarded: their labels are reported explicitly as unquoted coverage, but
their token-native values are not copied into a synthetic ETH total.

## Official Quote Sources

### stETH

Pinned official source:

- Lido core `v4.0.0`, commit
  `17005714f151e5502c559932319a3f2f74ac2436`;
- `contracts/0.4.24/StETH.sol`.

The stETH contract documents that account token balances are shares of total
pooled ether, `totalSupply()` equals total pooled ether, and the token uses 18
decimals. Therefore a stETH token-wei amount is already a pooled-ETH accounting
amount:

```text
stETH quoted ETH wei = stETH token amount
```

The quote adapter must not pass a stETH token amount to
`getPooledEthByShares`. That function accepts Lido shares, not stETH token
units, and doing so would double-convert the amount.

### rETH

Pinned official source:

- Rocket Pool commit
  `fef41a4f7cf99d7d66313c0ba04deb8ba2dabf88`;
- `contracts/contract/token/RocketTokenRETH.sol`.

Call the official rETH proxy at the same numeric finalized block:

```text
getEthValue(uint256) selector = 0x8b32fa23
```

The contract computes:

```text
floor(rETH amount * reported total ETH balance / reported total rETH supply)
```

Call `getEthValue` separately for the aggregate share-accounting amount and
aggregate custody amount. Multiplying both amounts by the already-rounded
one-token `getExchangeRate()` result would introduce a second floor and is not
accepted.

The result is Rocket Pool network accounting backing. The burn path performs
separate liquidity checks, so this quote is not executable redemption or
withdrawal capacity.

### cbETH

Pinned official source:

- Coinbase `wrapped-tokens-os` commit
  `5697a90f4c47e8d801cedce81444a8464019fe08`;
- `contracts/wrapped-tokens/staking/StakedTokenV1.sol`;
- Coinbase's official cbETH page, accessed 2026-07-31, which identifies the
  mainnet proxy
  `0xBe9895146f7AF43049ca1c1AE358B0541Ea49704`, says an unwrap amount is cbETH
  multiplied by the conversion rate, and defines the published rate as ETH2
  units per cbETH; and
- Coinbase's official cbETH whitepaper, accessed 2026-07-31, which defines the
  rate as the conversion between cbETH and staked ETH and documents that the
  smart contract exposes the oracle-updated rate.

Official denomination and deployment references:

- `https://www.coinbase.com/cbeth`
- `https://www.coinbase.com/cbeth/whitepaper`
- `https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/wrapped-assets/get-wrapped-asset-details`

Call the official upgradeable cbETH proxy at the same numeric finalized block:

```text
exchangeRate() selector = 0x3ba0b9a9
```

The contract returns an oracle-set rate scaled by `10**18`. For each input:

```text
cbETH quoted ETH wei = floor(cbETH token amount * exchangeRate / 10**18)
```

The adapter recomputes each quote with exact `bigint` arithmetic and rejects a
zero rate or any result outside uint256. Coinbase controls the oracle and the
token is upgradeable. The contract exposes no rate timestamp, so the result is
a `coinbase_oracle_accounting_quote`, not independently reconciled backing. A
permanent `cbeth_exchange_rate_freshness_not_verified` gap records that the
contract exposes no timestamp with which this bounded call could verify rate
freshness.

## Finalized Read Plan

One cold end-to-end verification uses:

1. the existing EigenLayer adapter's shared fresh-only verifier: four batches,
   91 logical requests, and 89 `eth_call` requests, without touching its public
   cache; then
2. one quote batch at the exact block number returned by the verified base
   snapshot:
   - rETH `getEthValue(share-accounting amount)`;
   - rETH `getEthValue(custody amount)`; and
   - cbETH `exchangeRate()`.

Cold-path total:

- five HTTP JSON-RPC batches;
- 94 logical requests; and
- 92 `eth_call` requests.

All 92 contract calls use the same numeric finalized block tag. stETH identity
conversion adds no call. The quote batch uses strict canonical JSON-RPC
envelopes, unique ids within the batch, exact one-word uint256 results, and no
provider-supplied error text.

The quote adapter owns the only cache in this path. When fully verified
combined quote evidence is cached, neither the fresh-only base loader nor the
quote batch runs again until that cache expires. Its 30-minute TTL begins with
this combined acquisition, so a second cache cannot extend older base evidence.
The counts above describe an uncached end-to-end verification, not every
invocation.

## Public Snapshot

Register a separate strict-empty MCP tool:

```text
get_eigenlayer_lst_eth_quotes({})
```

Verified output contains:

- the exact finalized block and the three ordered covered strategies;
- exact strategy and token identities;
- each share-accounting token amount and token custody amount;
- quote method and trust basis;
- exact share-accounting and custody ETH quotes;
- cbETH exchange rate when applicable;
- exact sums:
  - `covered_share_accounting_eth_equivalent_wei`; and
  - `covered_token_custody_eth_equivalent_wei`;
- coverage count `3` of `12`; and
- the exact nine unquoted strategy labels.

The two non-null sums are explicitly named covered partial aggregates. The
following remain `null`:

- `lst_restaked_eth_equivalent_wei`;
- `native_restaked_eth_wei`;
- `eigenlayer_eth_family_exposure_eth_wei`;
- `unique_net_eth_locked`;
- `combined_aave_spark_lido_sky_eigenlayer_demand`;
- `rehypothecation_ratio`; and
- `executable_withdrawal_capacity_eth_wei`.

Verified snapshots contain permanent gaps for incomplete 3-of-12 quote
coverage, absent native totals, absent full LST totals, absent cross-protocol
reconciliation, absent rehypothecation measurement, absent executable capacity,
and cbETH rate timestamp unavailability. A stale verified snapshot adds exactly
one controlled `source_stale` gap.

Unavailable snapshots contain no block, covered quotes, partial sums, token
identity claims, rate, or partial evidence. A failure in any one of the three
covered identities or quote paths makes the whole snapshot unavailable; it
must not leak the other two values as an apparently comparable partial.

## Exact Arithmetic and Domain Validation

All raw amounts, rates, quotes, products, and sums use `bigint` internally.
Public uint256 values are canonical decimal strings. The domain layer:

- requires the exact ordered three-token covered universe;
- pins strategy and token identities;
- requires 18 decimals;
- recomputes stETH identity quotes;
- accepts rETH direct aggregate results only from the adapter call path;
- recomputes both cbETH floor quotes from the one exact rate;
- recomputes both covered partial sums;
- rejects uint256 overflow, zero cbETH rate, duplicate evidence, fabricated
  totals, or inconsistent coverage; and
- prevents unavailable snapshots from containing partial evidence.

## Cache, Failure, and Credential Boundary

- Cache only fully verified normalized combined evidence for 30 minutes.
- Coalesce concurrent cold loads.
- Bind one adapter context to one internal RPC URL without using the URL in a
  cache key.
- Use only the existing adapter's shared uncached fresh-only verifier; never
  accept or cache a stale base snapshot and never nest the existing public
  30-minute cache inside the combined cache.
- A refresh failure may return only previously verified immutable stale
  evidence.
- Map the existing base adapter's bounded source failure to an unavailable
  quote snapshot.
- Never cache unavailable, partial, malformed, mismatched, or overflowed
  evidence.
- Never return, log, persist, or cache-key `ETHEREUM_RPC_URL`, raw provider
  errors, response bodies, or credential-bearing text.
- Default tests make no network call.
- The live body requires both
  `RUN_LIVE_EIGENLAYER_LST_ETH_QUOTES=1` and a nonblank
  `ETHEREUM_RPC_URL`.

## Non-Goals

- quoting ETHx, ankrETH, oETH, osETH, swETH, wBETH, sfrxETH, lsETH, or mETH;
- presenting three covered strategies as full 12-strategy value coverage;
- deriving a native EigenPod restaked-ETH total;
- reconciling token issuer backing, validator identities, withdrawal queues,
  slashing, liquidity, or redemption capacity;
- deduplicating Lido, Rocket Pool, Coinbase, EigenLayer, Aave, Spark, Sky,
  bridges, or downstream DeFi exposure;
- computing unique/net ETH locked, a combined protocol total, or a
  rehypothecation ratio;
- market pricing, historical indexing, recommendations, or write actions; or
- changing existing fee, Beacon, Dune, GrowThePie, collateral, Lido, Sky, or
  EigenLayer exposure behavior.
