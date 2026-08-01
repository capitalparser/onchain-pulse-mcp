import { evaluateEthValueAlert } from "./evaluator.js";
import { notifyTelegram, type TelegramNotifyResult } from "./telegram.js";
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
  reason: "snapshot_unavailable";
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
  try {
    const current = await waitForSnapshot(
      options.provider,
      telegram.snapshotTimeoutMs ?? 30_000,
    );
    return await notifyTelegram({
      enabled: true,
      token: telegram.botToken,
      chatId: telegram.chatId,
      timeoutMs: telegram.timeoutMs,
      alert: evaluateEthValueAlert({ current }),
      fetchImpl: options.fetchImpl,
    });
  } catch {
    return { status: "failed", delivered: false, reason: "snapshot_unavailable" };
  }
}
