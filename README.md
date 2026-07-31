# onchain-pulse-mcp

> Read-only MCP server exposing onchain market pulse signals — CEX flow, on-chain wallets, derivatives, ETF/RWA macro, and Korea-market premium — designed for AI agents, retail, and institutions.

**Status**: `v0.1` implementation branch active. Core adapters, MCP tools, stdio server, and warmup CLI are implemented.

See the design spec at [`docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`](docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md).

## Why

Existing onchain intelligence tools (Nansen, Arkham, Coinglass) are dashboards built for humans. AI agents need structured, queryable, decision-unit-bundled data — and most macro signals (ETF flow, stablecoin supply, RWA TVL, KR premium) live in fragmented sources. This server consolidates them behind a small, opinionated MCP surface.

## Design Highlights

- **Read-only · snapshot-oriented**: idempotent MCP responses, no write actions, local-only history materialisation for composite z-scores.
- **Source adapters**: free and BYOK-backed market, Ethereum, RWA, derivatives, and Korea data paths.
- **10 MCP tools**: the six original macro tools, token forensics, ETH value capture, and bounded Ethereum execution-fee and consensus-reward cross-checks.
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
| `ETHEREUM_RPC_URL` | Ethereum Execution API | Optional finalized-block fee cross-check transport; internal only and never returned |
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
`RUN_LIVE_DUNE_ETH_VALUE=1` explicitly authorizes it. ETH collateral demand,
price/ETH-BTC comparison, ETF or treasury-company flows, and Beacon reward
indexing remain deferred.

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
