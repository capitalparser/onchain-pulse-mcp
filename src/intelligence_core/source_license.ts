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
    reviewedAt: "2026-08-23",
    note: "The public API and open backend support research and require source attribution; recurring commercial redistribution and embedded paid-product rights are not explicit in the public documentation and require review or written permission.",
  },
  {
    sourcePrefix: "defillama",
    status: "internal_research_ok",
    attributionRequired: true,
    evidenceUrl: "https://defillama.com/terms",
    reviewedAt: "2026-08-23",
    note: "The official Terms grant personal non-commercial use and prohibit commercial copying, republishing, mirroring, or resale without prior written consent.",
  },
  {
    sourcePrefix: "defillama-stablecoins",
    status: "internal_research_ok",
    attributionRequired: true,
    evidenceUrl: "https://defillama.com/terms",
    reviewedAt: "2026-08-23",
    note: "The official public API remains suitable for internal research only under the current registry; commercial copying or republication requires prior written consent.",
  },
  {
    sourcePrefix: "robinhood-chain-docs",
    status: "attribution_required",
    attributionRequired: true,
    evidenceUrl: "https://docs.robinhood.com/chain/",
    reviewedAt: "2026-08-30",
    note: "Official chain and contract documentation may support attributed factual references; it does not grant redistribution rights for third-party market data or imply affiliation of community tokens.",
  },
  {
    sourcePrefix: "morpho-api",
    status: "commercial_review_required",
    attributionRequired: true,
    evidenceUrl: "https://docs.morpho.org/getting-started/resources/morpho-api",
    reviewedAt: "2026-08-30",
    note: "The public GraphQL API is suitable for internal research; recurring commercial embedding or redistribution requires explicit review of Morpho terms and endpoint policy.",
  },
  {
    sourcePrefix: "dexscreener",
    status: "commercial_review_required",
    attributionRequired: true,
    evidenceUrl: "https://docs.dexscreener.com/api/reference",
    reviewedAt: "2026-08-30",
    note: "Exact-address market and pool data may be used for internal research with attribution; commercial redistribution or paid-product embedding requires a separate rights review.",
  },
  {
    sourcePrefix: "robinhood-blockscout",
    status: "commercial_review_required",
    attributionRequired: true,
    evidenceUrl: "https://docs.blockscout.com/devs/apis/rest",
    reviewedAt: "2026-08-30",
    note: "Explorer token metadata and holder counts are research inputs; downstream commercial display or redistribution requires review of the explorer and Blockscout terms.",
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
