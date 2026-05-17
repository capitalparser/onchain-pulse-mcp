import type { Adapter, AdapterContext } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

interface Input {
  addresses: string[];
}

interface Label {
  entity?: string;
  category?: string;
}

interface FetchOutcome<T> {
  data?: T;
  stale?: string;
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  label: string,
  headers?: Record<string, string>,
): Promise<FetchOutcome<T>> {
  try {
    const r = await fetchImpl(url, { headers });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return { stale: `${label}:auth_rejected` };
      if (r.status === 429) return { stale: `${label}:rate_limited` };
      return { stale: `${label}:http_${r.status}` };
    }
    return { data: (await r.json()) as T };
  } catch {
    return { stale: `${label}:network_error` };
  }
}

export const walletId: Adapter<Input> = {
  name: "wallet_id",
  ttlMs: 24 * 60 * 60_000,

  capabilities(env: EnvConfig) {
    const byok_active: string[] = [];
    if (env.byok.arkham) byok_active.push("arkham");
    if (env.byok.nansen) byok_active.push("nansen");
    return { byok_active, sources: byok_active };
  },

  async fetch(input: Input, ctx: AdapterContext): Promise<AdapterResult> {
    if (!ctx.env.byok.arkham && !ctx.env.byok.nansen) {
      return { data: { labels: {} }, sources: [], asOf: new Date().toISOString(), stale: false, stale_data: [] };
    }

    const staleData: string[] = [];
    const labels: Record<string, Label> = {};
    const sources: string[] = [];

    if (ctx.env.byok.nansen) {
      const q = input.addresses.map(encodeURIComponent).join(",");
      const ns = await fetchJson<Record<string, { label: string; category?: string }>>(
        ctx.fetch,
        `https://api.nansen.ai/api/beta/entity/by-address?addresses=${q}`,
        "nansen",
        { apiKey: ctx.env.byok.nansen },
      );
      if (ns.data) {
        for (const [addr, v] of Object.entries(ns.data)) {
          labels[addr] = { entity: v.label, category: v.category };
        }
        sources.push("nansen");
      } else if (ns.stale) {
        staleData.push(ns.stale);
      }
    }

    if (ctx.env.byok.arkham) {
      const q = input.addresses.map(encodeURIComponent).join(",");
      const ak = await fetchJson<Record<string, { entity: string }>>(
        ctx.fetch,
        `https://api.arkhamintelligence.com/intelligence/address/${q}`,
        "arkham",
        { "API-Key": ctx.env.byok.arkham },
      );
      if (ak.data) {
        for (const [addr, v] of Object.entries(ak.data)) {
          labels[addr] = { ...labels[addr], entity: v.entity };
        }
        sources.push("arkham");
      } else if (ak.stale) {
        staleData.push(ak.stale);
      }
    }

    return { data: { labels }, sources, asOf: new Date().toISOString(), stale: false, stale_data: staleData };
  },
};
