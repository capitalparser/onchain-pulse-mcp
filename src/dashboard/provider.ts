import type { EthValueCaptureSnapshot, EthWindow } from "../eth_value_capture/types.js";
import type { EthDemandCompassSnapshot } from "../eth_demand_compass/types.js";

export interface FreeOnlySnapshotInvoker {
  (input: { window: EthWindow; paid_mode: "free_only"; include_rollups: false }): Promise<EthValueCaptureSnapshot>;
}

export function createFreeOnlySnapshotProvider(invoke: FreeOnlySnapshotInvoker) {
  return (window: EthWindow): Promise<EthValueCaptureSnapshot> => invoke({
    window,
    paid_mode: "free_only",
    include_rollups: false,
  });
}

/** Compass accepts no caller-controlled mode or credential fields. */
export interface FreeOnlyCompassInvoker {
  (input: Record<string, never>): Promise<EthDemandCompassSnapshot>;
}

export function createFreeOnlyCompassProvider(invoke: FreeOnlyCompassInvoker) {
  return (): Promise<EthDemandCompassSnapshot> => invoke({});
}
