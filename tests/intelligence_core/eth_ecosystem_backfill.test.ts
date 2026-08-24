import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../src/env.js";
import { shiftUtcDay } from "../../src/eth_value_capture/metrics.js";
import {
  EthEcosystemBackfillManifestSchema,
  runGrowThePieEcosystemBackfill,
} from "../../src/intelligence_core/backfill.js";
import type { MetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";

class MemoryStore implements MetricObservationStore {
  rows: MetricObservation[] = [];
  appendManyCalls = 0;
  async append(observation: MetricObservation): Promise<void> { this.rows.push(observation); }
  async appendMany(observations: readonly MetricObservation[]): Promise<void> {
    this.appendManyCalls += 1;
    this.rows.push(...observations);
  }
  async readAll(): Promise<MetricObservation[]> { return [...this.rows]; }
  async query(): Promise<MetricObservation[]> { return [...this.rows]; }
}

const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function masterBody(): Record<string, unknown> {
  return {
    chains: {
      ethereum: {
        chain_type: "l1",
        deployment: "PROD",
        da_layer: null,
        launch_date: "2015-07-30",
        supported_metrics: ["fees", "stables_mcap"],
      },
      base: {
        chain_type: "rollup",
        deployment: "PROD",
        da_layer: "Ethereum (blobs)",
        launch_date: "2023-08-09",
        supported_metrics: ["fees", "rent_paid", "stables_mcap"],
      },
    },
  };
}

function dailyRows(metricKey: string, origin: string, startDay: string, days: number, value: number) {
  return Array.from({ length: days }, (_, index) => ({
    metric_key: metricKey,
    origin_key: origin,
    date: shiftUtcDay(startDay, index),
    value,
  }));
}

function fixtures(feeValue = 10) {
  const start = "2026-07-16";
  const days = 15;
  return {
    master: masterBody(),
    fees: dailyRows("fees_paid_usd", "base", start, days, feeValue),
    rent: dailyRows("rent_paid_usd", "base", start, days, 2),
    stables: [
      ...dailyRows("stables_mcap", "ethereum", start, days, 1_000),
      ...dailyRows("stables_mcap", "base", start, days, 200),
    ],
  };
}

function fetchFor(fixture = fixtures()) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/master.json")) return jsonResponse(fixture.master);
    if (url.endsWith("/fees.json")) return jsonResponse(fixture.fees);
    if (url.endsWith("/rent_paid.json")) return jsonResponse(fixture.rent);
    if (url.endsWith("/stables_mcap.json")) return jsonResponse(fixture.stables);
    throw new Error(`unexpected request: ${url}`);
  });
}

async function tempManifestDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "opm-backfill-"));
  cleanup.push(directory);
  return directory;
}

const FIXED_NOW = () => new Date("2026-08-24T01:00:00.000Z");

describe("runGrowThePieEcosystemBackfill", () => {
  it("fetches each export once, writes daily window observations, and freezes a provenance manifest", async () => {
    const store = new MemoryStore();
    const fetchImpl = fetchFor();
    const manifestDir = await tempManifestDir();
    const result = await runGrowThePieEcosystemBackfill({
      env: loadEnv({ OPM_LANG: "en" }),
      store,
      manifestDir,
      startCutoffDay: "2026-07-30",
      endCutoffDay: "2026-07-31",
      window: "7d",
      runId: "test-backfill-1",
      fetchImpl: fetchImpl as typeof fetch,
      now: FIXED_NOW,
    });

    expect(result.status).toBe("complete");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(store.appendManyCalls).toBe(1);
    expect(store.rows).toHaveLength(12);
    expect(new Set(store.rows.map((row) => row.metric_key)).size).toBe(6);
    expect(new Set(store.rows.map((row) => row.observed_at.slice(0, 10))))
      .toEqual(new Set(["2026-07-29", "2026-07-30"]));
    expect(store.rows.every((row) => row.ingested_at === "2026-08-24T01:00:00.000Z")).toBe(true);
    expect(store.rows.every((row) => row.dimensions.collection_mode === "historical_backfill")).toBe(true);
    expect(result.manifest.ingestion_semantics.eligible_before_backfill_run).toBe(false);
    expect(result.manifest.ingestion_semantics.historical_source_versions_available).toBe(false);
    expect(result.manifest.license.commercial_redistribution_allowed).toBe(false);
    expect(result.manifest.source_payloads).toHaveLength(4);
    expect(result.manifest.source_payloads.every((source) => source.status === "captured")).toBe(true);
    expect(result.manifest.source_payloads.every((source) => /^[0-9a-f]{64}$/.test(source.body_sha256 ?? ""))).toBe(true);
    const persistedManifest = EthEcosystemBackfillManifestSchema.parse(
      JSON.parse(await readFile(result.manifest_path, "utf8")),
    );
    expect(persistedManifest.fingerprint_sha256).toBe(result.manifest.fingerprint_sha256);
  });

  it("is idempotent across different run ids when the semantic observations are unchanged", async () => {
    const store = new MemoryStore();
    const manifestDir = await tempManifestDir();
    const common = {
      env: loadEnv({}),
      store,
      manifestDir,
      startCutoffDay: "2026-07-30",
      endCutoffDay: "2026-07-31",
      window: "7d" as const,
      fetchImpl: fetchFor() as typeof fetch,
      now: FIXED_NOW,
    };
    const first = await runGrowThePieEcosystemBackfill({ ...common, runId: "test-backfill-a" });
    const second = await runGrowThePieEcosystemBackfill({ ...common, runId: "test-backfill-b" });
    expect(first.inserted_observation_ids).toHaveLength(12);
    expect(second.inserted_observation_ids).toHaveLength(0);
    expect(second.skipped_duplicate_ids).toHaveLength(12);
    expect(store.rows).toHaveLength(12);
  });

  it("creates new append-only revisions when a retrieved source changes the derived value", async () => {
    const store = new MemoryStore();
    const manifestDir = await tempManifestDir();
    const base = {
      env: loadEnv({}),
      store,
      manifestDir,
      startCutoffDay: "2026-07-30",
      endCutoffDay: "2026-07-31",
      window: "7d" as const,
    };
    await runGrowThePieEcosystemBackfill({
      ...base,
      runId: "test-revision-a",
      fetchImpl: fetchFor(fixtures(10)) as typeof fetch,
      now: FIXED_NOW,
    });
    const revised = await runGrowThePieEcosystemBackfill({
      ...base,
      runId: "test-revision-b",
      fetchImpl: fetchFor(fixtures(12)) as typeof fetch,
      now: () => new Date("2026-08-25T01:00:00.000Z"),
    });
    expect(revised.inserted_observation_ids.length).toBeGreaterThan(0);
    expect(store.rows.filter((row) => row.metric_key === "eth.l2_user_fees_usd")).toHaveLength(4);
    expect(new Set(store.rows
      .filter((row) => row.metric_key === "eth.l2_user_fees_usd")
      .map((row) => row.value))).toEqual(new Set([70, 84]));
  });

  it("keeps incomplete source days missing and reports a partial manifest", async () => {
    const fixture = fixtures();
    fixture.fees = fixture.fees.filter((row) => row.date !== "2026-07-25");
    const result = await runGrowThePieEcosystemBackfill({
      env: loadEnv({}),
      store: new MemoryStore(),
      manifestDir: await tempManifestDir(),
      startCutoffDay: "2026-07-30",
      endCutoffDay: "2026-07-31",
      window: "7d",
      runId: "test-partial",
      fetchImpl: fetchFor(fixture) as typeof fetch,
      now: FIXED_NOW,
    });
    expect(result.status).toBe("partial");
    expect(result.manifest.coverage.partial_cutoff_days).toBeGreaterThan(0);
    expect(result.manifest.gaps.map((gap) => gap.code)).toContain("fees_coverage_gap");
    expect(result.manifest.metric_keys).not.toContain("eth.l2_user_fees_usd");
  });
});
