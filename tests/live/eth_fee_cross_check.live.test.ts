import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthFeeRpc, fetchFinalizedEthFeeRpcHead } from "../../src/adapters/eth_fee_rpc.js";
import { loadEnv } from "../../src/env.js";
import { EthFeeCrossCheckSnapshotSchema } from "../../src/eth_fee_cross_check/types.js";
import { getEthFeeCrossCheck } from "../../src/tools/get_eth_fee_cross_check.js";

const runLive = process.env.RUN_LIVE_ETH_RPC === "1" && Boolean(process.env.ETHEREUM_RPC_URL?.trim());

describe.skipIf(!runLive)("Ethereum execution RPC finalized fee cross-check", () => {
  it("verifies at most two finalized blocks through the adapter and public tool boundary", async () => {
    const env = loadEnv(process.env);
    const ctx = makeContext({ env });
    const finalizedHead = await fetchFinalizedEthFeeRpcHead(env.ethereumRpcUrl, ctx);
    const startBlock = Math.max(0, finalizedHead - 1);
    const snapshot = getEthFeeCrossCheck({
      lang: env.lang,
      adapterSnapshot: await fetchEthFeeRpc(
        { startBlock, endBlock: finalizedHead, includeBlocks: true, rpcUrl: env.ethereumRpcUrl },
        ctx,
      ),
    });

    expect(snapshot.status).toBe("verified");
    expect(snapshot.verified_range?.block_count).toBeLessThanOrEqual(2);
    expect(snapshot.identities).toEqual({
      execution_equals_base_plus_priority: true,
      gross_equals_execution_plus_blob: true,
      total_burn_equals_base_plus_blob: true,
    });
    expect(EthFeeCrossCheckSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  }, 30_000);
});
