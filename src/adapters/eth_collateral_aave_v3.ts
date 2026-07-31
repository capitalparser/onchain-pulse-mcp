import type { AdapterContext } from "./base.js";
import {
  fetchFinalizedAaveV3Market,
  type AaveV3MarketRpcFailureCode,
  type FinalizedAaveV3MarketSpec,
} from "./aave_v3_market_rpc.js";
import {
  buildUnavailableEthCollateralSnapshot,
  buildVerifiedEthCollateralSnapshot,
  EthCollateralDomainError,
} from "../eth_collateral_demand/metrics.js";
import {
  ETH_COLLATERAL_ASSETS,
  type EthCollateralDemandSnapshot,
  type EthCollateralGapCode,
} from "../eth_collateral_demand/types.js";

const AAVE_V3_CORE_SPEC: FinalizedAaveV3MarketSpec = {
  marketId: "aave-v3-ethereum-core",
  cacheName: "eth_collateral_aave_v3",
  poolAddressesProvider: "0x2f39d218133afab8f2b819b1066c7e434ad94e9e",
  assets: ETH_COLLATERAL_ASSETS,
};

export interface EthCollateralAaveV3Input {
  /** Internal-only provider configuration. It is never returned or cached. */
  rpcUrl?: unknown;
}

type UnavailableCode = Extract<AaveV3MarketRpcFailureCode, EthCollateralGapCode>;

function configuredRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function unavailable(input: EthCollateralAaveV3Input, code: UnavailableCode): EthCollateralDemandSnapshot {
  const configured = configuredRpcUrl(input.rpcUrl) !== null;
  const detail = {
    rpc_not_configured: "Ethereum RPC is not configured.",
    rpc_access_gap: "Ethereum RPC evidence could not be retrieved.",
    rpc_chain_mismatch: "Ethereum RPC is not Ethereum mainnet.",
    rpc_finality_gap: "Ethereum RPC did not provide a finalized block.",
    rpc_schema_drift: "Ethereum RPC returned malformed evidence.",
    rpc_evidence_mismatch: "Ethereum RPC evidence did not reconcile.",
  }[code];
  return buildUnavailableEthCollateralSnapshot({
    summary: "Aave V3 Ethereum collateral capacity evidence is unavailable.",
    gaps: [{ code, detail }],
    sources: configured ? ["ethereum_rpc"] : [],
    sourceStatus: configured
      ? [{ source: "ethereum_rpc", role: "aave_v3_finalized_reserve_evidence", stale: false }]
      : [],
  });
}

export async function fetchEthCollateralAaveV3(
  input: EthCollateralAaveV3Input,
  ctx: AdapterContext,
): Promise<EthCollateralDemandSnapshot> {
  const result = await fetchFinalizedAaveV3Market(AAVE_V3_CORE_SPEC, input, ctx);
  if (result.status === "unavailable") return unavailable(input, result.code);
  try {
    return buildVerifiedEthCollateralSnapshot({
      block: result.evidence.block,
      reserves: result.evidence.reserves,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "aave_v3_finalized_reserve_evidence", stale: false }],
      stale: result.stale,
    });
  } catch (error) {
    if (error instanceof EthCollateralDomainError) {
      return unavailable(input, error.kind === "schema_drift" ? "rpc_schema_drift" : "rpc_evidence_mismatch");
    }
    return unavailable(input, "rpc_access_gap");
  }
}
