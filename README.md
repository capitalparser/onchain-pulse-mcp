# onchain-pulse-mcp

> Read-only MCP server exposing onchain market pulse signals — CEX flow, on-chain wallets, derivatives, ETF/RWA macro, and Korea-market premium — designed for AI agents, retail, and institutions.

**Status**: `v0.1` implementation branch active. Core adapters, MCP tools, stdio server, and warmup CLI are implemented.

See the design spec at [`docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`](docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md).

## Why

Existing onchain intelligence tools (Nansen, Arkham, Coinglass) are dashboards built for humans. AI agents need structured, queryable, decision-unit-bundled data — and most macro signals (ETF flow, stablecoin supply, RWA TVL, KR premium) live in fragmented sources. This server consolidates them behind a small, opinionated MCP surface.

## Design Highlights

- **Read-only · snapshot-oriented**: idempotent MCP responses, no write actions, local-only history materialisation for composite z-scores.
- **Source adapters**: free and BYOK-backed market, Ethereum, RWA, derivatives, and Korea data paths.
- **8 MCP tools**: the six original macro tools, token forensics, and ETH value capture.
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

Without a previously cached Dune result, this returns a partial
Coin Metrics-only snapshot. Missing fee values remain `null`:

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
  "sources": ["coinmetrics-community:SplyCur"],
  "confidence": 0.25
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

The live Coin Metrics check is free. The Dune check consumes Dune credits and
runs only when both `DUNE_API_KEY` is present and
`RUN_LIVE_DUNE_ETH_VALUE=1` explicitly authorizes it. ETH collateral demand,
price/ETH-BTC comparison, ETF or treasury-company flows, execution RPC
re-indexing, and Beacon reward indexing remain deferred.

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
