import { describe, expect, it } from "vitest";
import { deriveDashboardSignal } from "../../src/dashboard/signal.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";

function snapshot(): EthValueCaptureSnapshot {
  return {
    summary: "Complete snapshot.",
    window: "30d",
    cutoff_day: "2026-08-01",
    as_of: "2026-08-01T00:00:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: { current: 15, previous: 12, delta: 3, pct_change: 0.25, unit: "ETH" },
      base_fee_burn_eth: { current: 10, previous: 8, delta: 2, pct_change: 0.25, unit: "ETH" },
      blob_fee_burn_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      priority_fee_eth: { current: 3, previous: 3, delta: 0, pct_change: 0, unit: "ETH" },
      total_burn_eth: { current: 12, previous: 9, delta: 3, pct_change: 1 / 3, unit: "ETH" },
      consensus_issuance_eth: { current: 11, previous: 11, delta: 0, pct_change: 0, unit: "ETH" },
      net_issuance_eth: { current: -1, previous: 2, delta: -3, pct_change: -1.5, unit: "ETH" },
      l2_rent_paid_eth: { current: 4, previous: 3, delta: 1, pct_change: 1 / 3, unit: "ETH" },
      l2_calldata_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
      l2_blob_fee_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      l2_verification_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
    },
    ratios: {
      blob_share_of_total_burn: { current: 2 / 12, previous: 1 / 9, delta: 2 / 12 - 1 / 9, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 4 / 15, previous: 3 / 12, delta: 4 / 15 - 3 / 12, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [{ source: "coinmetrics-community:SplyCur", role: "ETH total supply boundaries", as_of: "2026-08-01T00:00:00.000Z", stale: false }],
    stale_data: [],
    confidence: 0.75,
    capabilities: { byok_active: [], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
  };
}

describe("deriveDashboardSignal", () => {
  it("identifies protocol-capture improvement without claiming collateral or reserve demand", () => {
    const result = deriveDashboardSignal(snapshot());

    expect(result.judgment).toMatchObject({ key: "structural", label: "Protocol capture improving" });
    expect(result.judgment.detail).toMatch(/collateral and reserve-asset demand are not evaluated/);
    expect(result.evidence).toEqual([
      "30D ETH burn increased versus the prior 30D period.",
      "Blob burn increased, supporting more L2 settlement use reaching Ethereum.",
      "Net issuance turned negative, reducing ETH supply.",
    ]);
    expect(result.evidence).toHaveLength(3);
    expect(result.cards.map((card) => card.interpretation)).toEqual([
      "Burn increasing",
      "L2 settlement use strengthening",
      "Ethereum rent improving",
      "Supply decreasing",
    ]);
  });

  it("prioritizes a data warning when the snapshot is partial, stale, or gapped", () => {
    const incomplete = snapshot();
    incomplete.status = "partial";
    incomplete.stale_data = ["l2_rent_paid_eth"];
    incomplete.gaps = [{ code: "partial_result", detail: "L2 rent delayed" }];

    const result = deriveDashboardSignal(incomplete);

    expect(result.judgment).toMatchObject({ key: "data_warning", label: "Data warning" });
    expect(result.evidence).toEqual([
      "Snapshot is partial.",
      "1 stale data field needs review.",
      "1 reported data gap needs review.",
    ]);
  });

  it("marks missing metrics as unavailable rather than inferring a direction", () => {
    const incomplete = snapshot();
    incomplete.metrics.blob_fee_burn_eth = { current: null, previous: null, delta: null, pct_change: null, unit: "ETH" };

    const result = deriveDashboardSignal(incomplete);

    expect(result.cards[1]).toMatchObject({ interpretation: "Awaiting data", direction: "unknown", changeLabel: "No comparison" });
  });

  it("does not call a less-negative issuance structural improvement", () => {
    const weakening = snapshot();
    weakening.metrics.net_issuance_eth = { current: -1, previous: -2, delta: 1, pct_change: 0.5, unit: "ETH" };

    const result = deriveDashboardSignal(weakening);

    expect(result.judgment.key).toBe("neutral");
    expect(result.cards[3]).toMatchObject({ interpretation: "Supply reduction weakening", tone: "negative" });
    expect(result.evidence).toContain("Net issuance is negative, but supply reduction is not improving.");
  });

  it("surfaces a stale source as a data warning", () => {
    const staleSource = snapshot();
    const source = staleSource.source_status[0]!;
    staleSource.source_status[0] = {
      source: source.source,
      role: source.role,
      as_of: source.as_of,
      stale: true,
    };

    const result = deriveDashboardSignal(staleSource);

    expect(result.judgment.key).toBe("data_warning");
    expect(result.evidence).toContain("1 stale source needs review.");
  });

  it("renders zero-to-zero issuance as stable rather than increasing", () => {
    const stable = snapshot();
    stable.metrics.net_issuance_eth = { current: 0, previous: 0, delta: 0, pct_change: 0, unit: "ETH" };

    const result = deriveDashboardSignal(stable);

    expect(result.cards[3]).toMatchObject({ interpretation: "Supply stable", tone: "neutral" });
  });
});
