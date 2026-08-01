import { describe, expect, it, vi } from "vitest";
import { runTelegramAlert } from "../../src/alerts/run.js";
import type { EnvConfig } from "../../src/env.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";

const env: EnvConfig = {
  byok: {}, lang: "en", historyPath: "/tmp/history.json",
  dashboard: { host: "127.0.0.1", port: 8787 },
  telegram: { enabled: false, timeoutMs: 100, botToken: "secret", chatId: "123" },
};

function snapshot(): EthValueCaptureSnapshot {
  return {
    summary: "Snapshot.", window: "30d", cutoff_day: "2026-08-01", as_of: "2026-08-01T00:00:00.000Z", status: "complete",
    metrics: Object.fromEntries(["gross_l1_fees_eth", "base_fee_burn_eth", "blob_fee_burn_eth", "priority_fee_eth", "total_burn_eth", "consensus_issuance_eth", "net_issuance_eth", "l2_rent_paid_eth", "l2_calldata_fee_eth", "l2_blob_fee_eth", "l2_verification_fee_eth"].map((key) => [key, { current: key === "net_issuance_eth" ? -1 : 1, previous: key === "net_issuance_eth" ? 1 : 1, delta: 0, pct_change: 0, unit: "ETH" }])) as EthValueCaptureSnapshot["metrics"],
    ratios: { blob_share_of_total_burn: { current: 0, previous: 0, delta: 0, unit: "ratio" }, l2_rent_share_of_l1_fees: { current: 0, previous: 0, delta: 0, unit: "ratio" } },
    sources: [], source_status: [], stale_data: [], confidence: 1, capabilities: { byok_active: [], paid_sources_active: [] }, gaps: [], methodology_version: "eth-value-capture-v1",
  };
}

describe("runTelegramAlert", () => {
  it("does not read a snapshot or send a request until Telegram is explicitly enabled", async () => {
    const provider = vi.fn();
    const fetchImpl = vi.fn();

    await expect(runTelegramAlert({ env, provider: provider as never, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ status: "disabled", delivered: false });
    expect(provider).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the shared 30-day snapshot only when enabled", async () => {
    const provider = vi.fn().mockResolvedValue(snapshot());
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));

    const result = await runTelegramAlert({ env: { ...env, telegram: { ...env.telegram!, enabled: true } }, provider, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(provider).toHaveBeenCalledWith("30d");
    expect(result).toMatchObject({ status: "sent", delivered: true });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("bounds snapshot-provider failures without serializing transport details", async () => {
    const result = await runTelegramAlert({
      env: { ...env, telegram: { ...env.telegram!, enabled: true } },
      provider: vi.fn().mockRejectedValue(new Error("https://rpc.example/secret-token")),
    });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "snapshot_unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
