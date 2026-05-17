import { join } from "node:path";
import { LangSchema, type Lang } from "./types.js";

export interface BYOKKeys {
  nansen?: string;
  glassnode?: string;
  arkham?: string;
  coinglass?: string;
  cryptoquant?: string;
  laevitas?: string;
}

export interface EnvConfig {
  byok: BYOKKeys;
  lang: Lang;
  /**
   * Absolute, tilde-expanded path to the history ring buffer JSON file
   * (Task 8.5). Defaults to `${HOME}/.cache/onchain-pulse-mcp/history.json`;
   * overridable via `OPM_HISTORY_PATH`. Leading `~` is expanded against `HOME`.
   * Non-leading `~` is preserved as a literal character.
   */
  historyPath: string;
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
    },
    lang: langParse.success ? langParse.data : "en",
    historyPath,
  };
}
