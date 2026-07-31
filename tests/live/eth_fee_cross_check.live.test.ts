import { describe, expect, it } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthFeeRpc } from "../../src/adapters/eth_fee_rpc.js";
import { loadEnv } from "../../src/env.js";
import { EthFeeCrossCheckSnapshotSchema } from "../../src/eth_fee_cross_check/types.js";
import { getEthFeeCrossCheck } from "../../src/tools/get_eth_fee_cross_check.js";

const runLive = process.env.RUN_LIVE_ETH_RPC === "1" && Boolean(process.env.ETHEREUM_RPC_URL);

describe.skipIf(!runLive)("Ethereum execution RPC finalized fee cross-check", () => {
  it("verifies at most two finalized blocks through the adapter and public tool boundary", async () => {
    const env = loadEnv(process.env);
    const ctx = makeContext({ env });
    // Resolve the finalized head through the documented read-only Execution API,
    // then constrain the adapter evidence pass to two blocks at most.
    const headResponse = await ctx.fetch(env.ethereumRpcUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["finalized", false] }),
    });
    const headBody = await headResponse.json() as { result?: { number?: string } };
    const finalizedHead = Number(BigInt(headBody.result?.number ?? "-1"));
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
