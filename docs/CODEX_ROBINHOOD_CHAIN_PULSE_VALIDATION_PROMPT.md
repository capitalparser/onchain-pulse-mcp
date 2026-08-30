# Codex validation prompt — Robinhood Chain Pulse

Use the currently selected local Git repository/worktree. Do not create a second clone or a manually managed worktree.

## Expected repository

```text
capitalparser/onchain-pulse-mcp
```

## Expected branch

```text
feat/robinhood-chain-pulse
```

The branch is independent of pending PRs #50 and #51 and must be based on `main`.

## Product boundary

This module is a research diagnostic for:

```text
capital formation
credit activation
leader-to-beta breadth
fragility
ETH value-capture linkage
```

It is not:

- a token recommendation;
- a target-price model;
- an automatic trading surface;
- a claim that community tokens are affiliated with Robinhood;
- a commercial redistribution API.

Do not weaken these boundaries to make a test pass.

## Repository and branch checks

Run and report:

```bash
git remote -v
git branch --show-current
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
test -f package.json
```

If the repository or branch is wrong, do not modify another project.

## Required runtime

Use Node.js 24 and run:

```bash
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
```

Fix failures on the same branch and rerun the entire sequence.

## Focused checks

### Official registry

Confirm:

- chain id `4663`;
- native gas `ETH`;
- Arbitrum rollup and Ethereum settlement/blob DA;
- no invented official chain token;
- WETH and USDG canonical addresses;
- community tokens have `official_affiliation=false`.

### DefiLlama adapter

Confirm:

- TVL, stablecoin supply, DEX volume, and application fees are independently parsed;
- the current stablecoin row matches the real `stablecoinchains` shape and does not invent a `change_7d` field;
- stablecoin 7-day change uses `stablecoincharts/Robinhood%20Chain`, exact UTC cutoffs, and ignores future observations;
- a missing 7-day observation or zero baseline leaves change null, while an observed current zero remains zero;
- history failure preserves current stablecoin supply and marks the adapter partial;
- one failed endpoint produces `partial`, not zero-filled `valid` data;
- missing Robinhood Chain rows fail closed;
- stale-cache fallback is marked stale and reduces confidence.

### Morpho adapter

Confirm:

- GraphQL is scoped to `chainId_in: [4663]` and listed markets;
- supply, borrow, liquidity, collateral, and utilisation aggregate correctly;
- zero listed markets is distinct from provider failure;
- invalid rows do not silently become zero;
- provider utilisation outside `[0,1]` makes aggregate utilisation null and partial;
- borrow above supply beyond the explicit rounding tolerance, including zero supply with positive borrow, emits `utilisation_inconsistent` and cannot activate credit;
- a small positive-supply rounding difference within tolerance remains valid;
- `first: 100` / `skip: 0, 100, ...` collects all pages and validates a stable `pageInfo.countTotal`;
- duplicate market IDs and totals above the explicit 1,000-market limit fail closed;
- missing `collateralAssetsUsd` leaves aggregate collateral null with a partial result while preserving valid supply, borrow, and liquidity;
- stock-token collateral classification remains null until an official effective-dated registry is implemented.

### Community-token adapter

Confirm:

- only exact registry addresses are accepted;
- ticker-only and fake-address rows are ignored;
- the primary pair is the highest-liquidity exact-address base-token pair;
- registry/explorer symbol mismatch excludes a token from breadth;
- unavailable or schema-invalid explorer metadata excludes a token from breadth even when DexScreener reports the expected ticker;
- holder-count failure remains null and does not become zero;
- a token needs market cap, liquidity, 24h return, and volume evidence to enter breadth;
- community tokens are never represented as official Robinhood assets.

### MCP registration

Confirm `get_robinhood_chain_pulse` is registered with exactly this input schema and rejects every non-empty object:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

The public handler must not accept caller-controlled URLs, token addresses, thresholds, or source modes.

### Classification

Confirm:

- capital formation is distinct from credit activation;
- stablecoin growth alone cannot create `credit_activation`;
- `capital_base=unknown` or `stable` plus current credit `active` cannot create `credit_activation`;
- `capital_base=expanding` plus current credit `active` can create `credit_activation`, but the summary must not claim credit growth without history;
- two unavailable source families produce `data_warning` before any surviving active-credit signal;
- leader-only and leader-beta diffusion are distinct;
- high fragility overrides diffusion into `fragile_blowoff`;
- ETH capture remains `protocol_link_present_unquantified` until chain-specific L1 rent and collateral use are measured;
- thresholds are versioned and documented as illustrative.

### Source licensing and leakage

Confirm the registry contains:

```text
robinhood-chain-docs
morpho-api
dexscreener
robinhood-blockscout
```

Each must remain non-redistributable by default. Inspect output and logs for:

- API keys;
- RPC credentials;
- query tokens;
- raw provider payloads;
- internal exception text;
- false Robinhood affiliation claims.

## Controlled smoke test

Run:

```bash
npm run robinhood-chain-pulse
```

If public endpoints are reachable, inspect the strict snapshot. If external access is blocked, distinguish environment failure from application failure and use controlled tests.

The smoke result must preserve:

- null for missing values;
- bounded gap codes;
- source references and status;
- one research phase;
- explicit interpretation boundaries.

## Required report

Create and commit:

```text
docs/CODEX_ROBINHOOD_CHAIN_PULSE_VALIDATION_REPORT.md
```

Include:

- repository, branch, and base commit;
- Node/npm versions;
- exact commands;
- typecheck, complete test, and build results;
- focused adapter and classification results;
- live or controlled smoke result;
- credential/raw-payload/affiliation leakage review;
- files changed and reasons;
- unresolved risks;
- final commit SHA;
- final status.

Use exactly one final status:

```text
ready_for_owner_review
```

or

```text
not_ready
```

Do not merge the branch and do not add or run GitHub Actions.
