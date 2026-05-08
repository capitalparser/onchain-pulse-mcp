---
title: onchain-pulse-mcp — Design Spec
date: 2026-05-08
status: draft
author: Kim Kyung-jun
---

# onchain-pulse-mcp — Design Spec

## 1. Problem & Motivation

온체인 시장 의사결정자(리테일/기관/AI 에이전트)는 **여러 도메인의 신호를 합쳐서 판단**해야 한다 — CEX flow, on-chain wallet, 파생상품, ETF/RWA macro, 한국 시장(김프). 기존 도구는 사람이 보는 대시보드 중심(Nansen, Arkham, Coinglass) 이라 **AI 에이전트가 자연어로 쿼리해서 의사결정에 직접 쓰기 어렵다**.

이 프로젝트는 위 신호들을 **MCP 도구로 노출하는 read-only / stateless 서버**다. 첫 릴리스는 거시 pulse (D view) 에 집중하고, 이후 종목 스크리닝 (B), 진입·청산 타이밍 (A) view 를 같은 데이터 레이어 위에 단계적으로 추가한다.

차별점: **에이전트 친화 설계** — JSON 응답에 LLM이 그대로 읽는 `summary` field 동시 포함, 도구를 의사결정 단위로 bundle (어댑터 ≠ tool), 오픈소스로 합성식·가중치 투명 공개.

## 2. Goals / Non-goals

### Goals (v0.1)

- **G1**. D view 거시 pulse 신호를 6개 MCP tool로 노출
- **G2**. 무료 데이터 소스 default + BYOK 환경변수로 깊이 enrichment
- **G3**. `npx onchain-pulse-mcp` 한 줄로 self-host (Claude Desktop / Claude Code 호환)
- **G4**. 한국 시장 신호 (Upbit netflow, 김프) 1급 입력으로 포함
- **G5**. composite pulse score 계산식·가중치를 `config/pulse.yaml` 로 외부화
- **G6**. 부분 데이터 누락 시 weight 재정규화 + `confidence` field 노출

### Non-goals (v0.1)

- **N1**. 알림 룰 엔진·Telegram bot 자체 (사용자 self-host 영역, 본 repo는 reference YAML 룰 예시만 commit)
- **N2**. B view (스크리닝) / A view (타이밍) — v0.2 / v0.3 로 미룸
- **N3**. 사용자 인증·SaaS 호스팅 (오픈소스 self-host 모델)
- **N4**. write 동작 (포지션 진입, 자동 매매 등 모두 범위 밖)
- **N5**. 영속 저장소 (DB·Redis 안 씀, in-memory cache only)

## 3. Users (Personas)

- **P1. 리테일 투자자**: Claude Desktop 사용자. `npx` 한 줄로 설치. 무료 default 데이터로 충분. 한국어 응답 비중 높음.
- **P2. 기관 분석가 / 펀드 PM**: BYOK 키 (Nansen, Glassnode 등) 보유. 매일 아침 pulse 진단 자동화. 자체 cron + Slack/Telegram 자체 구축.
- **P3. AI 에이전트**: 사람의 자연어 질문을 받아 MCP를 호출하는 LLM 에이전트. 응답의 `summary` field로 자연어 답변 합성. tool 호출 횟수 최소화 필요 (bundling 중요).

## 4. Architecture

```
        ┌─────────────────────────────────┐
        │  Agent / 사람 / cron+룰 엔진    │
        └──────────────┬──────────────────┘
                       │ MCP (stdio or HTTP)
        ┌──────────────▼──────────────────┐
        │      MCP Server (stateless)     │
        │   tools: get_market_pulse(),     │
        │          get_etf_flow(), ...    │
        └──────────────┬──────────────────┘
                       │ adapter dispatcher (parallel fan-out)
   ┌──────┬──────┬─────┴─────┬──────┬──────┬──────┐
   ▼      ▼      ▼           ▼      ▼      ▼
 cex_   onchain_  derivatives  macro_  wallet_  kr_
 flow   wallet                 rwa     id       layer

  ─── 별도 process / 사용자 self-host (본 repo 범위 밖) ───
        cron → MCP 폴링 → 룰 엔진 → 사용자가 자체 구축한 알림 채널
```

### 핵심 원칙

1. **Read-only · stateless**: write 없음, 응답 idempotent, 영속 store 없음 (in-memory TTL cache only)
2. **Adapter plug-in**: source 별 독립 모듈. BYOK 키 detect 시 `capabilities.byok_active` 에 키 이름 추가 + paid endpoint 사용, 없으면 free fallback (graceful degradation)
3. **알림은 MCP 밖**: cron/룰/봇은 사용자가 self-host. 본 repo는 reference YAML 룰만 `examples/rules/` 에 commit
4. **합성 지표 투명**: composite pulse score 식·가중치 모두 코드/config로 공개 — 신뢰 = 투명성
5. **도구 bundling**: MCP tool은 의사결정 단위 (예: `get_market_pulse()` 한 번 호출 → 6개 어댑터 fan-out). 에이전트의 호출 횟수 최소화

### 호스팅 모드

- **stdio (default)**: 사용자가 로컬 self-host (Claude Desktop / Claude Code 표준)
- **HTTP**: Fly.io 등 호스팅 → 원격 에이전트 접근 (v0.2 옵션)

### 런타임

**TypeScript + `@modelcontextprotocol/sdk`** 확정. Node 20+. 빌드: `tsup` (또는 `esbuild`). 배포: npm registry (`npx onchain-pulse-mcp`).

## 5. Components

### 5.1 데이터 어댑터 (6 modules)

| 어댑터 | Free default | BYOK 옵션 | 핵심 출력 |
|---|---|---|---|
| `cex_flow` | CoinGecko, Defillama exchange API | Glassnode, CryptoQuant, Coinglass Pro | netflow, exchange reserve |
| `onchain_wallet` | Etherscan free, public RPC, Defillama stable supply | Nansen Smart Money, Arkham Tag | smart money flow, stablecoin mint/burn |
| `derivatives` | Coinglass free (lag ~5min), Deribit public | Coinglass Pro, Laevitas | 펀딩률, OI, 옵션 IV, P/C ratio |
| `macro_rwa` | RWA.xyz public, Defillama TVL, Farside ETF scrape | Bloomberg, paid RWA feeds | BTC dom, ETF flow, RWA TVL, T-bill yield |
| `wallet_id` | (label 빈약 — N/A) | Arkham, Nansen | wallet 라벨 enrichment |
| `kr_premium` | Upbit public, Bithumb public | (선택) | 김프 spread, Upbit netflow, KRW 거래량 |

각 어댑터는 동일 인터페이스를 구현:

```typescript
interface Adapter<T> {
  name: string;
  ttlMs: number;
  capabilities(): { byok_active: string[]; sources: string[] };
  fetch(input: T): Promise<AdapterResult>;
}

interface AdapterResult {
  data: Record<string, unknown>;
  sources: string[];
  asOf: string;     // ISO 8601
  stale: boolean;   // cached fallback 사용 시 true
}
```

### 5.2 MCP가 노출하는 tools (v0.1)

```typescript
get_market_pulse()            // 합성: pulse score 0~100 + reading + raw inputs
get_etf_flow(window="7d")    // BTC/ETH spot ETF 순유입
get_stablecoin_pulse()       // USDT/USDC supply Δ, mint/burn rate
get_funding_oi(asset)        // 펀딩률 + OI + put/call (BTC/ETH)
get_kr_premium()             // 김프 spread, Upbit/Bithumb netflow
get_rwa_pulse()              // RWA TVL, 토큰화 미국채 yield curve
```

### 5.3 응답 스키마 (모든 tool 공통)

```json
{
  "summary": "ETF +$340M 7일 누적, reading: risk-on (78/100)",
  "score": 78,
  "reading": "risk-on",
  "as_of": "2026-05-08T07:00:00Z",
  "inputs": {
    "etf_7d_net_usd": 340000000,
    "stablecoin_7d_delta_pct": 1.4
  },
  "sources": ["farside.co.uk", "defillama"],
  "stale_data": [],
  "confidence": 1.0,
  "capabilities": { "byok_active": [] }
}
```

- `summary`: 한 줄 자연어 (LLM이 그대로 사용 가능). 영어 default + 한국어 토글 (env: `OPM_LANG=en|ko`, default `en`) — 글로벌 OSS 일관성.
- `reading`: `risk-off` (0–30) / `neutral` (30–70) / `risk-on` (70–100) / `unknown` (모든 source down).
- `confidence`: 입력 누락 시 1.0 미만 (살아남은 weight 합 / 전체 weight).
- `stale_data`: rate limit·source down으로 fallback한 항목 명시.
- `capabilities.byok_active`: BYOK 키로 paid endpoint 사용했는지.

### 5.4 Composite pulse score 합성식 (`config/pulse.yaml`)

```yaml
weights:
  etf_7d_net_flow_btc_eth: 0.25       # +
  stablecoin_7d_supply_delta: 0.20    # +
  upbit_netflow_7d_kr: 0.15           # +
  funding_avg_btc_eth: 0.15           # + (단 |z| > 2 일 때 reverse)
  btc_dominance_7d_delta: 0.10        # –
  options_put_call_ratio: 0.10        # –
  rwa_tvl_7d_delta: 0.05              # +

reading_buckets:
  risk_off: [0, 30]
  neutral:  [30, 70]
  risk_on:  [70, 100]
```

**계산**: 각 입력 → 30일 rolling z-score → sign-adjusted → weighted sum → sigmoid (1/(1+exp(-x))) → 0~100 scale.

**과열 reverse**: `funding_avg`가 |z| > 2 (예: 펀딩 0.05% 이상) 면 +방향이 아니라 –방향으로 뒤집음 (롱 청산 risk).

**weight 재정규화**: 입력 일부 누락 시 살아남은 weight 합으로 분모 재계산. `confidence` = (살아남은 weight) / 1.0.

### 5.5 캐시 layer

In-memory TTL cache (`lru-cache`). 소스별 다른 TTL:

| 어댑터 | TTL | 사유 |
|---|---|---|
| `derivatives` (펀딩률·OI) | 60s | 빠른 변화 |
| `cex_flow` | 5분 | medium freq |
| `onchain_wallet` | 10분 | block time, 발행/소각 lag |
| `kr_premium` | 5분 | Upbit rate limit 보호 |
| `macro_rwa` (ETF, RWA TVL) | 30분~1시간 | low freq |
| `wallet_id` | 24시간 | label 거의 안 바뀜 |

영속 store 없음. 프로세스 재시작 시 cache 비워짐 (의도).

### 5.6 BYOK 키 주입

환경변수 표준:

```
NANSEN_API_KEY
GLASSNODE_API_KEY
ARKHAM_API_KEY
COINGLASS_API_KEY
CRYPTOQUANT_API_KEY
LAEVITAS_API_KEY
```

어댑터가 시작 시 detect, `capabilities.byok_active` 메타에 반영. 없으면 free fallback. 사용자 BYOK 가이드는 `README.md` 별도 섹션.

## 6. Data flow

### 6.1 On-demand path (B 시나리오 — 에이전트 쿼리)

1. Agent → MCP tool call (예: `get_market_pulse()`)
2. Dispatcher → adapter들에 `Promise.all` parallel fan-out
3. 각 adapter: 캐시 hit? → 반환 / miss → BYOK 또는 free endpoint hit
4. Aggregator: weighted z-score → sigmoid → score → reading bucket
5. Response: `{ summary, score, reading, inputs, sources, stale_data, confidence }`

### 6.2 Cron path (C 시나리오 — 임계 알림)

본 repo 범위 밖. 사용자가 자체 구축. 단, **참고용 reference rule** 을 `examples/rules/` 에 5~10개 commit:

- `etf-outflow-streak.yaml` — "ETF 7일 outflow > $200M for 3 consecutive days"
- `funding-extreme.yaml` — "BTC funding |z| > 2"
- `kimchi-spread-spike.yaml` — "김프 > 5%"
- `stablecoin-burn-streak.yaml` — "stablecoin supply 5일 연속 감소"
- `rwa-tvl-drop.yaml` — "RWA TVL 7d > 3% 감소"

YAML schema는 단순 declarative — `metric`, `condition`, `threshold`, `window`, `consecutive` 필드. 외부 룰 엔진 (사용자 자체 구현) 이 파싱하여 cron으로 MCP 폴링.

**isolation 원칙**: 알림 채널·봇은 본 프로젝트가 정의하지 않음. 사용자가 다른 sibling 프로젝트(예: `02_audit_safe_signals`)와 봇·env·코드를 공유하지 않고 별도 인스턴스로 운영함.

## 7. Error handling

원칙: **부분 실패 OK, 침묵 실패 금지**. 항상 `stale_data` field로 무엇이 빠졌는지 명시.

| 상황 | 응답 |
|---|---|
| BYOK 키 없음 | free fallback. `capabilities.byok_active: []` |
| Rate limit hit | last cached 반환. `stale_data: ["coinglass: rate-limited, age=8min"]` |
| 단일 source down | 그 입력 제외, weight 재정규화. `stale_data` 표시, `confidence < 1.0` |
| 모든 source down | `summary: "data unavailable"`, `score: null`, `reading: "unknown"` (에러 throw 안 함) |
| 잘못된 input | MCP tool schema validation reject (`zod`) |
| network timeout | 어댑터별 5초 timeout → cache fallback → 그래도 없으면 단일 source down 처리 |

**에러 throw 정책**: tool 응답은 가능한 항상 200 + `reading: "unknown"` 으로 graceful degradation. 에이전트가 자연어로 처리 가능하게.

## 8. Testing

| 레이어 | 테스트 |
|---|---|
| Adapter unit | 각 어댑터 recorded HTTP fixture (`nock` 또는 `msw`). free + BYOK path 둘 다 |
| Composite score | 골든 fixture: 고정 시점 입력 → 고정 score. weight 변경 시 회귀 감지 |
| Confidence/재정규화 | 입력 일부 누락 시 weight 합·score·confidence 일관성 |
| MCP contract | tool schema validation, response shape (zod) |
| Integration smoke | weekly CI cron — 실제 free endpoint hit, schema 살아있는지 |

CI: GitHub Actions. PR마다 unit + composite golden 통과. weekly smoke. paid 키 secret 안 둠 (free path만 검증).

테스트 우선순위: composite score regression > adapter contract > smoke. composite은 사용자가 가장 신뢰하는 부분이라 골든 테스트 두텁게.

## 9. Open questions

- **Q1**. ETF flow 데이터 — Farside Investors scrape 가 ToS상 OK한지 / 안정한지. 대안: BitMEX research (지연 있음), 사용자 BYOK paid feed.
- **Q2**. Upbit/Bithumb netflow — 거래소가 wallet 주소 공개하지 않음. on-chain 추적 어려움. KRW 입출금 API는 사용자 본인 계정만. → "Upbit netflow" 정의를 **Upbit 거래량 / 글로벌 거래량 비율** 로 proxy 할지 결정 필요.
- **Q3**. pulse score `funding reverse` 임계 — `|z| > 2` 가 적정한지 backtest 필요. v0.1은 임의값으로 시작, v0.2에서 historical 검증.
- **Q4**. RWA TVL 7d delta 의 가중치 0.05 — 너무 작은가? 거시 pulse에서 RWA가 가지는 의미는 "전통금융 자본 유입" proxy. 사용자가 thesis에 따라 config로 조정.

## 10. Future work

- **v0.2**: B view (스크리닝). `find_unusual_flows()`, `find_whale_accumulation()`, `screen_by_signal()` 추가. 같은 6개 어댑터 위.
- **v0.3**: A view (타이밍). `should_long_short(asset, horizon)`, `position_health(asset)`. 펀딩·옵션·smart money 결합.
- **v0.4**: HTTP transport + Fly.io 호스팅 옵션 (원격 에이전트 접근).
- **v0.5**: composite score backtesting harness — 과거 데이터로 pulse score vs 실제 시장 움직임 검증.

## 11. Appendix — 첫 commit에 포함될 파일 (참고)

```
onchain-pulse-mcp/
├── README.md             # EN default + KR section
├── LICENSE               # MIT
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server entry (stdio)
│   ├── tools/            # 6 tool handlers
│   ├── adapters/         # 6 adapter modules
│   ├── pulse/             # composite score
│   └── cache.ts
├── config/
│   └── pulse.yaml         # default weights
├── examples/
│   └── rules/            # reference YAML 룰
├── tests/
│   ├── adapters/
│   ├── pulse/
│   └── fixtures/
├── docs/
│   └── superpowers/
│       └── specs/        # 본 spec 문서 위치
└── .github/workflows/
    └── ci.yml
```
