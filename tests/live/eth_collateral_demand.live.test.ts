import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthCollateralAaveV3 } from "../../src/adapters/eth_collateral_aave_v3.js";
import { loadEnv } from "../../src/env.js";
import { EthCollateralDemandSnapshotSchema, type ExactEthEquivalent } from "../../src/eth_collateral_demand/types.js";
import { getEthCollateralDemand } from "../../src/tools/get_eth_collateral_demand.js";

const runLive = process.env.RUN_LIVE_ETH_COLLATERAL === "1" && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

function fraction(value: ExactEthEquivalent): { numerator: bigint; denominator: bigint } {
  const denominator = BigInt(value.denominator);
  return {
    numerator: BigInt(value.wei_floor) * denominator + BigInt(value.remainder),
    denominator,
  };
}

describe.skipIf(!runLive)("Aave V3 Ethereum Core ETH-family collateral capacity", () => {
  it("reads one finalized verified snapshot with exact supplied identities and permanent null coverage", async () => {
    const env = loadEnv(process.env);
    const ctx = makeContext({ env });
    const snapshot = getEthCollateralDemand({
      lang: env.lang,
      adapterSnapshot: await fetchEthCollateralAaveV3({ rpcUrl: env.ethereumRpcUrl }, ctx),
    });

    expect(snapshot.status).toBe("verified");
    expect(snapshot.assets).toHaveLength(10);
    expect(snapshot.verified_block).not.toBeNull();
    expect(snapshot.identities).toEqual({
      supplied_equals_asset_sum: true,
      eligible_equals_enabled_asset_sum: true,
    });
    const wethPrice = BigInt(snapshot.assets.find((asset) => asset.symbol === "WETH")!.oracle_price);
    const suppliedRawNumerator = snapshot.assets.reduce(
      (total, asset) => total + BigInt(asset.supplied_raw) * BigInt(asset.oracle_price),
      0n,
    );
    const eligibleRawNumerator = snapshot.assets.filter((asset) => asset.collateral_enabled).reduce(
      (total, asset) => total + BigInt(asset.supplied_raw) * BigInt(asset.oracle_price),
      0n,
    );
    const supplied = fraction(snapshot.metrics.eth_family_supplied!);
    const eligible = fraction(snapshot.metrics.collateral_eligible_supplied!);
    expect(suppliedRawNumerator * supplied.denominator).toBe(supplied.numerator * wethPrice);
    expect(eligibleRawNumerator * eligible.denominator).toBe(eligible.numerator * wethPrice);
    expect(snapshot.metrics.actual_user_collateral).toBeNull();
    expect(snapshot.metrics.net_eth_locked).toBeNull();
    expect(snapshot.metrics.gross_eth_collateral).toBeNull();
    expect(snapshot.metrics.rehypothecation_ratio).toBeNull();
    expect(EthCollateralDemandSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  }, 30_000);
});
