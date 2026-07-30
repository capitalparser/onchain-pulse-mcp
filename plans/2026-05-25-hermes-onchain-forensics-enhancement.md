# onchain-pulse-mcp 기능 보완계획서 — Hermes식 온체인 포렌식 확장

> 작성일: 2026-05-25  
> 대상 프로젝트: `onchain-pulse-mcp`  
> 연결 입력: "Hermes as an Onchain Analyst" 원문 메모  
> 상태: draft / planning-only  
> 외부 검증 범위: x402 및 AgentCash의 일반 결제/도구 구조만 확인. Nansen TGM, Tokenomist, Cookie MCP, BlockRun의 현재 x402 제공 여부와 가격은 implementation 전 별도 확인 필요.

## 1. 결론

**conditional / high-priority v0.2 후보.**

Hermes 글은 `onchain-pulse-mcp`의 기존 로드맵 중 **v0.2 B view(screening)** 를 구체화하는 재료로 적합하다. 다만 그대로 복제하면 프로젝트의 핵심 원칙인 "query interface, not recommender"와 충돌할 수 있으므로, 기능명과 응답 언어는 `dump signal`, `buy/sell call`이 아니라 **Token Forensics Snapshot** 및 **Flow Reading**으로 설계해야 한다.

핵심 보완 방향은 다음 3개다.

1. `get_market_pulse` 중심의 거시 Snapshot에서, 특정 토큰/풀 단위의 **forensics Snapshot**으로 확장한다.
2. BYOK 중심 paid data model을 유지하되, x402/AgentCash는 **선택적 paid source adapter**로 추가한다.
3. "누가 던질까?"라는 투자 질문을 직접 답하지 않고, **top sellers, top accumulators, remaining inventory, CEX deposit risk, unlock proximity, source confidence**를 구조화해서 제공한다.

## 2. 기존 프로젝트 확인 결과

### 현재 구조

- 현재 구현은 TypeScript MCP 서버이며 `src/server.ts`에 6개 tool이 등록되어 있다.
- 현재 tool: `get_market_pulse`, `get_etf_flow`, `get_stablecoin_pulse`, `get_funding_oi`, `get_kr_premium`, `get_rwa_pulse`.
- 현재 adapter: `cex_flow`, `derivatives`, `kr_premium`, `macro_rwa`, `onchain_wallet`, `wallet_id`.
- 현재 응답 모델은 `ToolResponse`: `summary`, `score`, `reading`, `inputs`, `sources`, `stale_data`, `confidence`, `capabilities.byok_active`.
- `wallet_id` adapter는 이미 Arkham/Nansen BYOK label enrichment를 전제로 하고 있으나, v0.1 tool surface에서는 직접 사용되지 않는다.
- README의 roadmap은 v0.2를 `find_unusual_flows`, `find_whale_accumulation`, `screen_by_signal`로 예고한다.

### 이미 맞는 부분

- Hermes의 "skill bundle" 구조는 이 프로젝트의 "decision-unit-bundled MCP tool" 원칙과 잘 맞는다.
- `capabilities.byok_active`와 `stale_data`는 premium data / partial failure / fallback을 설명하기에 이미 좋은 기반이다.
- `wallet_id` adapter가 있어 top wallet label enrichment로 확장하기 쉽다.
- `read-only`, `snapshot-oriented`, `no trade prescription` 원칙은 포렌식 리포트에도 유지 가능하다.

### 충돌하거나 보완 필요한 부분

**Required**

- 현재 `ToolResponse`는 거시 Pulse에 맞춰져 있어, top wallets/table/multiple windows를 표현하기 부족하다.
- `reading` enum이 `risk-off | neutral | risk-on | unknown`으로 고정되어 있어, 토큰 포렌식에는 의미가 맞지 않는다.
- 현재 adapter interface는 token address / chain / pool input을 거의 받지 않는다.
- paid source 사용은 BYOK env var 중심이라, x402 per-call payment의 spend cap, pricing preview, payment failure를 표현할 자리가 없다.
- `wallet_id`는 label lookup만 담당하고, wallet age, remaining inventory, avg entry/exit price, CEX deposit proximity는 없다.

**Recommended**

- `v0.2`는 기존 `ToolResponse`를 억지로 재사용하지 말고 `ForensicsSnapshot`을 별도 schema로 둔다.
- "screening"과 "forensics"를 분리한다. Screening은 여러 토큰 중 후보 찾기이고, Forensics는 특정 토큰 하나를 깊게 보는 것이다.
- x402는 v0.2의 필수 경로가 아니라 `paid_sources` 확장으로 둔다. free/BYOK fallback이 계속 동작해야 한다.

## 3. 외부 참조 확인 메모

x402는 HTTP 402 Payment Required를 API/agent 결제 레이어로 쓰는 open protocol이며, API key 가입 흐름 없이 programmatic payment를 하게 해 준다는 설명이 공식 FAQ와 Cloudflare 문서에 있다. AgentCash 문서는 MCP tool 내부에서 upstream x402 API를 호출하고, 모델 입장에서는 일반 structured tool output만 받는 구조라고 설명한다. 또한 AgentCash는 spending cap을 지원한다고 설명한다.

계획상 의미:

- x402는 이 프로젝트의 MCP layer 자체를 유료화하는 것보다, **upstream premium source를 호출하는 adapter payment layer**로 보는 것이 더 자연스럽다.
- `NANSEN_API_KEY` 같은 BYOK와 `AGENTCASH_WALLET`/x402 payment path는 둘 다 `PaidSourceCapability`로 추상화해야 한다.
- paid call 전에는 price/capability preview가 있어야 하고, 실패 시 `stale_data`와 `payment_status`로 노출해야 한다.

참조:

- x402 FAQ: https://docs.x402.org/faq
- Cloudflare Agents x402: https://developers.cloudflare.com/agents/agentic-payments/x402/
- AgentCash MCP payments: https://agentcash.dev/learn/mcp-payments
- AgentCash how it works: https://agentcash.dev/docs/how-it-works

## 4. 제안 기능 묶음

### 4.1 신규 tool: `get_token_forensics`

목적: 특정 chain/token/pool에 대해 accumulation/dump 구조를 한 번에 조회한다.

입력 초안:

```ts
{
  chain: "base" | "ethereum" | "solana";
  token_address: string;
  quote_token?: "USD" | "USDC" | "WETH";
  pool_address?: string;
  windows?: Array<"24h" | "3d" | "7d" | "30d">;
  max_wallets?: number;          // default 20, hard cap 50
  paid_mode?: "free_only" | "byok_allowed" | "x402_allowed";
}
```

응답 초안:

```ts
{
  summary: string;
  flow_reading: "accumulation" | "distribution" | "mixed" | "thin-data" | "unknown";
  as_of: string;
  token: {
    chain: string;
    address: string;
    symbol?: string;
    pool_address?: string;
  };
  windows: {
    "24h"?: FlowWindow;
    "3d"?: FlowWindow;
    "7d"?: FlowWindow;
    "30d"?: FlowWindow;
  };
  top_sellers: WalletFlow[];
  top_accumulators: WalletFlow[];
  cex_deposit_risk: CexDepositRisk;
  unlock_context?: UnlockContext;
  sentiment_context?: SentimentContext;
  sources: string[];
  stale_data: string[];
  confidence: number;
  capabilities: {
    byok_active: string[];
    paid_sources_active: string[];
    paid_sources_quoted?: PaidSourceQuote[];
  };
  gaps: Gap[];
}
```

중요: `flow_reading`은 `buy/sell/hold`가 아니다. 관측된 flow 구조의 분류다.

### 4.2 신규 adapter: `dex_pool`

역할: DexScreener 등 free API로 pool discovery, liquidity, volume, price, 24h change를 가져온다.

필수 출력:

- `pool_address`
- `dex`
- `liquidity_usd`
- `volume_24h_usd`
- `price_usd`
- `price_change_24h_pct`
- `base_token`, `quote_token`

성공 기준:

- token address만 입력해도 가장 유의미한 pool을 선택한다.
- 유동성이 너무 낮으면 `gaps`에 `thin_liquidity`를 남긴다.
- pool 선택 기준은 deterministic해야 한다. 예: liquidity 우선, volume 보조.

### 4.3 신규 adapter: `wallet_flow`

역할: 특정 token/pool의 wallet-level buy/sell flow를 가져온다.

소스 우선순위:

1. Nansen TGM 또는 equivalent paid source
2. x402/AgentCash routed paid endpoint
3. BlockRun 또는 대체 free/paid source
4. 자체 RPC/event-log fallback

필수 출력:

- window별 bought/sold/net USD
- top sellers
- top accumulators
- avg entry/exit price
- remaining token inventory
- first_seen_at 또는 wallet age estimate

주의:

- 직접 RPC fallback은 비용은 낮지만 구현 난이도와 체인별 차이가 크다.
- v0.2 MVP에서는 Base/EVM 단일 체인부터 제한하는 것이 안전하다.

### 4.4 신규 adapter: `rpc_cross_check`

역할: wallet_flow 결과의 상위 주소를 RPC로 검산한다.

체크 항목:

- `balanceOf(token, wallet)`
- native balance
- nonce
- contract account 여부
- wallet age estimate

비용 통제:

- wallet당 최대 RPC call 수를 고정한다.
- 기본 `max_wallets=20`, hard cap 50.
- timeout과 partial result를 허용한다.

### 4.5 `wallet_id` 고도화

현재는 label lookup 중심이다. v0.2에서는 다음 필드를 표준화한다.

- `entity`
- `category`
- `label_confidence`
- `label_source`
- `is_cex_related`
- `is_bridge_related`
- `is_contract`

라벨 병합 규칙:

- Arkham/Nansen/entity source 간 충돌 시 source priority를 명시한다.
- label은 확정이 아니라 `label_confidence`와 함께 노출한다.
- CEX deposit detection은 label keyword만으로 확정하지 않고 `cex_deposit_risk`로 표현한다.

### 4.6 신규 adapter: `token_unlocks`

역할: Tokenomist 등 unlock source에서 upcoming unlock을 가져온다.

필수 출력:

- next unlock date
- unlock amount
- unlock percent of circulating supply
- cliff/linear 여부
- source confidence

v0.2 MVP에서는 optional로 둔다. source가 없으면 `gaps: ["unlock_data_missing"]`.

### 4.7 optional adapter: `sentiment_context`

역할: Cookie MCP 또는 X/social source로 sentiment context를 보조한다.

원칙:

- 온체인 flow의 보조 검산으로만 사용한다.
- sentiment가 onchain flow를 덮어쓰지 않는다.
- `sentiment_context`는 score input이 아니라 evidence context다.

## 5. x402 / paid source 설계

### 5.1 새 개념: `PaidSource`

현재 `BYOK`는 env key 기반이다. x402는 key가 아니라 per-call 결제다. 둘을 하나로 뭉개면 위험하므로 다음 개념을 추가한다.

```ts
type PaidSourceMode = "disabled" | "byok" | "x402";

interface PaidSourceQuote {
  source: string;
  mode: PaidSourceMode;
  estimated_cost_usd?: number;
  max_cost_usd?: number;
  endpoint?: string;
}

interface PaymentStatus {
  source: string;
  mode: PaidSourceMode;
  status: "not_attempted" | "quoted" | "paid" | "skipped_cap" | "insufficient_funds" | "failed";
  cost_usd?: number;
  reason?: string;
}
```

### 5.2 환경변수 초안

```bash
OPM_PAID_MODE=disabled|byok|x402
OPM_X402_DAILY_CAP_USD=2.00
OPM_X402_CALL_CAP_USD=0.15
OPM_X402_PROVIDER_ALLOWLIST=nansen,blockrun,tokenomist
```

BYOK env vars는 기존 유지:

```bash
NANSEN_API_KEY
ARKHAM_API_KEY
GLASSNODE_API_KEY
COINGLASS_API_KEY
```

### 5.3 spend control 원칙

**Required**

- 기본값은 `OPM_PAID_MODE=disabled`.
- paid call 전에 cap 검사를 한다.
- cap 초과 시 tool은 실패하지 않고 free fallback 또는 partial snapshot을 반환한다.
- paid result에는 `payment_status`를 남긴다.

**Recommended**

- `12_agent_pay_ops`와 ledger/spend policy를 공유할 수 있도록 payment abstraction을 작게 만든다.
- v0.2에서는 실제 결제 ledger를 이 repo에 넣지 않고, `PaymentClient` interface와 mock/test만 둔다.

## 6. 분류 로직

### 6.1 `flow_reading`

초기 rule-based 분류:

- `accumulation`: 7d net buy positive, top accumulators 분산, CEX deposit risk low
- `distribution`: 7d net sell negative, top sellers concentration high, remaining inventory still material
- `mixed`: 24h/3d/7d 방향이 서로 다름
- `thin-data`: liquidity/source coverage가 낮아 판단 불충분
- `unknown`: 핵심 source 실패

### 6.2 concentration metrics

필수 계산:

- top 1 seller share
- top 5 sellers share
- top 10 net flow share
- accumulator dispersion
- remaining inventory by top sellers

의미:

- 단일 지갑 매도인지, 분산된 retail flow인지 구분한다.
- "덤핑 위험"이라는 표현 대신 `seller_inventory_overhang`을 쓴다.

### 6.3 gap classification

응답에 다음 gap을 명시한다.

- `source_access_gap`: paid source unavailable, x402/BYOK absent
- `thin_liquidity`: pool liquidity too low
- `label_gap`: wallet labels unavailable or low confidence
- `rpc_gap`: RPC cross-check incomplete
- `unlock_data_gap`: unlock data unavailable
- `sentiment_gap`: sentiment source unavailable
- `cost_cap_gap`: spend cap prevented paid call

## 7. 구현 단계

### Phase 0 — 용어/스키마 결정

산출물:

- `CONTEXT.md`에 신규 용어 추가: `Token Forensics Snapshot`, `Flow Reading`, `Wallet Flow`, `Inventory Overhang`, `Paid Source`, `Payment Status`.
- ADR 작성 여부 검토: `ToolResponse`를 확장하지 않고 `ForensicsSnapshot`을 별도 schema로 둔다는 결정은 ADR 가치가 있다.

주의:

- 현재 `CONTEXT.md`는 이미 미커밋 수정이 있으므로, implementation 전 소유자 확인 후 수정한다.

### Phase 1 — free-first MVP

목표: x402 없이도 token-level snapshot skeleton을 제공한다.

작업:

- `src/types.ts`에 `ForensicsSnapshot` 계열 schema 추가
- `src/adapters/dex_pool.ts` 추가
- `src/adapters/rpc_cross_check.ts` 추가
- `src/tools/get_token_forensics.ts` 추가
- `src/server.ts` tool registration 추가
- tests 추가: schema, adapter, server tool contract, gap classification

성공 기준:

- token address 입력 시 pool/liquidity/price/volume + RPC cross-check 가능한 범위 반환
- paid source가 없어도 `source_access_gap`을 명시하고 정상 응답
- `npm run typecheck && npm run test && npm run build` 통과

### Phase 2 — paid source abstraction

목표: BYOK와 x402를 같은 adapter boundary 안에서 다룬다.

작업:

- `src/paid_sources/` 또는 `src/payment/` 추가
- `PaidSourceClient` interface 추가
- `PaymentStatus`, `PaidSourceQuote` schema 추가
- `OPM_PAID_MODE`, spend cap env parsing 추가
- mock paid source test 추가

성공 기준:

- 기본 disabled 상태에서 paid call이 발생하지 않는다.
- cap 초과 시 `cost_cap_gap`이 남는다.
- mock x402 source가 price quote → payment status → data return path를 통과한다.

### Phase 3 — wallet flow provider

목표: 실제 top seller/top accumulator 테이블을 채운다.

작업:

- `src/adapters/wallet_flow.ts` 추가
- Nansen/BYOK path 또는 x402-routed provider path 구현
- BlockRun/free fallback 가능성 검토
- avg entry/exit price 계산 표준화
- remaining inventory RPC cross-check 결합

성공 기준:

- 24h/3d/7d/30d 중 최소 7d window를 안정적으로 반환
- top sellers/top accumulators 각 최대 20개 반환
- source failure 시 partial snapshot + gap classification

### Phase 4 — unlock/sentiment optional context

목표: Hermes pipeline의 보조 context를 붙인다.

작업:

- `token_unlocks` optional adapter
- `sentiment_context` optional adapter
- response에 evidence-only context로 삽입

성공 기준:

- unlock/sentiment가 없어도 core forensics snapshot은 유지
- sentiment와 flow가 충돌할 때 `mixed` 또는 gap으로 표현, 결론을 덮지 않음

### Phase 5 — health check profile

목표: 사용자가 portfolio/watchlist에 대해 3일마다 health check를 돌릴 수 있도록 reference workflow를 제공한다.

작업:

- `examples/rules/token-forensics-healthcheck.yaml`
- `examples/watchlists/sample.yaml`
- CLI는 구현하지 않고, MCP consumer가 호출할 수 있는 tool contract와 예시만 제공

성공 기준:

- onchain-pulse-mcp는 여전히 read-only MCP 서버로 남는다.
- cron/alert/Telegram은 repo 밖 영역으로 유지한다.

## 8. 테스트 계획

Required:

- `ForensicsSnapshotSchema` runtime validation
- `get_token_forensics` input validation: invalid chain/address/max_wallets
- free-only path: paid source 없이도 정상 응답
- paid disabled path: payment client 호출 0회
- cap exceeded path: `cost_cap_gap`, no throw
- wallet label conflict path: source priority와 confidence 노출
- RPC partial failure: 일부 wallet만 실패해도 전체 snapshot 유지
- concentration calculation golden test
- flow_reading classification golden test

Recommended:

- recorded fixture 기반 DexScreener schema drift test
- Nansen/x402 mock contract test
- payment metadata에 민감정보가 섞이지 않는지 regression test
- high wallet count 입력 시 hard cap 적용 test

## 9. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---:|---|
| paid source 가격/제공 여부 변동 | 높음 | implementation 전 provider discovery를 별도 task로 둔다 |
| Nansen/Arkham 라벨 오류 | 높음 | label confidence와 source를 노출하고 확정 표현 금지 |
| RPC fallback 비용/속도 증가 | 중간 | wallet cap, timeout, partial result 허용 |
| x402 wallet/spend control 미성숙 | 높음 | default disabled, cap required, `12_agent_pay_ops`와 분리된 interface |
| tool이 recommender처럼 보임 | 높음 | `Flow Reading`, `Snapshot`, `gaps` 언어 유지 |
| 체인별 event parsing 복잡도 | 중간 | Base/EVM MVP로 시작, Solana는 별도 phase |

## 10. 프로젝트 간 연결

### `12_agent_pay_ops`

- x402 spend cap, usage ledger, merchant allowlist의 canonical owner 후보.
- `onchain-pulse-mcp`는 ledger를 직접 들고 가지 말고 `PaymentClient` interface만 유지하는 것이 좋다.

### `13_stablecoin_rails_intel`

- x402 ecosystem 자체가 투자 인텔리전스 대상이다.
- AgentCash, x402, MCP paid tools의 merchant onboarding 동향을 별도 market insight로 추적 가능.

### `03_tradingview_companion`

- chart/TA context와 token forensics snapshot을 합쳐 "왜 지금 움직였는가"를 설명하는 downstream consumer가 될 수 있다.
- 단, trade execution language는 downstream에서도 분리 필요.

## 11. 우선순위

**P0**

- `ForensicsSnapshot` schema
- `get_token_forensics` free-first skeleton
- Dex pool discovery
- gap classification
- no-prescription language

**P1**

- paid source abstraction
- wallet flow provider
- RPC cross-check
- top sellers/top accumulators tables
- concentration metrics

**P2**

- x402/AgentCash integration
- token unlocks
- sentiment context
- health check examples

**P3**

- HTML/Tufte report output
- watchlist runner
- multi-chain expansion beyond EVM/Base

## 12. Next decision

추천 결정:

**v0.2의 이름을 `Token Forensics Snapshot`으로 잡고, 첫 tool은 `get_token_forensics` 하나로 시작한다.**

기존 README의 `find_unusual_flows`, `find_whale_accumulation`, `screen_by_signal`은 그 다음이다. 먼저 특정 토큰 하나를 깊게 보는 포렌식 snapshot을 안정화해야 여러 토큰 screening이 의미 있어진다.

Implementation 전 확인 질문:

1. MVP chain을 Base로 제한할지, Ethereum/Base 동시 지원할지.
2. x402를 Phase 2 mock까지만 할지, 실제 AgentCash integration까지 v0.2에 넣을지.
3. `12_agent_pay_ops`와 spend ledger를 공유할지, onchain-pulse-mcp 내부에서는 cap-only로 끝낼지.

