import type { EthEcosystemCaptureSnapshot } from "../eth_ecosystem_capture/types.js";
import { buildMetricObservationId, OBSERVATION_ID_VERSION } from "./observation_id.js";
import { MetricObservationSchema, type MetricObservation } from "./types.js";

interface MetricCandidate {
  key: string;
  value: number | null;
  unit: string;
}

export interface EcosystemObservationOptions {
  dimensions?: Readonly<Record<string, string>>;
}

function sourceTime(snapshot: EthEcosystemCaptureSnapshot): string {
  const observedMs = Date.parse(snapshot.as_of);
  if (!Number.isFinite(observedMs)) {
    throw new Error("ETH ecosystem-capture snapshot as_of must be an ISO timestamp");
  }
  const cutoffMs = Date.parse(`${snapshot.cutoff_day}T23:59:59.999Z`);
  if (!Number.isFinite(cutoffMs)) {
    throw new Error("ETH ecosystem-capture cutoff_day must be canonical");
  }
  return new Date(Math.min(cutoffMs, observedMs)).toISOString();
}

export function metricObservationsFromEthEcosystemCapture(
  snapshot: EthEcosystemCaptureSnapshot,
  ingestedAt: Date,
  options: EcosystemObservationOptions = {},
): MetricObservation[] {
  if (snapshot.sources.length === 0) return [];
  const observedAt = new Date(Date.parse(snapshot.as_of)).toISOString();
  const ingestedAtIso = ingestedAt.toISOString();
  if (Date.parse(ingestedAtIso) < Date.parse(observedAt)) {
    throw new Error("ingestedAt must be at or after ecosystem snapshot as_of");
  }
  const sourceAt = sourceTime(snapshot);
  const sourceRefs = [...new Set(snapshot.sources)].sort();
  const dimensions = {
    window: snapshot.window,
    snapshot_status: snapshot.status,
    cutoff_day: snapshot.cutoff_day,
    chain_scope: "ethereum_l1_and_ethereum_da_rollups",
    included_l2_count: String(snapshot.coverage.included_l2_count),
    external_da_excluded_count: String(snapshot.coverage.excluded_external_da_origins.length),
    observation_id_version: OBSERVATION_ID_VERSION,
    ...(options.dimensions ?? {}),
  };
  const candidates: MetricCandidate[] = [
    {
      key: "eth.l2_user_fees_usd",
      value: snapshot.metrics.l2_user_fees_usd.current,
      unit: "USD",
    },
    {
      key: "eth.l2_rent_paid_usd",
      value: snapshot.metrics.l2_rent_paid_usd.current,
      unit: "USD",
    },
    {
      key: "eth.l2_settlement_cost_share",
      value: snapshot.metrics.l2_settlement_cost_share.current,
      unit: "ratio",
    },
    {
      key: "eth.l1_stablecoin_supply_usd",
      value: snapshot.metrics.ethereum_l1_stablecoin_supply_usd.current,
      unit: "USD",
    },
    {
      key: "eth.l2_stablecoin_supply_usd",
      value: snapshot.metrics.ethereum_l2_stablecoin_supply_usd.current,
      unit: "USD",
    },
    {
      key: "eth.ecosystem_stablecoin_supply_usd",
      value: snapshot.metrics.ethereum_ecosystem_stablecoin_supply_usd.current,
      unit: "USD",
    },
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
