import { describe, expect, it } from "vitest";
import {
  LidoAccountingEvidenceSchema,
  LidoPooledEthBackingMetricsSchema,
  LidoPooledEthBackingSnapshotSchema,
} from "../../src/lido_pooled_eth_backing/types.js";

const UINT256_OVERFLOW = (1n << 256n).toString();

const permanentGaps = [
  "all_ethereum_native_staked_not_measured",
  "unique_net_eth_locked_not_reconciled",
  "defi_eth_collateral_not_indexed",
  "combined_aave_spark_lido_demand_not_reconciled",
  "rehypothecation_ratio_not_measurable",
].map((code) => ({ code, detail: code }));

function verified() {
  return {
    status: "verified",
    summary: "verified",
    methodology: "lido-pooled-eth-backing-v1",
    verified_block: { number: 1, hash: `0x${"a".repeat(64)}`, timestamp: 1 },
    accounting: {
      total_supply_wei: "37", total_pooled_ether_wei: "37", total_shares: "50", external_shares: "10", external_ether_wei: "7",
      buffered_ether_wei: "3", cl_validators_balance_at_last_report_wei: "20",
      cl_pending_balance_at_last_report_wei: "4", deposited_since_last_report_wei: "3",
      deposited_for_current_report_wei: "2",
    },
    metrics: {
      total_pooled_eth_wei: "37", internal_pooled_eth_wei: "30", external_pooled_eth_wei: "7",
      buffered_eth_wei: "3", cl_validators_balance_at_last_report_wei: "20",
      cl_pending_balance_at_last_report_wei: "4", deposited_since_last_report_wei: "3",
      deposited_for_current_report_wei: "2", steth_total_supply_wei: "37", total_shares: "50",
      internal_shares: "40", external_shares: "10", all_ethereum_native_staked_eth: null,
      unique_net_eth_locked: null, defi_eth_collateral: null, combined_aave_spark_lido_demand: null,
      rehypothecation_ratio: null,
    },
    identities: {
      internal_ether_equals_components: true, internal_shares_equals_total_minus_external: true,
      external_ether_equals_floor_share_ratio: true, total_pooled_ether_equals_internal_plus_external: true,
      total_supply_equals_total_pooled_ether: true,
    },
    coverage: {
      lido_v4_mainnet_accounting_complete: true, all_ethereum_native_staked_complete: false,
      unique_net_eth_locked_complete: false, defi_eth_collateral_complete: false,
      combined_aave_spark_lido_demand_complete: false, rehypothecation_ratio_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }],
    gaps: permanentGaps.map((gap) => ({ ...gap })),
    capabilities: { ethereum_rpc_active: true },
  };
}

function unavailable(code: "rpc_not_configured" | "rpc_access_gap" = "rpc_access_gap") {
  const configured = code !== "rpc_not_configured";
  return {
    status: "unavailable", summary: "unavailable", methodology: "lido-pooled-eth-backing-v1",
    verified_block: null, accounting: null,
    metrics: {
      total_pooled_eth_wei: null, internal_pooled_eth_wei: null, external_pooled_eth_wei: null,
      buffered_eth_wei: null, cl_validators_balance_at_last_report_wei: null,
      cl_pending_balance_at_last_report_wei: null, deposited_since_last_report_wei: null,
      deposited_for_current_report_wei: null, steth_total_supply_wei: null, total_shares: null,
      internal_shares: null, external_shares: null, all_ethereum_native_staked_eth: null,
      unique_net_eth_locked: null, defi_eth_collateral: null, combined_aave_spark_lido_demand: null,
      rehypothecation_ratio: null,
    },
    identities: null,
    coverage: {
      lido_v4_mainnet_accounting_complete: false, all_ethereum_native_staked_complete: false,
      unique_net_eth_locked_complete: false, defi_eth_collateral_complete: false,
      combined_aave_spark_lido_demand_complete: false, rehypothecation_ratio_complete: false,
    },
    sources: configured ? ["ethereum_rpc"] : [],
    source_status: configured ? [{ source: "ethereum_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }] : [],
    gaps: [{ code, detail: code }], capabilities: { ethereum_rpc_active: false },
  };
}

describe("LidoPooledEthBackingSnapshotSchema", () => {
  it("accepts complete exact verified Lido v4 accounting", () => {
    expect(LidoPooledEthBackingSnapshotSchema.safeParse(verified()).success).toBe(true);
  });

  it.each([
    ["a fabricated total supply", (value: ReturnType<typeof verified>) => { value.accounting.total_supply_wei = "41"; }],
    ["a noncanonical decimal", (value: ReturnType<typeof verified>) => { value.metrics.total_shares = "050"; }],
    ["a missing permanent gap", (value: ReturnType<typeof verified>) => { value.gaps = value.gaps.slice(1); }],
    ["a duplicate permanent gap", (value: ReturnType<typeof verified>) => { value.gaps.push({ ...value.gaps[0]! }); }],
    ["a broader metric claimed as known", (value: ReturnType<typeof verified>) => { (value.metrics as { all_ethereum_native_staked_eth: unknown }).all_ethereum_native_staked_eth = "1"; }],
    ["mismatched provenance", (value: ReturnType<typeof verified>) => { value.source_status = []; }],
    ["an unmarked stale source", (value: ReturnType<typeof verified>) => { value.source_status[0]!.stale = true; }],
    ["an impossible deposited-for-current amount", (value: ReturnType<typeof verified>) => { value.accounting.deposited_for_current_report_wei = "4"; }],
    ["a fabricated external floor", (value: ReturnType<typeof verified>) => { value.metrics.external_pooled_eth_wei = "11"; }],
    ["a raw external ether amount that differs from the share-ratio floor", (value: ReturnType<typeof verified>) => { value.accounting.external_ether_wei = "8"; }],
    ["a fabricated canonical source", (value: ReturnType<typeof verified>) => {
      value.sources = ["fabricated_rpc"];
      value.source_status = [{ source: "fabricated_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }];
    }],
    ["extra matching provenance", (value: ReturnType<typeof verified>) => {
      value.sources.push("extra_rpc");
      value.source_status.push({ source: "extra_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false });
    }],
    ["a noncanonical source role", (value: ReturnType<typeof verified>) => {
      value.source_status[0]!.role = "fabricated_role";
    }],
  ])("rejects %s", (_name, mutate) => {
    const value = verified();
    mutate(value);
    expect(LidoPooledEthBackingSnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a coherently marked stale verified snapshot", () => {
    const value = verified();
    value.source_status[0]!.stale = true;
    value.gaps.push({ code: "source_stale", detail: "stale" });
    expect(LidoPooledEthBackingSnapshotSchema.safeParse(value).success).toBe(true);
  });

  it("rejects 2^256 decimal strings from every public accounting and metric contract", () => {
    const value = verified();
    value.accounting.total_supply_wei = UINT256_OVERFLOW;
    value.metrics.total_pooled_eth_wei = UINT256_OVERFLOW;
    expect(LidoAccountingEvidenceSchema.safeParse(value.accounting).success).toBe(false);
    expect(LidoPooledEthBackingMetricsSchema.safeParse(value.metrics).success).toBe(false);
  });

  it("accepts a coherent configured unavailable snapshot", () => {
    expect(LidoPooledEthBackingSnapshotSchema.safeParse(unavailable()).success).toBe(true);
  });

  it.each([
    ["partial evidence", (() => { const value = unavailable(); (value.metrics as { total_pooled_eth_wei: string | null }).total_pooled_eth_wei = "1"; return value; })()],
    ["configured failure missing provenance", (() => { const value = unavailable(); value.sources = []; value.source_status = []; return value; })()],
    ["unconfigured failure with provenance", (() => { const value = unavailable("rpc_not_configured"); value.sources = ["ethereum_rpc"]; value.source_status = [{ source: "ethereum_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }]; return value; })()],
    ["configured failure with fabricated source", (() => { const value = unavailable(); value.sources = ["fabricated_rpc"]; value.source_status = [{ source: "fabricated_rpc", role: "lido_v4_finalized_accounting_evidence", stale: false }]; return value; })()],
    ["multiple failure gaps", (() => { const value = unavailable(); (value.gaps as Array<{ code: string; detail: string }>).push({ code: "rpc_schema_drift", detail: "extra" }); return value; })()],
  ])("rejects unavailable snapshot with %s", (_name, value) => {
    expect(LidoPooledEthBackingSnapshotSchema.safeParse(value).success).toBe(false);
  });

  it("safeParse never throws for malformed nested data", () => {
    expect(() => LidoPooledEthBackingSnapshotSchema.safeParse({ status: "verified", metrics: { total_pooled_eth_wei: { toString: null } } })).not.toThrow();
  });
});
