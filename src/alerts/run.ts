import { evaluateEthValueAlert } from "./evaluator.js";
import { notifyTelegram, type TelegramNotifyResult } from "./telegram.js";
import { loadTelegramAlertState, saveTelegramAlertState, type TelegramAlertState } from "./state.js";
import type { DashboardSnapshotProvider } from "../dashboard/server.js";
import type { EnvConfig } from "../env.js";

export interface RunTelegramAlertOptions {
  env: EnvConfig;
  provider: DashboardSnapshotProvider;
  fetchImpl?: typeof fetch;
}

export type RunTelegramAlertResult = TelegramNotifyResult | {
  status: "failed";
  delivered: false;
  reason: "snapshot_unavailable" | "state_unavailable";
} | {
  status: "duplicate";
  delivered: false;
  fingerprint: string;
};

async function waitForSnapshot(
  provider: DashboardSnapshotProvider,
  timeoutMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider("30d"),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("snapshot_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runTelegramAlert(options: RunTelegramAlertOptions): Promise<RunTelegramAlertResult> {
  const telegram = options.env.telegram;
  if (!telegram?.enabled || !telegram.botToken || !telegram.chatId) {
    return { status: "disabled", delivered: false };
  }

  let state: TelegramAlertState;
  try {
    state = await loadTelegramAlertState(telegram.statePath) ?? { version: 1 };
  } catch {
    return { status: "failed", delivered: false, reason: "state_unavailable" };
  }

  let current;
  try {
    current = await waitForSnapshot(
      options.provider,
      telegram.snapshotTimeoutMs ?? 30_000,
    );
  } catch {
    return { status: "failed", delivered: false, reason: "snapshot_unavailable" };
  }

  const alert = state.pendingAlert ?? evaluateEthValueAlert({ current, previous: state.previousSnapshot });
  if (alert.shouldNotify && state.lastDeliveredFingerprint === alert.fingerprint) {
    const next: TelegramAlertState = {
      version: 1,
      previousSnapshot: current,
      lastDeliveredFingerprint: state.lastDeliveredFingerprint,
    };
    try {
      await saveTelegramAlertState(telegram.statePath, next);
    } catch {
      return { status: "failed", delivered: false, reason: "state_unavailable" };
    }
    return { status: "duplicate", delivered: false, fingerprint: alert.fingerprint };
  }

  const result = await notifyTelegram({
      enabled: true,
      token: telegram.botToken,
      chatId: telegram.chatId,
      timeoutMs: telegram.timeoutMs,
      alert,
      fetchImpl: options.fetchImpl,
    });
  const next: TelegramAlertState = result.status === "sent"
    ? {
      version: 1,
      previousSnapshot: current,
      lastDeliveredFingerprint: result.fingerprint,
    }
    : result.status === "failed" && alert.shouldNotify
      ? {
        version: 1,
        previousSnapshot: current,
        lastDeliveredFingerprint: state.lastDeliveredFingerprint,
        pendingAlert: alert,
      }
      : {
        version: 1,
        previousSnapshot: current,
        lastDeliveredFingerprint: state.lastDeliveredFingerprint,
        pendingAlert: state.pendingAlert,
      };
  try {
    await saveTelegramAlertState(telegram.statePath, next);
  } catch {
    return { status: "failed", delivered: false, reason: "state_unavailable" };
  }
  return result;
}
