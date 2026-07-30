import { TTLCache } from "../cache.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

export interface CacheSpec {
  name: string;
  ttlMs: number;
  max: number;
}

export interface AdapterContext {
  cacheFor<T extends NonNullable<unknown> = AdapterResult>(spec: CacheSpec): TTLCache<T>;
  env: EnvConfig;
  fetch: typeof fetch;
}

export interface Adapter<I = void> {
  name: string;
  ttlMs: number;
  capabilities(env: EnvConfig): { byok_active: string[]; sources: string[] };
  fetch(input: I, ctx: AdapterContext): Promise<AdapterResult>;
}

export function makeContext(opts: {
  env: EnvConfig;
  fetchImpl?: typeof fetch;
}): AdapterContext {
  const caches = new Map<string, unknown>();
  return {
    cacheFor<T extends NonNullable<unknown>>(spec: CacheSpec): TTLCache<T> {
      const existing = caches.get(spec.name);
      if (existing) return existing as TTLCache<T>;
      const fresh = new TTLCache<T>({ ttlMs: spec.ttlMs, max: spec.max });
      caches.set(spec.name, fresh);
      return fresh;
    },
    env: opts.env,
    fetch: opts.fetchImpl ?? globalThis.fetch,
  };
}

export async function withCache<T extends NonNullable<unknown> = AdapterResult>(
  cache: TTLCache<T>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    return await cache.getOrLoad(key, loader);
  } catch (err) {
    const fallback = cache.getStale(key);
    if (fallback) {
      if (typeof fallback === "object" && fallback !== null && "stale" in fallback) {
        return { ...(fallback as object), stale: true } as unknown as T;
      }
      return fallback;
    }
    throw err;
  }
}
