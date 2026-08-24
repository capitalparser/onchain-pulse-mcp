import type { EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import { buildMetricObservationId, OBSERVATION_ID_VERSION } from "./observation_id.js";
import { MetricObservationSchema, type MetricObservation } from "./types.js";

interface MetricCandidate {
  key: string;
  value: number | null;
  unit: string;
}

function sourceTime(snapshot: EthValueCaptureSnapshot): string {
  const observedMs = Date.parse(snapshot.as_of);
  if (!Number.isFinite(observedMs)) throw new Error("ETH value-capture snapshot as_of must be an ISO timestamp");
  if (snapshot.cutoff_day === null) return new Date(observedMs).toISOString();
  const cutoffMs = Date.parse(`${snapshot.cutoff_day}T23:59:59.999Z`);
  return new Date(Math.min(cutoffMs, observedMs)).toISOString();
}

export function metricObservationsFromEthValueCapture(
  snapshot: EthValueCaptureSnapshot,
  ingestedAt: Date,
): MetricObservation[] {
  if (snapshot.sources.length === 0) return [];
  const observedAt = new Date(Date.parse(snapshot.as_of)).toISOString();
  const ingestedAtIso = ingestedAt.toISOString();
  if (Date.parse(ingestedAtIso) < Date.parse(observedAt)) {
    throw new Error("ingestedAt must be at or after snapshot as_of");
  }
  const sourceAt = sourceTime(snapshot);
  const sourceRefs = [...new Set(snapshot.sources)].sort();
  const dimensions = {
    window: snapshot.window,
    snapshot_status: snapshot.status,
    cutoff_day: snapshot.cutoff_day ?? "unknown",
    observation_id_version: OBSERVATION_ID_VERSION,
  };

  const candidates: MetricCandidate[] = [
    { key: "eth.gross_l1_fees_eth", value: snapshot.metrics.gross_l1_fees_eth.current, unit: "ETH" },
    { key: "eth.total_burn_eth", value: snapshot.metrics.total_burn_eth.current, unit: "ETH" },
    { key: "eth.blob_fee_burn_eth", value: snapshot.metrics.blob_fee_burn_eth.current, unit: "ETH" },
    { key: "eth.net_issuance_eth", value: snapshot.metrics.net_issuance_eth.current, unit: "ETH" },
    { key: "eth.l2_rent_paid_eth", value: snapshot.metrics.l2_rent_paid_eth.current, unit: "ETH" },
    { key: "eth.l2_blob_fee_eth", value: snapshot.metrics.l2_blob_fee_eth.current, unit: "ETH" },
    { key: "eth.l2_rent_share_of_l1_fees", value: snapshot.ratios.l2_rent_share_of_l1_fees.current, unit: "ratio" },
  ];

  return candidates.flatMap((candidate) => {
    if (candidate.value === null) return [];
    const observation = {
      id: buildMetricObservationId({
        metricKey: candidate.key,
        subjectRef: "ethereum",
        assetRef: "ETH",
        value: candidate.value,
        unit: candidate.unit,
        sourceAt,
        observedAt,
        confidence: snapshot.confidence,
        sourceRefs,
        methodologyVersion: snapshot.methodology_version,
        dimensions,
      }),
      metric_key: candidate.key,
      subject_ref: "ethereum",
      asset_ref: "ETH",
      value: candidate.value,
      unit: candidate.unit,
      source_at: sourceAt,
      observed_at: observedAt,
      ingested_at: ingestedAtIso,
      confidence: snapshot.confidence,
      source_refs: sourceRefs,
      methodology_version: snapshot.methodology_version,
      dimensions,
    };
    return [MetricObservationSchema.parse(observation)];
  });
}
