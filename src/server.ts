import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AdapterContext } from "./adapters/base.js";
import { makeContext } from "./adapters/base.js";
import { cexFlow } from "./adapters/cex_flow.js";
import { dexPool } from "./adapters/dex_pool.js";
import { derivatives } from "./adapters/derivatives.js";
import { krPremium } from "./adapters/kr_premium.js";
import { macroRwa } from "./adapters/macro_rwa.js";
import { onchainWallet } from "./adapters/onchain_wallet.js";
import { rpcCrossCheck } from "./adapters/rpc_cross_check.js";
import { fetchDuneEthValue } from "./adapters/eth_value_dune.js";
import { fetchGrowThePieRent } from "./adapters/eth_value_growthepie.js";
import { fetchGrowThePieEcosystemCapture } from "./adapters/eth_ecosystem_growthepie.js";
import { fetchEthSupplyHistory } from "./adapters/eth_supply_coinmetrics.js";
import { fetchEthFeeRpc } from "./adapters/eth_fee_rpc.js";
import { fetchEthConsensusRewardsBeacon } from "./adapters/eth_consensus_rewards_beacon.js";
import { fetchEthCollateralAaveV3 } from "./adapters/eth_collateral_aave_v3.js";
import { fetchEthCollateralSpark } from "./adapters/eth_collateral_spark.js";
import { fetchLidoPooledEthBacking } from "./adapters/lido_pooled_eth_rpc.js";
import { fetchSkyEthCollateralCustody } from "./adapters/sky_eth_collateral_rpc.js";
import { fetchEigenLayerEthRestakingExposure } from "./adapters/eigenlayer_eth_restaking_rpc.js";
import { fetchEigenLayerLstEthQuotes } from "./adapters/eigenlayer_lst_eth_quotes_rpc.js";
import { fetchRobinhoodChainCommunity } from "./adapters/robinhood_chain_community.js";
import { fetchRobinhoodChainDefiLlama } from "./adapters/robinhood_chain_defillama.js";
import { fetchRobinhoodChainMorpho } from "./adapters/robinhood_chain_morpho.js";
import type { EnvConfig } from "./env.js";
import { windowToDays } from "./eth_value_capture/metrics.js";
import {
  GetEthFeeCrossCheckInputSchema,
  type EthFeeCrossCheckSnapshot,
} from "./eth_fee_cross_check/types.js";
import {
  GetEthConsensusRewardsCrossCheckInputSchema,
  type EthConsensusRewardsCrossCheckSnapshot,
} from "./eth_consensus_rewards/types.js";
import {
  GetEthValueCaptureInputSchema,
  type EthValueCaptureSnapshot,
} from "./eth_value_capture/types.js";
import {
  GetEthEcosystemCaptureInputSchema,
  type EthEcosystemCaptureSnapshot,
} from "./eth_ecosystem_capture/types.js";
import type { EthCollateralDemandSnapshot } from "./eth_collateral_demand/types.js";
import type { SparkCollateralCapacitySnapshot } from "./spark_collateral_capacity/types.js";
import type { LidoPooledEthBackingSnapshot } from "./lido_pooled_eth_backing/types.js";
import type { SkyEthCollateralCustodySnapshot } from "./sky_eth_collateral_custody/types.js";
import type { EigenLayerEthRestakingExposureSnapshot } from "./eigenlayer_eth_restaking/types.js";
import type { EigenLayerLstEthQuotesSnapshot } from "./eigenlayer_lst_eth_quotes/types.js";
import type { EthDemandCompassSnapshot } from "./eth_demand_compass/types.js";
import type { RobinhoodChainPulseSnapshot } from "./robinhood_chain_pulse/types.js";
import { fanOutAdapters } from "./pipeline/fanout.js";
import { toScoreInputs } from "./pipeline/score_inputs.js";
import { loadPulseConfig } from "./pulse/config.js";
import { makeFileHistoryStore, computeWindowDelta } from "./pulse/history.js";
import { getEtfFlow } from "./tools/get_etf_flow.js";
import { getEthValueCapture } from "./tools/get_eth_value_capture.js";
import { getEthEcosystemCapture } from "./tools/get_eth_ecosystem_capture.js";
import { getEthFeeCrossCheck } from "./tools/get_eth_fee_cross_check.js";
import { getEthConsensusRewardsCrossCheck } from "./tools/get_eth_consensus_rewards_cross_check.js";
import { getEthCollateralDemand } from "./tools/get_eth_collateral_demand.js";
import { getSparkEthCollateralCapacity } from "./tools/get_spark_eth_collateral_capacity.js";
import { getLidoPooledEthBacking } from "./tools/get_lido_pooled_eth_backing.js";
import { getSkyEthCollateralCustody } from "./tools/get_sky_eth_collateral_custody.js";
import { getEigenLayerEthRestakingExposure } from "./tools/get_eigenlayer_eth_restaking_exposure.js";
import { getEigenLayerLstEthQuotes } from "./tools/get_eigenlayer_lst_eth_quotes.js";
import { getEthDemandCompass } from "./tools/get_eth_demand_compass.js";
import { getRobinhoodChainPulse } from "./tools/get_robinhood_chain_pulse.js";
import { getFundingOi } from "./tools/get_funding_oi.js";
import { getKrPremium } from "./tools/get_kr_premium.js";
import { getMarketPulse } from "./tools/get_market_pulse.js";
import { getRwaPulse } from "./tools/get_rwa_pulse.js";
import { getStablecoinPulse } from "./tools/get_stablecoin_pulse.js";
import { getTokenForensics } from "./tools/get_token_forensics.js";
import type { ForensicsSnapshot, ToolResponse } from "./types.js";

const NoArgs = z.object({}).strict();
const SevenDayOnly = z.object({ window: z.literal("7d").default("7d") });
const RwaWindowArgs = z.object({ window: z.enum(["1d", "7d", "30d"]).default("7d") });
const FundingArgs = z.object({ asset: z.enum(["BTC", "ETH"]) });
const KrPremiumArgs = z.object({ asset: z.enum(["BTC", "ETH", "all"]).default("all") });
const TokenForensicsArgs = z.object({
  chain: z.enum(["base", "ethereum"]),
  token_address: z.string().min(1),
  pool_address: z.string().min(1).optional(),
  max_wallets: z.number().int().positive().max(50).default(20),
  paid_mode: z.enum(["free_only", "byok_allowed", "x402_allowed"]).default("free_only"),
});

interface JsonInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface HandlerContext {
  env: EnvConfig;
  ctx: AdapterContext;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonInputSchema;
  handler: (
    raw: unknown,
    hc: HandlerContext,
  ) => Promise<
    | ToolResponse
    | ForensicsSnapshot
    | EthValueCaptureSnapshot
    | EthEcosystemCaptureSnapshot
    | EthFeeCrossCheckSnapshot
    | EthConsensusRewardsCrossCheckSnapshot
    | EthCollateralDemandSnapshot
    | SparkCollateralCapacitySnapshot
    | LidoPooledEthBackingSnapshot
    | SkyEthCollateralCustodySnapshot
    | EigenLayerEthRestakingExposureSnapshot
    | EigenLayerLstEthQuotesSnapshot
    | EthDemandCompassSnapshot
    | RobinhoodChainPulseSnapshot
  >;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_market_pulse",
    description: "Composite onchain market pulse score with reading, inputs, sources, and confidence.",
    inputSchema: { type: "object", properties: {} },
    handler: handleMarketPulse,
  },
  {
    name: "get_etf_flow",
    description: "BTC spot ETF 7-day net flow. v0.1 supports only window=7d.",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["7d"] } } },
    handler: handleEtfFlow,
  },
  {
    name: "get_eth_value_capture",
    description:
      "Ethereum protocol fee, burn, L2 rent, supply change, and aligned issuance metrics over completed UTC-day windows; collateral and reserve demand are out of scope.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          default: "30d",
        },
        paid_mode: {
          type: "string",
          enum: ["free_only", "byok_allowed"],
          default: "free_only",
        },
        include_rollups: {
          type: "boolean",
          default: false,
        },
      },
    },
    handler: handleEthValueCapture,
  },
  {
    name: "get_eth_ecosystem_capture",
    description:
      "Chain-bounded Ethereum ecosystem growth and ETH settlement-capture metrics: Ethereum-DA L2 user fees, rent paid to Ethereum, settlement-cost share, and Ethereum L1/L2 stablecoin supply.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          default: "30d",
        },
      },
      additionalProperties: false,
    },
    handler: handleEthEcosystemCapture,
  },
  {
    name: "get_eth_demand_compass",
    description:
      "Read-only ETH demand compass that separates Ethereum ecosystem growth from ETH fee, settlement, supply, and collateral value accrual.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleEthDemandCompass,
  },
  {
    name: "get_robinhood_chain_pulse",
    description:
      "Read-only Robinhood Chain capital, credit, exact-address community breadth, fragility, and unquantified ETH-link diagnostic.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleRobinhoodChainPulse,
  },
  {
    name: "get_eth_fee_cross_check",
    description: "Bounded exact verification of Ethereum execution fees from finalized block and receipt evidence.",
    inputSchema: {
      type: "object",
      properties: {
        start_block: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        end_block: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        include_blocks: { type: "boolean", default: false },
      },
      required: ["start_block", "end_block"],
    },
    handler: handleEthFeeCrossCheck,
  },
  {
    name: "get_eth_consensus_rewards_cross_check",
    description: "Bounded exact verification of observed Ethereum consensus reward components from one finalized epoch.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        include_blocks: { type: "boolean", default: false },
      },
      required: ["epoch"],
    },
    handler: handleEthConsensusRewardsCrossCheck,
  },
  {
    name: "get_eth_collateral_demand",
    description: "Verified Aave V3 Core ETH-family supplied capacity at one finalized Ethereum block.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleEthCollateralDemand,
  },
  {
    name: "get_spark_eth_collateral_capacity",
    description: "Verified SparkLend ETH-family supplied capacity at one finalized Ethereum block.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleSparkEthCollateralCapacity,
  },
  {
    name: "get_lido_pooled_eth_backing",
    description: "Verified Lido pooled ETH backing at one finalized Ethereum block.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleLidoPooledEthBacking,
  },
  {
    name: "get_sky_eth_collateral_custody",
    description: "Verified legacy Maker/Sky ETH-family adapter-held token custody at one finalized Ethereum block; broader collateral and demand metrics stay null.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleSkyEthCollateralCustody,
  },
  {
    name: "get_eigenlayer_eth_restaking_exposure",
    description: "Verified fixed legacy EigenLayer ETH-family LST strategy token-unit exposure and native-restaking diagnostics; broader totals stay null.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleEigenLayerEthRestakingExposure,
  },
  {
    name: "get_eigenlayer_lst_eth_quotes",
    description: "Finalized bounded quotes for 9 of 12 fixed EigenLayer strategies; OETH is nominal unit accounting, not redeemability, and broader totals stay null.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: handleEigenLayerLstEthQuotes,
  },
  {
    name: "get_stablecoin_pulse",
    description: "Stablecoin 7-day supply delta. v0.1 supports only window=7d.",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["7d"] } } },
    handler: handleStablecoinPulse,
  },
  {
    name: "get_funding_oi",
    description: "Perpetual funding, put-call ratio, and open interest for BTC or ETH.",
    inputSchema: {
      type: "object",
      properties: { asset: { type: "string", enum: ["BTC", "ETH"] } },
      required: ["asset"],
    },
    handler: handleFundingOi,
  },
  {
    name: "get_kr_premium",
    description: "Korea premium spread for BTC, ETH, or both.",
    inputSchema: { type: "object", properties: { asset: { type: "string", enum: ["BTC", "ETH", "all"] } } },
    handler: handleKrPremium,
  },
  {
    name: "get_rwa_pulse",
    description: "RWA TVL summary over a requested display window.",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["1d", "7d", "30d"] } } },
    handler: handleRwaPulse,
  },
  {
    name: "get_token_forensics",
    description: "Token-level forensic snapshot with pool discovery, explicit gaps, and non-prescriptive flow reading.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["base", "ethereum"] },
        token_address: { type: "string" },
        pool_address: { type: "string" },
        max_wallets: { type: "number", minimum: 1, maximum: 50 },
        paid_mode: { type: "string", enum: ["free_only", "byok_allowed", "x402_allowed"] },
      },
      required: ["chain", "token_address"],
    },
    handler: handleTokenForensics,
  },
];

export interface ServerBundle {
  server: Server;
  ctx: AdapterContext;
}

export function listTools(): ToolDef[] {
  return TOOLS;
}

export function createServer(opts: { env: EnvConfig; fetchImpl?: typeof fetch }): ServerBundle {
  const ctx = makeContext({ env: opts.env, fetchImpl: opts.fetchImpl });
  const server = new Server(
    { name: "onchain-pulse-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = TOOLS.find((t) => t.name === req.params.name);
    if (!def) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${req.params.name}` }) }], isError: true };
    }

    try {
      const out = await def.handler(req.params.arguments ?? {}, { env: opts.env, ctx });
      return { content: [{ type: "text", text: JSON.stringify(out) }] };
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }], isError: true };
    }
  });

  return { server, ctx };
}

async function handleMarketPulse(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  NoArgs.parse(raw ?? {});
  const cfg = loadPulseConfig();
  const store = makeFileHistoryStore({
    path: hc.env.historyPath,
    windowDays: cfg.history?.window_days ?? 30,
    dedupHours: cfg.history?.dedup_hours ?? 24,
  });
  const history = store.load();
  const fanout = await fanOutAdapters([derivatives, macroRwa, onchainWallet, cexFlow, krPremium], hc.ctx);
  const macro = fanout.perAdapter.macro_rwa;
  const kr = fanout.perAdapter.kr_premium;

  if (macro) {
    const btcDominance = macro.data.btc_dominance;
    if (typeof btcDominance === "number" && Number.isFinite(btcDominance)) {
      macro.data.btc_dominance_7d_delta = computeWindowDelta(history.btc_dominance_raw ?? [], btcDominance, 7);
      store.appendDatapoint("btc_dominance_raw", btcDominance, new Date());
    }

    const rwaTvl = macro.data.rwa_tvl_usd;
    if (typeof rwaTvl === "number" && Number.isFinite(rwaTvl)) {
      macro.data.rwa_tvl_7d_delta = computeWindowDelta(history.rwa_tvl_raw ?? [], rwaTvl, 7);
      store.appendDatapoint("rwa_tvl_raw", rwaTvl, new Date());
    }
  }

  if (kr) {
    const upbitVolume = kr.data.upbit_volume_btc_24h;
    if (typeof upbitVolume === "number" && Number.isFinite(upbitVolume)) {
      kr.data.upbit_netflow_7d_kr = upbitVolume;
    }
  }

  const values = toScoreInputs(fanout.perAdapter);
  const asOf = fanout.asOf || new Date().toISOString();
  for (const [key, value] of Object.entries(values)) {
    store.appendDatapoint(key, value, new Date(asOf));
  }
  await store.save();

  return getMarketPulse({
    cfg,
    values,
    history,
    sources: fanout.sources,
    byokActive: fanout.byokActive,
    lang: hc.env.lang,
    asOf,
    staleData: fanout.staleData,
  });
}

async function handleEtfFlow(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  const args = SevenDayOnly.parse(raw ?? {});
  const r = await macroRwa.fetch(undefined, hc.ctx);
  return getEtfFlow({
    window: args.window,
    adapterResult: r,
    lang: hc.env.lang,
    byokActive: macroRwa.capabilities(hc.env).byok_active,
    staleData: r.stale ? ["macro_rwa:stale_fallback"] : (r.stale_data ?? []),
  });
}

export async function handleEthValueCapture(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthValueCaptureSnapshot> {
  const args = GetEthValueCaptureInputSchema.parse(raw ?? {});
  const windowDays = windowToDays(args.window);
  const now = new Date();
  const supply = await fetchEthSupplyHistory({ windowDays, now }, hc.ctx);
  const cutoffDay = supply.latestBoundary ?? now.toISOString().slice(0, 10);
  const [dune, growthepie] = await Promise.all([
    fetchDuneEthValue(
      {
        cutoffDay,
        windowDays,
        includeRollups: args.include_rollups,
        allowExecution: args.paid_mode === "byok_allowed",
      },
      hc.ctx,
    ),
    fetchGrowThePieRent(
      {
        cutoffDay,
        windowDays,
        includeRollups: args.include_rollups,
      },
      hc.ctx,
    ),
  ]);

  return getEthValueCapture({
    window: args.window,
    lang: hc.env.lang,
    includeRollups: args.include_rollups,
    byokActive: hc.env.byok.dune ? ["dune"] : [],
    selectedCutoffDay: cutoffDay,
    supply,
    dune,
    growthepie,
    now,
  });
}

async function loadEthEcosystemCapture(
  window: "7d" | "30d" | "90d",
  cutoffDay: string,
  now: Date,
  hc: HandlerContext,
): Promise<EthEcosystemCaptureSnapshot> {
  const adapter = await fetchGrowThePieEcosystemCapture(
    { cutoffDay, windowDays: windowToDays(window) },
    hc.ctx,
  );
  return getEthEcosystemCapture({
    window,
    lang: hc.env.lang,
    adapter,
    now,
  });
}

export async function handleEthEcosystemCapture(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthEcosystemCaptureSnapshot> {
  const args = GetEthEcosystemCaptureInputSchema.parse(raw ?? {});
  const now = new Date();
  return loadEthEcosystemCapture(
    args.window,
    now.toISOString().slice(0, 10),
    now,
    hc,
  );
}

export async function handleEthDemandCompass(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthDemandCompassSnapshot> {
  NoArgs.parse(raw ?? {});
  const now = new Date();
  const valueCapture = await handleEthValueCapture(
    { window: "30d", paid_mode: "free_only", include_rollups: false },
    hc,
  );
  const cutoffDay = valueCapture.cutoff_day ?? now.toISOString().slice(0, 10);
  const [ecosystemCapture, aaveSnapshot, lidoSnapshot] = await Promise.all([
    loadEthEcosystemCapture("30d", cutoffDay, now, hc),
    fetchEthCollateralAaveV3({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx),
    fetchLidoPooledEthBacking({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx),
  ]);
  const aave = getEthCollateralDemand({ lang: hc.env.lang, adapterSnapshot: aaveSnapshot });
  const lido = getLidoPooledEthBacking({ lang: hc.env.lang, adapterSnapshot: lidoSnapshot });
  return getEthDemandCompass({
    valueCapture,
    ecosystemCapture,
    aave,
    lido,
    now,
  });
}

export async function handleRobinhoodChainPulse(
  raw: unknown,
  hc: HandlerContext,
): Promise<RobinhoodChainPulseSnapshot> {
  NoArgs.parse(raw);
  const now = new Date();
  const [fundamentals, credit, community] = await Promise.all([
    fetchRobinhoodChainDefiLlama(hc.ctx, now),
    fetchRobinhoodChainMorpho(hc.ctx, now),
    fetchRobinhoodChainCommunity(hc.ctx, now),
  ]);
  return getRobinhoodChainPulse({
    lang: hc.env.lang,
    fundamentals,
    credit,
    community,
    now,
  });
}

export async function handleEthFeeCrossCheck(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthFeeCrossCheckSnapshot> {
  const args = GetEthFeeCrossCheckInputSchema.parse(raw ?? {});
  const adapterSnapshot = await fetchEthFeeRpc(
    {
      startBlock: args.start_block,
      endBlock: args.end_block,
      includeBlocks: args.include_blocks,
      rpcUrl: hc.env.ethereumRpcUrl,
    },
    hc.ctx,
  );
  return getEthFeeCrossCheck({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleEthConsensusRewardsCrossCheck(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthConsensusRewardsCrossCheckSnapshot> {
  const args = GetEthConsensusRewardsCrossCheckInputSchema.parse(raw ?? {});
  const adapterSnapshot = await fetchEthConsensusRewardsBeacon(
    {
      epoch: args.epoch,
      includeBlocks: args.include_blocks,
      beaconUrl: hc.env.ethereumBeaconApiUrl,
    },
    hc.ctx,
  );
  return getEthConsensusRewardsCrossCheck({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleEthCollateralDemand(
  raw: unknown,
  hc: HandlerContext,
): Promise<EthCollateralDemandSnapshot> {
  NoArgs.parse(raw ?? {});
  const adapterSnapshot = await fetchEthCollateralAaveV3(
    { rpcUrl: hc.env.ethereumRpcUrl },
    hc.ctx,
  );
  return getEthCollateralDemand({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleSparkEthCollateralCapacity(
  raw: unknown,
  hc: HandlerContext,
): Promise<SparkCollateralCapacitySnapshot> {
  NoArgs.parse(raw);
  const adapterSnapshot = await fetchEthCollateralSpark({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx);
  return getSparkEthCollateralCapacity({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleLidoPooledEthBacking(
  raw: unknown,
  hc: HandlerContext,
): Promise<LidoPooledEthBackingSnapshot> {
  NoArgs.parse(raw);
  const adapterSnapshot = await fetchLidoPooledEthBacking({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx);
  return getLidoPooledEthBacking({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleSkyEthCollateralCustody(
  raw: unknown,
  hc: HandlerContext,
): Promise<SkyEthCollateralCustodySnapshot> {
  NoArgs.parse(raw);
  const adapterSnapshot = await fetchSkyEthCollateralCustody({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx);
  return getSkyEthCollateralCustody({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleEigenLayerEthRestakingExposure(
  raw: unknown,
  hc: HandlerContext,
): Promise<EigenLayerEthRestakingExposureSnapshot> {
  NoArgs.parse(raw);
  const adapterSnapshot = await fetchEigenLayerEthRestakingExposure({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx);
  return getEigenLayerEthRestakingExposure({ lang: hc.env.lang, adapterSnapshot });
}

export async function handleEigenLayerLstEthQuotes(
  raw: unknown,
  hc: HandlerContext,
): Promise<EigenLayerLstEthQuotesSnapshot> {
  NoArgs.parse(raw);
  const adapterSnapshot = await fetchEigenLayerLstEthQuotes({ rpcUrl: hc.env.ethereumRpcUrl }, hc.ctx);
  return getEigenLayerLstEthQuotes({ lang: hc.env.lang, adapterSnapshot });
}

async function handleStablecoinPulse(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  const args = SevenDayOnly.parse(raw ?? {});
  const r = await onchainWallet.fetch(undefined, hc.ctx);
  return getStablecoinPulse({
    window: args.window,
    adapterResult: r,
    lang: hc.env.lang,
    byokActive: onchainWallet.capabilities(hc.env).byok_active,
    staleData: r.stale ? ["onchain_wallet:stale_fallback"] : (r.stale_data ?? []),
  });
}

async function handleFundingOi(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  const args = FundingArgs.parse(raw ?? {});
  const r = await derivatives.fetch(undefined, hc.ctx);
  return getFundingOi({
    asset: args.asset,
    adapterResult: r,
    lang: hc.env.lang,
    byokActive: derivatives.capabilities(hc.env).byok_active,
    staleData: r.stale ? ["derivatives:stale_fallback"] : (r.stale_data ?? []),
  });
}

async function handleKrPremium(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  const args = KrPremiumArgs.parse(raw ?? {});
  const r = await krPremium.fetch(undefined, hc.ctx);
  return getKrPremium({
    asset: args.asset,
    adapterResult: r,
    lang: hc.env.lang,
    byokActive: krPremium.capabilities(hc.env).byok_active,
    staleData: r.stale ? ["kr_premium:stale_fallback"] : (r.stale_data ?? []),
  });
}

async function handleRwaPulse(raw: unknown, hc: HandlerContext): Promise<ToolResponse> {
  const args = RwaWindowArgs.parse(raw ?? {});
  const r = await macroRwa.fetch(undefined, hc.ctx);
  return getRwaPulse({
    window: args.window,
    adapterResult: r,
    lang: hc.env.lang,
    byokActive: macroRwa.capabilities(hc.env).byok_active,
    staleData: r.stale ? ["macro_rwa:stale_fallback"] : (r.stale_data ?? []),
  });
}

async function handleTokenForensics(raw: unknown, hc: HandlerContext): Promise<ForensicsSnapshot> {
  const args = TokenForensicsArgs.parse(raw ?? {});
  const poolResult = await dexPool.fetch({ chain: args.chain, tokenAddress: args.token_address }, hc.ctx);
  const rpcResult = await rpcCrossCheck.fetch(
    {
      chain: args.chain,
      tokenAddress: args.token_address,
      wallets: [],
      maxWallets: args.max_wallets,
    },
    hc.ctx,
  );

  return getTokenForensics({
    chain: args.chain,
    tokenAddress: args.token_address,
    poolResult,
    rpcResult,
    byokActive: [],
    paidSourcesActive: [],
  });
}
