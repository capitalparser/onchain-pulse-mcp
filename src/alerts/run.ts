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

export async function runTelegramAlert(options: RunTelegramAlertOptions): Promise<RunTelegramAlertResult> {
  const telegram = options.env.telegram;
  if (!telegram?.enabled || !telegram.botToken || !telegram.chatId) {
    return { status: "disabled", delivered: false };
  }
  try {
    const current = await options.provider("30d");
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
