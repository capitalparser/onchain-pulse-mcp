import type { EthValueCaptureSnapshot, EthWindow } from "../eth_value_capture/types.js";

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
