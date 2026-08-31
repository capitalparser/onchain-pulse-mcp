import { z } from "zod";

const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const RobinhoodChainRegistrySchema = z.object({
  chain_id: z.literal(4663),
  chain_slug: z.literal("robinhood"),
  display_name: z.literal("Robinhood Chain"),
  rollup_stack: z.literal("arbitrum"),
  settlement_layer: z.literal("ethereum"),
  data_availability: z.literal("ethereum_blobs"),
  native_gas_symbol: z.literal("ETH"),
  official_chain_token: z.null(),
  rpc_url: z.string().url(),
  explorer_url: z.string().url(),
  canonical_tokens: z.object({
    WETH: EvmAddressSchema,
    USDG: EvmAddressSchema,
  }).strict(),
  official_sources: z.array(z.string().url()).min(1),
}).strict();

export type RobinhoodChainRegistry = z.infer<typeof RobinhoodChainRegistrySchema>;

export const ROBINHOOD_CHAIN_REGISTRY: RobinhoodChainRegistry =
  RobinhoodChainRegistrySchema.parse({
    chain_id: 4663,
    chain_slug: "robinhood",
    display_name: "Robinhood Chain",
    rollup_stack: "arbitrum",
    settlement_layer: "ethereum",
    data_availability: "ethereum_blobs",
    native_gas_symbol: "ETH",
    official_chain_token: null,
    rpc_url: "https://rpc.mainnet.chain.robinhood.com",
    explorer_url: "https://robinhoodchain.blockscout.com",
    canonical_tokens: {
      WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    },
    official_sources: [
      "https://docs.robinhood.com/chain/",
      "https://docs.robinhood.com/chain/connecting/",
      "https://docs.robinhood.com/chain/contracts/",
    ],
  });

export const CommunityVerificationStatusSchema = z.enum([
  "project_primary",
  "project_primary_plus_explorer",
  "research_candidate",
]);
export type CommunityVerificationStatus = z.infer<typeof CommunityVerificationStatusSchema>;

export const RobinhoodCommunityTokenSchema = z.object({
  symbol: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  address: EvmAddressSchema,
  category: z.literal("community_token"),
  official_affiliation: z.literal(false),
  verification_status: CommunityVerificationStatusSchema,
  verification_url: z.string().url(),
  project_url: z.string().url(),
  research_note: z.string().min(1).max(500),
}).strict();

export type RobinhoodCommunityToken = z.infer<typeof RobinhoodCommunityTokenSchema>;

export const ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE: readonly RobinhoodCommunityToken[] = [
  {
    symbol: "CASHCAT",
    name: "Cashcat",
    address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
    category: "community_token",
    official_affiliation: false,
    verification_status: "project_primary_plus_explorer",
    verification_url: "https://cashcat.cc/",
    project_url: "https://cashcat.cc/",
    research_note: "Community attention asset; not an official Robinhood token or equity claim.",
  },
  {
    symbol: "STONKBROKER",
    name: "Stonkbroker",
    address: "0xe934e36a439c94017b64a3fece66af12099abf50",
    category: "community_token",
    official_affiliation: false,
    verification_status: "project_primary",
    verification_url: "https://stonkbrokers.cash/docs",
    project_url: "https://stonkbrokers.cash/",
    research_note: "Community beta candidate; exact contract address is mandatory because ticker names are not unique.",
  },
  {
    symbol: "MANCER",
    name: "Mancer",
    address: "0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A",
    category: "community_token",
    official_affiliation: false,
    verification_status: "research_candidate",
    verification_url: "https://chainmancers.com/",
    project_url: "https://chainmancers.com/",
    research_note: "Research candidate that must pass exact-address explorer-symbol validation before breadth inclusion.",
  },
].map((token) => RobinhoodCommunityTokenSchema.parse(token));

export function normalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function communityTokenByAddress(address: string): RobinhoodCommunityToken | undefined {
  const normalized = normalizedAddress(address);
  return ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.find(
    (token) => normalizedAddress(token.address) === normalized,
  );
}
