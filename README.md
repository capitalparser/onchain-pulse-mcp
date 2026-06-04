# onchain-pulse-mcp

> Read-only MCP server exposing onchain market pulse signals — CEX flow, on-chain wallets, derivatives, ETF/RWA macro, and Korea-market premium — designed for AI agents, retail, and institutions.

**Status**: `v0.1` implementation branch active. Core adapters, MCP tools, stdio server, and warmup CLI are implemented.

See the design spec at [`docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`](docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md).

## Why

Existing onchain intelligence tools (Nansen, Arkham, Coinglass) are dashboards built for humans. AI agents need structured, queryable, decision-unit-bundled data — and most macro signals (ETF flow, stablecoin supply, RWA TVL, KR premium) live in fragmented sources. This server consolidates them behind a small, opinionated MCP surface.

## Design Highlights

- **Read-only · snapshot-oriented**: idempotent MCP responses, no write actions, local-only history materialisation for composite z-scores.
- **6 data adapters**: CEX flow, on-chain wallet, derivatives, macro/RWA, wallet identity, Korea layer.
- **6 MCP tools (v0.1)**: `get_market_pulse`, `get_etf_flow`, `get_stablecoin_pulse`, `get_funding_oi`, `get_kr_premium`, `get_rwa_pulse`.
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

`get_token_forensics` is Phase 1. It discovers the best pool through DexScreener
and returns a `ForensicsSnapshot` with `thin-data` or `unknown` flow reading
until wallet-flow providers are wired. It does not prescribe trades.

## Roadmap

- **v0.1**: D view (macro pulse) — 6 tools above, stdio transport.
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
