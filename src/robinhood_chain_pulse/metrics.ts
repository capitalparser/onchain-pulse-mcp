import type { Lang } from "../types.js";
import type { RobinhoodDefiLlamaResult } from "../adapters/robinhood_chain_defillama.js";
import type { RobinhoodMorphoResult } from "../adapters/robinhood_chain_morpho.js";
import type { RobinhoodCommunityResult } from "../adapters/robinhood_chain_community.js";
import { ROBINHOOD_CHAIN_REGISTRY } from "./registry.js";
import {
  RobinhoodBreadthMetricsSchema,
  RobinhoodChainPulseSnapshotSchema,
  type RobinhoodBreadthMetrics,
  type RobinhoodChainPulseSnapshot,
  type RobinhoodCommunityTokenMarket,
  type RobinhoodPulseGap,
} from "./types.js";

export const ROBINHOOD_CHAIN_PULSE_THRESHOLDS = {
  capital: {
    tvl_positive_1d_pct: 1,
    tvl_negative_1d_pct: -1,
    stablecoin_positive_7d_pct: 2,
    stablecoin_negative_7d_pct: -2,
    dex_positive_7d_pct: 10,
    dex_negative_7d_pct: -10,
    minimum_available_signals: 2,
  },
  credit: {
    active_supply_usd: 50_000_000,
    active_utilisation: 0.6,
    forming_supply_usd: 10_000_000,
    forming_utilisation: 0.25,
  },
  breadth: {
    minimum_diffusion_tokens: 3,
    leader_return_24h_pct: 5,
    beta_median_return_24h_pct: 3,
    positive_share: 2 / 3,
    minimum_liquidity_usd: 25_000,
  },
  fragility: {
    moderate_market_cap_to_liquidity: 20,
    high_market_cap_to_liquidity: 50,
    moderate_volume_to_liquidity: 2,
    high_volume_to_liquidity: 5,
    moderate_leader_market_cap_share: 0.65,
    high_leader_market_cap_share: 0.8,
  },
} as const;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function capitalAxis(result: RobinhoodDefiLlamaResult) {
  const rawSignals: Array<{
    name: string;
    value: number | null;
    positive: number;
    negative: number;
  }> = [
    {
      name: "TVL 1d",
      value: result.metrics.tvl_change_1d_pct,
      positive: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.tvl_positive_1d_pct,
      negative: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.tvl_negative_1d_pct,
    },
    {
      name: "stablecoin 7d",
      value: result.metrics.stablecoin_change_7d_pct,
      positive: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.stablecoin_positive_7d_pct,
      negative: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.stablecoin_negative_7d_pct,
    },
    {
      name: "DEX 7d",
      value: result.metrics.dex_change_7d_pct,
      positive: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.dex_positive_7d_pct,
      negative: ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.dex_negative_7d_pct,
    },
  ];
  const signals = rawSignals.filter((signal): signal is {
    name: string;
    value: number;
    positive: number;
    negative: number;
  } => signal.value !== null);
  const positiveCount = signals.filter((signal) => signal.value >= signal.positive).length;
  const negativeCount = signals.filter((signal) => signal.value <= signal.negative).length;
  const status = signals.length < ROBINHOOD_CHAIN_PULSE_THRESHOLDS.capital.minimum_available_signals
    ? "unknown"
    : positiveCount >= 2
      ? "expanding"
      : negativeCount >= 2
        ? "contracting"
        : positiveCount > 0 && negativeCount > 0
          ? "mixed"
          : "stable";
  return {
    status,
    evidence: signals.map((signal) => `${signal.name}: ${signal.value.toFixed(2)}%`),
    confidence: signals.length / 3,
  } as const;
}

function creditAxis(result: RobinhoodMorphoResult) {
  const supply = result.metrics.supply_usd;
  const utilisation = result.metrics.utilisation;
  const status = supply === null || utilisation === null
    ? "unknown"
    : supply >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.credit.active_supply_usd
      && utilisation >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.credit.active_utilisation
      ? "active"
      : supply >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.credit.forming_supply_usd
        && utilisation >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.credit.forming_utilisation
        ? "forming"
        : "inactive";
  const evidence: string[] = [];
  if (supply !== null) evidence.push(`Morpho supplied: $${Math.round(supply).toLocaleString("en-US")}`);
  if (result.metrics.borrow_usd !== null) {
    evidence.push(`Morpho borrowed: $${Math.round(result.metrics.borrow_usd).toLocaleString("en-US")}`);
  }
  if (utilisation !== null) evidence.push(`Morpho utilisation: ${(utilisation * 100).toFixed(1)}%`);
  return { status, evidence, confidence: result.confidence } as const;
}

function breadthMetrics(tokens: RobinhoodCommunityTokenMarket[]): RobinhoodBreadthMetrics {
  const eligible = tokens.filter((token) => token.eligible_for_breadth);
  const positive = eligible.filter((token) => (token.price_change_24h_pct ?? 0) > 0);
  const volumeActive = eligible.filter((token) => (token.volume_24h_usd ?? 0) > 0);
  const liquid = eligible.filter(
    (token) => (token.liquidity_usd ?? 0) >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.minimum_liquidity_usd,
  );
  const marketCapRows = eligible.filter(
    (token): token is RobinhoodCommunityTokenMarket & { market_cap_usd: number } => token.market_cap_usd !== null,
  );
  const totalMarketCap = marketCapRows.reduce((sum, token) => sum + token.market_cap_usd, 0);
  const leader = [...marketCapRows].sort((left, right) => right.market_cap_usd - left.market_cap_usd)[0] ?? null;
  const betaReturns = eligible
    .filter((token) => token.registry_symbol !== leader?.registry_symbol)
    .map((token) => token.price_change_24h_pct)
    .filter((value): value is number => value !== null);
  return RobinhoodBreadthMetricsSchema.parse({
    universe_size: tokens.length,
    eligible_count: eligible.length,
    positive_24h_count: positive.length,
    positive_24h_share: eligible.length > 0 ? positive.length / eligible.length : null,
    volume_active_count: volumeActive.length,
    volume_active_share: eligible.length > 0 ? volumeActive.length / eligible.length : null,
    liquidity_breadth_count: liquid.length,
    liquidity_breadth_share: eligible.length > 0 ? liquid.length / eligible.length : null,
    leader_symbol: leader?.registry_symbol ?? null,
    leader_return_24h_pct: leader?.price_change_24h_pct ?? null,
    beta_median_return_24h_pct: median(betaReturns),
    leader_market_cap_share: leader !== null && totalMarketCap > 0
      ? leader.market_cap_usd / totalMarketCap
      : null,
    median_market_cap_to_liquidity: median(
      eligible
        .map((token) => token.market_cap_to_liquidity)
        .filter((value): value is number => value !== null),
    ),
    median_volume_to_liquidity: median(
      eligible
        .map((token) => token.volume_to_liquidity)
        .filter((value): value is number => value !== null),
    ),
  });
}

function breadthAxis(breadth: RobinhoodBreadthMetrics) {
  const leader = breadth.leader_return_24h_pct;
  const beta = breadth.beta_median_return_24h_pct;
  const positiveShare = breadth.positive_24h_share;
  const status = breadth.eligible_count < 2
    ? "thin_data"
    : breadth.eligible_count >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.minimum_diffusion_tokens
      && leader !== null
      && leader >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.leader_return_24h_pct
      && beta !== null
      && beta >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.beta_median_return_24h_pct
      && positiveShare !== null
      && positiveShare >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.positive_share
      ? "leader_beta_diffusion"
      : leader !== null
        && leader >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.leader_return_24h_pct
        && beta !== null
        && beta <= 0
        ? "leader_only"
        : positiveShare !== null
          && positiveShare >= ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.positive_share
          ? "broad_risk_on"
          : breadth.eligible_count >= 2
            ? "mixed"
            : "unknown";
  const evidence: string[] = [
    `Eligible community tokens: ${breadth.eligible_count}/${breadth.universe_size}`,
  ];
  if (breadth.leader_symbol !== null && leader !== null) {
    evidence.push(`Leader ${breadth.leader_symbol}: ${leader.toFixed(2)}% (24h)`);
  }
  if (beta !== null) evidence.push(`Beta median: ${beta.toFixed(2)}% (24h)`);
  if (positiveShare !== null) evidence.push(`Positive breadth: ${(positiveShare * 100).toFixed(1)}%`);
  return {
    status,
    evidence,
    confidence: Math.min(1, breadth.eligible_count / ROBINHOOD_CHAIN_PULSE_THRESHOLDS.breadth.minimum_diffusion_tokens),
  } as const;
}

function fragilityAxis(breadth: RobinhoodBreadthMetrics) {
  const marketCapLiquidity = breadth.median_market_cap_to_liquidity;
  const volumeLiquidity = breadth.median_volume_to_liquidity;
  const leaderShare = breadth.leader_market_cap_share;
  const evidence: string[] = [];
  if (marketCapLiquidity !== null) evidence.push(`Median market-cap/liquidity: ${marketCapLiquidity.toFixed(1)}x`);
  if (volumeLiquidity !== null) evidence.push(`Median 24h volume/liquidity: ${volumeLiquidity.toFixed(1)}x`);
  if (leaderShare !== null) evidence.push(`Leader market-cap share: ${(leaderShare * 100).toFixed(1)}%`);
  const status = marketCapLiquidity === null && volumeLiquidity === null && leaderShare === null
    ? "unknown"
    : (marketCapLiquidity ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.high_market_cap_to_liquidity
      || (volumeLiquidity ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.high_volume_to_liquidity
      || (leaderShare ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.high_leader_market_cap_share
      ? "high"
      : (marketCapLiquidity ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.moderate_market_cap_to_liquidity
        || (volumeLiquidity ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.moderate_volume_to_liquidity
        || (leaderShare ?? 0) > ROBINHOOD_CHAIN_PULSE_THRESHOLDS.fragility.moderate_leader_market_cap_share
        ? "moderate"
        : "low";
  const observed = [marketCapLiquidity, volumeLiquidity, leaderShare].filter((value) => value !== null).length;
  return { status, evidence, confidence: observed / 3 } as const;
}

function summaryFor(snapshot: {
  phase: RobinhoodChainPulseSnapshot["phase"];
  lang: Lang;
}): string {
  if (snapshot.lang === "ko") {
    const summaries: Record<RobinhoodChainPulseSnapshot["phase"], string> = {
      capital_formation: "Robinhood Chain의 자본기반은 확대 중이지만, 신용활성화와 커뮤니티 토큰 확산은 아직 별도 확인이 필요합니다.",
      credit_activation: "자본 유입과 Morpho 차입·이용률이 함께 확대되어 온체인 신용활성화 국면으로 분류됩니다.",
      leader_concentration: "체인 대표 커뮤니티 토큰만 강하고 베타 확산은 확인되지 않아 대장 집중 국면입니다.",
      leader_beta_diffusion: "유동성 하한을 통과한 커뮤니티 토큰에서 대장 상승이 베타로 확산되는 징후가 확인됩니다.",
      fragile_blowoff: "대장·베타 확산은 있으나 유동성 대비 시가총액·거래량·집중도가 높아 후기 과열 위험이 큽니다.",
      mixed: "자본·신용·베타 확산 신호가 혼재되어 단일 국면으로 분류하기 어렵습니다.",
      data_warning: "일부 핵심 원천이 불완전하여 Robinhood Chain 국면을 신뢰성 있게 분류할 수 없습니다.",
      unavailable: "현재 Robinhood Chain 국면 분석에 필요한 근거를 제공할 수 없습니다.",
    };
    return summaries[snapshot.phase] ?? "현재 Robinhood Chain 국면 분석에 필요한 근거를 제공할 수 없습니다.";
  }
  const summaries: Record<RobinhoodChainPulseSnapshot["phase"], string> = {
    capital_formation: "Robinhood Chain capital is expanding, while credit activation and community-token diffusion require separate confirmation.",
    credit_activation: "Capital inflow and Morpho borrowing utilisation jointly indicate an onchain credit-activation phase.",
    leader_concentration: "The community-token leader is strong without confirmed beta diffusion.",
    leader_beta_diffusion: "The verified, liquidity-qualified community universe shows leader-to-beta diffusion.",
    fragile_blowoff: "Breadth is expanding, but valuation-to-liquidity, turnover, or leader concentration indicates blow-off fragility.",
    mixed: "Capital, credit, and speculative-breadth signals are mixed.",
    data_warning: "Core evidence is incomplete, so the Robinhood Chain phase cannot be classified reliably.",
    unavailable: "Robinhood Chain phase evidence is currently unavailable.",
  };
  return summaries[snapshot.phase] ?? "Robinhood Chain phase evidence is currently unavailable.";
}

export function buildRobinhoodChainPulse(args: {
  lang: Lang;
  fundamentals: RobinhoodDefiLlamaResult;
  credit: RobinhoodMorphoResult;
  community: RobinhoodCommunityResult;
  now: Date;
}): RobinhoodChainPulseSnapshot {
  const capital = capitalAxis(args.fundamentals);
  const credit = creditAxis(args.credit);
  const breadth = breadthMetrics(args.community.tokens);
  const speculativeBreadth = breadthAxis(breadth);
  const fragility = fragilityAxis(breadth);
  const allUnavailable = args.fundamentals.status === "unavailable"
    && args.credit.status === "unavailable"
    && args.community.status === "unavailable";
  const phase: RobinhoodChainPulseSnapshot["phase"] = allUnavailable
    ? "unavailable"
    : speculativeBreadth.status === "leader_beta_diffusion" && fragility.status === "high"
      ? "fragile_blowoff"
      : speculativeBreadth.status === "leader_beta_diffusion"
        ? "leader_beta_diffusion"
        : speculativeBreadth.status === "leader_only"
          ? "leader_concentration"
          : credit.status === "active" && capital.status !== "contracting"
            ? "credit_activation"
            : capital.status === "expanding"
              ? "capital_formation"
              : [args.fundamentals.status, args.credit.status, args.community.status].filter((status) => status === "unavailable").length >= 2
                ? "data_warning"
                : "mixed";
  const officialSources = ROBINHOOD_CHAIN_REGISTRY.official_sources.map(
    (url: string) => `robinhood-chain-docs:${url}`,
  );
  const gaps: RobinhoodPulseGap[] = [
    ...args.fundamentals.gaps,
    ...args.credit.gaps,
    ...args.community.gaps,
    {
      code: "robinhood-chain:eth_capture_unquantified",
      detail: "Robinhood Chain uses ETH gas and Ethereum settlement/DA, but chain-specific L1 settlement rent is not yet quantified in this module.",
    },
    {
      code: "robinhood-chain:community_tokens_unaffiliated",
      detail: "Registered community tokens are not official Robinhood tokens, equity, revenue rights, or chain governance claims.",
    },
  ];
  const confidence = Number((
    args.fundamentals.confidence * 0.35
    + args.credit.confidence * 0.25
    + args.community.confidence * 0.3
    + 0.1
  ).toFixed(2));
  const snapshot: RobinhoodChainPulseSnapshot = {
    summary: summaryFor({ phase, lang: args.lang }),
    as_of: args.now.toISOString(),
    phase,
    chain: {
      chain_id: ROBINHOOD_CHAIN_REGISTRY.chain_id,
      native_gas_symbol: ROBINHOOD_CHAIN_REGISTRY.native_gas_symbol,
      official_chain_token: null,
      rollup_stack: ROBINHOOD_CHAIN_REGISTRY.rollup_stack,
      settlement_layer: ROBINHOOD_CHAIN_REGISTRY.settlement_layer,
      data_availability: ROBINHOOD_CHAIN_REGISTRY.data_availability,
      community_tokens_are_unaffiliated: true,
    },
    fundamentals: args.fundamentals.metrics,
    credit: args.credit.metrics,
    community_tokens: args.community.tokens,
    breadth,
    axes: {
      capital_base: capital,
      credit_activation: credit,
      speculative_breadth: speculativeBreadth,
      fragility,
      eth_capture: {
        status: "protocol_link_present_unquantified",
        evidence: [
          "Robinhood Chain native gas is ETH.",
          "Robinhood Chain is an Arbitrum-based L2 settling to Ethereum with Ethereum blob data availability.",
        ],
        confidence: 1,
      },
    },
    sources: [...new Set([
      ...officialSources,
      ...args.fundamentals.sources,
      ...args.credit.sources,
      ...args.community.sources,
    ])].sort(),
    source_status: [
      ...args.fundamentals.sourceStatus,
      ...args.credit.sourceStatus,
      ...args.community.sourceStatus,
    ],
    stale_data: [...new Set([
      ...args.fundamentals.staleData,
      ...args.credit.staleData,
      ...args.community.staleData,
    ])].sort(),
    gaps,
    confidence,
    interpretation_boundary: [
      "This is a research classification, not an investment recommendation or target-price model.",
      "Community-token breadth is calculated only from exact registered addresses that pass minimum evidence and liquidity controls.",
      "Stablecoin supply is capital base, not credit activation, unless borrowing and utilisation also increase.",
      "Ethereum value capture is not inferred from Robinhood Chain activity until chain-specific L1 rent and ETH collateral use are measured.",
    ],
    methodology_version: "robinhood-chain-pulse-v1",
  };
  return RobinhoodChainPulseSnapshotSchema.parse(snapshot);
}
