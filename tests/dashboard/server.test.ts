import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import {
  createDashboardHandler,
  createDashboardServer,
  type DashboardSnapshotProvider,
} from "../../src/dashboard/server.js";
import { createFreeOnlySnapshotProvider } from "../../src/dashboard/provider.js";
import type { EthValueCaptureSnapshot } from "../../src/eth_value_capture/types.js";

function snapshot(window: EthValueCaptureSnapshot["window"] = "30d"): EthValueCaptureSnapshot {
  return {
    summary: "Complete snapshot.",
    window,
    cutoff_day: "2026-08-01",
    as_of: "2026-08-01T00:00:00.000Z",
    status: "complete",
    metrics: {
      gross_l1_fees_eth: { current: 15, previous: 12, delta: 3, pct_change: 0.25, unit: "ETH" },
      base_fee_burn_eth: { current: 10, previous: 8, delta: 2, pct_change: 0.25, unit: "ETH" },
      blob_fee_burn_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      priority_fee_eth: { current: 3, previous: 3, delta: 0, pct_change: 0, unit: "ETH" },
      total_burn_eth: { current: 12, previous: 9, delta: 3, pct_change: 1 / 3, unit: "ETH" },
      consensus_issuance_eth: { current: 11, previous: 11, delta: 0, pct_change: 0, unit: "ETH" },
      net_issuance_eth: { current: -1, previous: 2, delta: -3, pct_change: -1.5, unit: "ETH" },
      l2_rent_paid_eth: { current: 4, previous: 3, delta: 1, pct_change: 1 / 3, unit: "ETH" },
      l2_calldata_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
      l2_blob_fee_eth: { current: 2, previous: 1, delta: 1, pct_change: 1, unit: "ETH" },
      l2_verification_fee_eth: { current: 1, previous: 1, delta: 0, pct_change: 0, unit: "ETH" },
    },
    ratios: {
      blob_share_of_total_burn: { current: 2 / 12, previous: 1 / 9, delta: 2 / 12 - 1 / 9, unit: "ratio" },
      l2_rent_share_of_l1_fees: { current: 4 / 15, previous: 3 / 12, delta: 4 / 15 - 3 / 12, unit: "ratio" },
    },
    sources: ["coinmetrics-community:SplyCur", "growthepie:rent_paid_eth"],
    source_status: [
      { source: "coinmetrics-community:SplyCur", role: "ETH total supply boundaries", as_of: "2026-08-01T00:00:00.000Z", stale: false },
    ],
    stale_data: [],
    confidence: 0.75,
    capabilities: { byok_active: ["dune"], paid_sources_active: [] },
    gaps: [],
    methodology_version: "eth-value-capture-v1",
  };
}

async function invoke(url: string, provider: DashboardSnapshotProvider = async () => snapshot()) {
  let body = "";
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const handler = createDashboardHandler({ provider });
  await handler(
    { method: "GET", url } as IncomingMessage,
    {
      setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
      end(value?: string) { body = value ?? ""; },
      get statusCode() { return statusCode; },
      set statusCode(value: number) { statusCode = value; },
    } as unknown as ServerResponse,
  );
  return { body, statusCode, headers };
}

describe("dashboard server", () => {
  it("forces the shared snapshot provider into free-only mode", async () => {
    const inputs: Array<{ window: string; paid_mode: string; include_rollups: boolean }> = [];
    const provider = createFreeOnlySnapshotProvider(async (input) => {
      inputs.push(input);
      return snapshot();
    });

    await expect(provider("90d")).resolves.toEqual(snapshot());
    expect(inputs).toEqual([{ window: "90d", paid_mode: "free_only", include_rollups: false }]);
  });

  it("serves a sanitized free-only snapshot for a whitelisted window", async () => {
    const requested: string[] = [];
    const result = await invoke(
      "/api/eth/value-capture?window=7d&paid_mode=byok_allowed&api_key=secret",
      async (window) => {
        requested.push(window);
        return snapshot(window);
      },
    );

    expect(result.statusCode).toBe(200);
    expect(requested).toEqual(["7d"]);
    expect(JSON.parse(result.body)).toMatchObject({ window: "7d", status: "complete" });
    expect(result.body).not.toContain("capabilities");
    expect(result.body).not.toContain("secret");
  });

  it("rejects a valid provider snapshot whose window does not match the request", async () => {
    const result = await invoke(
      "/api/eth/value-capture?window=7d",
      async () => snapshot("30d"),
    );

    expect(result).toMatchObject({
      statusCode: 502,
      body: '{"error":"snapshot_invalid"}',
    });
  });

  it("rejects malformed provider metrics with the same bounded generic response", async () => {
    const malformed = { ...snapshot("7d"), metrics: {} } as EthValueCaptureSnapshot;
    const result = await invoke(
      "/api/eth/value-capture?window=7d",
      async () => malformed,
    );

    expect(result).toMatchObject({
      statusCode: 502,
      body: '{"error":"snapshot_invalid"}',
    });
  });

  it("returns bounded JSON errors for invalid dashboard routes and windows", async () => {
    const invalidWindow = await invoke("/api/eth/value-capture?window=1d");
    const missingRoute = await invoke("/api/private");
    const writeAttempt = await (async () => {
      let body = "";
      let statusCode = 200;
      await createDashboardHandler({ provider: async () => snapshot() })(
        { method: "POST", url: "/api/eth/value-capture" } as IncomingMessage,
        { setHeader() {}, end(value?: string) { body = value ?? ""; }, get statusCode() { return statusCode; }, set statusCode(value: number) { statusCode = value; } } as unknown as ServerResponse,
      );
      return { body, statusCode };
    })();

    expect(invalidWindow).toMatchObject({ statusCode: 400, body: '{"error":"invalid_window"}' });
    expect(missingRoute).toMatchObject({ statusCode: 404, body: '{"error":"not_found"}' });
    expect(writeAttempt).toEqual({ statusCode: 405, body: '{"error":"method_not_allowed"}' });
  });

  it("exposes only a read-only health response", async () => {
    const result = await invoke("/api/health");

    expect(result).toMatchObject({ statusCode: 200, body: '{"status":"ok"}' });
  });

  it("renders static KPI UI with an explicit API failure state", async () => {
    const result = await invoke("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toContain("text/html");
    expect(result.body).toContain("30D burn");
    expect(result.body).toContain("Blob burn");
    expect(result.body).toContain("L2 rent");
    expect(result.body).toContain("Net issuance");
    expect(result.body).toContain('id="api-failure"');
  });

  it("starts and stops on an injected loopback host and ephemeral port", async () => {
    const dashboard = createDashboardServer({ provider: async () => snapshot(), host: "127.0.0.1", port: 0 });

    const address = await dashboard.start();
    expect(address.host).toBe("127.0.0.1");
    expect(address.port).toBeGreaterThan(0);
    await dashboard.stop();
  });
});
