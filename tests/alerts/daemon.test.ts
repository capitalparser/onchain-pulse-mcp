import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startTelegramAlertDaemon } from "../../src/alerts/daemon.js";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("Telegram alert daemon", () => {
  afterEach(() => vi.useRealTimers());

  it("runs immediately and never overlaps a slow cycle", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const runCycle = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const daemon = startTelegramAlertDaemon({ intervalMs: 60_000, runCycle });

    expect(runCycle).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runCycle).toHaveBeenCalledTimes(1);

    release?.();
    await flush();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(runCycle).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runCycle).toHaveBeenCalledTimes(2);

    daemon.stop();
  });

  it("stops cleanly on SIGINT without scheduling another cycle", async () => {
    vi.useFakeTimers();
    const signals = new EventEmitter();
    const runCycle = vi.fn().mockResolvedValue(undefined);
    const daemon = startTelegramAlertDaemon({ intervalMs: 60_000, runCycle, signalTarget: signals });
    await flush();
    expect(runCycle).toHaveBeenCalledTimes(1);

    signals.emit("SIGINT");
    await daemon.done;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });
});
