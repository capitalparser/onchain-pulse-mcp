import type { EthValueAlert } from "./evaluator.js";

export interface TelegramNotifyOptions {
  enabled: boolean;
  token?: string;
  chatId?: string;
  alert: EthValueAlert;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type TelegramNotifyResult =
  | { status: "disabled"; delivered: false }
  | { status: "no_alert"; delivered: false }
  | { status: "sent"; delivered: true; fingerprint: string }
  | { status: "failed"; delivered: false; reason: "timeout" | "transport_error" | "http_error" | "invalid_response" };

function messageFor(alert: EthValueAlert): string {
  return [
    "Ethereum value-capture alert",
    ...alert.events.map((event) => `- ${event.message}`),
    `Fingerprint: ${alert.fingerprint}`,
  ].join("\n");
}

export async function notifyTelegram(options: TelegramNotifyOptions): Promise<TelegramNotifyResult> {
  if (!options.enabled || !options.token || !options.chatId) {
    return { status: "disabled", delivered: false };
  }
  if (!options.alert.shouldNotify) {
    return { status: "no_alert", delivered: false };
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5_000, 1), 15_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `https://api.telegram.org/bot${options.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: options.chatId, text: messageFor(options.alert) }),
        signal: controller.signal,
      },
    );
    if (response.status !== 200) {
      return { status: "failed", delivered: false, reason: "http_error" };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: "failed", delivered: false, reason: "invalid_response" };
    }
    const result = typeof payload === "object" && payload !== null
      ? (payload as { result?: unknown }).result
      : undefined;
    if (
      typeof payload !== "object" ||
      payload === null ||
      (payload as { ok?: unknown }).ok !== true ||
      typeof result !== "object" ||
      result === null ||
      Array.isArray(result) ||
      !Number.isInteger((result as { message_id?: unknown }).message_id)
    ) {
      return { status: "failed", delivered: false, reason: "invalid_response" };
    }
    return { status: "sent", delivered: true, fingerprint: options.alert.fingerprint };
  } catch {
    return {
      status: "failed",
      delivered: false,
      reason: controller.signal.aborted ? "timeout" : "transport_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
