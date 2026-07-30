import { LRUCache } from "lru-cache";

export interface TTLCacheOpts {
  ttlMs: number;
  max: number;
}

export class TTLCache<V extends NonNullable<unknown>> {
  private fresh: LRUCache<string, { value: V; expiresAt: number }>;
  private stale: LRUCache<string, V>;
  private inFlight: Map<string, Promise<V>> = new Map();
  private ttlMs: number;

  constructor(opts: TTLCacheOpts) {
    this.ttlMs = opts.ttlMs;
    this.fresh = new LRUCache({ max: opts.max });
    this.stale = new LRUCache({ max: opts.max });
  }

  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const p = (async () => {
      try {
        const v = await loader();
        this.set(key, v);
        return v;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, p);
    return p;
  }

  set(key: string, value: V): void {
    this.fresh.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.stale.set(key, value);
  }

  get(key: string): V | undefined {
    const entry = this.fresh.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.fresh.delete(key);
      return undefined;
    }
    return entry.value;
  }

  getStale(key: string): V | undefined {
    return this.stale.get(key);
  }
}
