import type { EthCollateralDemandSnapshot } from "../eth_collateral_demand/types.js";
import type { EthEcosystemCaptureSnapshot } from "../eth_ecosystem_capture/types.js";
import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import { buildEthDemandCompass } from "../eth_demand_compass/metrics.js";
import {
  EthDemandCompassV2SnapshotSchema,
  type EthDemandCompassV2Snapshot,
} from "../eth_demand_compass/types.js";
import type { LidoPooledEthBackingSnapshot } from "../lido_pooled_eth_backing/types.js";

export interface GetEthDemandCompassArgs {
  valueCapture: EthValueCaptureSnapshot;
  ecosystemCapture: EthEcosystemCaptureSnapshot;
  aave: EthCollateralDemandSnapshot;
  lido: LidoPooledEthBackingSnapshot;
  now: Date;
}

/** Composes sanitized, read-only snapshots; missing source coverage is never inferred as demand. */
export function getEthDemandCompass(
  args: GetEthDemandCompassArgs,
): EthDemandCompassV2Snapshot {
  return EthDemandCompassV2SnapshotSchema.parse(buildEthDemandCompass(args));
}
