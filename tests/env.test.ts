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
});
