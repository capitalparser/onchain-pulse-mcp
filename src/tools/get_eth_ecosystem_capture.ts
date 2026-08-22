import type { GrowThePieEcosystemResult } from "../adapters/eth_ecosystem_growthepie.js";
import { buildEthEcosystemCapture } from "../eth_ecosystem_capture/metrics.js";
import {
  EthEcosystemCaptureSnapshotSchema,
  type EthEcosystemCaptureSnapshot,
} from "../eth_ecosystem_capture/types.js";
import type { EthWindow } from "../eth_value_capture/types.js";
import type { Lang } from "../types.js";

export function getEthEcosystemCapture(args: {
  window: EthWindow;
  lang: Lang;
  adapter: GrowThePieEcosystemResult;
  now: Date;
}): EthEcosystemCaptureSnapshot {
  return EthEcosystemCaptureSnapshotSchema.parse(buildEthEcosystemCapture(args));
}
