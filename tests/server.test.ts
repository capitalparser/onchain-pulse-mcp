import { describe, it, expect, vi } from "vitest";
import { makeContext } from "../src/adapters/base.js";
import { EthValueCaptureSnapshotSchema } from "../src/eth_value_capture/types.js";
import { EthFeeCrossCheckSnapshotSchema } from "../src/eth_fee_cross_check/types.js";
import { EthConsensusRewardsCrossCheckSnapshotSchema } from "../src/eth_consensus_rewards/types.js";
import { EthCollateralDemandSnapshotSchema } from "../src/eth_collateral_demand/types.js";
import {
  createServer,
  handleEthCollateralDemand,
  handleEthFeeCrossCheck,
  handleEthConsensusRewardsCrossCheck,
  handleEthValueCapture,
  listTools,
} from "../src/server.js";
import type { EnvConfig } from "../src/env.js";

const env: EnvConfig = { byok: {}, lang: "en", historyPath: "/tmp/onchain-pulse-mcp-test-history.json", ethereumRpcUrl: undefined, ethereumBeaconApiUrl: undefined };

describe("server", () => {
  it("registers all eleven expected tools", () => {
    const names = listTools()
      .map((t) => t.name)
      .sort();

    expect(names).toEqual([
      "get_etf_flow",
      "get_eth_collateral_demand",
      "get_eth_consensus_rewards_cross_check",
      "get_eth_fee_cross_check",
      "get_eth_value_capture",
      "get_funding_oi",
      "get_kr_premium",
      "get_market_pulse",
      "get_rwa_pulse",
      "get_stablecoin_pulse",
      "get_token_forensics",
    ]);
  });

  it("get_eth_consensus_rewards_cross_check advertises its one-epoch reward contract", () => {
    const tool = listTools().find((t) => t.name === "get_eth_consensus_rewards_cross_check");

    expect(tool?.inputSchema.required).toEqual(["epoch"]);
    expect(tool?.inputSchema.properties).toEqual({
      epoch: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      include_blocks: { type: "boolean", default: false },
    });
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

  it("get_eth_fee_cross_check advertises its exact bounded range contract", () => {
    const tool = listTools().find((t) => t.name === "get_eth_fee_cross_check");

    expect(tool?.inputSchema.required).toEqual(["start_block", "end_block"]);
    expect(tool?.inputSchema.properties).toEqual({
      start_block: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      end_block: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      include_blocks: { type: "boolean", default: false },
    });
  });

  it("get_eth_collateral_demand advertises and enforces a strict empty object", async () => {
    const tool = listTools().find((item) => item.name === "get_eth_collateral_demand");
    expect(tool?.inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false });
    await expect(tool?.handler({ asset: "WETH" }, {
      env,
      ctx: makeContext({ env, fetchImpl: vi.fn() as unknown as typeof fetch }),
    })).rejects.toThrow();
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

function rpcResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function rpcHash(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function rpcQuantity(value: number): string {
  return `0x${value.toString(16)}`;
}

function oneBlockRpcFetch(blockNumber: number) {
  return vi.fn()
    .mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: 1, result: { number: rpcQuantity(blockNumber) } }))
    .mockResolvedValueOnce(rpcResponse([
      {
        jsonrpc: "2.0",
        id: 2,
        result: {
          number: rpcQuantity(blockNumber),
          hash: rpcHash(blockNumber),
          baseFeePerGas: "0xa",
          gasUsed: "0x5",
          timestamp: "0x65ec8786",
          transactions: [rpcHash(1)],
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        result: [{
          blockNumber: rpcQuantity(blockNumber),
          blockHash: rpcHash(blockNumber),
          transactionHash: rpcHash(1),
          transactionIndex: "0x0",
          gasUsed: "0x5",
          effectiveGasPrice: "0xa",
        }],
      },
    ]));
}

describe("handleEthFeeCrossCheck", () => {
  it("returns a verified, schema-valid localized snapshot from mocked finalized RPC evidence", async () => {
    const secret = "https://rpc.example/credential-never-returned";
    const localEnv: EnvConfig = { ...env, ethereumRpcUrl: secret };
    const output = await handleEthFeeCrossCheck(
      { start_block: 100, end_block: 100, include_blocks: true },
      { env: localEnv, ctx: makeContext({ env: localEnv, fetchImpl: oneBlockRpcFetch(100) as unknown as typeof fetch }) },
    );

    expect(output.status).toBe("verified");
    expect(output.summary).toBe("Ethereum execution fee evidence was verified against finalized blocks.");
    expect(output.blocks).toHaveLength(1);
    expect(output.identities).toEqual({
      execution_equals_base_plus_priority: true,
      gross_equals_execution_plus_blob: true,
      total_burn_equals_base_plus_blob: true,
    });
    expect(EthFeeCrossCheckSnapshotSchema.parse(output)).toEqual(output);
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it("returns a bounded no-config snapshot without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const output = await handleEthFeeCrossCheck(
      { start_block: 100, end_block: 100 },
      { env, ctx: makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }) },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(output.status).toBe("unavailable");
    expect(output.summary).toBe("Ethereum execution fee evidence is unavailable.");
    expect(output.gaps.map((gap) => gap.code)).toEqual(["rpc_not_configured"]);
    expect(EthFeeCrossCheckSnapshotSchema.parse(output)).toEqual(output);
  });

  it.each([
    { start_block: 101, end_block: 100 },
    { start_block: 0, end_block: 64 },
    { start_block: 0.5, end_block: 1 },
    { start_block: 100, end_block: 100, include_blocks: "yes" },
    { start_block: 100, end_block: 100, unknown: true },
  ])("rejects invalid public RPC cross-check arguments %#", async (raw) => {
    await expect(handleEthFeeCrossCheck(raw, {
      env,
      ctx: makeContext({ env, fetchImpl: vi.fn() as unknown as typeof fetch }),
    })).rejects.toThrow();
  });
});

describe("handleEthCollateralDemand", () => {
  it("returns a localized bounded no-config snapshot without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const output = await handleEthCollateralDemand(
      {},
      { env, ctx: makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }) },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(output.status).toBe("unavailable");
    expect(output.summary).toBe("Aave V3 Core ETH-family supplied capacity evidence is unavailable.");
    expect(output.gaps.map((gap) => gap.code)).toEqual(["rpc_not_configured"]);
    expect(EthCollateralDemandSnapshotSchema.parse(output)).toEqual(output);
  });

  it("does not expose the internal RPC URL when the collateral adapter fails", async () => {
    const secret = "https://rpc.example/credential-never-returned";
    const localEnv: EnvConfig = { ...env, ethereumRpcUrl: secret };
    const output = await handleEthCollateralDemand(
      {},
      {
        env: localEnv,
        ctx: makeContext({
          env: localEnv,
          fetchImpl: vi.fn().mockRejectedValue(new Error(`provider failed: ${secret}`)) as unknown as typeof fetch,
        }),
      },
    );
    expect(output.status).toBe("unavailable");
    expect(output.summary).toBe("Aave V3 Core ETH-family supplied capacity evidence is unavailable.");
    expect(JSON.stringify(output)).not.toContain(secret);
  });
});

describe("handleEthConsensusRewardsCrossCheck", () => {
  it("returns a bounded no-config snapshot without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const output = await handleEthConsensusRewardsCrossCheck(
      { epoch: 10 },
      { env, ctx: makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }) },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(output.status).toBe("unavailable");
    expect(output.summary).toBe("Ethereum consensus reward evidence is unavailable.");
    expect(output.gaps.map((gap) => gap.code)).toEqual(["beacon_not_configured"]);
    expect(EthConsensusRewardsCrossCheckSnapshotSchema.parse(output)).toEqual(output);
  });

  it.each([
    { epoch: -1 },
    { epoch: 1.5 },
    { epoch: Number.MAX_SAFE_INTEGER + 1 },
    { epoch: 10, include_blocks: "yes" },
    { epoch: 10, unknown: true },
  ])("rejects invalid public Beacon reward arguments %#", async (raw) => {
    await expect(handleEthConsensusRewardsCrossCheck(raw, {
      env,
      ctx: makeContext({ env, fetchImpl: vi.fn() as unknown as typeof fetch }),
    })).rejects.toThrow();
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
