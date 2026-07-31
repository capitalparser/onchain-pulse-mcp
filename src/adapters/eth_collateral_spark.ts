import type { AdapterContext } from "./base.js";
import {
  fetchFinalizedAaveV3Market,
  type AaveV3MarketRpcFailureCode,
  type FinalizedAaveV3MarketSpec,
} from "./aave_v3_market_rpc.js";
import {
  buildUnavailableSparkCollateralSnapshot,
  buildVerifiedSparkCollateralSnapshot,
  SparkCollateralDomainError,
} from "../spark_collateral_capacity/metrics.js";
import {
  SPARK_COLLATERAL_ASSETS,
  type SparkCollateralCapacitySnapshot,
  type SparkCollateralGapCode,
} from "../spark_collateral_capacity/types.js";

const SPARK_LEND_SPEC: FinalizedAaveV3MarketSpec = {
  marketId: "spark-lend-ethereum",
  cacheName: "eth_collateral_spark",
  poolAddressesProvider: "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE",
  assets: SPARK_COLLATERAL_ASSETS,
};

export interface EthCollateralSparkInput {
  /** Internal-only provider configuration. It is never returned or cached. */
  rpcUrl?: unknown;
}

type UnavailableCode = Extract<AaveV3MarketRpcFailureCode, SparkCollateralGapCode>;

function configuredRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function unavailable(input: EthCollateralSparkInput, code: UnavailableCode): SparkCollateralCapacitySnapshot {
  const configured = configuredRpcUrl(input.rpcUrl) !== null;
  const detail = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  }[code];
  return buildUnavailableSparkCollateralSnapshot({
    summary: "SparkLend Ethereum collateral capacity evidence is unavailable.",
    gaps: [{ code, detail }],
    sources: configured ? ["ethereum_rpc"] : [],
    sourceStatus: configured
      ? [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }]
      : [],
  });
}

export async function fetchEthCollateralSpark(
  input: EthCollateralSparkInput,
  ctx: AdapterContext,
): Promise<SparkCollateralCapacitySnapshot> {
  const result = await fetchFinalizedAaveV3Market(SPARK_LEND_SPEC, input, ctx);
  if (result.status === "unavailable") return unavailable(input, result.code);
  try {
    return buildVerifiedSparkCollateralSnapshot({
      block: result.evidence.block,
      reserves: result.evidence.reserves,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "spark_lend_finalized_reserve_evidence", stale: false }],
      stale: result.stale,
    });
  } catch (error) {
    if (error instanceof SparkCollateralDomainError) {
      return unavailable(input, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    return unavailable(input, "rpc_access_gap");
  }
}
