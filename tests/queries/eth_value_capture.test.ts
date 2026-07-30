import { describe, expect, it } from "vitest";
import { buildEthValueCaptureSql } from "../../src/queries/eth_value_capture.js";

describe("buildEthValueCaptureSql", () => {
  it("uses validated UTC literals and Dune partition filters", () => {
    const sql = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 30,
      includeRollups: false,
    });

    expect(sql).toContain("blockchain = 'ethereum'");
    expect(sql).toContain("block_month >=");
    expect(sql).toContain("block_date >=");
    expect(sql).toContain("block_date <");
    expect(sql).toContain("DATE '2026-07-29'");
    expect(sql).not.toContain("CURRENT_DATE");
    expect(sql).not.toContain("NOW()");
  });

  it("returns one stable output contract for current and previous periods", () => {
    const sql = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 7,
      includeRollups: false,
    });

    for (const alias of [
      "row_type",
      "rollup",
      "period",
      "gross_l1_fees_eth",
      "base_fee_burn_eth",
      "blob_fee_burn_eth",
      "priority_fee_eth",
      "l2_rent_paid_eth",
      "l2_calldata_fee_eth",
      "l2_blob_fee_eth",
      "l2_verification_fee_eth",
      "base_component_present",
      "blob_component_present",
      "priority_component_present",
      "l2_reconciled",
    ]) {
      expect(sql).toContain(alias);
    }
    expect(sql).toContain("('current')");
    expect(sql).toContain("('previous')");
  });

  it("retains component presence evidence instead of hiding missing keys", () => {
    const sql = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 7,
      includeRollups: false,
    });

    expect(sql).toContain("element_at(tx_fee_breakdown, 'base_fee') IS NOT NULL");
    expect(sql).toContain("element_at(tx_fee_breakdown, 'blob_fee') IS NOT NULL");
    expect(sql).toContain("element_at(tx_fee_breakdown, 'priority_fee') IS NOT NULL");
    expect(sql).toContain("base_component_present");
    expect(sql).toContain("blob_component_present");
    expect(sql).toContain("priority_component_present");
  });

  it("does not emit rollup rows unless requested", () => {
    const without = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 7,
      includeRollups: false,
    });
    const withRows = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 7,
      includeRollups: true,
    });

    expect(without).not.toContain("'rollup' AS row_type");
    expect(withRows).toContain("'rollup' AS row_type");
    expect(withRows).toContain("GROUP BY name, period");
  });

  it("reconciles L2 total rent to calldata, blob, and verification components", () => {
    const sql = buildEthValueCaptureSql({
      cutoffDay: "2026-07-29",
      windowDays: 30,
      includeRollups: true,
    });

    expect(sql).toContain("SUM(l1_fee_native)");
    expect(sql).toContain("SUM(data_fee_native)");
    expect(sql).toContain("SUM(blob_fee_native)");
    expect(sql).toContain("SUM(verification_fee_native)");
    expect(sql).toContain("<= 0.000000001");
  });

  it.each([
    "2026-7-29",
    "2026-02-31",
    "2026-07-29' OR TRUE --",
    "not-a-date",
  ])("rejects unsafe or impossible cutoff %s", (cutoffDay) => {
    expect(() =>
      buildEthValueCaptureSql({
        cutoffDay,
        windowDays: 30,
        includeRollups: false,
      }),
    ).toThrow("Invalid cutoffDay");
  });

  it("rejects unsupported runtime window values", () => {
    expect(() =>
      buildEthValueCaptureSql({
        cutoffDay: "2026-07-29",
        windowDays: 14 as 7,
        includeRollups: false,
      }),
    ).toThrow("Invalid windowDays");
  });
});
