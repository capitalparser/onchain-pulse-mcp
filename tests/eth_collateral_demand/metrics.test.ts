import { describe, expect, it } from "vitest";
import {
  EthCollateralDomainError,
  buildUnavailableEthCollateralSnapshot,
  buildVerifiedEthCollateralSnapshot,
  exactEthEquivalent,
  sumExactEthEquivalents,
} from "../../src/eth_collateral_demand/metrics.js";

const ASSETS = [
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

function reserves() {
  return ASSETS.map(([symbol, underlying], index) => ({
    symbol,
    underlying,
    decimals: 18,
    active: true,
    collateralEnabled: index !== 2,
    suppliedRaw: index === 0 ? 5n : index === 1 ? 3n : 0n,
    oraclePrice: index === 1 ? 3n : 2n,
  }));
}

describe("exact ETH-equivalent arithmetic", () => {
  it("preserves the non-divisible wei remainder without floating-point rounding", () => {
    expect(exactEthEquivalent(5n, 3n, 2n)).toEqual({
      wei_floor: "7",
      eth_floor: "0.000000000000000007",
      remainder: "1",
      denominator: "2",
    });
  });

  it("sums rational asset values before producing one aggregate floor", () => {
    expect(sumExactEthEquivalents([
      exactEthEquivalent(1n, 1n, 2n),
      exactEthEquivalent(1n, 1n, 3n),
    ])).toEqual({
      wei_floor: "0",
      eth_floor: "0",
      remainder: "5",
      denominator: "6",
    });
  });

  it("does not change a zero supplied reserve into missing or nonzero evidence", () => {
    expect(exactEthEquivalent(0n, 99n, 7n)).toEqual({
      wei_floor: "0",
      eth_floor: "0",
      remainder: "0",
      denominator: "7",
    });
  });
});

describe("verified collateral capacity", () => {
  it("separates eligible supply from all supplied capacity with exact identities", () => {
    const inputReserves = reserves();
    inputReserves[2] = { ...inputReserves[2]!, suppliedRaw: 1n };
    const snapshot = buildVerifiedEthCollateralSnapshot({
      block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
      reserves: inputReserves,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
    });

    expect(snapshot.metrics.eth_family_supplied).toEqual({
      wei_floor: "10", eth_floor: "0.00000000000000001", remainder: "1", denominator: "2",
    });
    expect(snapshot.metrics.collateral_eligible_supplied).toEqual({
      wei_floor: "9", eth_floor: "0.000000000000000009", remainder: "1", denominator: "2",
    });
    expect(snapshot.assets.find((asset) => asset.symbol === "cbETH")?.eth_equivalent).toEqual({
      wei_floor: "1", eth_floor: "0.000000000000000001", remainder: "0", denominator: "2",
    });
    expect(snapshot.metrics.actual_user_collateral).toBeNull();
    expect(snapshot.identities).toEqual({
      supplied_equals_asset_sum: true,
      eligible_equals_enabled_asset_sum: true,
    });
  });

  it("canonicalizes a divisible aggregate while retaining per-asset WETH-reference evidence", () => {
    const inputReserves = reserves();
    inputReserves[0] = { ...inputReserves[0]!, suppliedRaw: 2n, oraclePrice: 2n };
    inputReserves[1] = { ...inputReserves[1]!, suppliedRaw: 0n };
    const snapshot = buildVerifiedEthCollateralSnapshot({
      block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
      reserves: inputReserves,
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
    });
    expect(snapshot.assets.find((asset) => asset.symbol === "WETH")?.eth_equivalent).toEqual({
      wei_floor: "2", eth_floor: "0.000000000000000002", remainder: "0", denominator: "2",
    });
    expect(snapshot.metrics.eth_family_supplied).toEqual({
      wei_floor: "2", eth_floor: "0.000000000000000002", remainder: "0", denominator: "1",
    });
    expect(snapshot.metrics.collateral_eligible_supplied).toEqual(snapshot.metrics.eth_family_supplied);
  });

  it.each([
    ["missing reserve", (items: ReturnType<typeof reserves>) => items.slice(1)],
    ["duplicate reserve", (items: ReturnType<typeof reserves>) => [...items, items[0]!]],
    ["wrong decimals", (items: ReturnType<typeof reserves>) => [{ ...items[0]!, decimals: 6 }, ...items.slice(1)]],
    ["inactive reserve", (items: ReturnType<typeof reserves>) => [{ ...items[0]!, active: false }, ...items.slice(1)]],
    ["zero price", (items: ReturnType<typeof reserves>) => [{ ...items[0]!, oraclePrice: 0n }, ...items.slice(1)]],
    ["negative supply", (items: ReturnType<typeof reserves>) => [{ ...items[0]!, suppliedRaw: -1n }, ...items.slice(1)]],
  ])("rejects %s as complete aggregate evidence", (_name, mutate) => {
    expect(() => buildVerifiedEthCollateralSnapshot({
      block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
      reserves: mutate(reserves()),
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
    })).toThrow(EthCollateralDomainError);
  });

  it("builds a controlled stale verified fallback with matching provenance", () => {
    const snapshot = buildVerifiedEthCollateralSnapshot({
      block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
      reserves: reserves(),
      sources: ["ethereum_rpc"],
      sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
      stale: true,
    });
    expect(snapshot.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    expect(snapshot.source_status.every((status) => status.stale)).toBe(true);
  });

  it("maps malformed exported helper inputs to schema-drift errors", () => {
    try {
      exactEthEquivalent("5" as unknown as bigint, 3n, 2n);
      throw new Error("expected exactEthEquivalent to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EthCollateralDomainError);
      expect((error as EthCollateralDomainError).kind).toBe("schema_drift");
    }
    try {
      sumExactEthEquivalents([{ wei_floor: "0", eth_floor: "0", remainder: "0", denominator: "bad" } as unknown as ReturnType<typeof exactEthEquivalent>]);
      throw new Error("expected sumExactEthEquivalents to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EthCollateralDomainError);
      expect((error as EthCollateralDomainError).kind).toBe("schema_drift");
    }
  });

  it("distinguishes malformed reserve shape from a mismatched official reserve", () => {
    const malformed = reserves();
    malformed[0] = { ...malformed[0]!, underlying: "not-an-address" as never };
    const mismatched = reserves();
    mismatched[0] = { ...mismatched[0]!, underlying: ASSETS[1][1] };
    for (const [items, kind] of [[malformed, "schema_drift"], [mismatched, "evidence_mismatch"]] as const) {
      try {
        buildVerifiedEthCollateralSnapshot({
          block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
          reserves: items,
          sources: ["ethereum_rpc"],
          sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
        });
        throw new Error("expected invalid reserve evidence to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(EthCollateralDomainError);
        expect((error as EthCollateralDomainError).kind).toBe(kind);
      }
    }
  });

  it("maps malformed exported builder numeric evidence to schema drift", () => {
    const malformed = reserves();
    malformed[0] = { ...malformed[0]!, suppliedRaw: "bad" as never };
    try {
      buildVerifiedEthCollateralSnapshot({
        block: { number: 123, hash: `0x${"a".repeat(64)}`, timestamp: 1_700_000_000 },
        reserves: malformed,
        sources: ["ethereum_rpc"],
        sourceStatus: [{ source: "ethereum_rpc", role: "finalized reserve evidence", stale: false }],
      });
      throw new Error("expected malformed builder evidence to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EthCollateralDomainError);
      expect((error as EthCollateralDomainError).kind).toBe("schema_drift");
    }
  });
});

describe("unavailable collateral capacity", () => {
  it("refuses an unavailable snapshot without a bounded source failure", () => {
    expect(() => buildUnavailableEthCollateralSnapshot({
      summary: "Unavailable.",
      gaps: [],
    })).toThrow(EthCollateralDomainError);
  });

  it("returns no partial aggregate, asset, block, or identity evidence", () => {
    const snapshot = buildUnavailableEthCollateralSnapshot({
      summary: "Ethereum RPC is unavailable.",
      gaps: [{ code: "rpc_access_gap", detail: "RPC access failed." }],
    });
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.metrics.eth_family_supplied).toBeNull();
    expect(snapshot.assets).toEqual([]);
    expect(snapshot.verified_block).toBeNull();
    expect(snapshot.identities).toBeNull();
  });
});
