import * as cheerio from "cheerio";
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

const TTL_MS = 30 * 60_000;
const CACHE_MAX = 8;

interface FetchOutcome<T> {
  data?: T;
  stale?: string;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, label: string): Promise<FetchOutcome<T>> {
  try {
    const r = await fetchImpl(url);
    if (!r.ok) return { stale: `${label}:http_${r.status}` };
    return { data: (await r.json()) as T };
  } catch {
    return { stale: `${label}:network_error` };
  }
}

async function fetchText(fetchImpl: typeof fetch, url: string, label: string): Promise<FetchOutcome<string>> {
  try {
    const r = await fetchImpl(url);
    if (!r.ok) return { stale: `${label}:http_${r.status}` };
    return { data: await r.text() };
  } catch {
    return { stale: `${label}:network_error` };
  }
}

export function parseFarsideTable(html: string): Array<{ date: string; flowUsd: number }> {
  let $: ReturnType<typeof cheerio.load>;
  try {
    $ = cheerio.load(html);
  } catch {
    return [];
  }

  const rows: Array<{ date: string; flowUsd: number }> = [];
  $("table tbody tr").each((_, el) => {
    const $tr = $(el);
    if ($tr.hasClass("footer-totals")) return;
    const $cells = $tr.find("td");
    if ($cells.length < 2) return;
    const dateRaw = $cells.eq(0).text().trim();
    if (!/^\d{1,2}\s\w+\s\d{4}$/.test(dateRaw)) return;
    const totalRaw = $cells.eq($cells.length - 1).text();
    const num = parseFarsideNumber(totalRaw);
    if (num === undefined) return;
    rows.push({ date: dateRaw, flowUsd: Math.round(num * 1_000_000) });
  });
  return rows.slice(0, 7);
}

function parseFarsideNumber(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[*†‡]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/[−‒–—]/g, "-");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export const macroRwa: Adapter = {
  name: "macro_rwa",
  ttlMs: TTL_MS,

  capabilities(_env: EnvConfig) {
    return { byok_active: [], sources: ["farside.co.uk", "coingecko", "defillama"] };
  },

  async fetch(_input, ctx: AdapterContext): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "macro_rwa", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "macro_rwa", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      const farside = await fetchText(
        ctx.fetch,
        "https://farside.co.uk/btc-etf-flow-all-data/",
        "farside.co.uk",
      );
      if (farside.data) {
        const rows = parseFarsideTable(farside.data);
        if (rows.length < 7) {
          staleData.push("farside.co.uk:parse_failed");
        } else {
          data.etf_7d_net_usd = rows.reduce((s, r) => s + r.flowUsd, 0);
          sources.push("farside.co.uk");
        }
      } else if (farside.stale) {
        staleData.push(farside.stale);
      }

      const cg = await fetchJson<{ data: { market_cap_percentage: { btc: number } } }>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/global",
        "coingecko",
      );
      if (cg.data) {
        data.btc_dominance = cg.data.data.market_cap_percentage.btc;
        sources.push("coingecko");
      } else if (cg.stale) {
        staleData.push(cg.stale);
      }

      const dl = await fetchJson<Array<{ category?: string; tvl?: number }>>(
        ctx.fetch,
        "https://api.llama.fi/protocols",
        "defillama",
      );
      if (dl.data) {
        data.rwa_tvl_usd = dl.data
          .filter((p) => p.category === "RWA")
          .reduce((s, p) => s + (p.tvl ?? 0), 0);
        sources.push("defillama");
      } else if (dl.stale) {
        staleData.push(dl.stale);
      }

      return {
        data,
        sources,
        asOf: new Date().toISOString(),
        stale: false,
        stale_data: staleData,
      };
    });
  },
};
