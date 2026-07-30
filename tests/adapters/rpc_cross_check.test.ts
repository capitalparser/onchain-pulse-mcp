import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { rpcCrossCheck } from "../../src/adapters/rpc_cross_check.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

describe("rpc_cross_check adapter", () => {
  it("returns an explicit rpc_gap when no wallets are supplied", async () => {
    const ctx = makeContext({ env });

    const r = await rpcCrossCheck.fetch({ chain: "base", tokenAddress: "0xtoken", wallets: [] }, ctx);

    expect(r.data.checked_wallets).toEqual([]);
    expect(r.stale_data).toEqual(["rpc_cross_check:no_wallets"]);
    expect(r.sources).toEqual([]);
  });

  it("caps wallet checks to the requested maximum", async () => {
    const ctx = makeContext({ env });

    const r = await rpcCrossCheck.fetch(
      {
        chain: "base",
        tokenAddress: "0xtoken",
        wallets: ["0x1", "0x2", "0x3"],
        maxWallets: 2,
      },
      ctx,
    );

    expect(r.data.checked_wallets).toEqual(["0x1", "0x2"]);
    expect(r.data.skipped_wallet_count).toBe(1);
    expect(r.stale_data).toEqual(["rpc_cross_check:network_not_configured"]);
  });
});
