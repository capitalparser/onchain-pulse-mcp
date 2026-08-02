import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import { createHash } from "node:crypto";

export interface EthValueAlertInput {
  current: EthValueCaptureSnapshot;
  previous?: EthValueCaptureSnapshot;
}

export type EthValueAlertEventKind = "regime_transition" | "source_health" | "confidence_drop";

export interface EthValueAlertEvent {
  kind: EthValueAlertEventKind;
  message: string;
}

export interface EthValueAlert {
  shouldNotify: boolean;
  fingerprint: string;
  events: EthValueAlertEvent[];
}

type IssuanceRegime = "negative" | "nonnegative" | "unknown";

function issuanceRegime(value: number | null): IssuanceRegime {
  if (value === null || !Number.isFinite(value)) return "unknown";
  return value < 0 ? "negative" : "nonnegative";
}

export function evaluateEthValueAlert(input: EthValueAlertInput): EthValueAlert {
  const currentRegime = issuanceRegime(input.current.metrics.net_issuance_eth.current);
  // A persisted snapshot represents the last observed state. Fall back to the
  // rolling comparison only for the stateless one-shot invocation.
  const previousRegime = issuanceRegime(
    input.previous?.metrics.net_issuance_eth.current ?? input.current.metrics.net_issuance_eth.previous,
  );
  const healthDegraded =
    input.current.status !== "complete" ||
    input.current.stale_data.length > 0 ||
    input.current.source_status.some((source) => source.stale) ||
    input.current.gaps.length > 0;
  const confidenceDropped =
    input.previous !== undefined && input.current.confidence < input.previous.confidence;
  const events: EthValueAlertEvent[] = [];

  if (currentRegime !== "unknown" && previousRegime !== "unknown" && currentRegime !== previousRegime) {
    events.push({
      kind: "regime_transition",
      message: `Net issuance changed from ${previousRegime} to ${currentRegime}.`,
    });
  }
  if (healthDegraded) {
    events.push({
      kind: "source_health",
      message: "Snapshot quality is partial, stale, or has reported gaps.",
    });
  }
  if (confidenceDropped) {
    events.push({
      kind: "confidence_drop",
      message: "Snapshot confidence declined from the prior snapshot.",
    });
  }

  const fingerprintInput = JSON.stringify({
    window: input.current.window,
    current_regime: currentRegime,
    previous_regime: previousRegime,
    status: input.current.status,
    stale_data: [...input.current.stale_data].sort(),
    stale_sources: input.current.source_status
      .filter((source) => source.stale)
      .map((source) => source.source)
      .sort(),
    gap_codes: input.current.gaps.map((gap) => gap.code).sort(),
    confidence_dropped: confidenceDropped,
    confidence_current: confidenceDropped ? input.current.confidence : null,
    confidence_previous: confidenceDropped ? input.previous?.confidence ?? null : null,
  });

  return {
    shouldNotify: events.length > 0,
    fingerprint: createHash("sha256").update(fingerprintInput).digest("hex"),
    events,
  };
}
