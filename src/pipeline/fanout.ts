import type { Adapter, AdapterContext } from "../adapters/base.js";
import type { AdapterResult } from "../types.js";

export interface AdapterFanoutResult {
  perAdapter: Record<string, AdapterResult>;
  sources: string[];
  byokActive: string[];
  staleData: string[];
  asOf: string;
}

export async function fanOutAdapters(
  adapters: ReadonlyArray<Adapter>,
  ctx: AdapterContext,
): Promise<AdapterFanoutResult> {
  const perAdapter: Record<string, AdapterResult> = {};
  const sourcesSet = new Set<string>();
  const byokSet = new Set<string>();
  const staleData: string[] = [];
  let latestAsOf = "";

  const settled = await Promise.allSettled(
    adapters.map(async (a) => {
      const caps = a.capabilities(ctx.env);
      for (const k of caps.byok_active) byokSet.add(k);
      try {
        const result = await a.fetch(undefined as never, ctx);
        return { name: a.name, result };
      } catch {
        return { name: a.name, threw: true } as const;
      }
    }),
  );

  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const v = s.value;
    if ("threw" in v) {
      perAdapter[v.name] = { data: {}, sources: [], asOf: "", stale: false };
      staleData.push(`${v.name}:adapter_threw`);
      continue;
    }

    perAdapter[v.name] = v.result;
    for (const src of v.result.sources) sourcesSet.add(src);
    for (const sd of v.result.stale_data ?? []) staleData.push(sd);
    if (v.result.stale) staleData.push(`${v.name}:stale_fallback`);
    if (v.result.asOf > latestAsOf) latestAsOf = v.result.asOf;
  }

  return {
    perAdapter,
    sources: [...sourcesSet].sort(),
    byokActive: [...byokSet].sort(),
    staleData,
    asOf: latestAsOf,
  };
}
