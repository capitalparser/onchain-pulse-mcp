import { z } from "zod";
import type { MetricObservation } from "./types.js";

export const SourceCommercialStatusSchema = z.enum([
  "internal_research_ok",
  "attribution_required",
  "commercial_review_required",
  "commercial_contract_required",
  "commercial_redistribution_ok",
  "blocked",
]);
export type SourceCommercialStatus = z.infer<typeof SourceCommercialStatusSchema>;

export interface SourceLicensePolicy {
  sourcePrefix: string;
  status: SourceCommercialStatus;
  attributionRequired: boolean;
  evidenceUrl: string;
  reviewedAt: string;
  note: string;
}

export const SOURCE_LICENSE_POLICIES: readonly SourceLicensePolicy[] = [
  {
    sourcePrefix: "dune",
    status: "commercial_contract_required",
    attributionRequired: true,
    evidenceUrl: "https://dune.com/sql-api-terms",
    reviewedAt: "2026-08-21",
    note: "Recurring paid redistribution requires commercial review/permission; API use may not substitute for or compete with Dune.",
  },
  {
    sourcePrefix: "coinmetrics-community",
    status: "internal_research_ok",
    attributionRequired: true,
    evidenceUrl: "https://docs.coinmetrics.io/api",
    reviewedAt: "2026-08-21",
    note: "Community API documentation states free access is for non-commercial use.",
  },
  {
    sourcePrefix: "growthepie",
    status: "commercial_review_required",
    attributionRequired: true,
    evidenceUrl: "https://docs.growthepie.com/",
    reviewedAt: "2026-08-21",
    note: "Public API requires source attribution; recurring commercial redistribution rights are not explicit in public docs.",
  },
];

export interface SourcePolicyAssessment {
  sourceRef: string;
  policy: SourceLicensePolicy | null;
  commerciallyRedistributable: boolean;
  reason: string;
}

export function sourceLicensePolicy(sourceRef: string): SourceLicensePolicy | null {
  const normalized = sourceRef.trim().toLowerCase();
  return SOURCE_LICENSE_POLICIES.find((policy) =>
    normalized === policy.sourcePrefix || normalized.startsWith(`${policy.sourcePrefix}:`)
  ) ?? null;
}

export function assessSourceForCommercialRedistribution(sourceRef: string): SourcePolicyAssessment {
  const policy = sourceLicensePolicy(sourceRef);
  if (policy === null) {
    return {
      sourceRef,
      policy: null,
      commerciallyRedistributable: false,
      reason: "unknown source licensing status",
    };
  }
  const commerciallyRedistributable = policy.status === "commercial_redistribution_ok";
  return {
    sourceRef,
    policy,
    commerciallyRedistributable,
    reason: commerciallyRedistributable ? "approved for commercial redistribution" : policy.status,
  };
}

export function assertCommerciallyRedistributable(
  observations: readonly MetricObservation[],
  approvedSourcePrefixes: readonly string[] = [],
): void {
  const approved = new Set(approvedSourcePrefixes.map((value) => value.toLowerCase()));
  const failures = new Map<string, string>();

  for (const observation of observations) {
    for (const sourceRef of observation.source_refs) {
      const assessment = assessSourceForCommercialRedistribution(sourceRef);
      const prefix = assessment.policy?.sourcePrefix.toLowerCase();
      if (assessment.commerciallyRedistributable || (prefix !== undefined && approved.has(prefix))) continue;
      failures.set(sourceRef, assessment.reason);
    }
  }

  if (failures.size > 0) {
    const details = [...failures.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceRef, reason]) => `${sourceRef} (${reason})`)
      .join(", ");
    throw new Error(`commercial redistribution blocked by source licensing: ${details}`);
  }
}
