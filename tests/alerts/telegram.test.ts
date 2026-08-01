import { describe, expect, it, vi } from "vitest";
import { evaluateEthValueAlert } from "../../src/alerts/evaluator.js";
import { notifyTelegram } from "../../src/alerts/telegram.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";

function snapshot(overrides: Partial<EthValueCaptureSnapshot> = {}): EthValueCaptureSnapshot {
  return {
    summary: "Snapshot.", window: "30d", cutoff_day: "2026-08-01", as_of: "2026-08-01T00:00:00.000Z", status: "complete",
    metrics: {
      gross_l1_fees_eth: { current: 15, previous: 12, delta: 3, pct_change: 0.25, unit: "ETH" },
      base_fee_burn_eth: { current: 10, previous: 8, delta: 2, pct_change: 0.25, unit: "ETH" },
      blob_fee_burn_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      priority_fee_eth: { current: 3, previous: 3, delta: 0, pct_change: 0, unit: "ETH" },
      total_burn_eth: { current: 12, previous: 9, delta: 3, pct_change: 1 / 3, unit: "ETH" },
      consensus_issuance_eth: { current: 11, previous: 11, delta: 0, pct_change: 0, unit: "ETH" },
      net_issuance_eth: { current: -1, previous: 2, delta: -3, pct_change: -1.5, unit: "ETH" },
      l2_rent_paid_eth: { current: 4, previous: 3, delta: 1, pct_change: 1 / 3, unit: "ETH" },
      l2_calldata_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
      l2_blob_fee_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      l2_verification_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
    },
    ratios: {
      blob_share_of_total_burn: { current: 2 / 12, previous: 1 / 9, delta: 2 / 12 - 1 / 9, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 4 / 15, previous: 3 / 12, delta: 4 / 15 - 3 / 12, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur"], source_status: [], stale_data: [], confidence: 0.75,
    capabilities: { byok_active: [], paid_sources_active: [] }, gaps: [], methodology_version: "eth-value-capture-v1",
    ...overrides,
  };
}

describe("ETH value-capture Telegram alerts", () => {
  it("evaluates regime, health, and confidence transitions with a timestamp-independent fingerprint", () => {
    const current = snapshot({ status: "partial", stale_data: ["coinmetrics-community:stale"], gaps: [{ code: "partial_result", detail: "Partial result." }], confidence: 0.3 });
    const previous = snapshot({ confidence: 0.8 });
    const later = { ...current, as_of: "2026-08-01T00:05:00.000Z" };

    const alert = evaluateEthValueAlert({ current, previous });
    const sameStateLater = evaluateEthValueAlert({ current: later, previous });

    expect(alert.events.map((event) => event.kind)).toEqual(["regime_transition", "source_health", "confidence_drop"]);
    expect(alert.fingerprint).toBe(sameStateLater.fingerprint);
    expect(alert.shouldNotify).toBe(true);
  });

  it("treats a stale declared source as degraded health even when aggregate fields are otherwise complete", () => {
    const current = snapshot({
      metrics: { ...snapshot().metrics, net_issuance_eth: { current: -1, previous: -1, delta: 0, pct_change: 0, unit: "ETH" } },
      source_status: [{ source: "coinmetrics-community:SplyCur", role: "supply", as_of: "2026-08-01T00:00:00.000Z", stale: true }],
    });

    const alert = evaluateEthValueAlert({ current });
    const differentStaleSource = evaluateEthValueAlert({
      current: { ...current, source_status: [{ ...current.source_status[0]!, source: "growthepie" }] },
    });

    expect(alert.events).toEqual([{ kind: "source_health", message: "Snapshot quality is partial, stale, or has reported gaps." }]);
    expect(alert.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(alert.fingerprint).not.toBe(differentStaleSource.fingerprint);
  });

  it("does no network work when Telegram is disabled or unconfigured", async () => {
    const fetchImpl = vi.fn();
    const alert = evaluateEthValueAlert({ current: snapshot() });

    await expect(notifyTelegram({ enabled: false, token: "secret-token", chatId: "chat", alert, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ status: "disabled", delivered: false });
    await expect(notifyTelegram({ enabled: true, token: undefined, chatId: "chat", alert, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ status: "disabled", delivered: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts an opted-in alert and redacts transport secrets from all public results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));
    const alert = evaluateEthValueAlert({ current: snapshot() });

    const result = await notifyTelegram({ enabled: true, token: "super-secret-token", chatId: "123", alert, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ status: "sent", delivered: true, fingerprint: alert.fingerprint });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("bounds malformed Telegram responses behind a generic failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    const result = await notifyTelegram({ enabled: true, token: "super-secret-token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "invalid_response" });
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });

  it("does not send when no alert is due, and bounds non-2xx and timeout failures", async () => {
    const noAlertFetch = vi.fn();
    const quietAlert = evaluateEthValueAlert({ current: snapshot({ metrics: { ...snapshot().metrics, net_issuance_eth: { current: -1, previous: -1, delta: 0, pct_change: 0, unit: "ETH" } } }) });
    await expect(notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: quietAlert, fetchImpl: noAlertFetch as unknown as typeof fetch })).resolves.toEqual({ status: "no_alert", delivered: false });
    expect(noAlertFetch).not.toHaveBeenCalled();

    const httpFailure = await notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: vi.fn().mockResolvedValue(new Response("no", { status: 429 })) as unknown as typeof fetch });
    expect(httpFailure).toEqual({ status: "failed", delivered: false, reason: "http_error" });

    const timeoutFetch = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const timeout = await notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: timeoutFetch as unknown as typeof fetch, timeoutMs: 1 });
    expect(timeout).toEqual({ status: "failed", delivered: false, reason: "timeout" });
  });

  it("rejects a success response without Telegram's result payload", async () => {
    const result = await notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "invalid_response" });
  });

  it("rejects an object result without an integer message_id", async () => {
    const result = await notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })) as unknown as typeof fetch });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "invalid_response" });
  });

  it("rejects an array result even if it carries a message_id property", async () => {
    const result = await notifyTelegram({ enabled: true, token: "token", chatId: "123", alert: evaluateEthValueAlert({ current: snapshot() }), fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 })) as unknown as typeof fetch });

    expect(result).toEqual({ status: "failed", delivered: false, reason: "invalid_response" });
  });
});
