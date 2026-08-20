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
