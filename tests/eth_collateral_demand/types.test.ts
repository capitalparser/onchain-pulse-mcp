import { describe, expect, it } from "vitest";
import {
  EthCollateralDemandSnapshotSchema,
  type EthCollateralAssetEvidence,
  type EthCollateralDemandSnapshot,
} from "../../src/eth_collateral_demand/types.js";

const PERMANENT_GAPS = [
  "actual_user_collateral_not_indexed",
  "net_eth_locked_not_reconciled",
  "gross_collateral_not_reconciled",
  "rehypothecation_not_reconciled",
] as const;

function exact(weiFloor: string, remainder = "0", denominator = "1") {
  const wei = BigInt(weiFloor);
  const whole = wei / 1_000_000_000_000_000_000n;
  const fractional = wei % 1_000_000_000_000_000_000n;
  return {
    wei_floor: weiFloor,
    eth_floor: fractional === 0n
      ? whole.toString()
      : `${whole}.${fractional.toString().padStart(18, "0").replace(/0+$/, "")}`,
    remainder,
    denominator,
  };
}

const OFFICIAL_ASSETS = [
  ["WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  ["wstETH", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"],
  ["cbETH", "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704"],
  ["rETH", "0xae78736Cd615f374D3085123A210448E74Fc6393"],
  ["weETH", "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee"],
  ["osETH", "0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38"],
  ["ETHx", "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b"],
  ["rsETH", "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7"],
  ["tETH", "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8"],
  ["ezETH", "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110"],
] as const;

function asset(symbol: string, underlying: string): EthCollateralAssetEvidence {
  return {
    symbol,
    underlying,
    decimals: 18,
    active: true,
    collateral_enabled: symbol !== "cbETH",
    supplied_raw: "0",
    oracle_price: "1",
    eth_equivalent: exact("0"),
  };
}

function verifiedFixture(): EthCollateralDemandSnapshot {
  const assets = OFFICIAL_ASSETS.map(([symbol, underlying]) => asset(symbol, underlying));
  return {
    status: "verified",
    summary: "Aave V3 Ethereum Core supplied capacity was verified.",
    methodology: "eth-collateral-demand-aave-v3-v1",
    verified_block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
    metrics: {
      eth_family_supplied: exact("0"),
      collateral_eligible_supplied: exact("0"),
      actual_user_collateral: null,
      net_eth_locked: null,
      gross_eth_collateral: null,
      rehypothecation_ratio: null,
    },
    assets,
    identities: {
      supplied_equals_asset_sum: true,
      eligible_equals_enabled_asset_sum: true,
    },
    coverage: {
      aave_v3_ethereum_core_complete: true,
      user_collateral_usage_complete: false,
      net_eth_locked_complete: false,
      gross_collateral_complete: false,
      rehypothecation_complete: false,
    },
    sources: ["ethereum_rpc"],
    source_status: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
    gaps: PERMANENT_GAPS.map((code) => ({ code, detail: `${code} is not indexed.` })),
    capabilities: { ethereum_rpc_active: true },
  };
}

describe("EthCollateralDemandSnapshotSchema", () => {
  it("accepts a complete verified ten-asset capacity contract", () => {
    const candidate = verifiedFixture();
    expect(EthCollateralDemandSnapshotSchema.parse(candidate)).toEqual(candidate);
  });

  it("rejects a verified snapshot with incomplete asset coverage", () => {
    const candidate = verifiedFixture();
    candidate.assets.pop();
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a verified snapshot whose symbol is paired with another official underlying", () => {
    const candidate = verifiedFixture();
    candidate.assets[0] = { ...candidate.assets[0]!, underlying: OFFICIAL_ASSETS[1][1] };
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("bounds untrusted decimal strings before bigint arithmetic", () => {
    const candidate = verifiedFixture();
    candidate.assets[0] = { ...candidate.assets[0]!, supplied_raw: "9".repeat(79) };
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a verified snapshot that turns a broader unknown metric into zero", () => {
    const candidate = verifiedFixture() as unknown as { metrics: { actual_user_collateral: unknown } };
    candidate.metrics.actual_user_collateral = exact("0");
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a verified snapshot without all permanent coverage gaps", () => {
    const candidate = verifiedFixture();
    candidate.gaps.pop();
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    ["fabricated per-asset exact value", (candidate: EthCollateralDemandSnapshot) => {
      candidate.assets[0] = { ...candidate.assets[0]!, eth_equivalent: exact("1") };
    }],
    ["fabricated all-supply aggregate", (candidate: EthCollateralDemandSnapshot) => {
      candidate.metrics.eth_family_supplied = exact("1");
    }],
    ["fabricated eligible aggregate", (candidate: EthCollateralDemandSnapshot) => {
      candidate.metrics.collateral_eligible_supplied = exact("1");
    }],
    ["noncanonical aggregate denominator", (candidate: EthCollateralDemandSnapshot) => {
      candidate.metrics.eth_family_supplied = exact("0", "0", "2");
    }],
  ])("rejects a verified snapshot with %s even when identity flags are true", (_name, mutate) => {
    const candidate = verifiedFixture();
    mutate(candidate);
    expect(candidate.identities).toEqual({
      supplied_equals_asset_sum: true,
      eligible_equals_enabled_asset_sum: true,
    });
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    ["empty sources and provenance", (candidate: EthCollateralDemandSnapshot) => {
      candidate.sources = [];
      candidate.source_status = [];
    }],
    ["a source failure gap", (candidate: EthCollateralDemandSnapshot) => {
      candidate.gaps.push({ code: "rpc_access_gap", detail: "Access failed." });
    }],
    ["a stale gap without stale provenance", (candidate: EthCollateralDemandSnapshot) => {
      candidate.gaps.push({ code: "source_stale", detail: "Cached evidence." });
    }],
    ["stale provenance without a stale gap", (candidate: EthCollateralDemandSnapshot) => {
      candidate.source_status[0] = { ...candidate.source_status[0]!, stale: true };
    }],
    ["source status that is not named in sources", (candidate: EthCollateralDemandSnapshot) => {
      candidate.source_status[0] = { ...candidate.source_status[0]!, source: "other" };
    }],
  ])("rejects inconsistent verified provenance: %s", (_name, mutate) => {
    const candidate = verifiedFixture();
    mutate(candidate);
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("accepts unavailable evidence only when all observed values are absent", () => {
    const candidate: EthCollateralDemandSnapshot = {
      ...verifiedFixture(),
      status: "unavailable",
      verified_block: null,
      metrics: {
        eth_family_supplied: null,
        collateral_eligible_supplied: null,
        actual_user_collateral: null,
        net_eth_locked: null,
        gross_eth_collateral: null,
        rehypothecation_ratio: null,
      },
      assets: [],
      identities: null,
      coverage: {
        aave_v3_ethereum_core_complete: false,
        user_collateral_usage_complete: false,
        net_eth_locked_complete: false,
        gross_collateral_complete: false,
        rehypothecation_complete: false,
      },
      gaps: [{ code: "rpc_access_gap", detail: "The RPC did not provide complete evidence." }],
      capabilities: { ethereum_rpc_active: false },
    };
    expect(EthCollateralDemandSnapshotSchema.parse(candidate)).toEqual(candidate);
    candidate.metrics.eth_family_supplied = exact("0");
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects source_stale as the only unavailable failure gap", () => {
    const candidate: EthCollateralDemandSnapshot = {
      ...verifiedFixture(),
      status: "unavailable",
      verified_block: null,
      metrics: {
        eth_family_supplied: null,
        collateral_eligible_supplied: null,
        actual_user_collateral: null,
        net_eth_locked: null,
        gross_eth_collateral: null,
        rehypothecation_ratio: null,
      },
      assets: [],
      identities: null,
      coverage: {
        aave_v3_ethereum_core_complete: false,
        user_collateral_usage_complete: false,
        net_eth_locked_complete: false,
        gross_collateral_complete: false,
        rehypothecation_complete: false,
      },
      gaps: [{ code: "source_stale", detail: "Only cached evidence exists." }],
      capabilities: { ethereum_rpc_active: false },
    };
    expect(EthCollateralDemandSnapshotSchema.safeParse(candidate).success).toBe(false);
  });
});
