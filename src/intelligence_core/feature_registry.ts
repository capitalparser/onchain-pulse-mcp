import { z } from "zod";

export const FeatureDefinitionSchema = z.object({
  key: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  unit: z.string().min(1).max(80),
  cadence: z.enum(["block", "hourly", "daily", "weekly", "event"]),
  staleness_seconds: z.number().int().positive(),
  methodology_version: z.string().min(1).max(120),
  backfill: z.enum(["supported", "forward_only", "source_dependent"]),
  point_in_time_safe: z.boolean(),
  family: z.enum([
    "usage",
    "supply",
    "settlement",
    "liquidity",
    "leverage",
    "collateral",
    "flow",
    "valuation",
    "risk",
  ]),
}).strict();
export type FeatureDefinition = z.infer<typeof FeatureDefinitionSchema>;

const ROBINHOOD_METHODOLOGY_VERSION = "robinhood-chain-history-v1";

function robinhoodFeature(
  key: string,
  description: string,
  unit: string,
  family: FeatureDefinition["family"],
): FeatureDefinition {
  return {
    key,
    description,
    unit,
    cadence: "daily",
    staleness_seconds: 86_400,
    methodology_version: ROBINHOOD_METHODOLOGY_VERSION,
    backfill: "forward_only",
    point_in_time_safe: true,
    family,
  };
}

const ROBINHOOD_FEATURES: FeatureDefinition[] = [
  robinhoodFeature("robinhood_chain.tvl_usd", "Robinhood Chain TVL observed at collection time.", "USD", "liquidity"),
  robinhoodFeature("robinhood_chain.tvl_change_1d_pct", "Robinhood Chain one-day TVL percentage change.", "percent", "flow"),
  robinhoodFeature("robinhood_chain.stablecoin_supply_usd", "Robinhood Chain stablecoin supply observed at collection time.", "USD", "liquidity"),
  robinhoodFeature("robinhood_chain.stablecoin_change_7d_pct", "Robinhood Chain seven-day stablecoin supply change.", "percent", "flow"),
  robinhoodFeature("robinhood_chain.dex_volume_24h_usd", "Robinhood Chain DEX volume over 24 hours.", "USD", "usage"),
  robinhoodFeature("robinhood_chain.dex_change_7d_pct", "Robinhood Chain seven-day DEX activity change.", "percent", "flow"),
  robinhoodFeature("robinhood_chain.app_fees_24h_usd", "Robinhood Chain application fees over 24 hours.", "USD", "usage"),
  robinhoodFeature("robinhood_chain.morpho_supply_usd", "Current Morpho supply on Robinhood Chain.", "USD", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_borrow_usd", "Current Morpho borrow on Robinhood Chain.", "USD", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_liquidity_usd", "Current Morpho liquidity on Robinhood Chain.", "USD", "liquidity"),
  robinhoodFeature("robinhood_chain.morpho_collateral_usd", "Current Morpho collateral on Robinhood Chain.", "USD", "collateral"),
  robinhoodFeature("robinhood_chain.morpho_utilisation", "Current Morpho utilisation on Robinhood Chain.", "ratio", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_supply_change_7d_pct", "Seven-day Morpho supply change.", "percent", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_borrow_change_7d_pct", "Seven-day Morpho borrow change.", "percent", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_utilisation_change_7d", "Seven-day Morpho utilisation change.", "ratio", "leverage"),
  robinhoodFeature("robinhood_chain.morpho_history_coverage_ratio", "Share of listed Morpho markets with complete bounded history.", "ratio", "risk"),
  robinhoodFeature("robinhood_chain.community_eligible_count", "Count of registered community tokens eligible for breadth.", "count", "risk"),
  robinhoodFeature("robinhood_chain.community_positive_24h_share", "Positive-return share of the eligible community universe.", "ratio", "risk"),
  robinhoodFeature("robinhood_chain.community_beta_median_return_24h_pct", "Median 24-hour return outside the community leader.", "percent", "risk"),
  robinhoodFeature("robinhood_chain.community_leader_return_24h_pct", "Community leader 24-hour return.", "percent", "risk"),
  robinhoodFeature("robinhood_chain.community_leader_market_cap_share", "Community leader share of eligible market capitalisation.", "ratio", "risk"),
  robinhoodFeature("robinhood_chain.community_median_market_cap_to_liquidity", "Median eligible market-cap-to-liquidity ratio.", "ratio", "risk"),
  robinhoodFeature("robinhood_chain.community_median_volume_to_liquidity", "Median eligible 24-hour-volume-to-liquidity ratio.", "ratio", "risk"),
  ...[
    ["capital_base", ["expanding", "stable", "contracting", "mixed", "unknown"]],
    ["current_credit", ["active", "forming", "inactive", "unknown"]],
    ["speculative_breadth", ["leader_beta_diffusion", "leader_only", "broad_risk_on", "mixed", "thin_data", "unknown"]],
    ["fragility", ["low", "moderate", "high", "unknown"]],
    ["overall_phase", ["capital_formation", "credit_activation", "leader_concentration", "leader_beta_diffusion", "fragile_blowoff", "mixed", "data_warning", "unavailable"]],
  ].flatMap(([axis, values]) => (values as string[]).map((value) =>
    robinhoodFeature(
      "robinhood_chain.status." + axis + "." + value,
      "One-hot Robinhood Chain " + axis + " status: " + value + ".",
      "one_hot",
      "risk",
    )
  )),
];

const FEATURES: FeatureDefinition[] = [
  {
    key: "eth.gross_l1_fees_eth",
    description: "Gross Ethereum L1 execution fees for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "usage",
  },
  {
    key: "eth.total_burn_eth",
    description: "Ethereum base-fee plus blob-fee burn for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "supply",
  },
  {
    key: "eth.blob_fee_burn_eth",
    description: "Ethereum blob fee burn for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.net_issuance_eth",
    description: "Aligned Ethereum net issuance for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "supported",
    point_in_time_safe: true,
    family: "supply",
  },
  {
    key: "eth.l2_rent_paid_eth",
    description: "Total L2 rent paid to Ethereum for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.l2_blob_fee_eth",
    description: "L2 blob fee component paid to Ethereum for the selected comparison window.",
    unit: "ETH",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.l2_rent_share_of_l1_fees",
    description: "Share of gross Ethereum L1 fees attributable to L2 rent.",
    unit: "ratio",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-value-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.l2_user_fees_usd",
    description: "User fees paid on production Ethereum-DA rollups over the aligned comparison window.",
    unit: "USD",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "usage",
  },
  {
    key: "eth.l2_rent_paid_usd",
    description: "USD value of rent paid to Ethereum by production Ethereum-DA rollups over the aligned window.",
    unit: "USD",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.l2_settlement_cost_share",
    description: "Ethereum rent paid by included L2s divided by user fees collected on those same L2s and periods.",
    unit: "ratio",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "settlement",
  },
  {
    key: "eth.l1_stablecoin_supply_usd",
    description: "Stablecoin supply on Ethereum L1 at the aligned observation date.",
    unit: "USD",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "liquidity",
  },
  {
    key: "eth.l2_stablecoin_supply_usd",
    description: "Stablecoin supply on included production Ethereum-DA rollups at the aligned observation date.",
    unit: "USD",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "liquidity",
  },
  {
    key: "eth.ecosystem_stablecoin_supply_usd",
    description: "Combined stablecoin supply on Ethereum L1 and included production Ethereum-DA rollups.",
    unit: "USD",
    cadence: "daily",
    staleness_seconds: 172800,
    methodology_version: "eth-ecosystem-capture-v1",
    backfill: "source_dependent",
    point_in_time_safe: true,
    family: "liquidity",
  },
  ...ROBINHOOD_FEATURES,
];

for (const feature of FEATURES) FeatureDefinitionSchema.parse(feature);

const BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

export function listFeatureDefinitions(): FeatureDefinition[] {
  return FEATURES.map((feature) => ({ ...feature }));
}

export function getFeatureDefinition(key: string): FeatureDefinition | undefined {
  const feature = BY_KEY.get(key);
  return feature === undefined ? undefined : { ...feature };
}
