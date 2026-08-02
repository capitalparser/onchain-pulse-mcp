export const MIN_TELEGRAM_INTERVAL_MS = 60_000;
export const MAX_TELEGRAM_INTERVAL_MS = 86_400_000;

export function boundedTelegramIntervalMs(value: number, fallback = 900_000): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(MAX_TELEGRAM_INTERVAL_MS, Math.max(MIN_TELEGRAM_INTERVAL_MS, value));
}

export interface TelegramSignalTarget {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}

export interface TelegramAlertDaemonOptions {
  intervalMs: number;
  runCycle: () => Promise<unknown>;
  onCycle?: (result: unknown) => void;
  signalTarget?: TelegramSignalTarget;
}

export interface TelegramAlertDaemon {
  stop(): void;
  done: Promise<void>;
}

/**
 * Runs one cycle immediately and schedules the next only after the current
 * cycle settles. This intentionally uses a timeout chain instead of
 * setInterval so a slow provider or Telegram transport cannot overlap itself.
 */
export function startTelegramAlertDaemon(options: TelegramAlertDaemonOptions): TelegramAlertDaemon {
  const intervalMs = boundedTelegramIntervalMs(options.intervalMs);
  const signalTarget = options.signalTarget;
  let stopped = false;
  let inFlight = false;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });

  const stopFromSignal = () => stop();
  const finish = () => {
    if (completed || inFlight) return;
    completed = true;
    if (timer !== undefined) clearTimeout(timer);
    if (signalTarget !== undefined) {
      signalTarget.removeListener("SIGINT", stopFromSignal);
      signalTarget.removeListener("SIGTERM", stopFromSignal);
    }
    resolveDone();
  };

  const schedule = () => {
    if (stopped) {
      finish();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void cycle();
    }, intervalMs);
  };

  const cycle = async () => {
    if (stopped || inFlight) {
      finish();
      return;
    }
    inFlight = true;
    try {
      const result = await options.runCycle();
      options.onCycle?.(result);
    } catch {
      // runCycle is expected to return bounded public failures. Keep the
      // daemon alive even if an injected cycle violates that contract.
    } finally {
      inFlight = false;
      schedule();
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    finish();
  };

  if (signalTarget !== undefined) {
    signalTarget.once("SIGINT", stopFromSignal);
    signalTarget.once("SIGTERM", stopFromSignal);
  }
  void cycle();

  return { stop, done };
}
