import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthCollateralSpark } from "../../src/adapters/eth_collateral_spark.js";
import { loadEnv } from "../../src/env.js";
import { getSparkEthCollateralCapacity } from "../../src/tools/get_spark_eth_collateral_capacity.js";

const runLive = process.env.RUN_LIVE_SPARK_COLLATERAL === "1" && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

function fraction(value: { wei_floor: string; remainder: string; denominator: string }) {
  const denominator = BigInt(value.denominator);
  return { numerator: BigInt(value.wei_floor) * denominator + BigInt(value.remainder), denominator };
}

describe.skipIf(!runLive)("SparkLend Ethereum ETH-family supplied capacity", () => {
  it("reads one finalized Spark snapshot with exact identities and permanent null boundaries", async () => {
    const env = loadEnv(process.env);
    const snapshot = getSparkEthCollateralCapacity({
      lang: env.lang,
      adapterSnapshot: await fetchEthCollateralSpark({ rpcUrl: env.ethereumRpcUrl }, makeContext({ env })),
    });
    expect(snapshot.status).toBe("verified");
    expect(snapshot.assets).toHaveLength(6);
    expect(snapshot.identities).toEqual({ supplied_equals_asset_sum: true, eligible_equals_enabled_asset_sum: true });
    const wethPrice = BigInt(snapshot.assets.find((asset) => asset.symbol === "WETH")!.oracle_price);
    const suppliedRaw = snapshot.assets.reduce((total, asset) => total + BigInt(asset.supplied_raw) * BigInt(asset.oracle_price), 0n);
    const eligibleRaw = snapshot.assets.filter((asset) => asset.collateral_enabled).reduce((total, asset) => total + BigInt(asset.supplied_raw) * BigInt(asset.oracle_price), 0n);
    const supplied = fraction(snapshot.metrics.spark_eth_family_supplied!);
    const eligible = fraction(snapshot.metrics.spark_collateral_eligible_supplied!);
    expect(suppliedRaw * supplied.denominator).toBe(supplied.numerator * wethPrice);
    expect(eligibleRaw * eligible.denominator).toBe(eligible.numerator * wethPrice);
    expect(snapshot.metrics).toMatchObject({ combined_aave_spark_supplied: null, actual_user_collateral: null, net_eth_locked: null, gross_eth_collateral: null, rehypothecation_ratio: null });
  }, 30_000);
});
