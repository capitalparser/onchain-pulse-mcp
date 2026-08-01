import { join } from "node:path";
import { LangSchema, type Lang } from "./types.js";

export interface BYOKKeys {
  nansen?: string;
  glassnode?: string;
  arkham?: string;
  coinglass?: string;
  cryptoquant?: string;
  laevitas?: string;
  dune?: string;
}

export interface EnvConfig {
  byok: BYOKKeys;
  lang: Lang;
  /** Internal-only Execution API transport endpoint. Never expose this value. */
  ethereumRpcUrl?: string;
  /** Internal-only Beacon API transport endpoint. Never expose this value. */
  ethereumBeaconApiUrl?: string;
  /**
   * Absolute, tilde-expanded path to the history ring buffer JSON file
   * (Task 8.5). Defaults to `${HOME}/.cache/onchain-pulse-mcp/history.json`;
   * overridable via `OPM_HISTORY_PATH`. Leading `~` is expanded against `HOME`.
   * Non-leading `~` is preserved as a literal character.
   */
  historyPath: string;
  /** Read-only dashboard binding. Defaults to loopback to avoid public exposure. */
  dashboard?: {
    host: string;
    port: number;
  };
  /** Internal-only Telegram transport configuration. Never serialize this object. */
  telegram?: {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
    timeoutMs: number;
  };
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function loadEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): EnvConfig {
  const langParse = LangSchema.safeParse(env.OPM_LANG);
  const home = env.HOME ?? "";
  const rawHistory = env.OPM_HISTORY_PATH ?? "~/.cache/onchain-pulse-mcp/history.json";
  const historyPath = rawHistory.startsWith("~/")
    ? join(home, rawHistory.slice(2))
    : rawHistory === "~"
      ? home
      : rawHistory;

  return {
    byok: {
      nansen: env.NANSEN_API_KEY,
      glassnode: env.GLASSNODE_API_KEY,
      arkham: env.ARKHAM_API_KEY,
      coinglass: env.COINGLASS_API_KEY,
      cryptoquant: env.CRYPTOQUANT_API_KEY,
      laevitas: env.LAEVITAS_API_KEY,
      dune: env.DUNE_API_KEY,
    },
    lang: langParse.success ? langParse.data : "en",
    ethereumRpcUrl: env.ETHEREUM_RPC_URL,
    ethereumBeaconApiUrl: env.ETHEREUM_BEACON_API_URL,
    historyPath,
    dashboard: {
      host: env.OPM_DASHBOARD_HOST || "127.0.0.1",
      port: boundedInteger(env.OPM_DASHBOARD_PORT, 8787, 1, 65_535),
    },
    telegram: {
      enabled: env.OPM_TELEGRAM_ALERTS_ENABLED === "1",
      botToken: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID,
      timeoutMs: boundedInteger(env.OPM_TELEGRAM_TIMEOUT_MS, 5_000, 1, 15_000),
    },
  };
}
