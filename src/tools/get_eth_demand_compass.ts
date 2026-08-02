import type { EthCollateralDemandSnapshot } from "../eth_collateral_demand/types.js";
import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import { buildEthDemandCompass } from "../eth_demand_compass/metrics.js";
import { EthDemandCompassSnapshotSchema, type EthDemandCompassSnapshot } from "../eth_demand_compass/types.js";
import type { LidoPooledEthBackingSnapshot } from "../lido_pooled_eth_backing/types.js";
import type { ToolResponse } from "../types.js";

export interface GetEthDemandCompassArgs {
  valueCapture: EthValueCaptureSnapshot;
  stablecoin: ToolResponse;
  aave: EthCollateralDemandSnapshot;
  lido: LidoPooledEthBackingSnapshot;
  now: Date;
}

/** Composes only sanitized, read-only source snapshots; no source gaps are inferred as demand. */
export function getEthDemandCompass(args: GetEthDemandCompassArgs): EthDemandCompassSnapshot {
  return EthDemandCompassSnapshotSchema.parse(buildEthDemandCompass(args));
}
