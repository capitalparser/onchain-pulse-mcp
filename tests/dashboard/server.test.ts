import type { IncomingMessage, ServerResponse } from "node:http";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  createDashboardHandler,
  createDashboardServer,
  type DashboardCompassProvider,
  type DashboardSnapshotProvider,
} from "../../src/dashboard/server.js";
import { createFreeOnlySnapshotProvider } from "../../src/dashboard/provider.js";
import { createFreeOnlyCompassProvider } from "../../src/dashboard/provider.js";
import type { EthDemandCompassSnapshot } from "../../src/eth_demand_compass/types.js";
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

function compassSnapshot(): EthDemandCompassSnapshot {
  return {
    summary: "Ethereum demand is improving across core trend axes.",
    as_of: "2026-08-01T00:00:00.000Z",
    window: "30d",
    judgment: "structural",
    axes: {
      usage_demand: { status: "improving", score: 1, evidence: ["L1 fees and burn rose."], sources: ["dune"], confidence: 1 },
      l2_settlement: { status: "improving", score: 1, evidence: ["L2 rent rose."], sources: ["growthepie"], confidence: 1 },
      supply_absorption: { status: "improving", score: 1, evidence: ["Net issuance declined."], sources: ["coinmetrics"], confidence: 1 },
      collateral_demand: { status: "unknown", score: null, evidence: ["Point-in-time only."], sources: ["ethereum_rpc"], confidence: 0.5 },
      monetary_settlement: { status: "improving", score: 1, evidence: ["Stablecoin supply rose."], sources: ["defillama"], confidence: 1 },
    },
    evidence: ["usage demand: improving.", "l2 settlement: improving.", "supply absorption: improving."],
    sources: ["dune", "growthepie", "coinmetrics"],
    confidence: 0.88,
    gaps: [{ code: "collateral_trend_not_available", detail: "No comparable collateral history." }],
    methodology_version: "eth-demand-compass-v1",
  };
}

async function invoke(
  url: string,
  provider: DashboardSnapshotProvider = async () => snapshot(),
  compassProvider?: DashboardCompassProvider,
) {
  let body = "";
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const handler = createDashboardHandler({ provider, compassProvider });
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

class FixtureElement {
  textContent = "";
  className = "";
  children: FixtureElement[] = [];
  readonly classList = {
    add: (token: string) => { this.className = `${this.className} ${token}`.trim(); },
    remove: (token: string) => { this.className = this.className.split(" ").filter((item) => item !== token).join(" "); },
  };

  replaceChildren(...children: FixtureElement[]): void {
    this.children = children;
    this.textContent = "";
  }

  append(...children: FixtureElement[]): void {
    this.children.push(...children);
  }

  setAttribute(): void {}
}

async function runDashboardFixture(html: string, valueCapture: EthValueCaptureSnapshot, compass: EthDemandCompassSnapshot) {
  const elements = new Map<string, FixtureElement>();
  for (const match of html.matchAll(/<[^>]*id="([^"]+)"[^>]*>/g)) {
    const id = match[1];
    if (id !== undefined) {
      const element = new FixtureElement();
      const className = match[0].match(/class="([^"]*)"/)?.[1];
      if (className !== undefined) element.className = className;
      elements.set(id, element);
    }
  }
  const script = html.match(/<script>\n([\s\S]*)\n<\/script>/)?.[1];
  if (script === undefined) throw new Error("dashboard_script_missing");
  const document = {
    getElementById(id: string) { return elements.get(id) ?? null; },
    createElement() { return new FixtureElement(); },
    createElementNS() { return new FixtureElement(); },
  };
  const fetch = async (path: string) => ({
    ok: true,
    json: async () => path.includes("demand-compass") ? compass : valueCapture,
  });
  runInNewContext(script, { document, fetch, Math, Number, Promise });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return elements;
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

  it("invokes the Compass handler with its strict empty input", async () => {
    const inputs: unknown[] = [];
    const provider = createFreeOnlyCompassProvider(async (input) => {
      inputs.push(input);
      return compassSnapshot();
    });

    await expect(provider()).resolves.toEqual(compassSnapshot());
    expect(inputs).toEqual([{}]);
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

  it("serves a strict, sanitized demand compass through its dedicated read-only route", async () => {
    const result = await invoke(
      "/api/eth/demand-compass?paid_mode=byok_allowed&api_key=secret",
      async () => snapshot(),
      async () => compassSnapshot(),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      judgment: "structural",
      confidence: 0.88,
      axes: { usage_demand: { status: "improving" } },
    });
    expect(result.body).not.toContain("capabilities");
    expect(result.body).not.toContain("secret");
  });

  it("keeps the existing dashboard usable when no optional compass provider is configured", async () => {
    const valueCapture = await invoke("/api/eth/value-capture?window=30d");
    const compass = await invoke("/api/eth/demand-compass");

    expect(valueCapture.statusCode).toBe(200);
    expect(compass).toMatchObject({ statusCode: 503, body: '{"error":"compass_unavailable"}' });
  });

  it("rejects malformed or extra-field compass snapshots with a bounded response", async () => {
    const malformed = { ...compassSnapshot(), capabilities: { ethereum_rpc_active: true } };
    const result = await invoke("/api/eth/demand-compass", async () => snapshot(), async () => malformed as EthDemandCompassSnapshot);

    expect(result).toMatchObject({ statusCode: 502, body: '{"error":"compass_invalid"}' });
  });

  it("returns a bounded unavailable response when the compass provider fails", async () => {
    const result = await invoke("/api/eth/demand-compass", async () => snapshot(), async () => {
      throw new Error("internal rpc endpoint must stay private");
    });

    expect(result).toMatchObject({ statusCode: 503, body: '{"error":"compass_unavailable"}' });
    expect(result.body).not.toContain("private");
  });

  it("exposes only a read-only health response", async () => {
    const result = await invoke("/api/health");

    expect(result).toMatchObject({ statusCode: 200, body: '{"status":"ok"}' });
  });

  it("returns an empty favicon response so opening the dashboard has no avoidable console error", async () => {
    const result = await invoke("/favicon.ico");

    expect(result).toMatchObject({ statusCode: 204, body: "" });
  });

  it("renders a decision-oriented UI with judgment, evidence, trend, and data-quality regions", async () => {
    const result = await invoke("/");

    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toContain("text/html");
    expect(result.body).toContain('id="judgment-banner"');
    expect(result.body).toContain('id="judgment-title"');
    expect(result.body).toContain('id="total-burn-badge"');
    expect(result.body).toContain('id="blob-burn-badge"');
    expect(result.body).toContain('id="l2-rent-badge"');
    expect(result.body).toContain('id="net-issuance-badge"');
    expect(result.body).toContain('id="total-burn-trend"');
    expect(result.body).toContain('id="blob-burn-trend"');
    expect(result.body).toContain('id="evidence-list"');
    expect(result.body).toContain('id="data-quality"');
    expect(result.body).toContain("Value-capture lens; not a price forecast or trade call.");
    expect(result.body).toContain('id="api-failure"');
    expect(result.body).toContain('id="compass-panel"');
    expect(result.body).toContain('id="compass-judgment"');
    expect(result.body).toContain('id="compass-usage-demand"');
    expect(result.body).toContain('id="compass-l2-settlement"');
    expect(result.body).toContain('id="compass-supply-absorption"');
    expect(result.body).toContain('id="compass-collateral-demand"');
    expect(result.body).toContain('id="compass-monetary-settlement"');
    expect(result.body).toContain('id="compass-confidence"');
    expect(result.body).toContain('id="compass-evidence"');
    expect(result.body).toContain('id="compass-gaps"');
    expect(result.body).toContain('id="compass-failure"');
    expect(result.body).not.toContain("__name");
  });

  it("runs the static Compass fixture with hostile evidence as text rather than markup", async () => {
    const result = await invoke("/");
    const unsafeCompass = {
      ...compassSnapshot(),
      evidence: ["<img src=x onerror=alert(1)>", "L2 rent is improving."],
      gaps: [{ code: "stale_source" as const, detail: "<b>stale</b>" }],
    };
    const elements = await runDashboardFixture(result.body, snapshot(), unsafeCompass);

    expect(result.body).not.toContain("__name");
    expect(result.body).not.toContain("innerHTML");
    expect(elements.get("compass-judgment")?.textContent).toBe("Structural demand improving");
    expect(elements.get("compass-confidence")?.textContent).toBe("Confidence 88%");
    expect(elements.get("compass-evidence")?.children[0]?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(elements.get("compass-gaps")?.textContent).toBe("stale_source");
    expect(elements.get("compass-failure")?.className).toContain("hidden");
  });

  it("starts and stops on an injected loopback host and ephemeral port", async () => {
    const dashboard = createDashboardServer({ provider: async () => snapshot(), compassProvider: async () => compassSnapshot(), host: "127.0.0.1", port: 0 });

    const address = await dashboard.start();
    expect(address.host).toBe("127.0.0.1");
    expect(address.port).toBeGreaterThan(0);
    await dashboard.stop();
  });
});
