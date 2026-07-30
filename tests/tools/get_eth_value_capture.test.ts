import { describe, expect, it } from "vitest";
import type { CoinMetricsSupplyResult } from "../../src/adapters/eth_supply_coinmetrics.js";
import type {
  DuneEthValueResult,
  DunePeriodValues,
} from "../../src/adapters/eth_value_dune.js";
import type { GrowThePieRentResult } from "../../src/adapters/eth_value_growthepie.js";
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

function validGrowThePie(
  overrides: Partial<GrowThePieRentResult> = {},
): GrowThePieRentResult {
  return {
    status: "valid",
    cutoffDay: "2026-07-29",
    current: { l2Rent: 5 },
    previous: { l2Rent: 4 },
    asOf: "2026-07-28T00:00:00Z",
    stale: false,
    gaps: [],
    ...overrides,
  };
}

function unavailableGrowThePie(): GrowThePieRentResult {
  return {
    status: "unavailable",
    cutoffDay: "2026-07-29",
    current: { l2Rent: null },
    previous: { l2Rent: null },
    asOf: null,
    stale: false,
    gaps: [{
      code: "source_access_gap",
      detail: "GrowThePie L2 rent response was unavailable.",
    }],
  };
}

function assemble(overrides: {
  lang?: "en" | "ko";
  includeRollups?: boolean;
  byokActive?: string[];
  selectedCutoffDay?: string;
  supply?: CoinMetricsSupplyResult;
  dune?: DuneEthValueResult;
  growthepie?: GrowThePieRentResult;
} = {}) {
  return getEthValueCapture({
    window: "7d",
    lang: overrides.lang ?? "en",
    includeRollups: overrides.includeRollups ?? false,
    byokActive: overrides.byokActive ?? ["dune"],
    selectedCutoffDay: overrides.selectedCutoffDay ?? "2026-07-29",
    now: new Date("2026-07-29T12:00:00Z"),
    supply: overrides.supply ?? validSupply(),
    dune: overrides.dune ?? validDune(),
    growthepie: overrides.growthepie ?? validGrowThePie(),
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
    expect(result.cutoff_day).toBe("2026-07-29");
    expect(result.metrics.net_issuance_eth.current).toBe(-1);
    expect(result.metrics.total_burn_eth.current).toBeNull();
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.gaps.map((gap) => gap.code)).toContain("period_mismatch");
    expect(result.gaps.map((gap) => gap.code)).toContain("derivation_blocked");
    expect(result.confidence).toBe(0.4);
  });

  it("returns Coin Metrics-only partial data without fabricating Dune metrics", () => {
    const result = assemble({
      dune: unavailableDune(),
      growthepie: unavailableGrowThePie(),
      byokActive: [],
    });

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
      growthepie: unavailableGrowThePie(),
      byokActive: [],
    });

    expect(result.status).toBe("unavailable");
    expect(result.cutoff_day).toBe("2026-07-29");
    expect(result.confidence).toBe(0);
    expect(result.sources).toEqual([]);
    expect(result.as_of).toBe("2026-07-29T12:00:00.000Z");
  });

  it("uses the authoritative fallback cutoff for GrowThePie when Coin Metrics and Dune are unavailable", () => {
    const result = assemble({
      selectedCutoffDay: "2026-07-31",
      supply: unavailableSupply(),
      dune: unavailableDune(),
      growthepie: validGrowThePie({ cutoffDay: "2026-07-31" }),
      byokActive: [],
    });

    expect(result.cutoff_day).toBe("2026-07-31");
    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.sources).toEqual(["growthepie:rent_paid_eth"]);
    expect(result.confidence).toBe(0.15);
  });

  it("uses GrowThePie aligned to the authoritative cutoff when Dune is mismatched", () => {
    const result = assemble({
      selectedCutoffDay: "2026-07-29",
      dune: validDune({ cutoffDay: "2026-07-28" }),
      growthepie: validGrowThePie({ cutoffDay: "2026-07-29" }),
    });

    expect(result.cutoff_day).toBe("2026-07-29");
    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.metrics.consensus_issuance_eth.current).toBeNull();
    expect(result.sources).toContain("growthepie:rent_paid_eth");
    expect(result.gaps.map((gap) => gap.code)).toContain("period_mismatch");
  });

  it("prefers a complete Dune rent pair over GrowThePie", () => {
    const result = assemble({
      dune: validDune(),
      growthepie: validGrowThePie(),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 4,
      previous: 3,
    });
    expect(result.sources).toEqual([
      "coinmetrics-community:SplyCur",
      "dune:gas.fees",
      "dune:rollup_economics_ethereum.l1_fees",
    ]);
  });

  it("uses one complete GrowThePie pair when Dune rent is incomplete", () => {
    const result = assemble({
      dune: validDune({
        current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
        previous: feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }),
      }),
      growthepie: validGrowThePie(),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.sources).toEqual([
      "coinmetrics-community:SplyCur",
      "dune:gas.fees",
      "dune:rollup_economics_ethereum.l1_fees",
      "growthepie:rent_paid_eth",
    ]);
  });

  it("preserves aligned Dune decomposition when GrowThePie supplies the rent pair", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });
    const result = assemble({ dune });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.metrics.l2_calldata_fee_eth).toMatchObject({
      current: 1,
      previous: 0.75,
    });
    expect(result.metrics.l2_blob_fee_eth).toMatchObject({
      current: 2,
      previous: 1.5,
    });
    expect(result.metrics.l2_verification_fee_eth).toMatchObject({
      current: 1,
      previous: 0.75,
    });
    expect(result.sources).toContain("dune:rollup_economics_ethereum.l1_fees");
    expect(result.sources).toContain("growthepie:rent_paid_eth");
    expect(result.source_status).toContainEqual({
      source: "dune",
      role: "Ethereum fees and L2 decomposition",
      as_of: "2026-07-29T00:01:00Z",
      stale: false,
    });
    expect(result.confidence).toBe(1);
  });

  it("falls back to finite GrowThePie rent when Dune rent is NaN", () => {
    const result = assemble({
      dune: validDune({
        current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: Number.NaN },
      }),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.sources).toContain("growthepie:rent_paid_eth");
  });

  it("falls back to finite GrowThePie rent when Dune rent is Infinity", () => {
    const result = assemble({
      dune: validDune({
        previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: Number.POSITIVE_INFINITY },
      }),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 5,
      previous: 4,
    });
    expect(result.sources).toContain("growthepie:rent_paid_eth");
  });

  it("prefers stale-but-usable complete Dune rent without fresh rent confidence", () => {
    const result = assemble({
      dune: validDune({ status: "stale", stale: true }),
      growthepie: validGrowThePie(),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: 4,
      previous: 3,
    });
    expect(result.sources).toContain("dune:rollup_economics_ethereum.l1_fees");
    expect(result.sources).not.toContain("growthepie:rent_paid_eth");
    expect(result.confidence).toBe(0.25);
  });

  it("marks rent unavailable when the fallback cutoff does not match the snapshot", () => {
    const result = assemble({
      dune: validDune({
        current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
        previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
      }),
      growthepie: validGrowThePie({ cutoffDay: "2026-07-28" }),
    });

    expect(result.metrics.l2_rent_paid_eth).toMatchObject({
      current: null,
      previous: null,
    });
    expect(result.sources).not.toContain("growthepie:rent_paid_eth");
    expect(result.gaps.map((gap) => gap.code)).toContain("period_mismatch");
  });

  it("suppresses optional GrowThePie gaps when Dune has a complete rent pair", () => {
    const result = assemble({ growthepie: unavailableGrowThePie() });

    expect(result.metrics.l2_rent_paid_eth.current).toBe(4);
    expect(result.sources).toContain("dune:rollup_economics_ethereum.l1_fees");
    expect(result.gaps).not.toContainEqual({
      code: "source_access_gap",
      detail: "GrowThePie L2 rent response was unavailable.",
    });
  });

  it("keeps GrowThePie gaps visible when Dune does not have a complete rent pair", () => {
    const result = assemble({
      dune: validDune({
        current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
        previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
      }),
      growthepie: unavailableGrowThePie(),
    });

    expect(result.metrics.l2_rent_paid_eth.current).toBeNull();
    expect(result.sources).toContain("dune:gas.fees");
    expect(result.sources).not.toContain("growthepie:rent_paid_eth");
    expect(result.gaps).toContainEqual({
      code: "source_access_gap",
      detail: "GrowThePie L2 rent response was unavailable.",
    });
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

  it("uses GrowThePie rollups as rent-only window metrics", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });
    const growthepie = validGrowThePie({
      rollups: [{
        name: "Base",
        current: { l2Rent: 5 },
        previous: { l2Rent: 4 },
      }],
    });

    expect(assemble({ dune, growthepie, includeRollups: true }).rollups).toEqual([
      {
        name: "Base",
        l1_rent_eth: { current: 5, previous: 4, delta: 1, pct_change: 0.25, unit: "ETH" },
        calldata_fee_eth: { current: null, previous: null, delta: null, pct_change: null, unit: "ETH" },
        blob_fee_eth: { current: null, previous: null, delta: null, pct_change: null, unit: "ETH" },
        verification_fee_eth: { current: null, previous: null, delta: null, pct_change: null, unit: "ETH" },
      },
    ]);
  });

  it("keeps Dune-selected rollups unchanged without merging GrowThePie rollups", () => {
    const dune = validDune({
      rollups: [{
        name: "Base",
        current: { ...emptyPeriod(), l2Rent: 4, l2CalldataFee: 1, l2BlobFee: 2, l2VerificationFee: 1 },
        previous: { ...emptyPeriod(), l2Rent: 3, l2CalldataFee: 0.75, l2BlobFee: 1.5, l2VerificationFee: 0.75 },
      }],
    });
    const growthepie = validGrowThePie({
      rollups: [{
        name: "Optimism",
        current: { l2Rent: 5 },
        previous: { l2Rent: 4 },
      }],
    });

    expect(assemble({ dune, growthepie, includeRollups: true }).rollups?.map(({ name }) => name))
      .toEqual(["Base"]);
  });

  it("omits GrowThePie rollups when rollups are not requested", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });
    const growthepie = validGrowThePie({
      rollups: [{ name: "Base", current: { l2Rent: 5 }, previous: { l2Rent: 4 } }],
    });

    expect(assemble({ dune, growthepie })).not.toHaveProperty("rollups");
  });

  it("records selected GrowThePie provenance with the L2 rent role", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });
    const result = assemble({ dune });

    expect(result.sources).toContain("growthepie:rent_paid_eth");
    expect(result.source_status).toContainEqual({
      source: "growthepie",
      role: "L2 rent paid to Ethereum",
      as_of: "2026-07-28T00:00:00Z",
      stale: false,
    });
  });

  it("marks stale selected GrowThePie rent as stale cache data", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });
    const result = assemble({
      dune,
      growthepie: validGrowThePie({ status: "stale", stale: true }),
    });

    expect(result.metrics.l2_rent_paid_eth.current).toBe(5);
    expect(result.stale_data).toContain("growthepie:stale_cache");
  });

  it("uses selected GrowThePie rent in the L2-to-L1 fee ratio", () => {
    const dune = validDune({
      current: { ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }), l2Rent: null },
      previous: { ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }), l2Rent: null },
    });

    expect(assemble({ dune }).ratios.l2_rent_share_of_l1_fees.current).toBeCloseTo(1 / 3);
  });

  it("does not derive a rent ratio across misaligned source boundaries", () => {
    const result = assemble({ dune: validDune({ cutoffDay: "2026-07-28" }) });

    expect(result.ratios.l2_rent_share_of_l1_fees.current).toBeNull();
    expect(result.ratios.l2_rent_share_of_l1_fees.previous).toBeNull();
  });

  it("weights fresh GrowThePie rent separately from missing Dune breakdown evidence", () => {
    const dune = validDune({
      current: {
        ...feePeriod({ base: 10, blob: 2, priority: 3, l2Rent: 4 }),
        l2Rent: null,
        l2CalldataFee: null,
        l2BlobFee: null,
        l2VerificationFee: null,
      },
      previous: {
        ...feePeriod({ base: 8, blob: 1, priority: 2, l2Rent: 3 }),
        l2Rent: null,
        l2CalldataFee: null,
        l2BlobFee: null,
        l2VerificationFee: null,
      },
    });

    expect(assemble({ dune }).confidence).toBe(0.9);
  });

  it("retains full confidence for fresh complete Dune fee, rent, decomposition, supply, and consensus evidence", () => {
    expect(assemble().confidence).toBe(1);
  });

  it("awards only supply and GrowThePie rent confidence without Dune fees", () => {
    const result = assemble({ dune: unavailableDune() });

    expect(result.metrics.l2_rent_paid_eth.current).toBe(5);
    expect(result.confidence).toBe(0.4);
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
