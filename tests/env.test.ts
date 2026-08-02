import { describe, it, expect } from "vitest";
import { loadEnv, type EnvConfig } from "../src/env.js";

describe("loadEnv", () => {
  it("defaults to no enrichment when no BYOK keys present", () => {
    const cfg = loadEnv({});
    expect(cfg.byok.nansen).toBeUndefined();
    expect(cfg.byok.glassnode).toBeUndefined();
    expect(cfg.lang).toBe("en");
  });

  it("captures BYOK keys when present", () => {
    const cfg: EnvConfig = loadEnv({
      NANSEN_API_KEY: "n-1",
      GLASSNODE_API_KEY: "g-1",
      ARKHAM_API_KEY: "a-1",
      COINGLASS_API_KEY: "c-1",
      CRYPTOQUANT_API_KEY: "cq-1",
      LAEVITAS_API_KEY: "l-1",
      DUNE_API_KEY: "d-1",
    });
    expect(cfg.byok.nansen).toBe("n-1");
    expect(cfg.byok.glassnode).toBe("g-1");
    expect(cfg.byok.arkham).toBe("a-1");
    expect(cfg.byok.coinglass).toBe("c-1");
    expect(cfg.byok.cryptoquant).toBe("cq-1");
    expect(cfg.byok.laevitas).toBe("l-1");
    expect(cfg.byok.dune).toBe("d-1");
  });

  it("loads ETHEREUM_RPC_URL only into the internal Ethereum RPC configuration", () => {
    const cfg = loadEnv({ ETHEREUM_RPC_URL: "https://rpc.example/private-token" });

    expect(cfg.ethereumRpcUrl).toBe("https://rpc.example/private-token");
    expect(JSON.stringify({ byok: cfg.byok, lang: cfg.lang, historyPath: cfg.historyPath })).not.toContain(
      "private-token",
    );
  });

  it("loads ETHEREUM_BEACON_API_URL only into the internal Beacon configuration", () => {
    const cfg = loadEnv({ ETHEREUM_BEACON_API_URL: "https://beacon.example/private-token" });

    expect(cfg.ethereumBeaconApiUrl).toBe("https://beacon.example/private-token");
    expect(JSON.stringify({ byok: cfg.byok, lang: cfg.lang, historyPath: cfg.historyPath })).not.toContain(
      "private-token",
    );
  });

  it("respects OPM_LANG=ko", () => {
    expect(loadEnv({ OPM_LANG: "ko" }).lang).toBe("ko");
  });

  it("falls back to en when OPM_LANG is invalid", () => {
    expect(loadEnv({ OPM_LANG: "fr" }).lang).toBe("en");
  });

  it("defaults historyPath to ~/.cache/onchain-pulse-mcp/history.json (tilde expanded)", () => {
    const cfg = loadEnv({ HOME: "/home/test" });
    expect(cfg.historyPath).toBe("/home/test/.cache/onchain-pulse-mcp/history.json");
  });

  it("respects OPM_HISTORY_PATH override and expands leading ~", () => {
    const cfg = loadEnv({ HOME: "/home/test", OPM_HISTORY_PATH: "~/custom/h.json" });
    expect(cfg.historyPath).toBe("/home/test/custom/h.json");
  });

  it("preserves an absolute OPM_HISTORY_PATH unchanged", () => {
    const cfg = loadEnv({ HOME: "/home/test", OPM_HISTORY_PATH: "/var/lib/opm/history.json" });
    expect(cfg.historyPath).toBe("/var/lib/opm/history.json");
  });

  it("loads loopback dashboard defaults and keeps Telegram credentials internal", () => {
    const cfg = loadEnv({
      OPM_DASHBOARD_HOST: "127.0.0.1",
      OPM_DASHBOARD_PORT: "9911",
      OPM_TELEGRAM_ALERTS_ENABLED: "1",
      TELEGRAM_BOT_TOKEN: "secret-token",
      TELEGRAM_CHAT_ID: "123",
    });

    expect(cfg.dashboard).toEqual({ host: "127.0.0.1", port: 9911 });
    expect(cfg.telegram?.enabled).toBe(true);
    expect(JSON.stringify({ dashboard: cfg.dashboard, telegram: { enabled: cfg.telegram?.enabled } })).not.toContain("secret-token");
  });

  it("defaults and clamps the Telegram snapshot timeout", () => {
    expect(loadEnv({}).telegram?.snapshotTimeoutMs).toBe(30_000);
    expect(loadEnv({ OPM_TELEGRAM_SNAPSHOT_TIMEOUT_MS: "0" }).telegram?.snapshotTimeoutMs).toBe(1);
    expect(loadEnv({ OPM_TELEGRAM_SNAPSHOT_TIMEOUT_MS: "70000" }).telegram?.snapshotTimeoutMs).toBe(60_000);
    expect(loadEnv({ OPM_TELEGRAM_SNAPSHOT_TIMEOUT_MS: "invalid" }).telegram?.snapshotTimeoutMs).toBe(30_000);
  });

  it("uses a tilde-expanded Telegram state path and bounds daemon cadence", () => {
    const defaults = loadEnv({ HOME: "/home/test" }).telegram;
    expect(defaults?.statePath).toBe("/home/test/.cache/onchain-pulse-mcp/telegram-alert-state.json");
    expect(defaults?.intervalMs).toBe(900_000);

    const configured = loadEnv({
      HOME: "/home/test",
      OPM_TELEGRAM_STATE_PATH: "~/state/telegram.json",
      OPM_TELEGRAM_INTERVAL_MS: "1",
    }).telegram;
    expect(configured?.statePath).toBe("/home/test/state/telegram.json");
    expect(configured?.intervalMs).toBe(60_000);
    expect(loadEnv({ OPM_TELEGRAM_INTERVAL_MS: "999999999" }).telegram?.intervalMs).toBe(86_400_000);
  });
});
