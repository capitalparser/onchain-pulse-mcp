import { describe, it, expect } from "vitest";
import { createServer, listTools } from "../src/server.js";
import type { EnvConfig } from "../src/env.js";

const env: EnvConfig = { byok: {}, lang: "en", historyPath: "/tmp/onchain-pulse-mcp-test-history.json" };

describe("server", () => {
  it("registers all seven expected tools", () => {
    const names = listTools()
      .map((t) => t.name)
      .sort();

    expect(names).toEqual([
      "get_etf_flow",
      "get_funding_oi",
      "get_kr_premium",
      "get_market_pulse",
      "get_rwa_pulse",
      "get_stablecoin_pulse",
      "get_token_forensics",
    ]);
  });

  it("each tool advertises a JSON schema with type=object", () => {
    for (const t of listTools()) {
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("get_token_forensics requires chain and token_address", () => {
    const tool = listTools().find((t) => t.name === "get_token_forensics");

    expect(tool?.inputSchema.required).toEqual(["chain", "token_address"]);
    expect(tool?.inputSchema.properties.chain).toEqual({ type: "string", enum: ["base", "ethereum"] });
  });

  it("createServer returns a connectable Server instance plus adapter context", () => {
    const { server, ctx } = createServer({ env });

    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(ctx.env).toBe(env);
  });

  it("server-built AdapterContext gives each adapter an isolated cache", () => {
    const { ctx } = createServer({ env });
    const a = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const b = ctx.cacheFor({ name: "macro_rwa", ttlMs: 600_000, max: 32 });

    expect(a).not.toBe(b);
    a.set("k", { data: { x: "deriv" }, sources: [], asOf: "", stale: false });
    expect(b.get("k")).toBeUndefined();
  });
});
