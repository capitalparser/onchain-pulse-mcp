import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeContext } from "../../src/adapters/base.js";
import { macroRwa, parseFarsideTable } from "../../src/adapters/macro_rwa.js";

const cleanHtml = readFileSync(resolve("tests/adapters/fixtures/farside_btc_etf_clean.html"), "utf-8");
const realisticHtml = readFileSync(
  resolve("tests/adapters/fixtures/farside_btc_etf_realistic.html"),
  "utf-8",
);
const brokenHtml = readFileSync(resolve("tests/adapters/fixtures/farside_btc_etf_broken.html"), "utf-8");
const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

function fakeFetch(map: Record<string, unknown | string>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pattern, body] of Object.entries(map)) {
      if (u.includes(pattern)) {
        const isJson = typeof body !== "string";
        return new Response(isJson ? JSON.stringify(body) : body, {
          status: 200,
          headers: { "content-type": isJson ? "application/json" : "text/html" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("parseFarsideTable", () => {
  it("clean markup: extracts 7 rows with correct dates and signed millions", () => {
    const rows = parseFarsideTable(cleanHtml);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ date: "07 May 2026", flowUsd: 340_500_000 });
    expect(rows[2]).toEqual({ date: "05 May 2026", flowUsd: -50_000_000 });
  });

  it("realistic markup: handles entity, comma grouping, class attrs, sup footnotes, whitespace", () => {
    const rows = parseFarsideTable(realisticHtml);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ date: "07 May 2026", flowUsd: 1_340_500_000 });
    expect(rows[2]).toEqual({ date: "05 May 2026", flowUsd: -50_000_000 });
    expect(rows.find((r) => r.date === "Cumulative")).toBeUndefined();
  });

  it("broken markup: returns empty array (parser does not throw)", () => {
    expect(parseFarsideTable(brokenHtml)).toEqual([]);
  });
});

describe("macro_rwa adapter", () => {
  it("happy path: computes 7d ETF net flow + BTC dominance + RWA TVL from clean markup", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "farside.co.uk/btc-etf-flow-all-data": cleanHtml,
        "coingecko.com/api/v3/global": { data: { market_cap_percentage: { btc: 56.4 } } },
        "api.llama.fi/protocols": [
          { name: "Ondo", category: "RWA", tvl: 1_200_000_000 },
          { name: "Maple", category: "RWA", tvl: 600_000_000 },
          { name: "Compound", category: "Lending", tvl: 5_000_000_000 },
        ],
      }),
    });
    const r = await macroRwa.fetch(undefined, ctx);
    expect(r.data.etf_7d_net_usd).toBeCloseTo(500_500_000, 0);
    expect(r.data.btc_dominance).toBeCloseTo(56.4, 2);
    expect(r.data.rwa_tvl_usd).toBe(1_800_000_000);
    expect(r.sources).toEqual(expect.arrayContaining(["farside.co.uk", "coingecko", "defillama"]));
    expect(r.stale_data ?? []).toEqual([]);
  });

  it("realistic markup: parses 7 rows correctly even with attributes and entities", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "farside.co.uk/btc-etf-flow-all-data": realisticHtml,
        "coingecko.com/api/v3/global": { data: { market_cap_percentage: { btc: 56.4 } } },
        "api.llama.fi/protocols": [],
      }),
    });
    const r = await macroRwa.fetch(undefined, ctx);
    expect(r.data.etf_7d_net_usd).toBeCloseTo(1_500_500_000, 0);
  });

  it("F11 broken markup fallback: ETF omitted, stale_data annotated, other sources survive", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: fakeFetch({
        "farside.co.uk/btc-etf-flow-all-data": brokenHtml,
        "coingecko.com/api/v3/global": { data: { market_cap_percentage: { btc: 56.4 } } },
        "api.llama.fi/protocols": [{ name: "Ondo", category: "RWA", tvl: 1_000_000_000 }],
      }),
    });
    const r = await macroRwa.fetch(undefined, ctx);
    expect(r.data.etf_7d_net_usd).toBeUndefined();
    expect(r.data.btc_dominance).toBeCloseTo(56.4, 2);
    expect(r.data.rwa_tvl_usd).toBe(1_000_000_000);
    expect(r.stale_data).toContain("farside.co.uk:parse_failed");
    expect(r.sources).not.toContain("farside.co.uk");
  });

  it("Farside HTTP outage: ETF undefined, stale_data flagged, other sources survive", async () => {
    const ctx = makeContext({
      env,
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("farside")) return new Response("err", { status: 503 });
        if (u.includes("coingecko")) {
          return new Response(JSON.stringify({ data: { market_cap_percentage: { btc: 56.4 } } }), {
            status: 200,
          });
        }
        if (u.includes("api.llama.fi/protocols")) return new Response("[]", { status: 200 });
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await macroRwa.fetch(undefined, ctx);
    expect(r.data.etf_7d_net_usd).toBeUndefined();
    expect(r.stale_data).toContain("farside.co.uk:http_503");
    expect(r.data.btc_dominance).toBeCloseTo(56.4, 2);
  });
});
