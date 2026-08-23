import { afterEach, describe, expect, it } from "vitest";
import {
  createConsoleGatewayServer,
  type ConsoleGatewayOptions,
} from "../../src/dashboard/console_gateway.js";
import { EthFrontendOverviewSnapshotSchema } from "../../src/frontend_contract/eth_overview.js";

function ethMetric(current: number, previous: number) {
  return {
    current,
    previous,
    delta: current - previous,
    pct_change: previous === 0 ? null : (current - previous) / previous,
    unit: "ETH" as const,
  };
}

function usdMetric(current: number, previous: number) {
  return {
    current,
    previous,
    delta: current - previous,
    pct_change: previous === 0 ? null : (current - previous) / previous,
    unit: "USD" as const,
  };
}

function ratioMetric(current: number, previous: number) {
  return {
    current,
    previous,
    delta: current - previous,
    unit: "ratio" as const,
  };
}

function axis(status: "improving" | "weakening" | "neutral" | "unknown") {
  const score = status === "improving" ? 1 : status === "weakening" ? -1 : status === "neutral" ? 0 : null;
  return {
    status,
    score,
    evidence: ["Fixture evidence."],
    sources: ["fixture:source"],
    confidence: status === "unknown" ? 0 : 0.9,
  };
}

function valueCaptureFixture() {
  return {
    summary: "Ethereum protocol fee, supply, and settlement evidence is complete for the aligned window.",
    window: "30d" as const,
    cutoff_day: "2026-08-22",
    as_of: "2026-08-22T23:59:59.000Z",
    status: "complete" as const,
    metrics: {
      gross_l1_fees_eth: ethMetric(120, 100),
      base_fee_burn_eth: ethMetric(80, 70),
      blob_fee_burn_eth: ethMetric(8, 5),
      priority_fee_eth: ethMetric(32, 25),
      total_burn_eth: ethMetric(88, 75),
      consensus_issuance_eth: ethMetric(60, 62),
      net_issuance_eth: ethMetric(-28, -13),
      l2_rent_paid_eth: ethMetric(20, 16),
      l2_calldata_fee_eth: ethMetric(4, 5),
      l2_blob_fee_eth: ethMetric(12, 7),
      l2_verification_fee_eth: ethMetric(4, 4),
    },
    ratios: {
      blob_share_of_total_burn: ratioMetric(8 / 88, 5 / 75),
      l2_rent_share_of_l1_fees: ratioMetric(20 / 120, 16 / 100),
    },
    sources: ["fixture:value-capture"],
    source_status: [{
      source: "fixture:value-capture",
      role: "Fixture protocol evidence",
      as_of: "2026-08-22T23:59:59.000Z",
      stale: false,
    }],
    stale_data: [],
    confidence: 0.94,
    capabilities: {
      byok_active: ["dune"],
      paid_sources_active: ["dune"],
    },
    gaps: [],
    methodology_version: "eth-value-capture-v1" as const,
  };
}

function ecosystemCaptureFixture() {
  return {
    summary: "Ethereum-settled L2 activity and settlement capture strengthened over the aligned window.",
    window: "30d" as const,
    cutoff_day: "2026-08-22",
    as_of: "2026-08-22T23:59:59.000Z",
    status: "complete" as const,
    metrics: {
      l2_user_fees_usd: usdMetric(32_000_000, 28_000_000),
      l2_rent_paid_usd: usdMetric(4_400_000, 3_300_000),
      l2_settlement_cost_share: ratioMetric(0.1375, 0.1179),
      ethereum_l1_stablecoin_supply_usd: usdMetric(92_000_000_000, 89_000_000_000),
      ethereum_l2_stablecoin_supply_usd: usdMetric(19_000_000_000, 17_500_000_000),
      ethereum_ecosystem_stablecoin_supply_usd: usdMetric(111_000_000_000, 106_500_000_000),
    },
    coverage: {
      included_l2_count: 3,
      included_l2_origins: ["arbitrum", "base", "optimism"],
      excluded_external_da_origins: ["example-external-da"],
    },
    sources: ["fixture:ecosystem-capture"],
    source_status: [{
      source: "fixture:ecosystem-capture",
      role: "Fixture L2 and stablecoin evidence",
      as_of: "2026-08-22T23:59:59.000Z",
      stale: false,
    }],
    stale_data: [],
    confidence: 0.9,
    gaps: [],
    methodology_version: "eth-ecosystem-capture-v1" as const,
  };
}

function compassFixture() {
  return {
    summary: "The ecosystem expanded and ETH fee, settlement, and supply capture strengthened; collateral confirmation remains separate.",
    as_of: "2026-08-22T23:59:59.000Z",
    window: "30d" as const,
    judgment: "flow-driven" as const,
    ecosystem_state: "expanding" as const,
    eth_capture_state: "strengthening" as const,
    classification: "growth_with_capture" as const,
    capture_tier: "fee_and_supply" as const,
    axes: {
      ecosystem_activity: axis("improving"),
      usage_demand: axis("improving"),
      l2_settlement: axis("improving"),
      settlement_capture: axis("improving"),
      supply_absorption: axis("improving"),
      collateral_demand: axis("unknown"),
      monetary_settlement: axis("improving"),
    },
    evidence: [
      "Ethereum-settled L2 user fees increased.",
      "Rent paid to Ethereum increased faster than L2 user fees.",
      "Net issuance declined.",
    ],
    sources: ["fixture:value-capture", "fixture:ecosystem-capture"],
    confidence: 0.87,
    gaps: [],
    methodology_version: "eth-demand-compass-v2" as const,
  };
}

function providers(overrides: Partial<ConsoleGatewayOptions> = {}): ConsoleGatewayOptions {
  return {
    valueCaptureProvider: async () => valueCaptureFixture(),
    ecosystemCaptureProvider: async () => ecosystemCaptureFixture(),
    compassProvider: async () => compassFixture(),
    host: "127.0.0.1",
    port: 0,
    ...overrides,
  };
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

describe("console overview gateway", () => {
  it("returns one strict browser-safe overview contract", async () => {
    const origin = await start(providers());
    const response = await fetch(`${origin}/api/v1/eth/overview`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: unknown = await response.json();
    const overview = EthFrontendOverviewSnapshotSchema.parse(body);
    expect(overview.status).toBe("ready");
    expect(overview.decision.classification).toBe("growth_with_capture");
    expect(overview.data_quality.aligned_cutoff).toBe(true);
    expect(overview.coverage.included_l2_origins).toEqual(["arbitrum", "base", "optimism"]);
    expect(JSON.stringify(body)).not.toMatch(/byok_active|paid_sources_active|credential|api[_-]?key/i);
  });

  it("rejects legacy Compass V1 at the browser boundary", async () => {
    const legacy = compassFixture() as Record<string, unknown>;
    delete legacy.ecosystem_state;
    delete legacy.eth_capture_state;
    delete legacy.classification;
    delete legacy.capture_tier;
    legacy.methodology_version = "eth-demand-compass-v1";
    const axes = { ...(legacy.axes as Record<string, unknown>) };
    delete axes.ecosystem_activity;
    delete axes.settlement_capture;
    legacy.axes = axes;

    const origin = await start(providers({
      compassProvider: async () => legacy as never,
    }));
    const response = await fetch(`${origin}/api/v1/eth/overview`);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "upstream_snapshot_invalid" });
  });

  it("returns unavailable without leaking provider errors", async () => {
    const origin = await start(providers({
      ecosystemCaptureProvider: async () => {
        throw new Error("https://vendor.example/private-token");
      },
    }));
    const response = await fetch(`${origin}/api/v1/eth/overview`);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ error: "overview_unavailable" }));
    expect(text).not.toContain("private-token");
  });

  it("provides a bounded health route and rejects unsupported methods", async () => {
    const origin = await start(providers());
    const health = await fetch(`${origin}/api/health`);
    await expect(health.json()).resolves.toEqual({
      status: "ok",
      service: "onchain-pulse-console-gateway",
    });
    const post = await fetch(`${origin}/api/v1/eth/overview`, { method: "POST" });
    expect(post.status).toBe(405);
  });
});
