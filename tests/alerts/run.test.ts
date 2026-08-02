import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runTelegramAlert } from "../../src/alerts/run.js";
import { loadTelegramAlertState, saveTelegramAlertState } from "../../src/alerts/state.js";
import type { EnvConfig } from "../../src/env.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";

const statePaths = new Set<string>();
const createStatePath = (suffix: string): string => {
  const path = `/tmp/opm-alert-${suffix}-${crypto.randomUUID()}.json`;
  statePaths.add(path);
  return path;
};

const env: EnvConfig = {
  byok: {}, lang: "en", historyPath: "/tmp/history.json",
  dashboard: { host: "127.0.0.1", port: 8787 },
  telegram: { enabled: false, timeoutMs: 100, snapshotTimeoutMs: 30_000, statePath: createStatePath("default"), intervalMs: 60_000, botToken: "secret", chatId: "123" },
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
  afterEach(async () => {
    await Promise.all([...statePaths].map((path) => rm(path, { force: true })));
    statePaths.clear();
  });

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
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody.text).toContain("Net issuance changed from nonnegative to negative.");
    expect(requestBody.text).not.toContain("confidence");
  });

  it("bounds snapshot-provider failures without serializing transport details", async () => {
    const result = await runTelegramAlert({
      env: { ...env, telegram: { ...env.telegram!, enabled: true } },
      provider: vi.fn().mockRejectedValue(new Error("https://rpc.example/secret-token")),
    });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "snapshot_unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("returns a bounded generic failure when the snapshot provider never settles", async () => {
    const pending = runTelegramAlert({
      env: { ...env, telegram: { ...env.telegram!, enabled: true, snapshotTimeoutMs: 5 } },
      provider: vi.fn(() => new Promise<EthValueCaptureSnapshot>(() => {})),
    });

    const result = await Promise.race([
      pending,
      new Promise<"test_deadline">((resolve) => setTimeout(() => resolve("test_deadline"), 30)),
    ]);

    expect(result).toEqual({ status: "failed", delivered: false, reason: "snapshot_unavailable" });
  });

  it("persists the previous snapshot so a later confidence drop becomes alertable", async () => {
    const statePath = createStatePath("previous");
    const quiet = snapshot();
    quiet.metrics.net_issuance_eth = { current: -1, previous: -1, delta: 0, pct_change: 0, unit: "ETH" };
    quiet.confidence = 0.9;
    const changed = { ...quiet, confidence: 0.2, as_of: "2026-08-01T00:05:00.000Z" };
    const enabledEnv = { ...env, telegram: { ...env.telegram!, enabled: true, statePath } };
    const firstFetch = vi.fn();

    await expect(runTelegramAlert({ env: enabledEnv, provider: vi.fn().mockResolvedValue(quiet), fetchImpl: firstFetch as unknown as typeof fetch })).resolves.toEqual({ status: "no_alert", delivered: false });
    expect((await loadTelegramAlertState(statePath))?.previousSnapshot?.confidence).toBe(0.9);

    const secondFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));
    await expect(runTelegramAlert({ env: enabledEnv, provider: vi.fn().mockResolvedValue(changed), fetchImpl: secondFetch as unknown as typeof fetch })).resolves.toMatchObject({ status: "sent", delivered: true });
    expect(String(secondFetch.mock.calls[0]?.[1]?.body)).toContain("Snapshot confidence declined from the prior snapshot.");
  });

  it("retries a pending failed alert and suppresses a fingerprint after delivery", async () => {
    const statePath = createStatePath("retry");
    const enabledEnv = { ...env, telegram: { ...env.telegram!, enabled: true, statePath } };
    const unavailable = vi.fn().mockResolvedValue(new Response("no", { status: 503 }));

    await expect(runTelegramAlert({ env: enabledEnv, provider: vi.fn().mockResolvedValue(snapshot()), fetchImpl: unavailable as unknown as typeof fetch })).resolves.toEqual({ status: "failed", delivered: false, reason: "http_error" });
    const pending = await loadTelegramAlertState(statePath);
    expect(pending?.pendingAlert?.shouldNotify).toBe(true);

    const delivered = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 8 } }), { status: 200 }));
    const sent = await runTelegramAlert({ env: enabledEnv, provider: vi.fn().mockResolvedValue(snapshot()), fetchImpl: delivered as unknown as typeof fetch });
    expect(sent).toMatchObject({ status: "sent", delivered: true });
    expect((await loadTelegramAlertState(statePath))?.pendingAlert).toBeUndefined();

    const suppressedTransport = vi.fn();
    await expect(runTelegramAlert({ env: enabledEnv, provider: vi.fn().mockResolvedValue(snapshot()), fetchImpl: suppressedTransport as unknown as typeof fetch })).resolves.toMatchObject({ status: "duplicate", delivered: false });
    expect(suppressedTransport).not.toHaveBeenCalled();
  });

  it("does not load state, fetch snapshots, or call Telegram while disabled", async () => {
    const statePath = createStatePath("disabled");
    await saveTelegramAlertState(statePath, { version: 1, lastDeliveredFingerprint: "a".repeat(64) });
    const provider = vi.fn();
    const fetchImpl = vi.fn();

    await expect(runTelegramAlert({ env: { ...env, telegram: { ...env.telegram!, enabled: false, statePath } }, provider: provider as never, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ status: "disabled", delivered: false });
    expect(provider).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
