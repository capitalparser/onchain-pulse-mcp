import { describe, expect, it } from "vitest";
import type { CoinMetricsSupplyResult } from "../../src/adapters/eth_supply_coinmetrics.js";
import type {
  DuneEthValueResult,
  DunePeriodValues,
} from "../../src/adapters/eth_value_dune.js";
import { EthValueCaptureSnapshotSchema } from "../../src/eth_value_capture/types.js";
import { getEthValueCapture } from "../../src/tools/get_eth_value_capture.js";

function validSupply(
  overrides: Partial<CoinMetricsSupplyResult> = {},
): CoinMetricsSupplyResult {
  return {
    status: "valid",
    points: [
      { boundary: "2026-07-15", supplyEth: 1000 },
      { boundary: "2026-07-22", supplyEth: 1002 },
      { boundary: "2026-07-29", supplyEth: 1001 },
    ],
    latestBoundary: "2026-07-29",
    asOf: "2026-07-29T00:00:00Z",
    stale: false,
    gaps: [],
    ...overrides,
  };
}

function feePeriod(input: {
  base: number;
  blob: number;
  priority: number;
  l2Rent: number;
}): DunePeriodValues {
  return {
    grossL1Fees: input.base + input.blob + input.priority,
    baseFeeBurn: input.base,
    blobFeeBurn: input.blob,
    priorityFee: input.priority,
    l2Rent: input.l2Rent,
    l2CalldataFee: input.l2Rent / 4,
    l2BlobFee: input.l2Rent / 2,
    l2VerificationFee: input.l2Rent / 4,
  };
}

function emptyPeriod(): DunePeriodValues {
  return {
    grossL1Fees: null,
    baseFeeBurn: null,
    blobFeeBurn: null,
    priorityFee: null,
    l2Rent: null,
    l2CalldataFee: null,
    l2BlobFee: null,
    l2VerificationFee: null,
  };
}

function validDune(
  overrides: Partial<DuneEthValueResult> = {},
): DuneEthValueResult {
  return {
    status: "valid",
    cutoffDay: "2026-07-29",
    current: feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }),
    previous: feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }),
    asOf: "2026-07-29T00:01:00Z",
    stale: false,
    executionId: "exec-1",
    gaps: [],
    ...overrides,
  };
}

function unavailableSupply(): CoinMetricsSupplyResult {
  return {
    status: "unavailable",
    points: [],
    latestBoundary: null,
    asOf: null,
    stale: false,
    gaps: [
      {
        code: "source_access_gap",
        detail: "Coin Metrics ETH supply response was unavailable or invalid.",
      },
    ],
  };
}

function unavailableDune(): DuneEthValueResult {
  return {
    status: "unavailable",
    cutoffDay: "2026-07-29",
    current: emptyPeriod(),
    previous: emptyPeriod(),
    asOf: null,
    stale: false,
    executionId: null,
    gaps: [
      {
        code: "source_access_gap",
        detail: "Dune execution was not authorized or DUNE_API_KEY was unavailable.",
      },
    ],
  };
}

function assemble(overrides: {
  lang?: "en" | "ko";
  includeRollups?: boolean;
  byokActive?: string[];
  supply?: CoinMetricsSupplyResult;
  dune?: DuneEthValueResult;
} = {}) {
  return getEthValueCapture({
    window: "7d",
    lang: overrides.lang ?? "en",
    includeRollups: overrides.includeRollups ?? false,
    byokActive: overrides.byokActive ?? ["dune"],
    now: new Date("2026-07-29T12:00:00Z"),
    supply: overrides.supply ?? validSupply(),
    dune: overrides.dune ?? validDune(),
  });
}

describe("getEthValueCapture", () => {
  it("assembles aligned current and previous windows", () => {
    const result = assemble();

    expect(result.status).toBe("complete");
    expect(result.cutoff_day).toBe("2026-07-29");
    expect(result.metrics.net_issuance_eth).toMatchObject({
      current: -1,
      previous: 2,
    });
    expect(result.metrics.gross_l1_fees_eth.current).toBe(15);
    expect(result.metrics.total_burn_eth.current).toBe(12);
    expect(result.metrics.consensus_issuance_eth.current).toBe(11);
    expect(result.ratios.blob_share_of_total_burn.current).toBeCloseTo(2 / 12);
    expect(result.ratios.l2_rent_share_of_l1_fees.current).toBeCloseTo(4 / 15);
    expect(result.confidence).toBe(1);
    expect(EthValueCaptureSnapshotSchema.parse(result)).toEqual(result);
  });

  it("blocks consensus issuance when source cutoffs do not match", () => {
    const result = assemble({
      dune: validDune({ cutoffDay: "2026-07-28" }),
    });

    expect(result.status).toBe("partial");
    expect(result.cutoff_day).toBeNull();
    expect(result.metrics.net_issuance_eth.current).toBe(-1);
    expect(result.metrics.total_burn_eth.current).toBe(12);
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("period_mismatch");
    expect(result.gaps.map((gap) => gap.code)).toContain("derivation_blocked");
    expect(result.confidence).toBe(0.85);
  });

  it("returns Coin Metrics-only partial data without fabricating Dune metrics", () => {
    const result = assemble({ dune: unavailableDune(), byokActive: [] });

    expect(result.status).toBe("partial");
    expect(result.metrics.net_issuance_eth.current).toBe(-1);
    expect(result.metrics.base_fee_burn_eth.current).toBeNull();
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.sources).toEqual(["coinmetrics-community:SplyCur"]);
    expect(result.confidence).toBe(0.25);
  });

  it("returns Dune-only partial data without fabricating supply metrics", () => {
    const result = assemble({ supply: unavailableSupply() });

    expect(result.status).toBe("partial");
    expect(result.metrics.base_fee_burn_eth.current).toBe(10);
    expect(result.metrics.net_issuance_eth.current).toBeNull();
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.sources).toEqual([
      "dune:gas.fees",
      "dune:rollup_economics_ethereum.l1_fees",
    ]);
    expect(result.confidence).toBe(0.6);
  });

  it("returns unavailable when neither source has a core metric", () => {
    const result = assemble({
      supply: unavailableSupply(),
      dune: unavailableDune(),
      byokActive: [],
    });

    expect(result.status).toBe("unavailable");
    expect(result.cutoff_day).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.sources).toEqual([]);
    expect(result.as_of).toBe("2026-07-29T12:00:00.000Z");
  });

  it("keeps stale measurements visible but gives them no confidence weight", () => {
    const result = assemble({
      supply: validSupply({
        status: "stale",
        stale: true,
        gaps: [{ code: "source_stale", detail: "old supply" }],
      }),
      dune: validDune({
        status: "stale",
        stale: true,
        gaps: [{ code: "source_stale", detail: "old dune" }],
      }),
    });

    expect(result.status).toBe("partial");
    expect(result.metrics.net_issuance_eth.current).toBe(-1);
    expect(result.metrics.base_fee_burn_eth.current).toBe(10);
    expect(result.confidence).toBe(0);
    expect(result.stale_data).toEqual([
      "coinmetrics-community:stale",
      "dune:stale_cache",
    ]);
  });

  it("does not award fee coverage when one Dune component is missing", () => {
    const current = feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 });
    current.blobFeeBurn = null;
    current.grossL1Fees = null;
    const result = assemble({
      dune: validDune({
        current,
        gaps: [
          {
            code: "dune_schema_drift",
            detail: "Dune result rows did not satisfy the ETH value-capture schema.",
          },
        ],
      }),
    });

    expect(result.metrics.base_fee_burn_eth.current).toBe(10);
    expect(result.metrics.blob_fee_burn_eth.current).toBeNull();
    expect(result.metrics.gross_l1_fees_eth.current).toBeNull();
    expect(result.metrics.l2_rent_paid_eth.current).toBe(4);
    expect(result.confidence).toBe(0.5);
  });

  it("includes rollups only when requested", () => {
    const dune = validDune({
      rollups: [
        {
          name: "Base",
          current: { ...emptyPeriod(), l2Rent: 4, l2CalldataFee: 1, l2BlobFee: 2, l2VerificationFee: 1 },
          previous: { ...emptyPeriod(), l2Rent: 3, l2CalldataFee: 0.75, l2BlobFee: 1.5, l2VerificationFee: 0.75 },
        },
      ],
    });

    expect(assemble({ dune }).rollups).toBeUndefined();
    expect(assemble({ dune, includeRollups: true }).rollups).toEqual([
      {
        name: "Base",
        l1_rent_eth: {
          current: 4,
          previous: 3,
          delta: 1,
          pct_change: 1 / 3,
          unit: "ETH",
        },
        calldata_fee_eth: {
          current: 1,
          previous: 0.75,
          delta: 0.25,
          pct_change: 1 / 3,
          unit: "ETH",
        },
        blob_fee_eth: {
          current: 2,
          previous: 1.5,
          delta: 0.5,
          pct_change: 1 / 3,
          unit: "ETH",
        },
        verification_fee_eth: {
          current: 1,
          previous: 0.75,
          delta: 0.25,
          pct_change: 1 / 3,
          unit: "ETH",
        },
      },
    ]);
  });

  it("uses descriptive Korean copy and deduplicates capabilities and gaps", () => {
    const duplicatedGap = {
      code: "source_stale" as const,
      detail: "same gap",
    };
    const result = assemble({
      lang: "ko",
      byokActive: ["dune", "dune"],
      supply: validSupply({
        status: "stale",
        stale: true,
        gaps: [duplicatedGap, duplicatedGap],
      }),
    });

    expect(result.summary).toContain("일부");
    expect(result.summary).not.toMatch(/매수|매도|보유|가격 예측/);
    expect(result.capabilities.byok_active).toEqual(["dune"]);
    expect(result.gaps.filter((gap) => gap.detail === "same gap")).toHaveLength(1);
  });
});
