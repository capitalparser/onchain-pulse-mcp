import { afterEach, describe, expect, it } from "vitest";
import {
  createConsoleGatewayServer,
  type ConsoleGatewayOptions,
} from "../../src/dashboard/console_gateway.js";
import { EthFrontendHistorySnapshotSchema } from "../../src/frontend_contract/eth_history.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

const NOW = new Date("2026-08-24T00:00:00.000Z");

function row(overrides: Partial<MetricObservation> = {}): MetricObservation {
  return {
    id: "metric:history-gateway",
    metric_key: "eth.l2_settlement_cost_share",
    subject_ref: "ethereum",
    asset_ref: "ETH",
    value: 0.12,
    unit: "ratio",
    source_at: "2026-08-22T23:00:00.000Z",
    observed_at: "2026-08-22T23:59:00.000Z",
    ingested_at: "2026-08-23T00:05:00.000Z",
    confidence: 0.9,
    source_refs: ["growthepie:rent_paid_usd"],
    methodology_version: "eth-ecosystem-capture-v1",
    dimensions: { window: "30d" },
    ...overrides,
  };
}

function providers(overrides: Partial<ConsoleGatewayOptions> = {}): ConsoleGatewayOptions {
  return {
    valueCaptureProvider: async () => { throw new Error("not used"); },
    ecosystemCaptureProvider: async () => { throw new Error("not used"); },
    compassProvider: async () => { throw new Error("not used"); },
    historyProvider: async () => [row()],
    now: () => NOW,
    host: "127.0.0.1",
    port: 0,
    ...overrides,
  } as ConsoleGatewayOptions;
}

const servers: Array<ReturnType<typeof createConsoleGatewayServer>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function start(options: ConsoleGatewayOptions) {
  const gateway = createConsoleGatewayServer(options);
  servers.push(gateway);
  const address = await gateway.start();
  return `http://${address.host}:${address.port}`;
}

const validQuery = "metrics=eth.l2_settlement_cost_share&range=30d&window=30d&cutoff=2026-08-23T23%3A59%3A59.999Z";

describe("console ETH history gateway", () => {
  it("returns a bounded browser-safe point-in-time history response", async () => {
    const origin = await start(providers());
    const response = await fetch(`${origin}/api/v1/eth/history?${validQuery}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body: unknown = await response.json();
    const history = EthFrontendHistorySnapshotSchema.parse(body);
    expect(history.series[0]?.points[0]?.value).toBe(0.12);
    expect(history.data_quality.point_in_time_cutoff_applied).toBe(true);
    expect(history.distribution.commercial_redistribution_allowed).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/credential|private[_-]?key|api[_-]?key|byok/i);
  });

  it("rejects unsupported, duplicate, and future query input", async () => {
    const origin = await start(providers());
    for (const query of [
      "unknown=true",
      "range=30d&range=90d",
      "cutoff=2026-08-25T00%3A00%3A00.000Z",
      "metrics=eth.not_allowed",
    ]) {
      const response = await fetch(`${origin}/api/v1/eth/history?${query}`);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid_history_query" });
    }
  });

  it("returns bounded upstream failures without leaking error text", async () => {
    const origin = await start(providers({
      historyProvider: async () => {
        throw new Error("private-token=https://vendor.example/secret");
      },
    }));
    const response = await fetch(`${origin}/api/v1/eth/history?${validQuery}`);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ error: "history_unavailable" }));
    expect(text).not.toContain("private-token");
  });

  it("fails closed when the provider returns an invalid observation", async () => {
    const origin = await start(providers({
      historyProvider: async () => [{ ...row(), value: Number.NaN }],
    }));
    const response = await fetch(`${origin}/api/v1/eth/history?${validQuery}`);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "history_snapshot_invalid" });
  });

  it("reports history unavailable when no history provider is configured", async () => {
    const origin = await start(providers({ historyProvider: undefined }));
    const response = await fetch(`${origin}/api/v1/eth/history?${validQuery}`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "history_unavailable" });
  });
});
