import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthSupplyHistory } from "../../src/adapters/eth_supply_coinmetrics.js";
import { fetchDuneEthValue } from "../../src/adapters/eth_value_dune.js";
import { fetchGrowThePieRent } from "../../src/adapters/eth_value_growthepie.js";
import { loadEnv } from "../../src/env.js";

const runLive = process.env.RUN_LIVE_ETH_VALUE === "1";
const runLiveDune =
  runLive &&
  process.env.RUN_LIVE_DUNE_ETH_VALUE === "1" &&
  Boolean(process.env.DUNE_API_KEY);

function expectNonnegative(values: Array<number | null>): void {
  for (const value of values) {
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

describe.skipIf(!runLive)("ETH value capture live sources", () => {
  it("reads fresh exact ETH supply boundaries from Coin Metrics", async () => {
    const result = await fetchEthSupplyHistory(
      { windowDays: 7, now: new Date() },
      makeContext({ env: loadEnv(process.env) }),
    );

    expect(result.status).toBe("valid");
    expect(result.latestBoundary).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.points.length).toBeGreaterThanOrEqual(15);
    expect(result.gaps).toEqual([]);
  }, 30_000);

  it("reads aligned free L2 rent windows from GrowThePie", async () => {
    const now = new Date();
    const ctx = makeContext({ env: loadEnv(process.env) });
    const supply = await fetchEthSupplyHistory({ windowDays: 7, now }, ctx);
    expect(supply.latestBoundary).not.toBeNull();

    const result = await fetchGrowThePieRent(
      {
        cutoffDay: supply.latestBoundary!,
        windowDays: 7,
        includeRollups: true,
      },
      ctx,
    );

    expect(result.status).toBe("valid");
    expect(result.current.l2Rent).not.toBeNull();
    expect(result.previous.l2Rent).not.toBeNull();
    expect(result.current.l2Rent).toBeGreaterThanOrEqual(0);
    expect(result.previous.l2Rent).toBeGreaterThanOrEqual(0);
    expect(result.rollups?.length).toBeGreaterThan(0);
  }, 30_000);

  it.skipIf(!runLiveDune)(
    "executes one explicitly authorized Dune summary query",
    async () => {
      const env = loadEnv(process.env);
      const ctx = makeContext({ env });
      const supply = await fetchEthSupplyHistory(
        { windowDays: 7, now: new Date() },
        ctx,
      );
      expect(supply.latestBoundary).not.toBeNull();

      const result = await fetchDuneEthValue(
        {
          cutoffDay: supply.latestBoundary!,
          windowDays: 7,
          includeRollups: false,
          allowExecution: true,
        },
        ctx,
        { timeoutMs: 90_000 },
      );

      expect(result.status).toBe("valid");
      expect(result.gaps).toEqual([]);
      for (const period of [result.current, result.previous]) {
        expectNonnegative([
          period.grossL1Fees,
          period.baseFeeBurn,
          period.blobFeeBurn,
          period.priorityFee,
          period.l2Rent,
          period.l2CalldataFee,
          period.l2BlobFee,
          period.l2VerificationFee,
        ]);
        expect(period.grossL1Fees).toBeCloseTo(
          period.baseFeeBurn! + period.blobFeeBurn! + period.priorityFee!,
          9,
        );
        expect(period.l2Rent).toBeCloseTo(
          period.l2CalldataFee! +
            period.l2BlobFee! +
            period.l2VerificationFee!,
          9,
        );
      }
      expect(JSON.stringify(result)).not.toContain(process.env.DUNE_API_KEY!);
    },
    120_000,
  );
});
