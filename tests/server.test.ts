import { describe, it, expect, vi } from "vitest";
import { makeContext } from "../src/adapters/base.js";
import { EthValueCaptureSnapshotSchema } from "../src/eth_value_capture/types.js";
import {
  createServer,
  handleEthValueCapture,
  listTools,
} from "../src/server.js";
import type { EnvConfig } from "../src/env.js";

const env: EnvConfig = { byok: {}, lang: "en", historyPath: "/tmp/onchain-pulse-mcp-test-history.json" };

describe("server", () => {
  it("registers all eight expected tools", () => {
    const names = listTools()
      .map((t) => t.name)
      .sort();

    expect(names).toEqual([
      "get_etf_flow",
      "get_eth_value_capture",
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

  it("get_eth_value_capture advertises conservative defaults", () => {
    const tool = listTools().find((t) => t.name === "get_eth_value_capture");

    expect(tool?.inputSchema.properties.window).toEqual({
      type: "string",
      enum: ["7d", "30d", "90d"],
      default: "30d",
    });
    expect(tool?.inputSchema.properties.paid_mode).toEqual({
      type: "string",
      enum: ["free_only", "byok_allowed"],
      default: "free_only",
    });
    expect(tool?.inputSchema.properties.include_rollups).toEqual({
      type: "boolean",
      default: false,
    });
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function coinMetricsResponse() {
  return jsonResponse({
    data: [
      { asset: "eth", time: "2026-07-15T00:00:00.000000000Z", SplyCur: "1000" },
      { asset: "eth", time: "2026-07-22T00:00:00.000000000Z", SplyCur: "1002" },
      { asset: "eth", time: "2026-07-29T00:00:00.000000000Z", SplyCur: "1001" },
    ],
  });
}

function growThePieRentResponse() {
  return jsonResponse([
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-15", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-16", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-17", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-18", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-19", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-20", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-21", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-22", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-23", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-24", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-25", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-26", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-27", value: 1 },
    { metric_key: "rent_paid_eth", origin_key: "arbitrum", date: "2026-07-28", value: 1 },
  ]);
}

const duneRows = [
  {
    row_type: "summary",
    rollup: null,
    period: "current",
    gross_l1_fees_eth: "15",
    base_fee_burn_eth: "10",
    blob_fee_burn_eth: "2",
    priority_fee_eth: "3",
    l2_rent_paid_eth: "4",
    l2_calldata_fee_eth: "1",
    l2_blob_fee_eth: "2",
    l2_verification_fee_eth: "1",
    base_component_present: true,
    blob_component_present: true,
    priority_component_present: true,
    l2_reconciled: true,
  },
  {
    row_type: "summary",
    rollup: null,
    period: "previous",
    gross_l1_fees_eth: "11",
    base_fee_burn_eth: "8",
    blob_fee_burn_eth: "1",
    priority_fee_eth: "2",
    l2_rent_paid_eth: "3",
    l2_calldata_fee_eth: "0.75",
    l2_blob_fee_eth: "1.5",
    l2_verification_fee_eth: "0.75",
    base_component_present: true,
    blob_component_present: true,
    priority_component_present: true,
    l2_reconciled: true,
  },
];

describe("handleEthValueCapture", () => {
  it("returns free GrowThePie L2 rent without submitting Dune", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00Z"));
    try {
      const requestedUrls: string[] = [];
      const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith("https://community-api.coinmetrics.io/")) {
          return coinMetricsResponse();
        }
        if (url === "https://api.growthepie.com/v1/export/rent_paid.json") {
          return growThePieRentResponse();
        }
        throw new Error(`unexpected request: ${url}`);
      });
      const localEnv: EnvConfig = {
        byok: {},
        lang: "en",
        historyPath: "/tmp/history.json",
      };
      const output = await handleEthValueCapture(
        { window: "7d", paid_mode: "free_only", include_rollups: true },
        { env: localEnv, ctx: makeContext({ env: localEnv, fetchImpl: fetchImpl as typeof fetch }) },
      );

      expect(output.status).toBe("partial");
      expect(output.metrics.net_issuance_eth.current).toBe(-1);
      expect(output.metrics.base_fee_burn_eth.current).toBeNull();
      expect(output.metrics.l2_rent_paid_eth.current).toBe(7);
      expect(output.metrics.l2_rent_paid_eth.previous).toBe(7);
      expect(output.sources).toContain("growthepie:rent_paid_eth");
      expect(output.capabilities.paid_sources_active).toEqual([]);
      expect(requestedUrls).toContain(
        "https://api.growthepie.com/v1/export/rent_paid.json",
      );
      expect(requestedUrls.some((url) => url.startsWith("https://api.dune.com/"))).toBe(false);
      expect(EthValueCaptureSnapshotSchema.parse(output)).toEqual(output);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the current-day fallback cutoff for free GrowThePie rent when Coin Metrics fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00Z"));
    try {
      const requestedUrls: string[] = [];
      const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith("https://community-api.coinmetrics.io/")) {
          return new Response("unavailable", { status: 503 });
        }
        if (url === "https://api.growthepie.com/v1/export/rent_paid.json") {
          return growThePieRentResponse();
        }
        throw new Error(`unexpected request: ${url}`);
      });
      const localEnv: EnvConfig = {
        byok: {},
        lang: "en",
        historyPath: "/tmp/history.json",
      };
      const output = await handleEthValueCapture(
        { window: "7d", paid_mode: "free_only", include_rollups: true },
        { env: localEnv, ctx: makeContext({ env: localEnv, fetchImpl: fetchImpl as typeof fetch }) },
      );

      expect(output.cutoff_day).toBe("2026-07-29");
      expect(output.metrics.l2_rent_paid_eth).toMatchObject({ current: 7, previous: 7 });
      expect(output.metrics.consensus_issuance_eth.current).toBeNull();
      expect(output.sources).toEqual(["growthepie:rent_paid_eth"]);
      expect(output.source_status).toContainEqual({
        source: "growthepie",
        role: "L2 rent paid to Ethereum",
        as_of: "2026-07-28T00:00:00Z",
        stale: false,
      });
      expect(output.capabilities.paid_sources_active).toEqual([]);
      expect(output.confidence).toBe(0.15);
      expect(requestedUrls.some((url) => url.startsWith("https://api.dune.com/"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers authorized Dune rent while both sources align to the Coin Metrics cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00Z"));
    try {
      const requestedUrls: string[] = [];
      const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.startsWith("https://community-api.coinmetrics.io/")) {
          return coinMetricsResponse();
        }
        if (url === "https://api.growthepie.com/v1/export/rent_paid.json") {
          return growThePieRentResponse();
        }
        if (url.endsWith("/api/v1/sql/execute")) {
          return jsonResponse({ execution_id: "exec-server", state: "QUERY_STATE_PENDING" });
        }
        if (url.endsWith("/execution/exec-server/status")) {
          return jsonResponse({ execution_id: "exec-server", state: "QUERY_STATE_COMPLETED" });
        }
        if (url.endsWith("/execution/exec-server/results")) {
          return jsonResponse({
            execution_id: "exec-server",
            state: "QUERY_STATE_COMPLETED",
            result: { rows: duneRows },
          });
        }
        throw new Error(`unexpected request: ${url}`);
      });
      const localEnv: EnvConfig = {
        byok: { dune: "dune-key" },
        lang: "en",
        historyPath: "/tmp/history.json",
      };
      const output = await handleEthValueCapture(
        { window: "7d", paid_mode: "byok_allowed", include_rollups: true },
        { env: localEnv, ctx: makeContext({ env: localEnv, fetchImpl: fetchImpl as typeof fetch }) },
      );

      expect(output.status).toBe("complete");
      expect(output.metrics.l2_rent_paid_eth.current).toBe(4);
      expect(output.metrics.l2_rent_paid_eth.previous).toBe(3);
      expect(output.sources).not.toContain("growthepie:rent_paid_eth");
      expect(requestedUrls).toContain("https://api.growthepie.com/v1/export/rent_paid.json");
      const executeCall = fetchImpl.mock.calls.find(([url]) =>
        String(url).endsWith("/api/v1/sql/execute"),
      );
      expect(executeCall).toBeDefined();
      expect(JSON.parse(String(executeCall?.[1]?.body)).sql).toContain(
        "DATE '2026-07-29'",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { window: "1d" },
    { paid_mode: "x402_allowed" },
    { include_rollups: "yes" },
    { unknown: true },
  ])("rejects invalid public input %#", async (raw) => {
    await expect(
      handleEthValueCapture(raw, {
        env,
        ctx: makeContext({ env, fetchImpl: vi.fn() as typeof fetch }),
      }),
    ).rejects.toThrow();
  });
});
