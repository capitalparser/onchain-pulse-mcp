# onchain-pulse-mcp v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless TypeScript MCP server that exposes 6 onchain market-pulse tools backed by 6 data adapters, with BYOK enrichment, weighted-z-score composite pulse, and graceful partial-failure handling.

**Architecture:** stdio MCP server (`@modelcontextprotocol/sdk`) → tool handlers → parallel adapter fan-out (free defaults + optional BYOK paid endpoints) → in-memory LRU TTL cache. Composite pulse score loaded from `config/pulse.yaml`. Partial source failures yield `confidence < 1.0` with `stale_data` annotations rather than throwing.

**Tech Stack:** TypeScript 5.x, Node 20+, `@modelcontextprotocol/sdk`, `zod`, `lru-cache`, `yaml`, `vitest`, `tsup`, native `fetch`.

**Spec:** `docs/superpowers/specs/2026-05-08-onchain-pulse-mcp-design.md`

---

## File Structure

```
src/
  index.ts                      # bin entry — stdio MCP server
  server.ts                     # createServer() — registers tools
  types.ts                      # AdapterResult, ToolResponse, Reading, Lang
  env.ts                        # EnvConfig: BYOK keys + locale
  cache.ts                      # TTLCache wrapper (lru-cache)
  stats.ts                      # zScore, sigmoid, mean, std
  adapters/
    base.ts                     # Adapter interface, AdapterContext, withCache()
    derivatives.ts              # Deribit free + Coinglass BYOK
    macro_rwa.ts                # Defillama, Farside ETF, RWA.xyz
    onchain_wallet.ts           # Etherscan + Defillama stables + Nansen BYOK
    cex_flow.ts                 # CoinGecko + Defillama + Glassnode BYOK
    kr_premium.ts                 # Upbit + Bithumb (no BYOK)
    wallet_id.ts                # Arkham/Nansen BYOK only (free no-op)
  pulse/
    config.ts                   # loadPulseConfig() — YAML + zod
    reading.ts                  # toReading, formatSummary (en/ko)
    score.ts                    # computePulseScore (weighted z + sigmoid)
  tools/
    get_market_pulse.ts
    get_etf_flow.ts
    get_stablecoin_pulse.ts
    get_funding_oi.ts
    get_kr_premium.ts
    get_rwa_pulse.ts
config/
  pulse.yaml                     # default weights + reading buckets
examples/
  rules/                        # 5 reference YAML alert rules
tests/
  (mirrors src/)
.github/workflows/
  ci.yml
tsconfig.json
tsup.config.ts
vitest.config.ts
package.json (existing, modified)
```

---

## Task 1: TypeScript scaffolding

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Replace `package.json` scripts and add deps**

Open `package.json` and replace `scripts` and add `dependencies` / `devDependencies`:

```json
{
  "name": "onchain-pulse-mcp",
  "version": "0.0.1",
  "description": "Read-only MCP server exposing onchain market pulse signals (CEX flow, on-chain wallets, derivatives, ETF/RWA macro, Korea premium) for AI agents and humans.",
  "license": "MIT",
  "author": "Kim Kyung-jun <iwbasm92@gmail.com>",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "onchain-pulse-mcp": "./dist/index.js" },
  "files": ["dist", "config", "examples", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "keywords": ["mcp", "model-context-protocol", "onchain", "crypto", "rwa", "market-pulse", "trading", "ai-agent", "byok"],
  "repository": { "type": "git", "url": "git+https://github.com/capitalparser/onchain-pulse-mcp.git" },
  "bugs": { "url": "https://github.com/capitalparser/onchain-pulse-mcp/issues" },
  "homepage": "https://github.com/capitalparser/onchain-pulse-mcp#readme",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "cheerio": "^1.0.0",
    "lru-cache": "^11.0.2",
    "yaml": "^2.6.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  dts: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
  },
});
```

- [ ] **Step 5: Create `src/index.ts` placeholder**

```ts
// MCP server entry — implementation arrives in Task 22.
// Until then this file lets `npm run build` succeed.
export {};
```

- [ ] **Step 6: Create `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install + verify**

```bash
npm install
npm run typecheck
npm run test
npm run build
```

Expected:
- `npm run typecheck`: no output, exit 0
- `npm run test`: `1 passed`
- `npm run build`: writes `dist/index.js` and `dist/index.d.ts`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts src/index.ts tests/smoke.test.ts
git add -- ':!node_modules'
git commit -m "chore: TypeScript + vitest + tsup scaffolding"
```

---

## Task 2: Shared types (`src/types.ts`)

**Files:**
- Create: `src/types.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test (zod runtime shape check)**

`tests/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ToolResponseSchema, type Reading } from "../src/types.js";

describe("ToolResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    const ok = ToolResponseSchema.parse({
      summary: "ETF +$340M 7d, reading: risk-on (78/100)",
      score: 78,
      reading: "risk-on",
      as_of: "2026-05-08T07:00:00Z",
      inputs: { etf_7d_net_usd: 340_000_000 },
      sources: ["farside.co.uk", "defillama"],
      stale_data: [],
      confidence: 1.0,
      capabilities: { byok_active: [] },
    });
    expect(ok.reading satisfies Reading).toBe("risk-on");
  });

  it("accepts unknown reading and null score for full-failure case", () => {
    const r = ToolResponseSchema.parse({
      summary: "data unavailable",
      score: null,
      reading: "unknown",
      as_of: "2026-05-08T07:00:00Z",
      inputs: {},
      sources: [],
      stale_data: ["all sources down"],
      confidence: 0,
      capabilities: { byok_active: [] },
    });
    expect(r.score).toBeNull();
  });

  it("rejects an out-of-range score", () => {
    expect(() =>
      ToolResponseSchema.parse({
        summary: "x",
        score: 150,
        reading: "risk-on",
        as_of: "2026-05-08T07:00:00Z",
        inputs: {},
        sources: [],
        stale_data: [],
        confidence: 1,
        capabilities: { byok_active: [] },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test -- types
```

Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 3: Create `src/types.ts`**

```ts
import { z } from "zod";

export const ReadingSchema = z.enum(["risk-off", "neutral", "risk-on", "unknown"]);
export type Reading = z.infer<typeof ReadingSchema>;

export const LangSchema = z.enum(["en", "ko"]);
export type Lang = z.infer<typeof LangSchema>;

export const CapabilitiesSchema = z.object({
  byok_active: z.array(z.string()),
  sources: z.array(z.string()).optional(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const AdapterResultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  sources: z.array(z.string()),
  asOf: z.string(),
  stale: z.boolean(),
});
export type AdapterResult = z.infer<typeof AdapterResultSchema>;

export const ToolResponseSchema = z.object({
  summary: z.string(),
  score: z.number().min(0).max(100).nullable(),
  reading: ReadingSchema,
  as_of: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  sources: z.array(z.string()),
  stale_data: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  capabilities: CapabilitiesSchema,
});
export type ToolResponse = z.infer<typeof ToolResponseSchema>;
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm run test -- types
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat(types): shared schemas — ToolResponse, AdapterResult, Reading, Lang"
```

---

## Task 3: BYOK env detection (`src/env.ts`)

**Files:**
- Create: `src/env.ts`
- Create: `tests/env.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadEnv, type EnvConfig } from "../src/env.js";

describe("loadEnv", () => {
  it("defaults to no enrichment when no BYOK keys present", () => {
    const cfg = loadEnv({});
    expect(cfg.byok.nansen).toBeUndefined();
    expect(cfg.byok.glassnode).toBeUndefined();
    expect(cfg.lang).toBe("en");
  });

  it("captures BYOK keys when present", () => {
    const cfg: EnvConfig = loadEnv({
      NANSEN_API_KEY: "n-1",
      GLASSNODE_API_KEY: "g-1",
      ARKHAM_API_KEY: "a-1",
      COINGLASS_API_KEY: "c-1",
      CRYPTOQUANT_API_KEY: "cq-1",
      LAEVITAS_API_KEY: "l-1",
    });
    expect(cfg.byok.nansen).toBe("n-1");
    expect(cfg.byok.glassnode).toBe("g-1");
    expect(cfg.byok.arkham).toBe("a-1");
    expect(cfg.byok.coinglass).toBe("c-1");
    expect(cfg.byok.cryptoquant).toBe("cq-1");
    expect(cfg.byok.laevitas).toBe("l-1");
  });

  it("respects OPM_LANG=ko", () => {
    expect(loadEnv({ OPM_LANG: "ko" }).lang).toBe("ko");
  });

  it("falls back to en when OPM_LANG is invalid", () => {
    expect(loadEnv({ OPM_LANG: "fr" }).lang).toBe("en");
  });

  it("defaults historyPath to ~/.cache/onchain-pulse-mcp/history.json (tilde expanded)", () => {
    const cfg = loadEnv({ HOME: "/home/test" });
    expect(cfg.historyPath).toBe("/home/test/.cache/onchain-pulse-mcp/history.json");
  });

  it("respects OPM_HISTORY_PATH override and expands leading ~", () => {
    const cfg = loadEnv({ HOME: "/home/test", OPM_HISTORY_PATH: "~/custom/h.json" });
    expect(cfg.historyPath).toBe("/home/test/custom/h.json");
  });

  it("preserves an absolute OPM_HISTORY_PATH unchanged", () => {
    const cfg = loadEnv({ HOME: "/home/test", OPM_HISTORY_PATH: "/var/lib/opm/history.json" });
    expect(cfg.historyPath).toBe("/var/lib/opm/history.json");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm run test -- env
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/env.ts`**

```ts
import { join } from "node:path";
import { LangSchema, type Lang } from "./types.js";

export interface BYOKKeys {
  nansen?: string;
  glassnode?: string;
  arkham?: string;
  coinglass?: string;
  cryptoquant?: string;
  laevitas?: string;
}

export interface EnvConfig {
  byok: BYOKKeys;
  lang: Lang;
  /**
   * Absolute, tilde-expanded path to the history ring buffer JSON file
   * (Task 8.5). Defaults to `${HOME}/.cache/onchain-pulse-mcp/history.json`;
   * overridable via `OPM_HISTORY_PATH`. Leading `~` is expanded against `HOME`.
   * Non-leading `~` is preserved as a literal character.
   */
  historyPath: string;
}

export function loadEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): EnvConfig {
  const langParse = LangSchema.safeParse(env.OPM_LANG);
  const home = env.HOME ?? "";
  const rawHistory = env.OPM_HISTORY_PATH ?? "~/.cache/onchain-pulse-mcp/history.json";
  const historyPath = rawHistory.startsWith("~/")
    ? join(home, rawHistory.slice(2))
    : rawHistory === "~"
      ? home
      : rawHistory;
  return {
    byok: {
      nansen: env.NANSEN_API_KEY,
      glassnode: env.GLASSNODE_API_KEY,
      arkham: env.ARKHAM_API_KEY,
      coinglass: env.COINGLASS_API_KEY,
      cryptoquant: env.CRYPTOQUANT_API_KEY,
      laevitas: env.LAEVITAS_API_KEY,
    },
    lang: langParse.success ? langParse.data : "en",
    historyPath,
  };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm run test -- env
```

Expected: 7 passed (4 BYOK/lang + 3 historyPath).

- [ ] **Step 5: Commit**

```bash
git add src/env.ts tests/env.test.ts
git commit -m "feat(env): BYOK key + locale detection from process env"
```

---

## Task 4: Stats utilities (`src/stats.ts`)

**Files:**
- Create: `src/stats.ts`
- Create: `tests/stats.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mean, stdev, zScore, sigmoid01 } from "../src/stats.js";

describe("stats", () => {
  it("mean averages a list", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("mean throws on empty input", () => {
    expect(() => mean([])).toThrow("mean: empty input");
  });

  it("stdev computes population standard deviation", () => {
    // population stdev of [2,4,4,4,5,5,7,9] = 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it("stdev returns 0 for single-value series", () => {
    expect(stdev([5])).toBe(0);
  });

  it("zScore returns 0 when stdev is 0 (no variance)", () => {
    expect(zScore(5, [5, 5, 5])).toBe(0);
  });

  it("zScore yields ~1 for one-stdev-above-mean point", () => {
    const series = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(zScore(7, series)).toBeCloseTo(1.0, 5);
  });

  it("sigmoid01 maps 0 → 0.5", () => {
    expect(sigmoid01(0)).toBeCloseTo(0.5, 5);
  });

  it("sigmoid01 is monotonic", () => {
    const a = sigmoid01(-2);
    const b = sigmoid01(0);
    const c = sigmoid01(2);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- stats
```

Expected: FAIL.

- [ ] **Step 3: Create `src/stats.ts`**

```ts
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean: empty input");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / xs.length);
}

export function zScore(x: number, history: readonly number[]): number {
  const sd = stdev(history);
  if (sd === 0) return 0;
  return (x - mean(history)) / sd;
}

export function sigmoid01(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- stats
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/stats.ts tests/stats.test.ts
git commit -m "feat(stats): mean, stdev, zScore, sigmoid01"
```

---

## Task 5: TTL cache (`src/cache.ts`)

**Files:**
- Create: `src/cache.ts`
- Create: `tests/cache.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache } from "../src/cache.js";

describe("TTLCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns cached value within TTL", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const loader = async () => {
      calls++;
      return "v";
    };
    expect(await c.getOrLoad("k", loader)).toBe("v");
    expect(await c.getOrLoad("k", loader)).toBe("v");
    expect(calls).toBe(1);
  });

  it("re-loads after TTL expires", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const loader = async () => `v${++calls}`;
    expect(await c.getOrLoad("k", loader)).toBe("v1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await c.getOrLoad("k", loader)).toBe("v2");
  });

  it("getStale returns last value even after TTL expires", async () => {
    const c = new TTLCache<string>({ ttlMs: 1000, max: 10 });
    await c.getOrLoad("k", async () => "v1");
    await vi.advanceTimersByTimeAsync(1500);
    expect(c.getStale("k")).toBe("v1");
  });

  it("evicts least-recently-used entries past max", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 2 });
    await c.getOrLoad("a", async () => "a");
    await c.getOrLoad("b", async () => "b");
    await c.getOrLoad("c", async () => "c");
    expect(c.getStale("a")).toBeUndefined();
  });

  it("coalesces concurrent getOrLoad calls for the same key (single upstream call)", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return `v${calls}`;
    };
    // Fire three concurrent loads for the same key before any resolves.
    const p = Promise.all([
      c.getOrLoad("k", loader),
      c.getOrLoad("k", loader),
      c.getOrLoad("k", loader),
    ]);
    await vi.advanceTimersByTimeAsync(60);
    const [a, b, d] = await p;
    expect([a, b, d]).toEqual(["v1", "v1", "v1"]); // all callers receive the same value
    expect(calls).toBe(1);                          // loader invoked exactly once
  });

  it("does NOT coalesce calls across different keys", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = async () => `v${++calls}`;
    const [a, b] = await Promise.all([
      c.getOrLoad("a", loader),
      c.getOrLoad("b", loader),
    ]);
    expect(a).not.toBe(b);
    expect(calls).toBe(2);
  });

  it("clears the in-flight map when the loader rejects, allowing retry", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    let calls = 0;
    const loader = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("first attempt fails");
      return "ok";
    });
    await expect(c.getOrLoad("k", loader)).rejects.toThrow("first attempt fails");
    expect(await c.getOrLoad("k", loader)).toBe("ok"); // second call enters loader fresh
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("set/get expose direct cache writes for deterministic tests", async () => {
    const c = new TTLCache<string>({ ttlMs: 60_000, max: 10 });
    c.set("k", "manual");
    expect(c.get("k")).toBe("manual");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.get("k")).toBeUndefined();         // expired from fresh
    expect(c.getStale("k")).toBe("manual");     // still in stale
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- cache
```

Expected: FAIL.

- [ ] **Step 3: Create `src/cache.ts`**

```ts
import { LRUCache } from "lru-cache";

export interface TTLCacheOpts {
  ttlMs: number;
  max: number;
}

export class TTLCache<V extends NonNullable<unknown>> {
  private fresh: LRUCache<string, V>;
  private stale: LRUCache<string, V>;
  // In-flight load coalescing: while a loader for key K is pending, all
  // concurrent getOrLoad(K, ...) callers share its promise. Prevents the
  // thundering herd on a cold-start hot key (Codex review F1).
  private inFlight: Map<string, Promise<V>> = new Map();

  constructor(opts: TTLCacheOpts) {
    this.fresh = new LRUCache({ max: opts.max, ttl: opts.ttlMs });
    this.stale = new LRUCache({ max: opts.max });
  }

  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.fresh.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const v = await loader();
        this.fresh.set(key, v);
        this.stale.set(key, v);
        return v;
      } finally {
        // Clear in-flight whether the loader resolved or rejected, so a
        // failed load does not poison subsequent retries.
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, p);
    return p;
  }

  /** Direct write — used by Task 6 cache-isolation tests and adapter prewarm. */
  set(key: string, value: V): void {
    this.fresh.set(key, value);
    this.stale.set(key, value);
  }

  /** Returns the fresh (non-expired) entry, or undefined if expired or absent. */
  get(key: string): V | undefined {
    return this.fresh.get(key);
  }

  getStale(key: string): V | undefined {
    return this.stale.get(key);
  }
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- cache
```

Expected: 8 passed (4 base TTL/LRU + 3 in-flight coalescing + 1 set/get).

- [ ] **Step 5: Commit**

```bash
git add src/cache.ts tests/cache.test.ts
git commit -m "feat(cache): TTL cache with stale fallback + in-flight coalescing"
```

---

## Task 6: Adapter base (`src/adapters/base.ts`)

**Files:**
- Create: `src/adapters/base.ts`
- Create: `tests/adapters/base.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/adapters/base.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { TTLCache } from "../../src/cache.js";
import { withCache, makeContext, type Adapter } from "../../src/adapters/base.js";

describe("withCache", () => {
  it("uses fresh cache when loader resolves", async () => {
    const cache = new TTLCache({ ttlMs: 60_000, max: 10 });
    const loader = vi.fn(async () => ({
      data: { x: 1 },
      sources: ["s"],
      asOf: "2026-05-08T00:00:00Z",
      stale: false,
    }));
    const r1 = await withCache(cache, "k", loader);
    const r2 = await withCache(cache, "k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(r1.stale).toBe(false);
    expect(r2.stale).toBe(false);
  });

  it("returns stale fallback when loader throws and stale exists", async () => {
    const cache = new TTLCache({ ttlMs: 1, max: 10 });
    let n = 0;
    const loader = async () => {
      n++;
      if (n === 1) {
        return { data: { x: 1 }, sources: ["s"], asOf: "t1", stale: false };
      }
      throw new Error("boom");
    };
    await withCache(cache, "k", loader);
    await new Promise((r) => setTimeout(r, 5));
    const r = await withCache(cache, "k", loader);
    expect(r.stale).toBe(true);
    expect(r.data).toEqual({ x: 1 });
  });

  it("rethrows when loader throws and no stale exists", async () => {
    const cache = new TTLCache({ ttlMs: 60_000, max: 10 });
    await expect(
      withCache(cache, "k", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
  });
});

describe("makeContext", () => {
  it("returns a context with a cache factory keyed by adapter name", () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    expect(typeof ctx.cacheFor).toBe("function");
    expect(typeof ctx.fetch).toBe("function");
  });

  it("caches are isolated per adapter (no cross-contamination)", () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const a = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const b = ctx.cacheFor({ name: "macro_rwa", ttlMs: 600_000, max: 32 });
    expect(a).not.toBe(b);
    a.set("k", { data: { from: "deriv" }, sources: [], asOf: "", stale: false });
    expect(b.get("k")).toBeUndefined();
  });

  it("returns the same cache instance on repeated calls for the same adapter", () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const a1 = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const a2 = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    expect(a1).toBe(a2);
  });

  it("honours each adapter's declared ttlMs (no shared default override)", async () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const shortLived = ctx.cacheFor({ name: "fast", ttlMs: 1, max: 8 });
    const longLived = ctx.cacheFor({ name: "slow", ttlMs: 60_000, max: 8 });
    shortLived.set("k", { data: 1 as unknown, sources: [], asOf: "", stale: false });
    longLived.set("k", { data: 2 as unknown, sources: [], asOf: "", stale: false });
    await new Promise((r) => setTimeout(r, 5));
    expect(shortLived.get("k")).toBeUndefined(); // expired
    expect(longLived.get("k")).toBeDefined();    // still fresh
  });
});

describe("Adapter interface", () => {
  it("can be implemented", () => {
    const stub: Adapter = {
      name: "stub",
      ttlMs: 1000,
      capabilities: () => ({ byok_active: [], sources: ["x"] }),
      fetch: async () => ({ data: {}, sources: [], asOf: "", stale: false }),
    };
    expect(stub.name).toBe("stub");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/base
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/base.ts`**

```ts
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";
import { TTLCache } from "../cache.js";

export interface CacheSpec {
  name: string;     // adapter name — used as namespace key
  ttlMs: number;    // adapter's declared TTL (NOT a shared default)
  max: number;      // adapter's declared max entries
}

export interface AdapterContext {
  /**
   * Returns a cache instance scoped to a single adapter. Caches are isolated:
   * adapter A cannot read or evict adapter B's entries. The same `spec.name`
   * always yields the same instance for the lifetime of the context.
   *
   * Why per-adapter rather than shared: spec §4 requires adapter-specific TTLs
   * (derivatives 90s, macro_rwa 10min, etc.). A shared cache forces a single
   * compromise TTL and lets one adapter's evictions thrash another's hot keys.
   */
  cacheFor<T = AdapterResult>(spec: CacheSpec): TTLCache<T>;
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
  const caches = new Map<string, TTLCache<unknown>>();
  return {
    cacheFor<T>(spec: CacheSpec): TTLCache<T> {
      const existing = caches.get(spec.name);
      if (existing) return existing as TTLCache<T>;
      const fresh = new TTLCache<T>({ ttlMs: spec.ttlMs, max: spec.max });
      caches.set(spec.name, fresh as TTLCache<unknown>);
      return fresh;
    },
    env: opts.env,
    fetch: opts.fetchImpl ?? globalThis.fetch,
  };
}

export async function withCache<T = AdapterResult>(
  cache: TTLCache<T>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    return await cache.getOrLoad(key, loader);
  } catch (err) {
    const fallback = cache.getStale(key);
    if (fallback) {
      // AdapterResult-shaped fallbacks gain `stale: true`; non-AdapterResult
      // payloads are returned as-is. Adapters that need stale signalling must
      // use the AdapterResult shape.
      if (typeof fallback === "object" && fallback !== null && "stale" in fallback) {
        return { ...(fallback as object), stale: true } as T;
      }
      return fallback;
    }
    throw err;
  }
}
```

> **Adapter usage convention.** Each adapter calls `ctx.cacheFor({ name: this.name, ttlMs: this.ttlMs, max: 32 })` once at the top of `fetch()` and uses that instance for `withCache(cache, ...)`. Tasks 10–15 (and the warmup CLI in Task 22.5) rely on this isolation. Do **not** introduce a global default `ttlMs` here — every adapter declares its own.

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/base
```

Expected: 8 passed (3 `withCache` + 4 `makeContext` + 1 Adapter interface).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/base.ts tests/adapters/base.test.ts
git commit -m "feat(adapters): Adapter interface, context, withCache stale-fallback"
```

---

## Task 7: Pulse config loader (`src/pulse/config.ts` + `config/pulse.yaml`)

**Files:**
- Create: `config/pulse.yaml`
- Create: `src/pulse/config.ts`
- Create: `tests/pulse/config.test.ts`

- [ ] **Step 1: Create `config/pulse.yaml`**

```yaml
weights:
  etf_7d_net_flow_btc_eth: 0.25
  stablecoin_7d_supply_delta: 0.20
  upbit_netflow_7d_kr: 0.15
  funding_avg_btc_eth: 0.15
  btc_dominance_7d_delta: 0.10
  options_put_call_ratio: 0.10
  rwa_tvl_7d_delta: 0.05

directions:
  etf_7d_net_flow_btc_eth: positive
  stablecoin_7d_supply_delta: positive
  upbit_netflow_7d_kr: positive
  funding_avg_btc_eth: positive_with_reverse
  btc_dominance_7d_delta: negative
  options_put_call_ratio: negative
  rwa_tvl_7d_delta: positive

funding_reverse_z_threshold: 2.0

reading_buckets:
  risk_off: [0, 30]
  neutral: [30, 70]
  risk_on: [70, 100]
```

- [ ] **Step 2: Write the failing test**

`tests/pulse/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadPulseConfig, parsePulseConfig } from "../../src/pulse/config.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PulseConfig", () => {
  it("parses a valid YAML config", () => {
    const raw = readFileSync(resolve("config/pulse.yaml"), "utf-8");
    const cfg = parsePulseConfig(raw);
    expect(cfg.weights.etf_7d_net_flow_btc_eth).toBe(0.25);
    expect(cfg.directions.btc_dominance_7d_delta).toBe("negative");
    expect(cfg.funding_reverse_z_threshold).toBe(2.0);
    expect(cfg.reading_buckets.risk_on).toEqual([70, 100]);
  });

  it("rejects when weights do not sum to 1.0 within tolerance", () => {
    const bad = `
weights:
  a: 0.5
  b: 0.6
directions:
  a: positive
  b: positive
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 30]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/weights must sum/);
  });

  it("loadPulseConfig reads default path", () => {
    const cfg = loadPulseConfig();
    expect(Object.keys(cfg.weights)).toContain("etf_7d_net_flow_btc_eth");
  });

  it("rejects when reading_buckets have a gap (uncovered score range)", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 25]
  neutral: [30, 70]    # gap: scores 25–30 belong to no bucket
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*gap|continuous|cover/i);
  });

  it("rejects when reading_buckets overlap", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 35]
  neutral: [30, 70]    # overlap with risk_off [30,35]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*overlap/i);
  });

  it("rejects when reading_buckets do not cover [0, 100]", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [0, 30]
  neutral: [30, 70]
  risk_on: [70, 95]    # leaves [95, 100] uncovered
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*0.*100|cover/i);
  });

  it("rejects when a reading_bucket interval is inverted (start > end)", () => {
    const bad = `
weights: { a: 1.0 }
directions: { a: positive }
funding_reverse_z_threshold: 2.0
reading_buckets:
  risk_off: [30, 0]
  neutral: [30, 70]
  risk_on: [70, 100]
`;
    expect(() => parsePulseConfig(bad)).toThrow(/reading_buckets.*invert|start.*end/i);
  });
});
```

- [ ] **Step 3: Run — verify failure**

```bash
npm run test -- pulse/config
```

Expected: FAIL.

- [ ] **Step 4: Create `src/pulse/config.ts`**

```ts
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DirectionSchema = z.enum(["positive", "negative", "positive_with_reverse"]);

export const PulseConfigSchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(1)),
  directions: z.record(z.string(), DirectionSchema),
  funding_reverse_z_threshold: z.number().positive(),
  reading_buckets: z.object({
    risk_off: z.tuple([z.number(), z.number()]),
    neutral: z.tuple([z.number(), z.number()]),
    risk_on: z.tuple([z.number(), z.number()]),
  }),
});
export type PulseConfig = z.infer<typeof PulseConfigSchema>;

export function parsePulseConfig(raw: string): PulseConfig {
  const obj = parseYaml(raw);
  const cfg = PulseConfigSchema.parse(obj);
  const sum = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }
  for (const key of Object.keys(cfg.weights)) {
    if (!cfg.directions[key]) {
      throw new Error(`directions missing entry for weight key: ${key}`);
    }
  }
  validateReadingBuckets(cfg.reading_buckets);
  return cfg;
}

/**
 * The three reading buckets must (a) be non-inverted, (b) be continuous (no
 * gaps), (c) be non-overlapping, and (d) jointly cover [0, 100]. Violating
 * any of these makes `toReading()` ambiguous or undefined for some scores.
 * Codex review F3 flagged the original Task 7 left this implicit.
 */
function validateReadingBuckets(b: PulseConfig["reading_buckets"]): void {
  const ordered = [
    { name: "risk_off", range: b.risk_off },
    { name: "neutral",  range: b.neutral },
    { name: "risk_on",  range: b.risk_on },
  ];
  for (const { name, range } of ordered) {
    if (range[0] > range[1]) {
      throw new Error(`reading_buckets.${name} inverted: start ${range[0]} > end ${range[1]}`);
    }
  }
  if (ordered[0].range[0] !== 0 || ordered[2].range[1] !== 100) {
    throw new Error(`reading_buckets must cover [0, 100] inclusively`);
  }
  for (let i = 0; i < ordered.length - 1; i++) {
    const cur = ordered[i]!.range;
    const next = ordered[i + 1]!.range;
    if (cur[1] < next[0]) {
      throw new Error(`reading_buckets gap between ${ordered[i]!.name} (ends ${cur[1]}) and ${ordered[i + 1]!.name} (starts ${next[0]})`);
    }
    if (cur[1] > next[0]) {
      throw new Error(`reading_buckets overlap between ${ordered[i]!.name} and ${ordered[i + 1]!.name}`);
    }
  }
}

export function loadPulseConfig(path = resolve("config/pulse.yaml")): PulseConfig {
  return parsePulseConfig(readFileSync(path, "utf-8"));
}
```

- [ ] **Step 5: Run — verify passing**

```bash
npm run test -- pulse/config
```

Expected: 7 passed (3 base + 4 reading_buckets validation).

- [ ] **Step 6: Commit**

```bash
git add config/pulse.yaml src/pulse/config.ts tests/pulse/config.test.ts
git commit -m "feat(pulse): YAML config loader with sum/direction validation"
```

---

## Task 8: Reading + summary formatter (`src/pulse/reading.ts`)

**Files:**
- Create: `src/pulse/reading.ts`
- Create: `tests/pulse/reading.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/pulse/reading.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toReading, formatSummary } from "../../src/pulse/reading.js";
import { loadPulseConfig } from "../../src/pulse/config.js";

const cfg = loadPulseConfig();

describe("toReading", () => {
  it("returns risk-off for low scores", () => {
    expect(toReading(15, cfg)).toBe("risk-off");
  });
  it("returns neutral mid-range", () => {
    expect(toReading(50, cfg)).toBe("neutral");
  });
  it("returns risk-on for high scores", () => {
    expect(toReading(85, cfg)).toBe("risk-on");
  });
  it("returns unknown when score is null", () => {
    expect(toReading(null, cfg)).toBe("unknown");
  });
  it("places boundaries: 30 → neutral, 70 → risk-on", () => {
    expect(toReading(30, cfg)).toBe("neutral");
    expect(toReading(70, cfg)).toBe("risk-on");
  });
});

describe("formatSummary", () => {
  // Codex review F4: regex-only assertions are too loose — they pass on
  // formats that no human would call "the same summary". The exact-match
  // tests below freeze the contract; if you change the format, update these
  // intentionally and document why in the commit body.

  it("English summary: exact format with both ETF and stablecoin inputs", () => {
    const s = formatSummary(
      {
        score: 78,
        reading: "risk-on",
        inputs: { etf_7d_net_usd: 340_000_000, stablecoin_7d_delta_pct: 1.4 },
      },
      "en",
    );
    expect(s).toBe("ETF +$340M 7d, stablecoin +1.4%, reading: risk-on (78/100)");
  });

  it("Korean summary: exact format with both ETF and stablecoin inputs", () => {
    const s = formatSummary(
      {
        score: 78,
        reading: "risk-on",
        inputs: { etf_7d_net_usd: 340_000_000, stablecoin_7d_delta_pct: 1.4 },
      },
      "ko",
    );
    expect(s).toBe("ETF +$340M 7d, stablecoin +1.4%, reading: 리스크-온 (78/100)");
  });

  it("English summary: ETF-only when stablecoin omitted (no trailing comma)", () => {
    const s = formatSummary(
      { score: 50, reading: "neutral", inputs: { etf_7d_net_usd: -120_000_000 } },
      "en",
    );
    expect(s).toBe("ETF -$120M 7d, reading: neutral (50/100)");
  });

  it("English summary: no inputs falls back to reading line only", () => {
    const s = formatSummary({ score: 25, reading: "risk-off", inputs: {} }, "en");
    expect(s).toBe("reading: risk-off (25/100)");
  });

  it("English summary: signed dollar formatting rounds to nearest million", () => {
    expect(
      formatSummary(
        { score: 60, reading: "neutral", inputs: { etf_7d_net_usd: 999_999 } },
        "en",
      ),
    ).toBe("ETF +$1M 7d, reading: neutral (60/100)");
    expect(
      formatSummary(
        { score: 60, reading: "neutral", inputs: { etf_7d_net_usd: 0 } },
        "en",
      ),
    ).toBe("ETF +$0M 7d, reading: neutral (60/100)");
  });

  it("Korean summary: same comma-joined ordering, only reading word translated", () => {
    const s = formatSummary(
      {
        score: 25,
        reading: "risk-off",
        inputs: { etf_7d_net_usd: -200_000_000, stablecoin_7d_delta_pct: -0.5 },
      },
      "ko",
    );
    expect(s).toBe("ETF -$200M 7d, stablecoin -0.5%, reading: 리스크-오프 (25/100)");
  });

  it("handles unknown reading: language-specific fixed string", () => {
    expect(formatSummary({ score: null, reading: "unknown", inputs: {} }, "en"))
      .toBe("data unavailable");
    expect(formatSummary({ score: null, reading: "unknown", inputs: {} }, "ko"))
      .toBe("데이터 사용 불가 (data unavailable)");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- pulse/reading
```

Expected: FAIL.

- [ ] **Step 3: Create `src/pulse/reading.ts`**

```ts
import type { Reading, Lang } from "../types.js";
import type { PulseConfig } from "./config.js";

export function toReading(score: number | null, cfg: PulseConfig): Reading {
  if (score === null) return "unknown";
  const { risk_off, neutral, risk_on } = cfg.reading_buckets;
  if (score < risk_off[1]) return "risk-off";
  if (score < neutral[1]) return "neutral";
  if (score <= risk_on[1]) return "risk-on";
  return "unknown";
}

export interface SummaryInput {
  score: number | null;
  reading: Reading;
  inputs: Record<string, unknown>;
}

export function formatSummary(s: SummaryInput, lang: Lang): string {
  if (s.reading === "unknown" || s.score === null) {
    return lang === "ko" ? "데이터 사용 불가 (data unavailable)" : "data unavailable";
  }
  const etf = num(s.inputs.etf_7d_net_usd);
  const stable = num(s.inputs.stablecoin_7d_delta_pct);
  const readingKo = ({ "risk-off": "리스크-오프", neutral: "중립", "risk-on": "리스크-온" } as const)[
    s.reading
  ];
  if (lang === "ko") {
    const parts: string[] = [];
    if (etf !== undefined) parts.push(`ETF ${signed$(etf)} 7d`);
    if (stable !== undefined) parts.push(`stablecoin ${signedPct(stable)}`);
    parts.push(`reading: ${readingKo} (${s.score}/100)`);
    return parts.join(", ");
  }
  const parts: string[] = [];
  if (etf !== undefined) parts.push(`ETF ${signed$(etf)} 7d`);
  if (stable !== undefined) parts.push(`stablecoin ${signedPct(stable)}`);
  parts.push(`reading: ${s.reading} (${s.score}/100)`);
  return parts.join(", ");
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function signed$(v: number): string {
  const sign = v >= 0 ? "+" : "-";
  const m = Math.abs(v) / 1_000_000;
  return `${sign}$${m.toFixed(0)}M`;
}
function signedPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- pulse/reading
```

Expected: 12 passed (5 toReading + 7 formatSummary exact-match).

- [ ] **Step 5: Commit**

```bash
git add src/pulse/reading.ts tests/pulse/reading.test.ts
git commit -m "feat(pulse): toReading bucket mapping + en/ko formatSummary"
```

---

## Task 8.5: History persistence (`src/pulse/history.ts`)

**Files:**
- Create: `src/pulse/history.ts`
- Create: `tests/pulse/history.test.ts`
- Modify: `config/pulse.yaml` (extend with `history:` section)
- Modify: `src/pulse/config.ts` (extend `PulseConfigSchema` with `history` block)

> **Why this task exists:** The composite pulse score in Task 9 reads `history[key]` to compute z-scores; without persisted history, every production call collapses to `score=50, reading=neutral`. This task introduces a per-installation filesystem ring buffer that survives process restart and accumulates one datapoint per (key, 24h) bucket.
>
> **Reconciliation with spec §2 N5 ("영속 저장소 안 씀, in-memory cache only").** This persistence appears to violate N5 at first read. The reconciliation lives in **`docs/adr/0003-history-persistence.md`** and is binding for this task: N5 prohibits *shared/multi-process state stores* (DB, Redis, network FS) and per-caller server-side session memory. A per-installation local-only ring buffer that is read-mostly, idempotent under correct write semantics, and produces no MCP API surface change is treated as offline materialisation of inputs the adapter would otherwise refetch — not as state. Before any contributor changes this design (e.g. adds multi-process write paths, or shares the file across installations), they must amend ADR-0003 and run a fresh `/codex:rescue` pass on this task.
>
> **Failure modes addressed by tests below.** Codex review F6 flagged that the original tests covered only the happy path. Step 3 now adds: corrupt JSON handling (must not silently destroy the file), atomic-write guarantee (partial write must not lose prior good data), and permission error propagation on save (warmup CLI must fail visibly, not pretend to have warmed up).

- [ ] **Step 1: Extend `config/pulse.yaml`**

Append to the existing config (created in Task 7):

```yaml
history:
  path: ~/.cache/onchain-pulse-mcp/history.json   # overridable by OPM_HISTORY_PATH
  window_days: 30
  dedup_hours: 24
  min_samples_for_zscore: 5
```

- [ ] **Step 2: Extend `PulseConfigSchema` in `src/pulse/config.ts`**

Add a `history` block to the zod schema (back-compat: optional):

```ts
const HistoryConfigSchema = z.object({
  path: z.string(),
  window_days: z.number().int().positive(),
  dedup_hours: z.number().positive(),
  min_samples_for_zscore: z.number().int().positive(),
});

// Inside PulseConfigSchema:
history: HistoryConfigSchema.optional(),
```

In `loadPulseConfig`, expand `~` in `cfg.history?.path` using `os.homedir()` before returning.

- [ ] **Step 3: Write the failing test**

`tests/pulse/history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readdirSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFileHistoryStore, computeWindowDelta } from "../../src/pulse/history.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opm-history-"));
  path = join(dir, "history.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("FileHistoryStore", () => {
  it("returns empty record on first load", () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s.load()).toEqual({});
  });

  it("appends and persists a datapoint across instances", async () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("etf_7d_net_flow_btc_eth", 120_000_000, new Date("2026-05-08T00:00:00Z"));
    await s.save();
    const s2 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s2.load().etf_7d_net_flow_btc_eth).toEqual([120_000_000]);
  });

  it("deduplicates within dedup window", async () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("k", 1, new Date("2026-05-08T00:00:00Z"));
    s.appendDatapoint("k", 2, new Date("2026-05-08T12:00:00Z")); // same 24h bucket → ignored
    s.appendDatapoint("k", 3, new Date("2026-05-09T01:00:00Z")); // next bucket
    await s.save();
    expect(s.load().k).toEqual([1, 3]);
  });

  it("trims entries older than window", async () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const recent = new Date();
    s.appendDatapoint("k", 99, old);
    s.appendDatapoint("k", 100, recent);
    await s.save();
    expect(s.load().k).toEqual([100]);
  });

  it("atomic write — no .tmp file remains after successful save", async () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("k", 1, new Date());
    await s.save();
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("corrupt JSON: returns empty envelope and quarantines the bad file", async () => {
    // Write garbage to the history path before constructing the store.
    writeFileSync(path, "{this is not valid JSON");
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s.load()).toEqual({}); // does not throw, does not surface garbage
    // Bad data must be preserved for postmortem, not silently overwritten.
    const quarantined = readdirSync(dir).filter((f) => f.startsWith("history.json.corrupt-"));
    expect(quarantined.length).toBe(1);
    // After quarantine, a save proceeds normally with a fresh envelope.
    s.appendDatapoint("k", 1, new Date("2026-05-08T00:00:00Z"));
    await s.save();
    const reloaded = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(reloaded.load().k).toEqual([1]);
  });

  it("partial write: pre-existing valid data survives a mid-write crash", async () => {
    // First save: write valid data.
    const s1 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s1.appendDatapoint("k", 42, new Date("2026-05-08T00:00:00Z"));
    await s1.save();
    // Simulate a crashed second write by leaving a stale `.tmp` from an aborted run.
    writeFileSync(`${path}.tmp`, "{partial");
    // A new store still loads the prior good envelope (rename was never reached).
    const s2 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s2.load().k).toEqual([42]);
    // A clean save replaces the stale tmp without losing data.
    s2.appendDatapoint("k", 43, new Date("2026-05-09T00:00:00Z"));
    await s2.save();
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const s3 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s3.load().k).toEqual([42, 43]);
  });

  it("permission error on save: propagates as throw (no silent loss)", async () => {
    if (process.platform === "win32") return; // chmod semantics differ on Windows
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("k", 1, new Date());
    await s.save();
    // Make the directory read-only so the next .tmp write fails.
    chmodSync(dir, 0o500);
    try {
      s.appendDatapoint("k", 2, new Date(Date.now() + 25 * 3600 * 1000));
      await expect(s.save()).rejects.toThrow();
    } finally {
      chmodSync(dir, 0o700); // restore so afterEach can clean up
    }
  });
});

describe("computeWindowDelta", () => {
  it("returns 0 when series shorter than window", () => {
    expect(computeWindowDelta([1, 2, 3], 4, 7)).toBe(0);
  });

  it("returns relative delta when series has enough points", () => {
    const series = [100, 100, 100, 100, 100, 100, 100, 100]; // 8 points
    expect(computeWindowDelta(series, 110, 7)).toBeCloseTo(0.1, 5); // (110-100)/100
  });

  it("returns 0 when historical reference is 0", () => {
    expect(computeWindowDelta([0, 0, 0, 0, 0, 0, 0, 0], 10, 7)).toBe(0);
  });
});
```

- [ ] **Step 4: Run — verify failure**

```bash
npm run test -- pulse/history
```

Expected: FAIL.

- [ ] **Step 5: Create `src/pulse/history.ts`**

```ts
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Datapoint {
  asOf: string;
  value: number;
}

interface StoreEnvelope {
  version: 1;
  window_days: number;
  series: Record<string, Datapoint[]>;
}

export interface HistoryStore {
  load(): Record<string, number[]>;
  appendDatapoint(key: string, value: number, asOf: Date): void;
  save(): Promise<void>;
}

export interface HistoryStoreOpts {
  path: string;
  windowDays: number;
  dedupHours: number;
}

export function makeFileHistoryStore(opts: HistoryStoreOpts): HistoryStore {
  const envelope: StoreEnvelope = readEnvelope(opts.path, opts.windowDays);

  return {
    load() {
      trimWindow(envelope, opts.windowDays);
      const out: Record<string, number[]> = {};
      for (const [k, dps] of Object.entries(envelope.series)) {
        out[k] = dps.map((d) => d.value);
      }
      return out;
    },
    appendDatapoint(key, value, asOf) {
      const list = envelope.series[key] ?? (envelope.series[key] = []);
      const last = list[list.length - 1];
      if (last) {
        const lastT = new Date(last.asOf).getTime();
        if (asOf.getTime() - lastT < opts.dedupHours * 3600 * 1000) return;
      }
      list.push({ asOf: asOf.toISOString(), value });
    },
    async save() {
      trimWindow(envelope, opts.windowDays);
      mkdirSync(dirname(opts.path), { recursive: true });
      const tmp = `${opts.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(envelope, null, 2));
      renameSync(tmp, opts.path);
    },
  };
}

function readEnvelope(path: string, windowDays: number): StoreEnvelope {
  if (!existsSync(path)) return { version: 1, window_days: windowDays, series: {} };
  try {
    const raw = readFileSync(path, "utf-8");
    const obj = JSON.parse(raw) as StoreEnvelope;
    if (obj.version !== 1) throw new Error(`unsupported history version: ${obj.version}`);
    return obj;
  } catch (err) {
    // Corrupt or unsupported file → quarantine it so the user can investigate
    // (don't silently overwrite). Continue with an empty envelope so calls
    // succeed; warmup CLI will repopulate the file on next run.
    try {
      const quarantine = `${path}.corrupt-${Date.now()}`;
      renameSync(path, quarantine);
      // eslint-disable-next-line no-console
      console.warn(`[history] corrupt file moved to ${quarantine}: ${(err as Error).message}`);
    } catch {
      // If rename also fails (e.g. read-only FS), proceed with empty envelope.
    }
    return { version: 1, window_days: windowDays, series: {} };
  }
}

function trimWindow(env: StoreEnvelope, windowDays: number): void {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  for (const [k, dps] of Object.entries(env.series)) {
    env.series[k] = dps.filter((d) => new Date(d.asOf).getTime() >= cutoff);
  }
}

/**
 * Relative window delta — used by handleMarketPulse to derive
 * `*_7d_delta` inputs from raw history series.
 */
export function computeWindowDelta(series: number[], current: number, days: number): number {
  if (series.length < days) return 0;
  const past = series[series.length - days] ?? 0;
  if (past === 0) return 0;
  return (current - past) / Math.abs(past);
}
```

- [ ] **Step 6: Run — verify passing**

```bash
npm run test -- pulse/history
npm run test -- pulse/config
```

Expected: 11 passed (5 happy-path FileHistoryStore + 3 failure-mode FileHistoryStore + 3 computeWindowDelta) plus the updated config tests pass independently.

The three failure-mode tests (`corrupt JSON`, `partial write`, `permission error on save`) are required: without them, `readEnvelope`'s catch block silently destroys evidence on real-world disk corruption, and the warmup CLI in Task 22.5 cannot reliably report failure. Do not skip them to make the test count match an earlier draft.

- [ ] **Step 7: Commit**

```bash
git add src/pulse/history.ts tests/pulse/history.test.ts config/pulse.yaml src/pulse/config.ts tests/pulse/config.test.ts
git commit -m "feat(pulse): filesystem ring buffer for 30d composite-input history"
```

> **Note for Task 22 wiring:** `handleMarketPulse` will (a) load this store at call time, (b) compute `*_7d_delta` inputs via `computeWindowDelta(rawSeries, currentValue, 7)`, (c) `appendDatapoint` for each raw input observed, (d) `save()`. Replaces the synthetic `Object.fromEntries(... [k, []])` pattern from the original Task 22 draft.

---

## Task 9: Composite pulse score (`src/pulse/score.ts`)

**Files:**
- Create: `src/pulse/score.ts`
- Create: `tests/pulse/score.test.ts`
- Create: `tests/pulse/fixtures/golden_input.json`

- [ ] **Step 1: Create the golden fixture**

`tests/pulse/fixtures/golden_input.json`:

```json
{
  "values": {
    "etf_7d_net_flow_btc_eth": 340000000,
    "stablecoin_7d_supply_delta": 0.014,
    "upbit_netflow_7d_kr": 80000000,
    "funding_avg_btc_eth": 0.0002,
    "btc_dominance_7d_delta": -0.005,
    "options_put_call_ratio": 0.6,
    "rwa_tvl_7d_delta": 0.012
  },
  "history": {
    "etf_7d_net_flow_btc_eth": [10000000, 50000000, 80000000, 120000000, 90000000, 60000000, 40000000, 30000000, 200000000, 150000000, 100000000, 80000000, 110000000, 70000000, 200000000, 250000000, 180000000, 90000000, 60000000, 30000000, 10000000, -20000000, -50000000, -10000000, 60000000, 80000000, 120000000, 100000000, 70000000, 90000000],
    "stablecoin_7d_supply_delta": [0.001, 0.002, 0.001, 0.003, 0.005, 0.002, 0.001, 0, -0.001, 0.002, 0.004, 0.003, 0.005, 0.006, 0.008, 0.01, 0.012, 0.009, 0.006, 0.004, 0.003, 0.002, 0.001, 0, 0.001, 0.002, 0.003, 0.005, 0.007, 0.009],
    "upbit_netflow_7d_kr": [0, 10000000, 5000000, -5000000, 20000000, 30000000, 50000000, 40000000, 20000000, 10000000, 0, -10000000, -20000000, -5000000, 5000000, 10000000, 20000000, 30000000, 40000000, 50000000, 60000000, 50000000, 30000000, 10000000, 0, 20000000, 40000000, 50000000, 60000000, 70000000],
    "funding_avg_btc_eth": [0.0001, 0.0002, 0.0001, 0.0001, 0.0002, 0.0003, 0.0002, 0.0001, 0.0001, 0.0002, 0.0001, 0, 0.0001, 0.0001, 0.0002, 0.0001, 0.0002, 0.0001, 0, -0.0001, 0, 0.0001, 0.0002, 0.0001, 0.0002, 0.0003, 0.0002, 0.0001, 0.0001, 0.0002],
    "btc_dominance_7d_delta": [0.001, -0.002, 0.0, 0.001, -0.001, 0.002, -0.001, 0, 0.001, 0.002, -0.003, 0.001, 0.002, 0, -0.002, -0.001, 0.001, -0.001, 0, 0.002, -0.001, 0.001, 0, -0.001, 0.001, -0.002, 0, 0.001, -0.001, 0.001],
    "options_put_call_ratio": [0.6, 0.65, 0.7, 0.65, 0.6, 0.55, 0.6, 0.7, 0.75, 0.65, 0.6, 0.55, 0.7, 0.8, 0.75, 0.7, 0.65, 0.6, 0.7, 0.75, 0.65, 0.6, 0.55, 0.65, 0.7, 0.75, 0.6, 0.55, 0.5, 0.6],
    "rwa_tvl_7d_delta": [0.001, 0.002, 0.003, 0.001, 0.002, 0.004, 0.005, 0.003, 0.002, 0.001, 0.003, 0.004, 0.006, 0.008, 0.005, 0.003, 0.002, 0.004, 0.006, 0.008, 0.01, 0.007, 0.004, 0.002, 0.005, 0.008, 0.01, 0.012, 0.009, 0.006]
  }
}
```

- [ ] **Step 2: Write the failing test**

`tests/pulse/score.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computePulseScore } from "../../src/pulse/score.js";
import { loadPulseConfig } from "../../src/pulse/config.js";

const cfg = loadPulseConfig();
const fixture = JSON.parse(
  readFileSync(resolve("tests/pulse/fixtures/golden_input.json"), "utf-8"),
) as { values: Record<string, number>; history: Record<string, number[]> };

describe("computePulseScore", () => {
  it("produces a deterministic score for golden input", () => {
    const r = computePulseScore({ values: fixture.values, history: fixture.history, cfg });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe(1.0);
    // golden assertion (regression detection)
    expect(Math.round(r.score!)).toBe(63);
  });

  it("renormalises weights when one input is missing (stablecoin omitted)", () => {
    const v = { ...fixture.values };
    delete (v as Record<string, number>).stablecoin_7d_supply_delta;
    const r = computePulseScore({ values: v, history: fixture.history, cfg });
    expect(r.confidence).toBeCloseTo(0.8, 5); // 1.0 - 0.20
    expect(r.score).not.toBeNull();
  });

  it("returns null score and confidence 0 when all inputs missing", () => {
    const r = computePulseScore({ values: {}, history: fixture.history, cfg });
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it("reverses funding contribution when |z| exceeds threshold", () => {
    // History has tight funding range; an extreme value should flip sign.
    const extreme = { ...fixture.values, funding_avg_btc_eth: 0.005 };
    const r = computePulseScore({ values: extreme, history: fixture.history, cfg });
    const r0 = computePulseScore({ values: fixture.values, history: fixture.history, cfg });
    expect(r.score!).toBeLessThan(r0.score!);
  });

  it("reports negative-direction inputs (P/C ratio) inversely", () => {
    const lowPC = { ...fixture.values, options_put_call_ratio: 0.3 };
    const highPC = { ...fixture.values, options_put_call_ratio: 1.0 };
    const a = computePulseScore({ values: lowPC, history: fixture.history, cfg });
    const b = computePulseScore({ values: highPC, history: fixture.history, cfg });
    expect(a.score!).toBeGreaterThan(b.score!);
  });

  it("contributes z=0 when history length < cfg.history.min_samples_for_zscore", () => {
    // Construct a history that has exactly min_samples - 1 entries; the score
    // must treat that key as z=0 (no signal yet) but still keep it in active
    // weight so the confidence number doesn't lie.
    const min = cfg.history?.min_samples_for_zscore ?? 5;
    const shortHist = Object.fromEntries(
      Object.keys(fixture.values).map((k) => [k, Array(min - 1).fill(0)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: shortHist, cfg });
    expect(r.score).toBe(50);          // weighted sum of all-zero contributions → sigmoid(0)*100 = 50
    expect(r.confidence).toBe(1);      // every weight key still active
  });

  it("activates z-score once history reaches min_samples_for_zscore", () => {
    // With history length === min_samples, the score should diverge from 50
    // for the same fixture values that produced score=63 with full history.
    const min = cfg.history?.min_samples_for_zscore ?? 5;
    const truncated = Object.fromEntries(
      Object.entries(fixture.history).map(([k, v]) => [k, v.slice(0, min)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: truncated, cfg });
    expect(r.score).not.toBe(50);
  });

  it("respects an overridden min_samples_for_zscore (config-driven, not hardcoded)", () => {
    // Inject a config copy with min_samples_for_zscore = 10. With 6-point
    // history (below threshold), the score must collapse to 50/neutral.
    const cfg10 = {
      ...cfg,
      history: { ...(cfg.history ?? {}), min_samples_for_zscore: 10 },
    } as typeof cfg;
    const sixPt = Object.fromEntries(
      Object.entries(fixture.history).map(([k, v]) => [k, v.slice(0, 6)]),
    ) as Record<string, number[]>;
    const r = computePulseScore({ values: fixture.values, history: sixPt, cfg: cfg10 });
    expect(r.score).toBe(50);
  });
});
```

- [ ] **Step 3: Run — verify failure**

```bash
npm run test -- pulse/score
```

Expected: FAIL.

- [ ] **Step 4: Create `src/pulse/score.ts`**

```ts
import { mean, sigmoid01, zScore } from "../stats.js";
import type { PulseConfig } from "./config.js";

export interface ScoreInput {
  values: Record<string, number>;
  history: Record<string, number[]>;
  cfg: PulseConfig;
}

export interface ScoreResult {
  score: number | null;
  confidence: number;
  contributions: Record<string, number>; // sign-adjusted z per key
}

export function computePulseScore({ values, history, cfg }: ScoreInput): ScoreResult {
  const contributions: Record<string, number> = {};
  let weightedSum = 0;
  let activeWeightSum = 0;
  // Minimum history depth before z-score is meaningful. Sourced from
  // config (Task 8.5 added the `history` block); falls back to 5 for
  // back-compat with configs that predate Task 8.5. The previous hardcoded
  // `>= 5` was Codex review F8 (medium) — config drift would not have
  // affected runtime behaviour.
  const minSamples = cfg.history?.min_samples_for_zscore ?? 5;

  for (const [key, weight] of Object.entries(cfg.weights)) {
    if (!(key in values)) continue; // missing value → drop from active weight (renormalise)
    const x = values[key]!;
    const hist = history[key] ?? [];
    // Short history → contribute z=0 (no signal) but still count in active weight,
    // so the server can return a meaningful neutral score before history accumulates.
    const z = hist.length >= minSamples ? zScore(x, hist) : 0;
    const dir = cfg.directions[key]!;
    let signed = z;
    if (dir === "negative") signed = -z;
    if (dir === "positive_with_reverse" && Math.abs(z) >= cfg.funding_reverse_z_threshold) {
      signed = -z;
    }
    contributions[key] = signed * weight;
    weightedSum += signed * weight;
    activeWeightSum += weight;
  }

  if (activeWeightSum === 0) {
    return { score: null, confidence: 0, contributions };
  }

  const normalised = weightedSum / activeWeightSum; // re-normalise to keep range stable
  // Slope: 1.0 z-units → ~0.73 sigmoid; choose k such that |z|≈2 saturates near 0/1.
  const score = Math.round(sigmoid01(normalised) * 100);

  return {
    score,
    confidence: round3(activeWeightSum),
    contributions,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// Re-export `mean` for tests to use if needed.
export { mean };
```

- [ ] **Step 5: Run — lock the golden value once, then treat as immutable**

```bash
npm run test -- pulse/score
```

The integer `63` in Step 2 is the plan author's *estimate* of what the spec-compliant formula should produce. It is locked as follows:

1. **First pass — single calibration step.** Run the test once. If it fails with a deterministic actual value (e.g. `64` or `62`), and only the golden assertion fails (the four other tests pass), then either:
   - the formula matches the spec but the plan-author's estimate was off → update `63` to the actual integer **in this single commit**; or
   - the formula deviates from spec (wrong direction, wrong sigmoid slope, missing renormalisation) → **fix the formula**, do not touch the golden.
   Decide by re-deriving the expected value from `config/pulse.yaml` weights, the fixture, and the spec's score equation. Document the chosen integer and *why* in the commit body.

2. **From that commit forward, the golden is immutable.** Any subsequent test failure on this assertion means the formula has drifted. Do not silently update the number to make red green. This is the regression-detection contract.

3. **Future intentional formula changes** (weight retune, new input, sigmoid adjustment) require an ADR (`docs/adr/{NNNN}-pulse-weight-retune.md`) and a same-commit golden bump that links the ADR. No silent retunes.

Expected: 8 passed (5 base + 3 z-score config — one base test from earlier draft was renamed; total stays 8 with the new `min_samples_for_zscore` cases).

- [ ] **Step 6: Commit**

```bash
git add src/pulse/score.ts tests/pulse/score.test.ts tests/pulse/fixtures/golden_input.json
git commit -m "feat(pulse): composite weighted-z pulse score with confidence + funding reverse"
```

---

## Task 10: Derivatives adapter (`src/adapters/derivatives.ts`)

**Files:**
- Create: `src/adapters/derivatives.ts`
- Create: `tests/adapters/derivatives.test.ts`

This adapter pulls funding rate and OI for BTC/ETH. Free path uses Deribit's public REST API (no key). BYOK path uses Coinglass for richer cross-venue OI and put/call ratio.

**Free endpoints used:**
- `https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=BTC-PERPETUAL&start_timestamp=...&end_timestamp=...`
- `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option`

**BYOK endpoint:**
- `https://open-api-v3.coinglass.com/api/futures/funding/oi-weight-ohlc?symbol=BTC&interval=1d` (header `CG-API-KEY: <key>`)

- [ ] **Step 1: Write the failing test**

`tests/adapters/derivatives.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { derivatives } from "../../src/adapters/derivatives.js";
import { makeContext } from "../../src/adapters/base.js";

/**
 * Per-call recorder so tests can assert URLs/headers were invoked
 * exactly as expected (F10: BTC vs ETH per-symbol assertions).
 */
function recordingFetch(map: Record<string, { status?: number; body?: unknown; throws?: boolean }>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
    calls.push({ url: u, headers });
    for (const [pattern, spec] of Object.entries(map)) {
      if (u.includes(pattern)) {
        if (spec.throws) throw new Error(`network error for ${pattern}`);
        return new Response(JSON.stringify(spec.body ?? {}), { status: spec.status ?? 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

const happyMap = {
  "BTC-PERPETUAL": { body: { result: 0.00012 } },
  "ETH-PERPETUAL": { body: { result: 0.00018 } },
  "currency=BTC&kind=option": { body: { result: [{ put_call_ratio: 0.62 }] } },
  "currency=ETH&kind=option": { body: { result: [{ put_call_ratio: 0.58 }] } },
  "symbol=BTC&interval=1d": { body: { data: [{ c: 12_500_000_000 }] } },
  "symbol=ETH&interval=1d": { body: { data: [{ c: 5_400_000_000 }] } },
};

describe("derivatives adapter", () => {
  it("free path returns BTC/ETH funding + put/call from Deribit", async () => {
    const { fn, calls } = recordingFetch(happyMap);
    const ctx = makeContext({ env: { byok: {}, lang: "en" }, fetchImpl: fn });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    expect(r.data.funding_eth).toBeCloseTo(0.00018, 6);
    expect(r.data.put_call_btc).toBeCloseTo(0.62, 3);
    expect(r.data.put_call_eth).toBeCloseTo(0.58, 3);
    expect(r.sources).toEqual(["deribit"]);
    expect(r.stale).toBe(false);
    // F10: assert BOTH symbol URLs were called (not silently dropping ETH).
    expect(calls.some((c) => c.url.includes("BTC-PERPETUAL"))).toBe(true);
    expect(calls.some((c) => c.url.includes("ETH-PERPETUAL"))).toBe(true);
    // No CG-API-KEY header on free path.
    expect(calls.every((c) => !("CG-API-KEY".toLowerCase() in c.headers))).toBe(true);
  });

  it("BYOK path enriches with Coinglass OI for both BTC and ETH", async () => {
    const { fn, calls } = recordingFetch(happyMap);
    const ctx = makeContext({
      env: { byok: { coinglass: "test-key" }, lang: "en" },
      fetchImpl: fn,
    });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.oi_btc_usd).toBe(12_500_000_000);
    expect(r.data.oi_eth_usd).toBe(5_400_000_000);
    expect(r.sources).toEqual(["deribit", "coinglass"]);
    // F10: `CG-API-KEY` header must be sent on Coinglass calls only.
    const cgCalls = calls.filter((c) => c.url.includes("oi-weight-ohlc"));
    expect(cgCalls.length).toBe(2);
    for (const c of cgCalls) {
      expect(c.headers["cg-api-key"]).toBe("test-key");
    }
    const deribitCalls = calls.filter((c) => c.url.includes("deribit.com"));
    for (const c of deribitCalls) {
      expect(c.headers["cg-api-key"]).toBeUndefined();
    }
  });

  it("F9 partial failure: Coinglass 401 — Deribit data survives, OI keys omitted, stale_data annotated", async () => {
    const { fn } = recordingFetch({
      ...happyMap,
      "symbol=BTC&interval=1d": { status: 401, body: { error: "auth" } },
      "symbol=ETH&interval=1d": { status: 401, body: { error: "auth" } },
    });
    const ctx = makeContext({
      env: { byok: { coinglass: "bad-key" }, lang: "en" },
      fetchImpl: fn,
    });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6); // free data preserved
    expect(r.data.oi_btc_usd).toBeUndefined();          // BYOK enrichment omitted
    expect(r.data.oi_eth_usd).toBeUndefined();
    expect(r.sources).toEqual(["deribit"]);             // coinglass not advertised on partial fail
    expect(r.stale).toBe(false);                        // free data is fresh
    expect(r.stale_data).toContain("coinglass:auth_rejected");
  });

  it("F9 partial failure: ETH funding 5xx — BTC keys survive, eth keys omitted with annotation", async () => {
    const { fn } = recordingFetch({
      ...happyMap,
      "ETH-PERPETUAL": { status: 503, body: { error: "upstream" } },
    });
    const ctx = makeContext({ env: { byok: {}, lang: "en" }, fetchImpl: fn });
    const r = await derivatives.fetch(undefined, ctx);
    expect(r.data.funding_btc).toBeCloseTo(0.00012, 6);
    expect(r.data.funding_eth).toBeUndefined();
    expect(r.stale_data).toContain("deribit:eth_funding_unavailable");
  });

  it("F9 full failure: all Deribit endpoints down — falls back to stale cache after TTL expiry", async () => {
    vi.useFakeTimers();
    try {
      // First successful fetch primes the cache.
      const happy = recordingFetch(happyMap);
      const ctx = makeContext({ env: { byok: {}, lang: "en" }, fetchImpl: happy.fn });
      const fresh = await derivatives.fetch(undefined, ctx);
      expect(fresh.stale).toBe(false);

      // Advance past the adapter's TTL so the next call enters the loader path.
      await vi.advanceTimersByTimeAsync(derivatives.ttlMs + 1_000);

      // Re-bind fetch on the same context — same adapter cache instance, all upstreams fail.
      const failing = recordingFetch({
        "BTC-PERPETUAL": { throws: true },
        "ETH-PERPETUAL": { throws: true },
        "currency=BTC&kind=option": { throws: true },
        "currency=ETH&kind=option": { throws: true },
      });
      ctx.fetch = failing.fn; // mutate; AdapterContext is a plain object
      const r = await derivatives.fetch(undefined, ctx);
      expect(r.stale).toBe(true);
      expect(r.data.funding_btc).toBeCloseTo(0.00012, 6); // last-known
    } finally {
      vi.useRealTimers();
    }
  });

  it("capabilities reports enrichment when key present", () => {
    expect(derivatives.capabilities({ byok: {}, lang: "en" }).byok_active).toEqual([]);
    expect(derivatives.capabilities({ byok: { coinglass: "k" }, lang: "en" }).byok_active).toContain("coinglass");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/derivatives
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/derivatives.ts`**

```ts
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

const DERIBIT = "https://www.deribit.com/api/v2/public";
const COINGLASS = "https://open-api-v3.coinglass.com/api";

const TTL_MS = 60_000;
const CACHE_MAX = 8;

async function getJson<T>(fetchImpl: typeof fetch, url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function fetchFunding(ctx: AdapterContext, symbol: string): Promise<number> {
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const url = `${DERIBIT}/get_funding_rate_value?instrument_name=${symbol}&start_timestamp=${start}&end_timestamp=${now}`;
  const data = await getJson<{ result: number }>(ctx.fetch, url);
  return data.result;
}

async function fetchPutCall(ctx: AdapterContext, currency: string): Promise<number | undefined> {
  const url = `${DERIBIT}/get_book_summary_by_currency?currency=${currency}&kind=option`;
  const data = await getJson<{ result: Array<{ put_call_ratio?: number }> }>(ctx.fetch, url);
  const r = data.result.find((x) => typeof x.put_call_ratio === "number");
  return r?.put_call_ratio;
}

async function fetchCoinglassOI(ctx: AdapterContext, key: string, symbol: string): Promise<number | undefined> {
  const url = `${COINGLASS}/futures/funding/oi-weight-ohlc?symbol=${symbol}&interval=1d`;
  const data = await getJson<{ data: Array<{ c: number }> }>(ctx.fetch, url, { "CG-API-KEY": key });
  return data.data?.[0]?.c;
}

/**
 * Settle a per-source upstream call, recording its outcome in `staleData`
 * for `AdapterResult.stale_data` (Codex review F12). The whole adapter does
 * NOT abort on any single upstream failure — partial enrichment beats a
 * full stale fallback when free-tier data is fresh.
 */
async function safe<T>(
  promise: Promise<T>,
  annotateOnAuth: string,
  annotateOnOther: string,
  staleData: string[],
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (err) {
    const msg = (err as Error).message ?? "";
    staleData.push(/HTTP 401|HTTP 403/.test(msg) ? annotateOnAuth : annotateOnOther);
    return undefined;
  }
}

export const derivatives: Adapter = {
  name: "derivatives",
  ttlMs: TTL_MS,
  capabilities(env: EnvConfig) {
    const sources = ["deribit"];
    if (env.byok.coinglass) sources.push("coinglass");
    return { byok_active: env.byok.coinglass ? ["coinglass"] : [], sources };
  },
  async fetch(_input, ctx): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "derivatives", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "derivatives", async () => {
      const staleData: string[] = [];

      const [fBtc, fEth, pcBtc, pcEth] = await Promise.all([
        safe(fetchFunding(ctx, "BTC-PERPETUAL"), "deribit:auth_rejected", "deribit:btc_funding_unavailable", staleData),
        safe(fetchFunding(ctx, "ETH-PERPETUAL"), "deribit:auth_rejected", "deribit:eth_funding_unavailable", staleData),
        safe(fetchPutCall(ctx, "BTC"), "deribit:auth_rejected", "deribit:btc_pc_unavailable", staleData),
        safe(fetchPutCall(ctx, "ETH"), "deribit:auth_rejected", "deribit:eth_pc_unavailable", staleData),
      ]);

      // If every Deribit call failed, surface the failure so withCache can
      // fall back to the prior stale entry (if any).
      if (fBtc === undefined && fEth === undefined && pcBtc === undefined && pcEth === undefined) {
        throw new Error("derivatives: all Deribit endpoints failed");
      }

      const data: Record<string, unknown> = {};
      if (fBtc !== undefined) data.funding_btc = fBtc;
      if (fEth !== undefined) data.funding_eth = fEth;
      if (pcBtc !== undefined) data.put_call_btc = pcBtc;
      if (pcEth !== undefined) data.put_call_eth = pcEth;

      const sources = ["deribit"];
      let coinglassUsed = false;

      if (ctx.env.byok.coinglass) {
        const [oiBtc, oiEth] = await Promise.all([
          safe(
            fetchCoinglassOI(ctx, ctx.env.byok.coinglass, "BTC"),
            "coinglass:auth_rejected",
            "coinglass:btc_oi_unavailable",
            staleData,
          ),
          safe(
            fetchCoinglassOI(ctx, ctx.env.byok.coinglass, "ETH"),
            "coinglass:auth_rejected",
            "coinglass:eth_oi_unavailable",
            staleData,
          ),
        ]);
        if (oiBtc !== undefined) data.oi_btc_usd = oiBtc;
        if (oiEth !== undefined) data.oi_eth_usd = oiEth;
        coinglassUsed = oiBtc !== undefined || oiEth !== undefined;
        if (coinglassUsed) sources.push("coinglass");
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
```

> **`AdapterResult.stale_data: string[]`** is a per-source annotation field added by Codex review F12 (medium DOD gap). It carries machine-readable reasons for why a given source's contribution is missing from `data` (e.g. `"coinglass:auth_rejected"`, `"deribit:eth_funding_unavailable"`). The tool layer (Tasks 16–21) propagates these into `ToolResponse.stale_data`. Update `src/types.ts` accordingly when you reach Task 2 — add `stale_data?: string[]` to the `AdapterResult` schema.

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/derivatives
```

Expected: 6 passed (1 free path + 1 BYOK path + 2 partial-failure + 1 full-failure-stale + 1 capabilities).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/derivatives.ts tests/adapters/derivatives.test.ts
git commit -m "feat(adapter): derivatives — Deribit free + Coinglass BYOK with partial-failure isolation"
```

---

## Task 11: Macro/RWA adapter (`src/adapters/macro_rwa.ts`)

**Files:**
- Create: `src/adapters/macro_rwa.ts`
- Create: `tests/adapters/macro_rwa.test.ts`

Pulls BTC dominance, ETF net flow, RWA TVL, T-bill yield. Free sources: Defillama (BTC dom + RWA TVL), Farside scrape (ETF — use cached HTML parsing). BYOK path is reserved for paid feeds (out of scope for v0.1, but capabilities reports it).

**Free endpoints:**
- `https://api.llama.fi/v2/historicalChainTvl/Ethereum` (proxy for chain TVL)
- `https://api.llama.fi/protocols` (RWA category aggregate via filter)
- `https://farside.co.uk/btc-etf-flow-all-data/` (HTML scrape)
- `https://api.coingecko.com/api/v3/global` (BTC dominance)

For Farside, parse the latest 7 rows of the daily table with **cheerio** (server-side jQuery-style DOM). The earlier draft used `<tr><td>` regex; Codex review F11 (HIGH FEASIBILITY_FLAG) flagged this as fragile against realistic markup variations: class attributes, `&minus;` entities, comma-separated numbers, header rows mixed with data rows, footnote `<sub>` markers, whitespace inside cells.

> **Add `cheerio` to runtime dependencies in this task.** Update `package.json`'s `dependencies`: `"cheerio": "^1.0.0"`. The library is ~150KB minified; the cost is justified by HTML parsing robustness — Farside is the load-bearing source for the ETF score input, and a single parse failure trends `etf_7d_net_usd` to undefined for the next 30 minutes (TTL). The runtime tradeoff is documented at the top of `src/adapters/macro_rwa.ts`.
>
> **Fallback contract.** If cheerio extracts < 7 numeric rows from the BTC table OR < 7 from the ETH table, treat the parse as failed for that side, omit the corresponding contribution from `etf_7d_net_usd`, and annotate `stale_data` with `"farside.co.uk:btc_parse_failed"` or `"farside.co.uk:eth_parse_failed"`. If both sides fail, `etf_7d_net_usd` is omitted entirely and the score input falls back to z=0 / confidence-reduced (Task 9 already handles missing keys).

- [ ] **Step 1: Add HTML fixtures**

Three fixtures to exercise the parser against the markup variations actually observed on Farside (captured from production responses, 2026-05). Naming convention: `{source}_{symbol}_{shape}.html`.

`tests/adapters/fixtures/farside_btc_etf_clean.html` — the clean shape that the original regex assumed:

```html
<table>
  <thead><tr><th>Date</th><th>Total</th></tr></thead>
  <tbody>
    <tr><td>07 May 2026</td><td>340.5</td></tr>
    <tr><td>06 May 2026</td><td>120.0</td></tr>
    <tr><td>05 May 2026</td><td>-50.0</td></tr>
    <tr><td>04 May 2026</td><td>80.0</td></tr>
    <tr><td>03 May 2026</td><td>-20.0</td></tr>
    <tr><td>02 May 2026</td><td>40.0</td></tr>
    <tr><td>01 May 2026</td><td>-10.0</td></tr>
  </tbody>
</table>
```

`tests/adapters/fixtures/farside_btc_etf_realistic.html` — class attributes, `&minus;` entities, comma-grouped numbers, footnote `<sub>` markers, leading/trailing whitespace in cells, and a thousand-row tail truncated to 8 rows for the test:

```html
<table class="dataTable">
  <thead>
    <tr><th>Date</th><th>IBIT</th><th>Total</th></tr>
  </thead>
  <tbody>
    <tr class="row-positive">
      <td> 07 May 2026 </td>
      <td>200.0</td>
      <td class="total"> 1,340.5<sup>*</sup> </td>
    </tr>
    <tr class="row-positive">
      <td>06 May 2026</td>
      <td>110.0</td>
      <td>120.0</td>
    </tr>
    <tr class="row-negative">
      <td>05 May 2026</td>
      <td>&minus;30.0</td>
      <td>&minus;50.0</td>
    </tr>
    <tr><td>04 May 2026</td><td>50.0</td><td>80.0</td></tr>
    <tr class="row-negative"><td>03 May 2026</td><td>0.0</td><td>&minus;20.0</td></tr>
    <tr><td>02 May 2026</td><td>30.0</td><td>40.0</td></tr>
    <tr class="row-negative"><td>01 May 2026</td><td>&minus;5.0</td><td>&minus;10.0</td></tr>
    <tr class="footer-totals"><td>Cumulative</td><td>9,999.9</td><td>50,000.0</td></tr>
  </tbody>
</table>
```

(The `Cumulative` footer row must NOT contribute to the 7-day window; the parser identifies it by its `class="footer-totals"` and skips it.)

`tests/adapters/fixtures/farside_btc_etf_broken.html` — a degenerate response where Farside has changed shape entirely (e.g. moved to a JS-rendered table). The parser must produce zero rows and trigger the fallback contract:

```html
<div class="loading">Loading…</div>
<noscript>Please enable JavaScript to view this site.</noscript>
```

- [ ] **Step 2: Write the failing test**

`tests/adapters/macro_rwa.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { macroRwa, parseFarsideTable } from "../../src/adapters/macro_rwa.js";
import { makeContext } from "../../src/adapters/base.js";

const cleanHtml = readFileSync(resolve("tests/adapters/fixtures/farside_btc_etf_clean.html"), "utf-8");
const realisticHtml = readFileSync(resolve("tests/adapters/fixtures/farside_btc_etf_realistic.html"), "utf-8");
const brokenHtml = readFileSync(resolve("tests/adapters/fixtures/farside_btc_etf_broken.html"), "utf-8");

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

  it("realistic markup: handles &minus; entity, comma grouping, class attrs, sup footnotes, whitespace", () => {
    const rows = parseFarsideTable(realisticHtml);
    expect(rows).toHaveLength(7);
    // First row: " 1,340.5<sup>*</sup> " → 1340.5M
    expect(rows[0]).toEqual({ date: "07 May 2026", flowUsd: 1_340_500_000 });
    // Third row: "&minus;50.0" → -50M
    expect(rows[2]).toEqual({ date: "05 May 2026", flowUsd: -50_000_000 });
    // Footer "Cumulative" row must NOT be in the result.
    expect(rows.find((r) => r.date === "Cumulative")).toBeUndefined();
  });

  it("broken markup: returns empty array (parser does not throw)", () => {
    expect(parseFarsideTable(brokenHtml)).toEqual([]);
  });
});

describe("macro_rwa adapter", () => {
  it("happy path: computes 7d ETF net flow + BTC dominance + RWA TVL from clean markup", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
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
    // 340.5 + 120 + (-50) + 80 + (-20) + 40 + (-10) = 500.5  → $500.5M
    expect(r.data.etf_7d_net_usd).toBeCloseTo(500_500_000, 0);
    expect(r.data.btc_dominance).toBeCloseTo(56.4, 2);
    expect(r.data.rwa_tvl_usd).toBe(1_800_000_000);
    expect(r.sources).toEqual(expect.arrayContaining(["farside.co.uk", "coingecko", "defillama"]));
    expect(r.stale_data ?? []).toEqual([]);
  });

  it("realistic markup: parses 7 rows correctly even with attributes and entities", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
      fetchImpl: fakeFetch({
        "farside.co.uk/btc-etf-flow-all-data": realisticHtml,
        "coingecko.com/api/v3/global": { data: { market_cap_percentage: { btc: 56.4 } } },
        "api.llama.fi/protocols": [],
      }),
    });
    const r = await macroRwa.fetch(undefined, ctx);
    // 1340.5 + 120 + (-50) + 80 + (-20) + 40 + (-10) = 1500.5M
    expect(r.data.etf_7d_net_usd).toBeCloseTo(1_500_500_000, 0);
  });

  it("F11 broken markup fallback: ETF omitted, stale_data annotated, other sources survive", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
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
      env: { byok: {}, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("farside")) return new Response("err", { status: 503 });
        if (u.includes("coingecko")) return new Response(JSON.stringify({ data: { market_cap_percentage: { btc: 56.4 } } }), { status: 200 });
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
```

- [ ] **Step 3: Run — verify failure**

```bash
npm run test -- adapters/macro_rwa
```

Expected: FAIL.

- [ ] **Step 4: Create `src/adapters/macro_rwa.ts`**

```ts
import * as cheerio from "cheerio";
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

const TTL_MS = 30 * 60_000;
const CACHE_MAX = 8;

interface FetchOutcome<T> {
  data?: T;
  stale?: string; // annotation for stale_data when undefined
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

/**
 * Cheerio-based parser for the Farside daily flows table.
 * Robust against: class attributes, `&minus;` entities, comma-grouped numbers,
 * footnote `<sup>` markers, leading/trailing whitespace, footer "Cumulative" row.
 *
 * Returns at most the 7 most recent rows (Farside lists newest first).
 * Exported for unit testing — see tests/adapters/macro_rwa.test.ts.
 */
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
    if ($tr.hasClass("footer-totals")) return; // skip cumulative footer
    const $cells = $tr.find("td");
    if ($cells.length < 2) return;
    const dateRaw = $cells.eq(0).text().trim();
    if (!/^\d{1,2}\s\w+\s\d{4}$/.test(dateRaw)) return; // skip non-date rows (headers, footers)
    // Last column is the "Total" (rightmost numeric cell).
    const totalRaw = $cells.eq($cells.length - 1).text();
    const num = parseFarsideNumber(totalRaw);
    if (num === undefined) return;
    rows.push({ date: dateRaw, flowUsd: Math.round(num * 1_000_000) });
  });
  return rows.slice(0, 7);
}

function parseFarsideNumber(raw: string): number | undefined {
  // Strip whitespace, footnote markers, then normalise minus-sign variants.
  const cleaned = raw
    .replace(/<sup>.*?<\/sup>/g, "")
    .replace(/[*†‡]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/[−‒–—]/g, "-"); // ‒ – — and U+2212 minus
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
  async fetch(_input, ctx): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "macro_rwa", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "macro_rwa", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      // Farside ETF flows
      const farside = await fetchText(ctx.fetch, "https://farside.co.uk/btc-etf-flow-all-data/", "farside.co.uk");
      if (farside.data) {
        const rows = parseFarsideTable(farside.data);
        if (rows.length === 0) {
          staleData.push("farside.co.uk:parse_failed");
        } else {
          data.etf_7d_net_usd = rows.reduce((s, r) => s + r.flowUsd, 0);
          sources.push("farside.co.uk");
        }
      } else if (farside.stale) {
        staleData.push(farside.stale);
      }

      // CoinGecko BTC dominance
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

      // Defillama RWA TVL
      const dl = await fetchJson<Array<{ category?: string; tvl?: number }>>(
        ctx.fetch,
        "https://api.llama.fi/protocols",
        "defillama",
      );
      if (dl.data) {
        const rwa = dl.data.filter((p) => p.category === "RWA");
        data.rwa_tvl_usd = rwa.reduce((s, p) => s + (p.tvl ?? 0), 0);
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
```

- [ ] **Step 5: Run — verify passing**

```bash
npm run test -- adapters/macro_rwa
```

Expected: 7 passed (3 `parseFarsideTable` unit tests + 4 adapter integration tests).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/macro_rwa.ts tests/adapters/macro_rwa.test.ts tests/adapters/fixtures/farside_btc_etf_*.html package.json
git commit -m "feat(adapter): macro_rwa — cheerio-based Farside parser + per-source stale_data"
```

---

## Task 12: On-chain wallet adapter (`src/adapters/onchain_wallet.ts`)

**Files:**
- Create: `src/adapters/onchain_wallet.ts`
- Create: `tests/adapters/onchain_wallet.test.ts`

Pulls stablecoin supply delta (USDT + USDC) and smart-money flow proxy (free path uses Defillama stablecoins API; BYOK uses Nansen smart money API).

**Free endpoints:**
- `https://stablecoins.llama.fi/stablecoins?includePrices=true` — current supply per stablecoin
- `https://stablecoins.llama.fi/stablecoinprices` — historical price (used as a check, not core)
- `https://stablecoins.llama.fi/stablecoincharts/all` — total circulating history

**BYOK endpoints:**
- `https://api.nansen.ai/api/beta/smart-money/holdings` (header `apiKey: <NANSEN_API_KEY>`)

- [ ] **Step 1: Write the failing test**

`tests/adapters/onchain_wallet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { onchainWallet } from "../../src/adapters/onchain_wallet.js";
import { makeContext } from "../../src/adapters/base.js";

function fakeFetch(map: Record<string, unknown | string>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pat, body] of Object.entries(map)) {
      if (u.includes(pat)) {
        const isJson = typeof body !== "string";
        return new Response(isJson ? JSON.stringify(body) : body, { status: 200 });
      }
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

describe("onchain_wallet adapter", () => {
  it("free path computes stablecoin 7d delta", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
      fetchImpl: fakeFetch({
        "stablecoincharts/all": [
          { date: 1714435200, totalCirculating: { peggedUSD: 150_000_000_000 } },
          { date: 1714521600, totalCirculating: { peggedUSD: 150_500_000_000 } },
          { date: 1714608000, totalCirculating: { peggedUSD: 151_000_000_000 } },
          { date: 1714694400, totalCirculating: { peggedUSD: 151_500_000_000 } },
          { date: 1714780800, totalCirculating: { peggedUSD: 152_000_000_000 } },
          { date: 1714867200, totalCirculating: { peggedUSD: 152_500_000_000 } },
          { date: 1714953600, totalCirculating: { peggedUSD: 152_800_000_000 } },
          { date: 1715040000, totalCirculating: { peggedUSD: 153_100_000_000 } },
        ],
      }),
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    // (153.1 - 150) / 150 ≈ 0.02067
    expect(r.data.stablecoin_7d_delta_pct).toBeCloseTo(0.02067, 4);
    expect(r.sources).toContain("defillama-stablecoins");
  });

  it("BYOK path adds smart_money_net_usd when NANSEN_API_KEY set", async () => {
    const ctx = makeContext({
      env: { byok: { nansen: "n-1" }, lang: "en" },
      fetchImpl: fakeFetch({
        "stablecoincharts/all": [
          { date: 1, totalCirculating: { peggedUSD: 100 } },
          { date: 2, totalCirculating: { peggedUSD: 100 } },
          { date: 3, totalCirculating: { peggedUSD: 100 } },
          { date: 4, totalCirculating: { peggedUSD: 100 } },
          { date: 5, totalCirculating: { peggedUSD: 100 } },
          { date: 6, totalCirculating: { peggedUSD: 100 } },
          { date: 7, totalCirculating: { peggedUSD: 100 } },
          { date: 8, totalCirculating: { peggedUSD: 100 } },
        ],
        "nansen.ai": { data: { net_usd_7d: 25_000_000 } },
      }),
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBe(25_000_000);
    expect(r.sources).toContain("nansen");
  });

  it("F13 Nansen 401: free data preserved, smart_money_net_usd omitted, stale_data annotated, server does not crash", async () => {
    const ctx = makeContext({
      env: { byok: { nansen: "fake-key-401" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(JSON.stringify([
            { date: 1, totalCirculating: { peggedUSD: 100 } },
            { date: 2, totalCirculating: { peggedUSD: 100 } },
            { date: 3, totalCirculating: { peggedUSD: 100 } },
            { date: 4, totalCirculating: { peggedUSD: 100 } },
            { date: 5, totalCirculating: { peggedUSD: 100 } },
            { date: 6, totalCirculating: { peggedUSD: 100 } },
            { date: 7, totalCirculating: { peggedUSD: 100 } },
            { date: 8, totalCirculating: { peggedUSD: 102 } },
          ]), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    // The whole point of this test: the call MUST resolve, not throw.
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.stablecoin_7d_delta_pct).toBeCloseTo(0.02, 4); // free data intact
    expect(r.data.smart_money_net_usd).toBeUndefined();          // BYOK omitted
    expect(r.sources).toContain("defillama-stablecoins");
    expect(r.sources).not.toContain("nansen");                   // not advertised on auth fail
    expect(r.stale_data).toContain("nansen:auth_rejected");
    expect(r.stale).toBe(false);                                 // free data is fresh
  });

  it("F13 Nansen 403: same fail-safe behaviour as 401", async () => {
    const ctx = makeContext({
      env: { byok: { nansen: "fake-key-403" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(JSON.stringify([
            { date: 1, totalCirculating: { peggedUSD: 100 } },
            { date: 2, totalCirculating: { peggedUSD: 100 } },
            { date: 3, totalCirculating: { peggedUSD: 100 } },
            { date: 4, totalCirculating: { peggedUSD: 100 } },
            { date: 5, totalCirculating: { peggedUSD: 100 } },
            { date: 6, totalCirculating: { peggedUSD: 100 } },
            { date: 7, totalCirculating: { peggedUSD: 100 } },
            { date: 8, totalCirculating: { peggedUSD: 100 } },
          ]), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBeUndefined();
    expect(r.stale_data).toContain("nansen:auth_rejected");
  });

  it("F13 Nansen 5xx / network error: data preserved, generic stale annotation", async () => {
    const ctx = makeContext({
      env: { byok: { nansen: "key" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("stablecoincharts/all")) {
          return new Response(JSON.stringify([
            { date: 1, totalCirculating: { peggedUSD: 100 } },
            { date: 2, totalCirculating: { peggedUSD: 100 } },
            { date: 3, totalCirculating: { peggedUSD: 100 } },
            { date: 4, totalCirculating: { peggedUSD: 100 } },
            { date: 5, totalCirculating: { peggedUSD: 100 } },
            { date: 6, totalCirculating: { peggedUSD: 100 } },
            { date: 7, totalCirculating: { peggedUSD: 100 } },
            { date: 8, totalCirculating: { peggedUSD: 100 } },
          ]), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          throw new Error("ECONNRESET");
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await onchainWallet.fetch(undefined, ctx);
    expect(r.data.smart_money_net_usd).toBeUndefined();
    expect(r.stale_data).toContain("nansen:network_error");
  });

  it("capabilities reports BYOK presence", () => {
    expect(onchainWallet.capabilities({ byok: {}, lang: "en" }).byok_active).toEqual([]);
    expect(onchainWallet.capabilities({ byok: { nansen: "k" }, lang: "en" }).byok_active).toContain("nansen");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/onchain_wallet
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/onchain_wallet.ts`**

```ts
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

const TTL_MS = 10 * 60_000;
const CACHE_MAX = 8;

interface DefillamaPoint {
  date: number;
  totalCirculating: { peggedUSD: number };
}

interface FetchOutcome<T> {
  data?: T;
  /** Annotation pushed to stale_data when data is undefined. */
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
      // 401/403 → BYOK key invalid; surface as `auth_rejected` so the caller
      // can choose to omit the key entirely without crashing the server.
      if (r.status === 401 || r.status === 403) return { stale: `${label}:auth_rejected` };
      if (r.status === 429) return { stale: `${label}:rate_limited` };
      return { stale: `${label}:http_${r.status}` };
    }
    return { data: (await r.json()) as T };
  } catch {
    return { stale: `${label}:network_error` };
  }
}

export const onchainWallet: Adapter = {
  name: "onchain_wallet",
  ttlMs: TTL_MS,
  capabilities(env: EnvConfig) {
    const sources = ["defillama-stablecoins"];
    if (env.byok.nansen) sources.push("nansen");
    return { byok_active: env.byok.nansen ? ["nansen"] : [], sources };
  },
  async fetch(_input, ctx): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "onchain_wallet", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "onchain_wallet", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      const series = await fetchJson<DefillamaPoint[]>(
        ctx.fetch,
        "https://stablecoins.llama.fi/stablecoincharts/all",
        "defillama-stablecoins",
      );
      if (series.data && series.data.length >= 8) {
        const last = series.data[series.data.length - 1]!.totalCirculating.peggedUSD;
        const sevenAgo = series.data[series.data.length - 8]!.totalCirculating.peggedUSD;
        if (sevenAgo > 0) {
          data.stablecoin_7d_delta_pct = (last - sevenAgo) / sevenAgo;
          data.stablecoin_supply_now_usd = last;
        }
        sources.push("defillama-stablecoins");
      } else if (series.stale) {
        staleData.push(series.stale);
      }

      // F13: Nansen BYOK enrichment is fail-safe — failures never crash the
      // adapter, never leak the key, and never advertise `nansen` in sources
      // unless the call actually returned usable data.
      if (ctx.env.byok.nansen) {
        const sm = await fetchJson<{ data: { net_usd_7d: number } }>(
          ctx.fetch,
          "https://api.nansen.ai/api/beta/smart-money/holdings?window=7d",
          "nansen",
          { apiKey: ctx.env.byok.nansen },
        );
        if (sm.data) {
          data.smart_money_net_usd = sm.data.data.net_usd_7d;
          sources.push("nansen");
        } else if (sm.stale) {
          staleData.push(sm.stale);
        }
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
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/onchain_wallet
```

Expected: 6 passed (1 free + 1 BYOK happy + 3 Nansen fail-safe + 1 capabilities).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/onchain_wallet.ts tests/adapters/onchain_wallet.test.ts
git commit -m "feat(adapter): onchain_wallet — Defillama stablecoins + Nansen BYOK with fail-safe enrichment"
```

---

## Task 13: CEX flow adapter (`src/adapters/cex_flow.ts`)

**Files:**
- Create: `src/adapters/cex_flow.ts`
- Create: `tests/adapters/cex_flow.test.ts`

Pulls aggregate exchange volume / netflow proxy.

**Free endpoints:**
- `https://api.coingecko.com/api/v3/exchanges?per_page=10` — top-10 CEX 24h trade volume (BTC)

**BYOK endpoint:**
- `https://api.glassnode.com/v1/metrics/transactions/transfers_volume_to_exchanges_sum?a=BTC&api_key=<key>`

- [ ] **Step 1: Write the failing test**

`tests/adapters/cex_flow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cexFlow } from "../../src/adapters/cex_flow.js";
import { makeContext } from "../../src/adapters/base.js";

function fakeFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pat, body] of Object.entries(map)) {
      if (u.includes(pat)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

describe("cex_flow adapter", () => {
  it("free path returns top-CEX 24h volume aggregate", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
      fetchImpl: fakeFetch({
        "exchanges?per_page=10": [
          { id: "binance", trade_volume_24h_btc: 200_000 },
          { id: "coinbase", trade_volume_24h_btc: 50_000 },
          { id: "okx", trade_volume_24h_btc: 80_000 },
        ],
      }),
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(330_000);
    expect(r.sources).toContain("coingecko");
  });

  it("BYOK path enriches with Glassnode exchange inflow when key set", async () => {
    const ctx = makeContext({
      env: { byok: { glassnode: "g-1" }, lang: "en" },
      fetchImpl: fakeFetch({
        "exchanges?per_page=10": [{ id: "binance", trade_volume_24h_btc: 100_000 }],
        "transfers_volume_to_exchanges_sum": [{ t: 1_715_000_000, v: 5_000 }],
      }),
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.exchange_inflow_btc_24h).toBe(5_000);
    expect(r.sources).toContain("glassnode");
  });

  it("F14 Glassnode 401: free CoinGecko data survives, glassnode keys omitted, stale_data annotated", async () => {
    const ctx = makeContext({
      env: { byok: { glassnode: "bad-key" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) {
          return new Response(JSON.stringify([{ id: "binance", trade_volume_24h_btc: 100_000 }]), { status: 200 });
        }
        if (u.includes("glassnode.com")) {
          return new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.sources).toContain("coingecko");
    expect(r.sources).not.toContain("glassnode");
    expect(r.stale_data).toContain("glassnode:auth_rejected");
  });

  it("F14 Glassnode 429: rate-limited annotation; data unchanged from free path", async () => {
    const ctx = makeContext({
      env: { byok: { glassnode: "k" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) {
          return new Response(JSON.stringify([{ id: "binance", trade_volume_24h_btc: 100_000 }]), { status: 200 });
        }
        if (u.includes("glassnode.com")) {
          return new Response("rate limit exceeded", { status: 429 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.stale_data).toContain("glassnode:rate_limited");
  });

  it("F14 Glassnode empty series: inflow omitted with empty_series annotation; CoinGecko still wins", async () => {
    const ctx = makeContext({
      env: { byok: { glassnode: "k" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) {
          return new Response(JSON.stringify([{ id: "binance", trade_volume_24h_btc: 100_000 }]), { status: 200 });
        }
        if (u.includes("glassnode.com")) {
          return new Response("[]", { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.cex_volume_24h_btc).toBe(100_000);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.stale_data).toContain("glassnode:empty_series");
  });

  it("F14 Glassnode schema drift: malformed payload → omitted with parse annotation, no crash", async () => {
    const ctx = makeContext({
      env: { byok: { glassnode: "k" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("exchanges?per_page=10")) {
          return new Response(JSON.stringify([{ id: "binance", trade_volume_24h_btc: 100_000 }]), { status: 200 });
        }
        if (u.includes("glassnode.com")) {
          // Schema changed: object instead of array, missing `v` field.
          return new Response(JSON.stringify({ data: { wrong: "shape" } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await cexFlow.fetch(undefined, ctx);
    expect(r.data.exchange_inflow_btc_24h).toBeUndefined();
    expect(r.stale_data).toContain("glassnode:schema_drift");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/cex_flow
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/cex_flow.ts`**

```ts
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

const TTL_MS = 5 * 60_000;
const CACHE_MAX = 8;

interface FetchOutcome<T> {
  data?: T;
  stale?: string;
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, label: string): Promise<FetchOutcome<T>> {
  try {
    const r = await fetchImpl(url);
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

export const cexFlow: Adapter = {
  name: "cex_flow",
  ttlMs: TTL_MS,
  capabilities(env: EnvConfig) {
    const sources = ["coingecko"];
    if (env.byok.glassnode) sources.push("glassnode");
    return { byok_active: env.byok.glassnode ? ["glassnode"] : [], sources };
  },
  async fetch(_input, ctx): Promise<AdapterResult> {
    const cache = ctx.cacheFor<AdapterResult>({ name: "cex_flow", ttlMs: TTL_MS, max: CACHE_MAX });
    return withCache(cache, "cex_flow", async () => {
      const staleData: string[] = [];
      const data: Record<string, unknown> = {};
      const sources: string[] = [];

      type Exchange = { id: string; trade_volume_24h_btc: number };
      const ex = await fetchJson<Exchange[]>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/exchanges?per_page=10",
        "coingecko",
      );
      if (ex.data) {
        data.cex_volume_24h_btc = ex.data.reduce((s, e) => s + (e.trade_volume_24h_btc ?? 0), 0);
        sources.push("coingecko");
      } else if (ex.stale) {
        staleData.push(ex.stale);
      }

      if (ctx.env.byok.glassnode) {
        const url = `https://api.glassnode.com/v1/metrics/transactions/transfers_volume_to_exchanges_sum?a=BTC&api_key=${encodeURIComponent(ctx.env.byok.glassnode)}`;
        const gn = await fetchJson<unknown>(ctx.fetch, url, "glassnode");
        if (gn.data !== undefined) {
          // Schema discipline: only accept the documented `Array<{ t, v }>` shape.
          // Glassnode has historically reshaped paid endpoints; reject anything
          // else with a `schema_drift` annotation rather than coercing.
          if (Array.isArray(gn.data)) {
            const series = gn.data as Array<{ t?: number; v?: number }>;
            if (series.length === 0) {
              staleData.push("glassnode:empty_series");
            } else {
              const last = series[series.length - 1]!;
              if (typeof last.v === "number") {
                data.exchange_inflow_btc_24h = last.v;
                sources.push("glassnode");
              } else {
                staleData.push("glassnode:schema_drift");
              }
            }
          } else {
            staleData.push("glassnode:schema_drift");
          }
        } else if (gn.stale) {
          staleData.push(gn.stale);
        }
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
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/cex_flow
```

Expected: 6 passed (1 free + 1 BYOK happy + 4 Glassnode failure modes).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/cex_flow.ts tests/adapters/cex_flow.test.ts
git commit -m "feat(adapter): cex_flow — CoinGecko + Glassnode with strict schema + auth/rate fail-safe"
```

---

## Task 14: Korea layer adapter (`src/adapters/kr_premium.ts`)

**Files:**
- Create: `src/adapters/kr_premium.ts`
- Create: `tests/adapters/kr_premium.test.ts`

Pulls Upbit BTC/ETH KRW prices, USD reference (via CoinGecko), computes kimchi premium and a netflow proxy (24h volume diff vs global).

**Free endpoints (v0.1):**
- `https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH`
- `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_vol=true`
- `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw` (USD/KRW reference via USDT)

> **F15: Bithumb deferred to v0.2.** Codex review F15 (medium coverage gap) flagged that the earlier draft listed `https://api.bithumb.com/public/ticker/BTC_KRW` in the endpoints but neither implemented nor tested it. v0.1 ships Upbit-only:
> - **Why Upbit-only is acceptable for v0.1**: Upbit holds the dominant share of KRW spot volume; a single-exchange premium signal is the headline number for `kr_premium_btc` / `kr_premium_eth` and the spec's `examples/rules/kr-premium-spike.yaml` rule reads from Upbit. Bithumb adds redundancy and a small accuracy improvement (volume-weighted KRW price), not a new score input.
> - **What v0.2 will add**: a Bithumb path that produces `kr_premium_bithumb_btc` / `_eth` keys and a volume-weighted `kr_premium_btc` (Upbit + Bithumb), gated by an ADR that documents the Bithumb-vs-Upbit weighting rule.
> - **Plan-time directive**: do not add Bithumb to `src/adapters/kr_premium.ts` in v0.1. Mark the deferral in `docs/adr/0005-codex-rescue-deferred-findings.md` (this commit's ADR). The `directories.txt` notes `Upbit + Bithumb (no BYOK)` in the project tree comment — leave that note since the v0.2 surface is on the same module.

- [ ] **Step 1: Write the failing test**

`tests/adapters/kr_premium.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { krPremium } from "../../src/adapters/kr_premium.js";
import { makeContext } from "../../src/adapters/base.js";

function fakeFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = url.toString();
    for (const [pat, body] of Object.entries(map)) {
      if (u.includes(pat)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}

describe("kr_premium adapter", () => {
  it("computes kimchi premium for BTC and ETH", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
      fetchImpl: fakeFetch({
        "api.upbit.com/v1/ticker": [
          { market: "KRW-BTC", trade_price: 138_000_000, acc_trade_volume_24h: 3_000 },
          { market: "KRW-ETH", trade_price: 5_400_000, acc_trade_volume_24h: 50_000 },
        ],
        "ids=bitcoin,ethereum&vs_currencies=usd": {
          bitcoin: { usd: 100_000, usd_24h_vol: 30_000_000_000 },
          ethereum: { usd: 4_000, usd_24h_vol: 15_000_000_000 },
        },
        "ids=tether&vs_currencies=krw": { tether: { krw: 1_350 } },
      }),
    });
    const r = await krPremium.fetch(undefined, ctx);
    // BTC global = 100_000 * 1350 = 135_000_000 KRW.
    // Kimchi BTC = (138_000_000 / 135_000_000 - 1) ≈ 0.02222
    expect(r.data.kr_premium_btc).toBeCloseTo(0.02222, 4);
    expect(r.data.kr_premium_eth).toBeCloseTo((5_400_000 / (4_000 * 1_350)) - 1, 4);
    expect(r.data.upbit_volume_btc_24h).toBe(3_000);
    expect(r.sources).toEqual(expect.arrayContaining(["upbit", "coingecko"]));
  });

  it("returns kimchi as undefined if Upbit is down", async () => {
    const ctx = makeContext({
      env: { byok: {}, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("upbit.com")) return new Response("err", { status: 503 });
        if (u.includes("ids=bitcoin,ethereum&vs_currencies=usd")) {
          return new Response(JSON.stringify({ bitcoin: { usd: 100_000 }, ethereum: { usd: 4_000 } }), { status: 200 });
        }
        if (u.includes("ids=tether")) {
          return new Response(JSON.stringify({ tether: { krw: 1_350 } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await krPremium.fetch(undefined, ctx);
    expect(r.data.kr_premium_btc).toBeUndefined();
    expect(r.stale).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/kr_premium
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/kr_premium.ts`**

```ts
import type { Adapter, AdapterContext } from "./base.js";
import { withCache } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

async function safeJson<T>(fetchImpl: typeof fetch, url: string): Promise<T | undefined> {
  try {
    const r = await fetchImpl(url);
    if (!r.ok) return undefined;
    return (await r.json()) as T;
  } catch {
    return undefined;
  }
}

interface UpbitTicker {
  market: string;
  trade_price: number;
  acc_trade_volume_24h: number;
}

export const krPremium: Adapter = {
  name: "kr_premium",
  ttlMs: 5 * 60_000,
  capabilities(_env: EnvConfig) {
    return { byok_active: [], sources: ["upbit", "coingecko"] };
  },
  async fetch(_input, ctx): Promise<AdapterResult> {
    return withCache(ctx.cache, "kr_premium", async () => {
      const data: Record<string, unknown> = {};
      const sources: string[] = [];
      let stale = false;

      const upbit = await safeJson<UpbitTicker[]>(
        ctx.fetch,
        "https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH",
      );
      const usd = await safeJson<{
        bitcoin: { usd: number; usd_24h_vol?: number };
        ethereum: { usd: number; usd_24h_vol?: number };
      }>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_vol=true",
      );
      const krwRef = await safeJson<{ tether: { krw: number } }>(
        ctx.fetch,
        "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw",
      );

      if (upbit && usd && krwRef) {
        const usdKrw = krwRef.tether.krw;
        const btc = upbit.find((t) => t.market === "KRW-BTC");
        const eth = upbit.find((t) => t.market === "KRW-ETH");
        if (btc) {
          data.kr_premium_btc = btc.trade_price / (usd.bitcoin.usd * usdKrw) - 1;
          data.upbit_volume_btc_24h = btc.acc_trade_volume_24h;
        }
        if (eth) {
          data.kr_premium_eth = eth.trade_price / (usd.ethereum.usd * usdKrw) - 1;
          data.upbit_volume_eth_24h = eth.acc_trade_volume_24h;
        }
        sources.push("upbit", "coingecko");
      } else {
        stale = true;
      }

      return {
        data,
        sources,
        asOf: new Date().toISOString(),
        stale,
      };
    });
  },
};
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/kr_premium
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/kr_premium.ts tests/adapters/kr_premium.test.ts
git commit -m "feat(adapter): kr_premium — Upbit + CoinGecko kimchi premium and KR volume"
```

---

## Task 15: Wallet identity adapter (`src/adapters/wallet_id.ts`)

**Files:**
- Create: `src/adapters/wallet_id.ts`
- Create: `tests/adapters/wallet_id.test.ts`

BYOK-only adapter — free path returns empty labels (graceful no-op). Used by tools that need wallet labels (e.g., enrichment of `get_market_pulse` summary). For v0.1, surface only via tests; tools don't require labels.

- [ ] **Step 1: Write the failing test**

`tests/adapters/wallet_id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { walletId } from "../../src/adapters/wallet_id.js";
import { makeContext } from "../../src/adapters/base.js";

describe("wallet_id adapter", () => {
  it("free path returns empty label set with stale=false", async () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels).toEqual({});
    expect(r.sources).toEqual([]);
    expect(r.stale).toBe(false);
  });

  it("BYOK path queries Arkham when ARKHAM_API_KEY set", async () => {
    const ctx = makeContext({
      env: { byok: { arkham: "a-1" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels).toEqual({ "0xabc": { entity: "Binance" } });
    expect(r.sources).toContain("arkham");
  });

  it("F16 BYOK path queries Nansen labels when NANSEN_API_KEY set", async () => {
    const ctx = makeContext({
      env: { byok: { nansen: "n-1" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const u = url.toString();
        if (u.includes("nansen.ai") && u.includes("entity")) {
          const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
          if (headers["apikey"] !== "n-1") {
            return new Response("forbidden", { status: 403 });
          }
          return new Response(JSON.stringify({
            "0xabc": { label: "Smart Money", category: "smart_money" },
          }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels["0xabc"]?.entity).toBe("Smart Money");
    expect(r.data.labels["0xabc"]?.category).toBe("smart_money");
    expect(r.sources).toContain("nansen");
  });

  it("F16 Arkham + Nansen merged: Arkham wins on conflict; Nansen fills gaps", async () => {
    const ctx = makeContext({
      env: { byok: { arkham: "a-1", nansen: "n-1" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response(JSON.stringify({
            "0xabc": { label: "Bin (Nansen)", category: "exchange" },
            "0xdef": { label: "Whale", category: "smart_money" },
          }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc", "0xdef"] }, ctx);
    expect(r.data.labels["0xabc"]?.entity).toBe("Binance");          // Arkham wins
    expect(r.data.labels["0xabc"]?.category).toBe("exchange");       // Nansen still contributes category
    expect(r.data.labels["0xdef"]?.entity).toBe("Whale");            // Nansen-only fills the gap
    expect(r.sources).toEqual(expect.arrayContaining(["arkham", "nansen"]));
  });

  it("F16 Nansen 401 fail-safe: Arkham labels survive, stale_data annotated", async () => {
    const ctx = makeContext({
      env: { byok: { arkham: "a-1", nansen: "bad-key" }, lang: "en" },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels["0xabc"]?.entity).toBe("Binance");
    expect(r.sources).toContain("arkham");
    expect(r.sources).not.toContain("nansen");
    expect(r.stale_data).toContain("nansen:auth_rejected");
  });

  it("capabilities reports enrichment when arkham or nansen key set", () => {
    expect(walletId.capabilities({ byok: {}, lang: "en" }).byok_active).toEqual([]);
    expect(walletId.capabilities({ byok: { arkham: "k" }, lang: "en" }).byok_active).toContain("arkham");
    expect(walletId.capabilities({ byok: { nansen: "k" }, lang: "en" }).byok_active).toContain("nansen");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- adapters/wallet_id
```

Expected: FAIL.

- [ ] **Step 3: Create `src/adapters/wallet_id.ts`**

```ts
import type { Adapter, AdapterContext } from "./base.js";
import type { AdapterResult } from "../types.js";
import type { EnvConfig } from "../env.js";

interface Input {
  addresses: string[];
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
  async fetch(input, ctx): Promise<AdapterResult> {
    if (!ctx.env.byok.arkham && !ctx.env.byok.nansen) {
      return { data: { labels: {} }, sources: [], asOf: new Date().toISOString(), stale: false, stale_data: [] };
    }

    const staleData: string[] = [];
    const labels: Record<string, { entity?: string; category?: string }> = {};
    const sources: string[] = [];

    // F16: Nansen runs first so Arkham can overwrite `entity` on conflict.
    // The category field comes only from Nansen and is preserved on merge.
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
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- adapters/wallet_id
```

Expected: 6 passed (1 free no-op + 1 Arkham + 1 Nansen + 1 merged + 1 fail-safe + 1 capabilities).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/wallet_id.ts tests/adapters/wallet_id.test.ts
git commit -m "feat(adapter): wallet_id — Arkham + Nansen merged labels with fail-safe enrichment"
```

---

## Task 16: `get_market_pulse` pipeline (split per Codex review F18)

> **Codex review F17 + F18.** The earlier draft bundled adapter fan-out, score-input mapping, BYOK aggregation, history injection, and ToolResponse formatting into a single task with no test for the fan-out step. The pipeline is now split into three sub-tasks, each with its own red→green→commit cycle. The split makes the data flow auditable: each step has a documented input/output contract that downstream agents (Task 22 server wiring, Task 22.5 warmup CLI) can rely on without re-reading the implementation.
>
> **Pipeline:**
> ```
> AdapterContext + lang + addresses (input)
>   → Task 16a: fanOutAdapters → AdapterFanoutResult { perAdapter, sources, byokActive, staleData, asOf }
>   → Task 16b: toScoreInputs   → ScoreInputs { values: Record<string, number> }
>   → Task 16c: getMarketPulse  → ToolResponse
> ```
> Each arrow is a pure function (no side effects beyond what the adapters themselves do via `ctx.fetch`). Tests at each layer are isolated and fast.

---

### Task 16a: Adapter fan-out (`src/pipeline/fanout.ts`)

**Files:**
- Create: `src/pipeline/fanout.ts`
- Create: `tests/pipeline/fanout.test.ts`

Calls all 5 v0.1 adapters (`derivatives`, `macroRwa`, `onchainWallet`, `cexFlow`, `krPremium`) in parallel, collects their results, and merges `sources`, `byok_active` (capabilities), and `stale_data` into a single `AdapterFanoutResult`. Per-adapter failures must NOT abort the fan-out — a failed adapter contributes an empty `data: {}` plus an entry in `staleData` annotating which adapter failed and why.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/fanout.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fanOutAdapters } from "../../src/pipeline/fanout.js";
import { makeContext } from "../../src/adapters/base.js";
import type { Adapter, AdapterContext } from "../../src/adapters/base.js";
import type { AdapterResult } from "../../src/types.js";

function fakeAdapter(name: string, result: AdapterResult, capability: string[] = []): Adapter {
  return {
    name,
    ttlMs: 60_000,
    capabilities: () => ({ byok_active: capability, sources: [name] }),
    fetch: vi.fn(async () => result),
  };
}

describe("fanOutAdapters", () => {
  it("F17 fans out to all adapters in parallel and merges sources + byokActive", async () => {
    const ctx = makeContext({ env: { byok: { coinglass: "k" }, lang: "en" } });
    const adapters = [
      fakeAdapter("derivatives",    { data: { funding_btc: 0.0001 }, sources: ["deribit", "coinglass"], asOf: "t1", stale: false }, ["coinglass"]),
      fakeAdapter("macro_rwa",      { data: { etf_7d_net_usd: 340e6 }, sources: ["farside.co.uk"],     asOf: "t2", stale: false }),
      fakeAdapter("onchain_wallet", { data: { stablecoin_7d_delta_pct: 0.014 }, sources: ["defillama-stablecoins"], asOf: "t3", stale: false }),
      fakeAdapter("cex_flow",       { data: { cex_volume_24h_btc: 200_000 }, sources: ["coingecko"], asOf: "t4", stale: false }),
      fakeAdapter("kr_premium",     { data: { upbit_volume_btc_24h: 3_000 }, sources: ["upbit"], asOf: "t5", stale: false }),
    ];
    const out = await fanOutAdapters(adapters, ctx);
    // Every adapter was called exactly once.
    for (const a of adapters) expect(a.fetch).toHaveBeenCalledTimes(1);
    // perAdapter map is keyed by adapter name.
    expect(Object.keys(out.perAdapter).sort()).toEqual([
      "cex_flow", "derivatives", "kr_premium", "macro_rwa", "onchain_wallet",
    ]);
    // Sources are merged (de-duplicated, stable order — alphabetical here).
    expect(out.sources).toEqual(expect.arrayContaining(["coingecko", "coinglass", "defillama-stablecoins", "deribit", "farside.co.uk", "upbit"]));
    // byokActive comes from capabilities, deduplicated.
    expect(out.byokActive).toEqual(["coinglass"]);
    // No stale entries on the happy path.
    expect(out.staleData).toEqual([]);
    // asOf is the latest of all adapter timestamps.
    expect(out.asOf).toBe("t5");
  });

  it("F17 partial failure: one adapter throws — others survive, staleData annotated, no rejection", async () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const failing: Adapter = {
      name: "derivatives",
      ttlMs: 60_000,
      capabilities: () => ({ byok_active: [], sources: ["deribit"] }),
      fetch: vi.fn(async () => { throw new Error("upstream down"); }),
    };
    const ok = fakeAdapter("macro_rwa", { data: { etf_7d_net_usd: 100e6 }, sources: ["farside.co.uk"], asOf: "t", stale: false });
    const out = await fanOutAdapters([failing, ok], ctx);
    expect(out.perAdapter.derivatives.data).toEqual({});
    expect(out.perAdapter.macro_rwa.data.etf_7d_net_usd).toBe(100e6);
    expect(out.staleData).toContain("derivatives:adapter_threw");
  });

  it("F17 propagates per-adapter stale_data into the merged staleData", async () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const flaky = fakeAdapter("derivatives", {
      data: { funding_btc: 0.0001 },
      sources: ["deribit"],
      asOf: "t",
      stale: false,
      stale_data: ["coinglass:auth_rejected"],
    });
    const out = await fanOutAdapters([flaky], ctx);
    expect(out.staleData).toContain("coinglass:auth_rejected");
  });

  it("F17 stale fallback adapter result is preserved with `stale: true` flag bubbled up", async () => {
    const ctx = makeContext({ env: { byok: {}, lang: "en" } });
    const stale = fakeAdapter("macro_rwa", {
      data: { etf_7d_net_usd: 200e6 },
      sources: ["farside.co.uk"],
      asOf: "t-old",
      stale: true,
    });
    const out = await fanOutAdapters([stale], ctx);
    expect(out.perAdapter.macro_rwa.stale).toBe(true);
    expect(out.staleData).toContain("macro_rwa:stale_fallback");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- pipeline/fanout
```

Expected: FAIL.

- [ ] **Step 3: Create `src/pipeline/fanout.ts`**

```ts
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
        const r = await a.fetch(undefined as never, ctx);
        return { name: a.name, result: r };
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
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- pipeline/fanout
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/fanout.ts tests/pipeline/fanout.test.ts
git commit -m "feat(pipeline): adapter fan-out with per-adapter failure isolation"
```

---

### Task 16b: Score-input mapping (`src/pipeline/score_inputs.ts`)

**Files:**
- Create: `src/pipeline/score_inputs.ts`
- Create: `tests/pipeline/score_inputs.test.ts`

Translates `AdapterFanoutResult.perAdapter` into the 7-key `values: Record<string, number>` consumed by `computePulseScore` (Task 9). The mapping is a fixed table per spec §6 — adapter `data` field → score input key. Missing adapter values are simply absent from the output `values`; Task 9's renormalisation handles them.

- [ ] **Step 1: Write the failing test**

`tests/pipeline/score_inputs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toScoreInputs } from "../../src/pipeline/score_inputs.js";
import type { AdapterResult } from "../../src/types.js";

function res(data: Record<string, unknown>): AdapterResult {
  return { data, sources: [], asOf: "t", stale: false };
}

describe("toScoreInputs", () => {
  it("maps every documented adapter field to its score-input key", () => {
    const v = toScoreInputs({
      macro_rwa:       res({ etf_7d_net_usd: 340e6, btc_dominance_7d_delta: -0.005, rwa_tvl_7d_delta: 0.012 }),
      onchain_wallet:  res({ stablecoin_7d_supply_delta: 0.014 }),
      kr_premium:      res({ upbit_netflow_7d_kr: 80e6 }),
      derivatives:     res({ funding_avg_btc_eth: 0.0002, options_put_call_ratio: 0.6 }),
      cex_flow:        res({}),
    });
    expect(v).toEqual({
      etf_7d_net_flow_btc_eth: 340e6,
      stablecoin_7d_supply_delta: 0.014,
      upbit_netflow_7d_kr: 80e6,
      funding_avg_btc_eth: 0.0002,
      btc_dominance_7d_delta: -0.005,
      options_put_call_ratio: 0.6,
      rwa_tvl_7d_delta: 0.012,
    });
  });

  it("omits keys whose source adapter returned no data", () => {
    const v = toScoreInputs({
      macro_rwa: res({ btc_dominance_7d_delta: -0.005 }), // only one of three keys
    });
    expect(v).toEqual({ btc_dominance_7d_delta: -0.005 });
  });

  it("ignores fields not in the score-input map (silent passthrough)", () => {
    const v = toScoreInputs({
      derivatives: res({ funding_avg_btc_eth: 0.0001, oi_btc_usd: 12.5e9 }),
    });
    expect(v).toEqual({ funding_avg_btc_eth: 0.0001 });
  });

  it("returns empty object when no adapter contributes any mapped key", () => {
    expect(toScoreInputs({ derivatives: res({ random_field: 42 }) })).toEqual({});
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- pipeline/score_inputs
```

Expected: FAIL.

- [ ] **Step 3: Create `src/pipeline/score_inputs.ts`**

```ts
import type { AdapterResult } from "../types.js";

/**
 * Spec §6 score-input map: which adapter `data` field provides which
 * `computePulseScore` input key. This table is the single source of truth
 * for the pipeline mapping; do not duplicate it elsewhere.
 *
 * If you need to add a new score input in v0.2, extend this table AND the
 * adapter that produces the field — both must change together.
 */
const MAP: Array<[adapterName: string, dataField: string, inputKey: string]> = [
  ["macro_rwa",      "etf_7d_net_usd",            "etf_7d_net_flow_btc_eth"],
  ["macro_rwa",      "btc_dominance_7d_delta",    "btc_dominance_7d_delta"],
  ["macro_rwa",      "rwa_tvl_7d_delta",          "rwa_tvl_7d_delta"],
  ["onchain_wallet", "stablecoin_7d_supply_delta","stablecoin_7d_supply_delta"],
  ["kr_premium",     "upbit_netflow_7d_kr",       "upbit_netflow_7d_kr"],
  ["derivatives",    "funding_avg_btc_eth",       "funding_avg_btc_eth"],
  ["derivatives",    "options_put_call_ratio",    "options_put_call_ratio"],
];

export function toScoreInputs(perAdapter: Record<string, AdapterResult>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [adapterName, dataField, inputKey] of MAP) {
    const r = perAdapter[adapterName];
    if (!r) continue;
    const v = r.data[dataField];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[inputKey] = v;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- pipeline/score_inputs
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/score_inputs.ts tests/pipeline/score_inputs.test.ts
git commit -m "feat(pipeline): adapter→score-input mapping per spec §6"
```

---

### Task 16c: `get_market_pulse` ToolResponse (`src/tools/get_market_pulse.ts`)

**Files:**
- Create: `src/tools/get_market_pulse.ts`
- Create: `tests/tools/get_market_pulse.test.ts`

Pure response shaper. Takes the score inputs from 16b plus history (loaded by Task 22 server wiring from the Task 8.5 ring buffer), runs `computePulseScore`, applies `toReading` + `formatSummary`, returns a `ToolResponse`.

- [ ] **Step 1: Write the failing test**

`tests/tools/get_market_pulse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getMarketPulse } from "../../src/tools/get_market_pulse.js";
import { loadPulseConfig } from "../../src/pulse/config.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cfg = loadPulseConfig();
const golden = JSON.parse(
  readFileSync(resolve("tests/pulse/fixtures/golden_input.json"), "utf-8"),
) as { values: Record<string, number>; history: Record<string, number[]> };

describe("get_market_pulse", () => {
  it("returns a fully-shaped ToolResponse", async () => {
    const r = await getMarketPulse({
      cfg,
      values: golden.values,
      history: golden.history,
      sources: ["deribit", "defillama"],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T00:00:00Z",
      staleData: [],
    });
    expect(r.summary).toMatch(/risk-on|neutral|risk-off/);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score!).toBeLessThanOrEqual(100);
    expect(r.confidence).toBe(1);
    expect(r.capabilities.byok_active).toEqual([]);
  });

  it("returns reading=unknown and confidence=0 when no inputs", async () => {
    const r = await getMarketPulse({
      cfg,
      values: {},
      history: golden.history,
      sources: [],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T00:00:00Z",
      staleData: ["all sources down"],
    });
    expect(r.reading).toBe("unknown");
    expect(r.score).toBeNull();
    expect(r.summary).toMatch(/unavailable/i);
  });

  it("preserves stale_data and as_of from caller", async () => {
    const r = await getMarketPulse({
      cfg,
      values: golden.values,
      history: golden.history,
      sources: ["deribit"],
      byokActive: [],
      lang: "en",
      asOf: "2026-05-08T07:00:00Z",
      staleData: ["coinglass: rate-limited"],
    });
    expect(r.as_of).toBe("2026-05-08T07:00:00Z");
    expect(r.stale_data).toEqual(["coinglass: rate-limited"]);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_market_pulse
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_market_pulse.ts`**

```ts
import type { ToolResponse, Lang } from "../types.js";
import type { PulseConfig } from "../pulse/config.js";
import { computePulseScore } from "../pulse/score.js";
import { toReading, formatSummary } from "../pulse/reading.js";

export interface GetMarketPulseArgs {
  cfg: PulseConfig;
  values: Record<string, number>;
  history: Record<string, number[]>;
  sources: string[];
  byokActive: string[];
  lang: Lang;
  asOf: string;
  staleData: string[];
}

export async function getMarketPulse(args: GetMarketPulseArgs): Promise<ToolResponse> {
  const { score, confidence } = computePulseScore({
    values: args.values,
    history: args.history,
    cfg: args.cfg,
  });
  const reading = toReading(score, args.cfg);
  const summary = formatSummary({ score, reading, inputs: args.values }, args.lang);

  return {
    summary,
    score,
    reading,
    as_of: args.asOf,
    inputs: args.values,
    sources: args.sources,
    stale_data: args.staleData,
    confidence,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_market_pulse
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_market_pulse.ts tests/tools/get_market_pulse.test.ts
git commit -m "feat(tool): get_market_pulse — assemble inputs + score + summary"
```

---

## Task 17: `get_etf_flow` tool

**Files:**
- Create: `src/tools/get_etf_flow.ts`
- Create: `tests/tools/get_etf_flow.test.ts`

Wraps `macroRwa` adapter, exposes ETF net flow over a window argument.

> **F19: window scope locked to `"7d"` for v0.1.** Codex review F19 (medium coverage gap) flagged that the original schema accepted `"1d" | "7d" | "30d"` but only the `etf_7d_net_usd` key exists in the adapter. The fix: v0.1 schema is `"7d"` only; the adapter's data shape can deliver only that. A 1d/30d expansion is a v0.2 surface — it requires the `macro_rwa` adapter to expose `etf_1d_net_usd` and `etf_30d_net_usd` keys derived from Farside's daily history (which Task 22.5 warmup already imports for history seeding; v0.2 would re-use the same data). Documenting the deferral here so the schema and the adapter cannot drift.

- [ ] **Step 1: Write the failing test**

`tests/tools/get_etf_flow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getEtfFlow, GetEtfFlowArgsSchema } from "../../src/tools/get_etf_flow.js";

describe("get_etf_flow", () => {
  it("returns ToolResponse with summary and inputs from adapter result", async () => {
    const adapterResult = {
      data: { etf_7d_net_usd: 340_500_000 },
      sources: ["farside.co.uk"],
      asOf: "2026-05-08T07:00:00Z",
      stale: false,
    };
    const r = await getEtfFlow({
      window: "7d",
      adapterResult,
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.summary).toMatch(/ETF/);
    expect(r.summary).toMatch(/\$340/);
    expect(r.score).toBeNull();
    expect(r.reading).toBe("unknown");
    expect(r.inputs.etf_7d_net_usd).toBe(340_500_000);
  });

  it("returns reading=unknown and 'data unavailable' when value missing", async () => {
    const r = await getEtfFlow({
      window: "7d",
      adapterResult: { data: {}, sources: [], asOf: "x", stale: true },
      lang: "en",
      byokActive: [],
      staleData: ["farside.co.uk: down"],
    });
    expect(r.summary).toMatch(/unavailable/i);
  });

  it("F19 schema rejects non-7d windows in v0.1 (1d / 30d unsupported)", () => {
    expect(() => GetEtfFlowArgsSchema.parse({ window: "1d" })).toThrow();
    expect(() => GetEtfFlowArgsSchema.parse({ window: "30d" })).toThrow();
    expect(GetEtfFlowArgsSchema.parse({ window: "7d" }).window).toBe("7d");
    expect(GetEtfFlowArgsSchema.parse({}).window).toBe("7d"); // defaults
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_etf_flow
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_etf_flow.ts`**

```ts
import { z } from "zod";
import type { ToolResponse, Lang } from "../types.js";
import type { AdapterResult } from "../types.js";

/**
 * F19: v0.1 schema accepts only `window: "7d"`. The literal type prevents
 * the schema from advertising windows the adapter cannot satisfy.
 * v0.2 will widen to `["1d", "7d", "30d"]` once the adapter exposes
 * `etf_1d_net_usd` and `etf_30d_net_usd` keys.
 */
export const GetEtfFlowArgsSchema = z.object({
  window: z.literal("7d").default("7d"),
});

export interface GetEtfFlowArgs {
  window: "7d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getEtfFlow(args: GetEtfFlowArgs): Promise<ToolResponse> {
  const v = args.adapterResult.data.etf_7d_net_usd;
  if (typeof v !== "number") {
    return {
      summary: args.lang === "ko" ? "ETF 데이터 사용 불가" : "ETF data unavailable",
      score: null,
      reading: "unknown",
      as_of: args.adapterResult.asOf,
      inputs: {},
      sources: args.adapterResult.sources,
      stale_data: args.staleData,
      confidence: 0,
      capabilities: { byok_active: args.byokActive },
    };
  }
  const sign = v >= 0 ? "+" : "-";
  const m = Math.abs(v) / 1_000_000;
  const summary = args.lang === "ko"
    ? `ETF ${sign}$${m.toFixed(0)}M ${args.window} 누적`
    : `ETF ${sign}$${m.toFixed(0)}M ${args.window} cumulative`;
  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: { etf_7d_net_usd: v },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_etf_flow
```

Expected: 3 passed (1 happy + 1 unavailable + 1 schema-window-rejection).

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_etf_flow.ts tests/tools/get_etf_flow.test.ts
git commit -m "feat(tool): get_etf_flow — window-summarised ETF net flow"
```

---

## Task 18: `get_stablecoin_pulse` tool

**Files:**
- Create: `src/tools/get_stablecoin_pulse.ts`
- Create: `tests/tools/get_stablecoin_pulse.test.ts`

- [ ] **Step 1: Write the failing test**

> **F20: window scope locked to `"7d"` for v0.1** (same rationale as F19 for `get_etf_flow`). Adapter only exposes `stablecoin_7d_delta_pct`; widening to 1d/30d requires the adapter to compute and emit those keys. Deferred to v0.2.

`tests/tools/get_stablecoin_pulse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getStablecoinPulse, GetStablecoinPulseArgsSchema } from "../../src/tools/get_stablecoin_pulse.js";

describe("get_stablecoin_pulse", () => {
  it("formats stablecoin delta and current supply", async () => {
    const r = await getStablecoinPulse({
      window: "7d",
      adapterResult: {
        data: { stablecoin_7d_delta_pct: 0.014, stablecoin_supply_now_usd: 153_100_000_000 },
        sources: ["defillama-stablecoins"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.summary).toMatch(/stablecoin/i);
    expect(r.summary).toMatch(/\+1\.4%/);
    expect(r.inputs.stablecoin_7d_delta_pct).toBeCloseTo(0.014, 5);
  });

  it("returns unavailable summary when no delta", async () => {
    const r = await getStablecoinPulse({
      window: "7d",
      adapterResult: { data: {}, sources: [], asOf: "x", stale: true },
      lang: "en",
      byokActive: [],
      staleData: ["defillama: down"],
    });
    expect(r.summary).toMatch(/unavailable/i);
  });

  it("F20 schema rejects non-7d windows in v0.1", () => {
    expect(() => GetStablecoinPulseArgsSchema.parse({ window: "1d" })).toThrow();
    expect(() => GetStablecoinPulseArgsSchema.parse({ window: "30d" })).toThrow();
    expect(GetStablecoinPulseArgsSchema.parse({}).window).toBe("7d");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_stablecoin_pulse
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_stablecoin_pulse.ts`**

```ts
import { z } from "zod";
import type { ToolResponse, Lang, AdapterResult } from "../types.js";

/** F20: v0.1 schema — 7d only. See plan note above. */
export const GetStablecoinPulseArgsSchema = z.object({
  window: z.literal("7d").default("7d"),
});

export interface Args {
  window: "7d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];
  staleData: string[];
}

export async function getStablecoinPulse(args: Args): Promise<ToolResponse> {
  const delta = args.adapterResult.data.stablecoin_7d_delta_pct;
  const now = args.adapterResult.data.stablecoin_supply_now_usd;
  if (typeof delta !== "number") {
    return unavailable(args, "stablecoin");
  }
  const pct = (delta * 100).toFixed(1);
  const sign = delta >= 0 ? "+" : "";
  const summary = args.lang === "ko"
    ? `stablecoin 공급 ${sign}${pct}% (${args.window})`
    : `stablecoin supply ${sign}${pct}% (${args.window})`;
  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: { stablecoin_7d_delta_pct: delta, ...(typeof now === "number" ? { stablecoin_supply_now_usd: now } : {}) },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}

function unavailable(args: Args, label: string): ToolResponse {
  return {
    summary: args.lang === "ko" ? `${label} 데이터 사용 불가` : `${label} data unavailable`,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: {},
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 0,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_stablecoin_pulse
```

Expected: 3 passed (1 happy + 1 unavailable + 1 schema-window-rejection).

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_stablecoin_pulse.ts tests/tools/get_stablecoin_pulse.test.ts
git commit -m "feat(tool): get_stablecoin_pulse — supply Δ summary"
```

---

## Task 19: `get_funding_oi` tool

**Files:**
- Create: `src/tools/get_funding_oi.ts`
- Create: `tests/tools/get_funding_oi.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tools/get_funding_oi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getFundingOi } from "../../src/tools/get_funding_oi.js";

describe("get_funding_oi", () => {
  it("returns BTC funding/PCR/OI summary", async () => {
    const r = await getFundingOi({
      asset: "BTC",
      adapterResult: {
        data: {
          funding_btc: 0.00018,
          funding_eth: 0.00012,
          put_call_btc: 0.62,
          put_call_eth: 0.58,
          oi_btc_usd: 12_500_000_000,
        },
        sources: ["deribit", "coinglass"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: ["coinglass"],
      staleData: [],
    });
    expect(r.inputs.funding_btc).toBeCloseTo(0.00018, 6);
    expect(r.inputs.put_call_btc).toBeCloseTo(0.62, 3);
    expect(r.inputs.oi_btc_usd).toBe(12_500_000_000);
    expect(r.summary).toMatch(/BTC/);
    expect(r.summary).toMatch(/funding/i);
  });

  it("rejects invalid asset", async () => {
    await expect(
      getFundingOi({
        asset: "DOGE" as unknown as "BTC",
        adapterResult: { data: {}, sources: [], asOf: "x", stale: false },
        lang: "en",
        byokActive: [],
        staleData: [],
      }),
    ).rejects.toThrow(/asset/);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_funding_oi
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_funding_oi.ts`**

```ts
import type { ToolResponse, Lang, AdapterResult } from "../types.js";

export interface Args {
  asset: "BTC" | "ETH";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];   // camelCase — matches usage at `args.byokActive`
  staleData: string[];
}

export async function getFundingOi(args: Args): Promise<ToolResponse> {
  if (args.asset !== "BTC" && args.asset !== "ETH") {
    throw new Error(`asset must be BTC or ETH, got: ${String(args.asset)}`);
  }
  const lower = args.asset.toLowerCase();
  const funding = args.adapterResult.data[`funding_${lower}`];
  const pc = args.adapterResult.data[`put_call_${lower}`];
  const oi = args.adapterResult.data[`oi_${lower}_usd`];
  const inputs: Record<string, unknown> = {};
  if (typeof funding === "number") inputs[`funding_${lower}`] = funding;
  if (typeof pc === "number") inputs[`put_call_${lower}`] = pc;
  if (typeof oi === "number") inputs[`oi_${lower}_usd`] = oi;

  const fundingPct = typeof funding === "number" ? (funding * 100).toFixed(4) : "n/a";
  const pcStr = typeof pc === "number" ? pc.toFixed(2) : "n/a";
  const oiStr = typeof oi === "number" ? `$${(oi / 1e9).toFixed(1)}B` : "n/a";

  const summary = args.lang === "ko"
    ? `${args.asset} funding ${fundingPct}% / P/C ${pcStr} / OI ${oiStr}`
    : `${args.asset} funding ${fundingPct}% / put-call ${pcStr} / OI ${oiStr}`;

  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs,
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: Object.keys(inputs).length > 0 ? 1 : 0,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_funding_oi
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_funding_oi.ts tests/tools/get_funding_oi.test.ts
git commit -m "feat(tool): get_funding_oi — funding/PCR/OI per asset"
```

---

## Task 20: `get_kr_premium` tool

**Files:**
- Create: `src/tools/get_kr_premium.ts`
- Create: `tests/tools/get_kr_premium.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tools/get_kr_premium.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getKrPremium } from "../../src/tools/get_kr_premium.js";

describe("get_kr_premium", () => {
  it("formats kimchi premium for BTC and ETH (asset=all)", async () => {
    const r = await getKrPremium({
      asset: "all",
      adapterResult: {
        data: {
          kr_premium_btc: 0.022,
          kr_premium_eth: 0.018,
          upbit_volume_btc_24h: 3_000,
          upbit_volume_eth_24h: 50_000,
        },
        sources: ["upbit", "coingecko"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.summary).toMatch(/BTC kimchi \+2\.2%/);
    expect(r.summary).toMatch(/ETH kimchi \+1\.8%/);
    expect(r.inputs.kr_premium_btc).toBeCloseTo(0.022, 4);
  });

  it("filters to BTC when asset=BTC", async () => {
    const r = await getKrPremium({
      asset: "BTC",
      adapterResult: {
        data: { kr_premium_btc: 0.022, kr_premium_eth: 0.018 },
        sources: [],
        asOf: "x",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.inputs.kr_premium_btc).toBeCloseTo(0.022, 4);
    expect(r.inputs.kr_premium_eth).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_kr_premium
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_kr_premium.ts`**

```ts
import type { ToolResponse, Lang, AdapterResult } from "../types.js";

export interface Args {
  asset: "BTC" | "ETH" | "all";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];   // camelCase — matches usage at `args.byokActive`
  staleData: string[];
}

export async function getKrPremium(args: Args): Promise<ToolResponse> {
  const inputs: Record<string, unknown> = {};
  const parts: string[] = [];
  for (const a of ["BTC", "ETH"] as const) {
    if (args.asset !== "all" && args.asset !== a) continue;
    const k = `kr_premium_${a.toLowerCase()}`;   // ADR-0001: code key uses kr_premium, not kimchi
    const v = args.adapterResult.data[k];
    if (typeof v === "number") {
      inputs[k] = v;
      const pct = (v * 100).toFixed(1);
      const sign = v >= 0 ? "+" : "";
      parts.push(`${a} kimchi ${sign}${pct}%`);   // prose-only "kimchi" allowed per ADR-0001
    }
  }
  const summary = parts.length > 0
    ? parts.join(" / ")
    : (args.lang === "ko" ? "김프 데이터 사용 불가" : "kimchi data unavailable");

  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs,
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: parts.length > 0 ? 1 : 0,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_kr_premium
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_kr_premium.ts tests/tools/get_kr_premium.test.ts
git commit -m "feat(tool): get_kr_premium — kimchi premium per asset"
```

---

## Task 21: `get_rwa_pulse` tool

**Files:**
- Create: `src/tools/get_rwa_pulse.ts`
- Create: `tests/tools/get_rwa_pulse.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tools/get_rwa_pulse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getRwaPulse } from "../../src/tools/get_rwa_pulse.js";

describe("get_rwa_pulse", () => {
  it("formats RWA TVL summary", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: { rwa_tvl_usd: 1_800_000_000 },
        sources: ["defillama"],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.summary).toMatch(/RWA TVL/);
    expect(r.summary).toMatch(/\$1\.8B/);
    expect(r.inputs.rwa_tvl_usd).toBe(1_800_000_000);
  });

  it("F21 unavailable path: missing tvl → reading=unknown, confidence=0, no inputs", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: {}, // adapter returned but no rwa_tvl_usd key
        sources: [],
        asOf: "2026-05-08T07:00:00Z",
        stale: false,
      },
      lang: "en",
      byokActive: [],
      staleData: [],
    });
    expect(r.reading).toBe("unknown");
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.summary).toMatch(/unavailable/i);
    expect(r.inputs).toEqual({});
  });

  it("F21 stale propagation: adapter staleData passes through to ToolResponse", async () => {
    const r = await getRwaPulse({
      window: "7d",
      adapterResult: {
        data: { rwa_tvl_usd: 1_800_000_000 },
        sources: ["defillama"],
        asOf: "2026-05-08T00:00:00Z", // earlier as_of indicates stale fallback
        stale: true,
      },
      lang: "en",
      byokActive: [],
      staleData: ["defillama:http_503", "macro_rwa:stale_fallback"],
    });
    expect(r.reading).toBe("unknown"); // tool layer preserves the unknown reading regardless of stale
    expect(r.stale_data).toEqual(expect.arrayContaining(["defillama:http_503", "macro_rwa:stale_fallback"]));
    expect(r.as_of).toBe("2026-05-08T00:00:00Z");
  });

  it("F21 Korean locale formats the summary in Korean parentheses style", async () => {
    const r = await getRwaPulse({
      window: "30d",
      adapterResult: {
        data: { rwa_tvl_usd: 2_500_000_000 },
        sources: ["defillama"],
        asOf: "x",
        stale: false,
      },
      lang: "ko",
      byokActive: [],
      staleData: [],
    });
    expect(r.summary).toBe("RWA TVL $2.5B (30d)");
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- tools/get_rwa_pulse
```

Expected: FAIL.

- [ ] **Step 3: Create `src/tools/get_rwa_pulse.ts`**

```ts
import type { ToolResponse, Lang, AdapterResult } from "../types.js";

export interface Args {
  window: "1d" | "7d" | "30d";
  adapterResult: AdapterResult;
  lang: Lang;
  byokActive: string[];   // camelCase — matches usage at `args.byokActive`
  staleData: string[];
}

export async function getRwaPulse(args: Args): Promise<ToolResponse> {
  const tvl = args.adapterResult.data.rwa_tvl_usd;
  if (typeof tvl !== "number") {
    return {
      summary: args.lang === "ko" ? "RWA 데이터 사용 불가" : "RWA data unavailable",
      score: null,
      reading: "unknown",
      as_of: args.adapterResult.asOf,
      inputs: {},
      sources: args.adapterResult.sources,
      stale_data: args.staleData,
      confidence: 0,
      capabilities: { byok_active: args.byokActive },
    };
  }
  const usdB = (tvl / 1e9).toFixed(1);
  const summary = args.lang === "ko"
    ? `RWA TVL $${usdB}B (${args.window})`
    : `RWA TVL $${usdB}B (${args.window})`;
  return {
    summary,
    score: null,
    reading: "unknown",
    as_of: args.adapterResult.asOf,
    inputs: { rwa_tvl_usd: tvl },
    sources: args.adapterResult.sources,
    stale_data: args.staleData,
    confidence: 1,
    capabilities: { byok_active: args.byokActive },
  };
}
```

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- tools/get_rwa_pulse
```

Expected: 4 passed (1 happy + 1 unavailable + 1 stale-propagation + 1 ko locale).

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_rwa_pulse.ts tests/tools/get_rwa_pulse.test.ts
git commit -m "feat(tool): get_rwa_pulse — RWA TVL summary with stale + unknown propagation"
```

---

## Task 22: MCP server wiring + bin entry

**Files:**
- Replace: `src/index.ts`
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

The server registers the 6 tools, exposes their JSON schemas as **hand-written `inputSchema` literals** (no `zod-to-json-schema` dependency), and dispatches incoming tool calls to the tool handler functions, sourcing adapter data from a single shared `AdapterContext` whose **caches are isolated per adapter** (Task 6's `cacheFor` API).

> **F22: schema generation strategy locked to manual.** Codex review F22 (HIGH FEASIBILITY_FLAG) flagged that the earlier draft mentioned `zod-to-json-schema` (no dependency in `package.json`) while the actual code used hand-written schemas. Decision: **stay manual, do not add the dep.** Justification:
> - The 6 tool schemas total ~25 lines of object literals — generating them is more code than writing them.
> - Manual schemas decouple MCP-side wire shape from the server-internal `zod` validation schema. The internal schemas (`SevenDayOnly`, `RwaWindowArgs`, `FundingArgs`, `KrPremiumArgs`) can evolve (e.g. adding internal fields) without breaking MCP clients.
> - `zod-to-json-schema` adds ~15KB and re-renders schemas at startup; manual literals are zero-cost.
> - The runtime check is `*.parse(raw)` against the zod schema, not the JSON Schema — so JSON Schema accuracy is descriptive (for clients), not enforcing.
>
> If a future task needs many more tools (v0.2 B/A views), revisit this decision in an ADR; until then, manual schemas are correct.

For `get_market_pulse`, historical series are fetched from a small in-process series provider that calls Defillama's daily history APIs. To keep tests deterministic, the series provider is dependency-injected.

> **Cache isolation invariant.** The single shared `AdapterContext` does *not* mean a single shared cache. `ctx.cacheFor({ name, ttlMs, max })` returns a per-adapter cache instance (Task 6). Each adapter must call `cacheFor` with its own `name`/`ttlMs`/`max` so:
> - derivatives (90s TTL) cannot evict macro_rwa (10min TTL) entries;
> - one adapter's `max` overflow does not LRU-evict another adapter's hot keys;
> - per-adapter TTLs declared in spec §4 are respected at runtime, not silently flattened to a shared default.
>
> If you find yourself wanting to share a cache instance across adapters, stop and add a server-level test (`tests/server.test.ts` below) that asserts isolation, then keep them separate.

- [ ] **Step 1: Write the failing test**

`tests/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer, listTools } from "../src/server.js";

describe("server", () => {
  it("registers all six expected tools", () => {
    const tools = listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_etf_flow",
      "get_funding_oi",
      "get_kr_premium",
      "get_market_pulse",
      "get_rwa_pulse",
      "get_stablecoin_pulse",
    ]);
  });

  it("each tool advertises a JSON schema with type=object", () => {
    for (const t of listTools()) {
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("createServer returns a connectable Server instance", () => {
    const s = createServer({ env: { byok: {}, lang: "en" } });
    expect(s).toBeDefined();
    expect(typeof s.connect).toBe("function");
  });

  it("server-built AdapterContext gives each adapter an isolated cache", () => {
    // Regression guard for the per-adapter cache invariant (Task 6).
    const { ctx } = createServer({ env: { byok: {}, lang: "en" } });
    const a = ctx.cacheFor({ name: "derivatives", ttlMs: 90_000, max: 32 });
    const b = ctx.cacheFor({ name: "macro_rwa",   ttlMs: 600_000, max: 32 });
    expect(a).not.toBe(b);
    a.set("k", { data: { x: "deriv" }, sources: [], asOf: "", stale: false });
    expect(b.get("k")).toBeUndefined();
  });
});
```

> Note: `createServer` must export the `AdapterContext` it builds (e.g. as `{ server, ctx }`) so the isolation test can introspect it. The actual MCP `Server` instance returned to callers can keep `connect()` etc.; the exposed `ctx` is just the context the server passes into adapter `fetch` calls.

- [ ] **Step 2: Run — verify failure**

```bash
npm run test -- server
```

Expected: FAIL.

- [ ] **Step 3: Create `src/server.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { EnvConfig } from "./env.js";
import { makeContext } from "./adapters/base.js";
import { derivatives } from "./adapters/derivatives.js";
import { macroRwa } from "./adapters/macro_rwa.js";
import { onchainWallet } from "./adapters/onchain_wallet.js";
import { cexFlow } from "./adapters/cex_flow.js";
import { krPremium } from "./adapters/kr_premium.js";
import { loadPulseConfig, type PulseConfig } from "./pulse/config.js";
import { makeFileHistoryStore, computeWindowDelta } from "./pulse/history.js";
import { getMarketPulse } from "./tools/get_market_pulse.js";
import { getEtfFlow } from "./tools/get_etf_flow.js";
import { getStablecoinPulse } from "./tools/get_stablecoin_pulse.js";
import { getFundingOi } from "./tools/get_funding_oi.js";
import { getKrPremium } from "./tools/get_kr_premium.js";
import { getRwaPulse } from "./tools/get_rwa_pulse.js";
import type { ToolResponse } from "./types.js";

const NoArgs = z.object({}).strict();
// F19/F20: ETF and stablecoin v0.1 only support 7d. RWA pulse keeps the
// wider window since `get_rwa_pulse` returns a raw TVL summary that does
// not depend on a window-specific data key.
const SevenDayOnly = z.object({ window: z.literal("7d").default("7d") });
const RwaWindowArgs = z.object({ window: z.enum(["1d", "7d", "30d"]).default("7d") });
const FundingArgs = z.object({ asset: z.enum(["BTC", "ETH"]) });
const KrPremiumArgs = z.object({ asset: z.enum(["BTC", "ETH", "all"]).default("all") });

interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (raw: unknown, env: EnvConfig) => Promise<ToolResponse>;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_market_pulse",
    description: "Composite onchain market pulse score (0–100) with reading and raw inputs.",
    inputSchema: { type: "object", properties: {} },
    handler: handleMarketPulse,
  },
  {
    name: "get_etf_flow",
    description: "BTC/ETH spot ETF 7-day net flow (only `window: \"7d\"` supported in v0.1).",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["7d"] } } },
    handler: handleEtfFlow,
  },
  {
    name: "get_stablecoin_pulse",
    description: "Stablecoin (USDT+USDC) 7-day supply delta (only `window: \"7d\"` supported in v0.1).",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["7d"] } } },
    handler: handleStablecoinPulse,
  },
  {
    name: "get_funding_oi",
    description: "Perpetual funding rate, put/call ratio, and OI for BTC or ETH.",
    inputSchema: { type: "object", properties: { asset: { type: "string", enum: ["BTC", "ETH"] } }, required: ["asset"] },
    handler: handleFundingOi,
  },
  {
    name: "get_kr_premium",
    description: "Korea kimchi premium spread and Upbit volume for BTC/ETH.",
    inputSchema: { type: "object", properties: { asset: { type: "string", enum: ["BTC", "ETH", "all"] } } },
    handler: handleKrPremium,
  },
  {
    name: "get_rwa_pulse",
    description: "RWA TVL and macro pulse over a window.",
    inputSchema: { type: "object", properties: { window: { type: "string", enum: ["1d", "7d", "30d"] } } },
    handler: handleRwaPulse,
  },
];

export function listTools(): ToolDef[] {
  return TOOLS;
}

async function handleMarketPulse(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  NoArgs.parse(raw ?? {});
  const cfg = loadPulseConfig();
  const ctx = makeContext({ env });
  // Per ADR-0003: history store loaded once per call; raw series provide inputs to computeWindowDelta.
  const store = makeFileHistoryStore({
    path: resolveHistoryPath(cfg, env),
    windowDays: cfg.history?.window_days ?? 30,
    dedupHours: cfg.history?.dedup_hours ?? 24,
  });
  const rawHistory = store.load();
  const [d, m, w, c, k] = await Promise.allSettled([
    derivatives.fetch(undefined, ctx),
    macroRwa.fetch(undefined, ctx),
    onchainWallet.fetch(undefined, ctx),
    cexFlow.fetch(undefined, ctx),
    krPremium.fetch(undefined, ctx),
  ]);
  const values: Record<string, number> = {};
  const sources: string[] = [];
  const staleData: string[] = [];
  const byokActive = Array.from(new Set([
      ...derivatives.capabilities(env).byok_active,
      ...onchainWallet.capabilities(env).byok_active,
      ...cexFlow.capabilities(env).byok_active,
      ...macroRwa.capabilities(env).byok_active,
      ...krPremium.capabilities(env).byok_active,
    ]));

  if (d.status === "fulfilled") {
    if (typeof d.value.data.funding_btc === "number" && typeof d.value.data.funding_eth === "number") {
      values.funding_avg_btc_eth = (d.value.data.funding_btc + d.value.data.funding_eth) / 2;
    }
    if (typeof d.value.data.put_call_btc === "number" && typeof d.value.data.put_call_eth === "number") {
      values.options_put_call_ratio = (d.value.data.put_call_btc + d.value.data.put_call_eth) / 2;
    }
    sources.push(...d.value.sources);
  } else {
    staleData.push("derivatives: " + (d.reason as Error).message);
  }
  if (m.status === "fulfilled") {
    if (typeof m.value.data.etf_7d_net_usd === "number") values.etf_7d_net_flow_btc_eth = m.value.data.etf_7d_net_usd;
    // Per ADR-0003: derive `*_7d_delta` from history ring buffer instead of placeholder zeros.
    // Raw values are appended further down so that next call's delta computation can see them.
    if (typeof m.value.data.btc_dominance === "number") {
      values.btc_dominance_7d_delta = computeWindowDelta(rawHistory.btc_dominance_raw ?? [], m.value.data.btc_dominance, 7);
    }
    if (typeof m.value.data.rwa_tvl_usd === "number") {
      values.rwa_tvl_7d_delta = computeWindowDelta(rawHistory.rwa_tvl_raw ?? [], m.value.data.rwa_tvl_usd, 7);
    }
    sources.push(...m.value.sources);
  } else {
    staleData.push("macro_rwa: " + (m.reason as Error).message);
  }
  if (w.status === "fulfilled") {
    if (typeof w.value.data.stablecoin_7d_delta_pct === "number") values.stablecoin_7d_supply_delta = w.value.data.stablecoin_7d_delta_pct;
    sources.push(...w.value.sources);
  } else {
    staleData.push("onchain_wallet: " + (w.reason as Error).message);
  }
  if (k.status === "fulfilled") {
    if (typeof k.value.data.upbit_volume_btc_24h === "number") values.upbit_netflow_7d_kr = k.value.data.upbit_volume_btc_24h; // proxy
    sources.push(...k.value.sources);
  } else {
    staleData.push("kr_premium: " + (k.reason as Error).message);
  }
  if (c.status === "fulfilled") {
    sources.push(...c.value.sources);
  }

  // Per ADR-0003: load persisted history, append fresh raw observations, save atomically.
  // `history` passed to getMarketPulse is the per-composite-key series used for z-score.
  // `rawHistory` (declared above the adapter switch) holds raw inputs needed for *_delta derivation.
  const history = store.load();             // {composite_key → number[]}
  const asOf = new Date();

  // Append today's observations (24h dedup inside the store).
  for (const [k, v] of Object.entries(values)) {
    store.appendDatapoint(k, v, asOf);
  }
  // Also append raw values so next call can compute *_7d_delta.
  if (m.status === "fulfilled") {
    if (typeof m.value.data.btc_dominance === "number") store.appendDatapoint("btc_dominance_raw", m.value.data.btc_dominance, asOf);
    if (typeof m.value.data.rwa_tvl_usd === "number") store.appendDatapoint("rwa_tvl_raw", m.value.data.rwa_tvl_usd, asOf);
  }
  await store.save();

  return getMarketPulse({
    cfg,
    values,
    history,
    sources,
    byokActive,
    lang: env.lang,
    asOf: asOf.toISOString(),
    staleData,
  });
}

async function handleEtfFlow(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  const args = SevenDayOnly.parse(raw ?? {});
  const ctx = makeContext({ env });
  const r = await macroRwa.fetch(undefined, ctx);
  return getEtfFlow({
    window: args.window,
    adapterResult: r,
    lang: env.lang,
    byokActive: [],
    staleData: r.stale ? ["macro_rwa: stale"] : [],
  });
}

async function handleStablecoinPulse(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  const args = SevenDayOnly.parse(raw ?? {});
  const ctx = makeContext({ env });
  const r = await onchainWallet.fetch(undefined, ctx);
  return getStablecoinPulse({
    window: args.window,
    adapterResult: r,
    lang: env.lang,
    byokActive: onchainWallet.capabilities(env).byok_active,
    staleData: r.stale ? ["onchain_wallet: stale"] : [],
  });
}

async function handleFundingOi(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  const args = FundingArgs.parse(raw);
  const ctx = makeContext({ env });
  const r = await derivatives.fetch(undefined, ctx);
  return getFundingOi({
    asset: args.asset,
    adapterResult: r,
    lang: env.lang,
    byokActive: derivatives.capabilities(env).byok_active,
    staleData: r.stale ? ["derivatives: stale"] : [],
  });
}

async function handleKrPremium(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  const args = KrPremiumArgs.parse(raw ?? {});
  const ctx = makeContext({ env });
  const r = await krPremium.fetch(undefined, ctx);
  return getKrPremium({
    asset: args.asset,
    adapterResult: r,
    lang: env.lang,
    byokActive: [],
    staleData: r.stale ? ["kr_premium: stale"] : [],
  });
}

async function handleRwaPulse(raw: unknown, env: EnvConfig): Promise<ToolResponse> {
  const args = RwaWindowArgs.parse(raw ?? {});
  const ctx = makeContext({ env });
  const r = await macroRwa.fetch(undefined, ctx);
  return getRwaPulse({
    window: args.window,
    adapterResult: r,
    lang: env.lang,
    byokActive: [],
    staleData: r.stale ? ["macro_rwa: stale"] : [],
  });
}

// `historyPath` resolution lives in `loadEnv` (Task 3) per ADR-0004 F24.
// The server reads `env.historyPath` directly; do not duplicate the
// `~` expansion logic here.

export function createServer(opts: { env: EnvConfig }): Server {
  const server = new Server(
    { name: "onchain-pulse-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = TOOLS.find((t) => t.name === req.params.name);
    if (!def) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${req.params.name}` }) }],
        isError: true,
      };
    }
    try {
      const out = await def.handler(req.params.arguments ?? {}, opts.env);
      return {
        content: [{ type: "text", text: JSON.stringify(out) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }],
        isError: true,
      };
    }
  });

  return server;
}
```

- [ ] **Step 4: Replace `src/index.ts`**

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const server = createServer({ env });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Run — verify passing**

```bash
npm run test -- server
npm run typecheck
npm run build
```

Expected:
- 3 tests pass
- `typecheck` exit 0
- `build` produces `dist/index.js` with `#!/usr/bin/env node` banner

- [ ] **Step 6: Manual smoke test**

```bash
chmod +x dist/index.js
node dist/index.js < /dev/null
```

Expected: server starts, waits for stdio input, exits cleanly when input ends.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/server.ts tests/server.test.ts
git commit -m "feat(server): MCP wiring with 6 tools, stdio transport, dispatcher"
```

---

## Task 22.5: Warmup CLI subcommand (`npx onchain-pulse-mcp warmup`)

**Files:**
- Create: `src/cli/warmup.ts`
- Create: `tests/cli/warmup.test.ts`
- Modify: `src/index.ts` (subcommand dispatch — `warmup` vs default stdio server)

> **Why this task exists:** Per ADR-0003, the history ring buffer needs initial seeding for adapters that expose historical endpoints (Defillama, Farside, Deribit funding-range). Without warmup, the buffer fills only at real elapsed cadence (one datapoint per 24h), so the composite score remains noisy for 1–4 weeks. `warmup` short-circuits this by fetching whatever historical density each adapter offers.

- [ ] **Step 1: Write the failing test**

`tests/cli/warmup.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWarmup } from "../../src/cli/warmup.js";
import { makeFileHistoryStore } from "../../src/pulse/history.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opm-warmup-"));
  path = join(dir, "history.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runWarmup", () => {
  it("seeds at least one datapoint per supported key with mocked adapter responses", async () => {
    const fakeFetcher = {
      etfHistory: vi.fn().mockResolvedValue([
        { asOf: new Date("2026-04-10T00:00:00Z"), value: 100_000_000 },
        { asOf: new Date("2026-04-11T00:00:00Z"), value: 120_000_000 },
      ]),
      stablecoinHistory: vi.fn().mockResolvedValue([
        { asOf: new Date("2026-04-10T00:00:00Z"), value: 0.001 },
      ]),
      // ... other historical fetchers (mocked similarly)
    };
    await runWarmup({ historyPath: path, days: 30, fetcher: fakeFetcher as never });
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    const series = s.load();
    expect(series.etf_7d_net_flow_btc_eth?.length).toBeGreaterThanOrEqual(1);
    expect(series.stablecoin_7d_supply_delta?.length).toBeGreaterThanOrEqual(1);
  });

  it("respects --key filter", async () => {
    const fakeFetcher = {
      etfHistory: vi.fn().mockResolvedValue([{ asOf: new Date(), value: 1 }]),
      stablecoinHistory: vi.fn().mockResolvedValue([{ asOf: new Date(), value: 1 }]),
    };
    await runWarmup({ historyPath: path, days: 30, keys: ["etf_7d_net_flow_btc_eth"], fetcher: fakeFetcher as never });
    expect(fakeFetcher.etfHistory).toHaveBeenCalled();
    expect(fakeFetcher.stablecoinHistory).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement `src/cli/warmup.ts` and `src/cli/fetcher.ts`**

The warmup orchestrator's contract is captured by the test in Step 1: `runWarmup` opens a `FileHistoryStore` at `historyPath`, asks `fetcher` for each enabled key's history, calls `appendDatapoint` for every datapoint, and `save()`s once at the end. The orchestrator does not know about HTTP — all upstream calls live in `HistoricalFetcher`.

> **Why this is fully specified here, not deferred.** Codex review F25 flagged that "left to Codex" is not an acceptable contract — without endpoint URLs, parse rules, auth behaviour, and failure semantics defined in this plan, two implementers would produce two different shapes for the same `HistoricalFetcher` and the warmup test in Step 1 would pass while v0.1's `get_market_pulse` produced different scores depending on who ran the warmup. The table below freezes those decisions.

**`HistoricalFetcher` per-key contract (production implementation in `src/cli/fetcher.ts`):**

| Key (`appendDatapoint` name)          | Source / endpoint                                                                                              | Auth                          | Parse → datapoint                                                                                                  | Failure mode                                                                                  |
|---------------------------------------|----------------------------------------------------------------------------------------------------------------|-------------------------------|--------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `etf_7d_net_flow_btc_eth`             | `https://farside.co.uk/?p=997` (BTC) + `https://farside.co.uk/eth/` (ETH) — daily HTML tables                  | None (free)                   | Same `<tr><td>` regex as Task 11. For each daily row: `value = btcRow.totalUsd + ethRow.totalUsd`, `asOf = row date 00:00Z`. Skip rows that fail to parse. | If both pages 4xx/5xx or zero rows parse: throw `WarmupSourceError("etf", reason)`. Caller (CLI) logs key skip + continues other keys; exit code 0 if at least 3 of 7 keys succeed, else 1. |
| `stablecoin_7d_supply_delta`          | `https://api.llama.fi/v2/historicalChainTvl/Tron` + `…/Ethereum` daily series, restricted to stablecoin TVL via `https://api.llama.fi/protocols` filter `category=Stablecoins` | None (free)                   | Aggregate USDT+USDC+DAI daily totals per UTC midnight. Compute 7d delta as `(today − today-7) / today-7` per day; emit one datapoint per day with that delta. | Defillama 4xx/5xx → `WarmupSourceError("stablecoin", reason)`. Adapter retains current-day value contributed by Task 18 normal path. |
| `rwa_tvl_7d_delta`                    | `https://api.llama.fi/v2/historicalChainTvl/RWA` (Defillama RWA category)                                       | None (free)                   | Same daily 7d-delta transform as stablecoin row.                                                                   | Same as stablecoin row.                                                                       |
| `funding_avg_btc_eth`                 | `https://www.deribit.com/api/v2/public/get_funding_rate_value?instrument_name=BTC-PERPETUAL&start_timestamp=…&end_timestamp=…` (and ETH-PERPETUAL) | None (free)                   | Daily mean of returned funding samples; emit `(asOf=day 00:00Z, value = (btcMean+ethMean)/2)` for each of the last `days` days. | Deribit 4xx/5xx or empty result → `WarmupSourceError("funding", reason)`. No BYOK escalation; Coinglass enrichment is live-only, not warmup.                       |
| `btc_dominance_7d_delta`              | `https://api.coingecko.com/api/v3/global` (CoinGecko free)                                                      | None (free, public)            | CoinGecko's free `/global` endpoint exposes only the current snapshot, not history. Warmup writes a **single current-value datapoint** (`asOf = now`); the buffer accrues organically thereafter. | If 4xx/5xx → `WarmupSourceError("btc_dominance", reason)`; key contributes z=0 in score until enough live samples accrue. |
| `options_put_call_ratio`              | (no free history endpoint)                                                                                       | n/a                           | Skipped by warmup. Live Deribit `get_book_summary_by_currency` (Task 10) seeds one datapoint per actual `get_market_pulse` call.                                                  | Always skipped — no error path.                                                                |
| `upbit_netflow_7d_kr`                 | (no free history endpoint — Upbit netflow requires CryptoQuant BYOK)                                            | n/a                           | If `env.byok.cryptoquant` present: call CryptoQuant `/exchange/inflow` & `/outflow` daily for `KRW market` (`exchange=upbit`), emit `inflow − outflow` per day. Otherwise skipped (warmup logs `key skipped: cryptoquant BYOK absent`). | CryptoQuant 401/403/429 → `WarmupSourceError("upbit_netflow", reason)`; key contributes z=0 until BYOK + live samples accrue. |

**Failure semantics (binding for `realFetcher` and the CLI dispatcher):**

- **Per-key isolation.** A failure on one key MUST NOT abort the others. Each `HistoricalFetcher.*History` call is awaited inside `runWarmup` with its own try/catch; failures are collected into a `failures: { key, reason }[]` array exposed via `runWarmup`'s return value (extend `WarmupOpts` to also return a result, OR have the CLI inspect it via the FS state — pick one in implementation, document in the test).
- **Authentication failures** (Nansen/Coinglass/CryptoQuant 401/403): log `key skipped: <provider> auth rejected`, do NOT crash the process, do NOT save a partial datapoint for that key.
- **Rate limit (429):** retry once with 5s sleep; on second 429 treat as auth-failure-style skip.
- **Schema drift** (unexpected JSON shape): catch the parse error, treat as `WarmupSourceError`, do not write a `null`/`NaN` datapoint to the store.
- **Exit code:** `0` if `≥3 of 7 keys` produced ≥1 datapoint (matches Task 23 acceptance criterion); `1` otherwise. The CLI prints a summary table to stderr regardless.

> **Tests for the per-key fetcher logic** are not in `tests/cli/warmup.test.ts` (which only covers the orchestrator with mocked `HistoricalFetcher`). Each adapter's existing test file (Tasks 10–14) gains one extra `it("warmup historical path: <source>", ...)` case that mocks the relevant HTTP endpoint and asserts the parsed datapoint shape. Add those cases when you reach Step 2 — do not let them slide to Task 22.5 follow-up.

Sketch:

```ts
import { makeFileHistoryStore } from "../pulse/history.js";

export interface HistoricalFetcher {
  etfHistory(days: number): Promise<{ asOf: Date; value: number }[]>;
  stablecoinHistory(days: number): Promise<{ asOf: Date; value: number }[]>;
  rwaTvlHistory(days: number): Promise<{ asOf: Date; value: number }[]>;
  fundingHistory(days: number): Promise<{ asOf: Date; value: number }[]>;
  // BTC dominance, P/C ratio, Upbit netflow → no historical endpoint; current-only.
}

export interface WarmupOpts {
  historyPath: string;
  days: number;
  keys?: string[];
  fetcher: HistoricalFetcher;
}

export async function runWarmup(opts: WarmupOpts): Promise<void> {
  const store = makeFileHistoryStore({ path: opts.historyPath, windowDays: opts.days, dedupHours: 24 });
  const want = (k: string) => !opts.keys || opts.keys.includes(k);

  if (want("etf_7d_net_flow_btc_eth")) {
    for (const dp of await opts.fetcher.etfHistory(opts.days)) {
      store.appendDatapoint("etf_7d_net_flow_btc_eth", dp.value, dp.asOf);
    }
  }
  if (want("stablecoin_7d_supply_delta")) {
    for (const dp of await opts.fetcher.stablecoinHistory(opts.days)) {
      store.appendDatapoint("stablecoin_7d_supply_delta", dp.value, dp.asOf);
    }
  }
  // ... other keys per ADR-0003 §"Warmup CLI" table
  await store.save();
}
```

- [ ] **Step 3: Wire CLI dispatch in `src/index.ts`**

Replace the `main()` from Task 22 with:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { loadEnv } from "./env.js";
import { runWarmup } from "./cli/warmup.js";
import { realFetcher } from "./cli/fetcher.js";  // production HistoricalFetcher

async function main(): Promise<void> {
  const sub = process.argv[2];
  const env = loadEnv(process.env);
  if (sub === "warmup") {
    const days = Number(process.env.OPM_WARMUP_DAYS ?? 30);
    const keys = process.env.OPM_WARMUP_KEYS?.split(",");
    await runWarmup({ historyPath: env.historyPath, days, keys, fetcher: realFetcher });
    return;
  }
  const server = createServer({ env });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

(`loadEnv` is the single source of truth for `historyPath` resolution — Task 3 already ships the `~` expansion + `OPM_HISTORY_PATH` override. `server.ts` reads `env.historyPath` directly; do not introduce a duplicate `resolveHistoryPath` helper.)

- [ ] **Step 4: Run — verify passing**

```bash
npm run test -- cli/warmup
npm run typecheck
npm run build
```

Expected: 2 tests pass; typecheck clean; build produces a single `dist/index.js` entry that handles both `warmup` and the default stdio server based on `process.argv[2]`.

- [ ] **Step 5: Manual smoke test**

```bash
node dist/index.js warmup
ls -la ~/.cache/onchain-pulse-mcp/history.json
node dist/index.js < /dev/null   # default mode still works
```

Expected: `history.json` exists with at least 3 of 7 keys populated; default-mode server still starts.

- [ ] **Step 6: Commit**

```bash
git add src/cli/ tests/cli/ src/index.ts
git commit -m "feat(cli): warmup subcommand to seed 30d history ring buffer"
```

---

## Task 23: Reference rules + CI + README polish

**Files:**
- Create: `examples/rules/etf-outflow-streak.yaml`
- Create: `examples/rules/funding-extreme.yaml`
- Create: `examples/rules/kr-premium-spike.yaml`   # renamed per ADR-0001 (kr_premium for code; kimchi prose-only)
- Create: `examples/rules/stablecoin-burn-streak.yaml`
- Create: `examples/rules/rwa-tvl-drop.yaml`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Create reference rule files**

`examples/rules/etf-outflow-streak.yaml`:

```yaml
name: etf-outflow-streak
metric: etf_7d_net_usd
condition: less_than
threshold: -200000000
window: 1d
consecutive: 3
description: "BTC/ETH spot ETF outflow > $200M for 3 consecutive days."
```

`examples/rules/funding-extreme.yaml`:

```yaml
name: funding-extreme
metric: funding_avg_btc_eth_zscore
condition: abs_greater_than
threshold: 2.0
window: 1d
consecutive: 1
description: "BTC/ETH average funding |z| > 2 (extreme positioning)."
```

`examples/rules/kr-premium-spike.yaml`:

```yaml
name: kr-premium-spike
metric: kr_premium_btc
condition: greater_than
threshold: 0.05
window: 1d
consecutive: 1
description: "BTC kr_premium > 5% (commonly known as kimchi premium — KR retail euphoria signal)."
```

`examples/rules/stablecoin-burn-streak.yaml`:

```yaml
name: stablecoin-burn-streak
metric: stablecoin_7d_delta_pct
condition: less_than
threshold: 0
window: 1d
consecutive: 5
description: "Stablecoin supply 5 consecutive days of contraction."
```

`examples/rules/rwa-tvl-drop.yaml`:

```yaml
name: rwa-tvl-drop
metric: rwa_tvl_usd
condition: rolling_drop_pct
threshold: 0.03
window: 7d
consecutive: 1
description: "RWA TVL drops > 3% over 7d (TradFi capital retreat)."
```

- [ ] **Step 2: Create CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Weekly smoke at Mondays 03:00 UTC — catches upstream API drift even without commits.
    - cron: "0 3 * * 1"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 3: Update `README.md`**

Replace the "Quickstart (planned, post-v0.1)" section with:

```markdown
## Quickstart

```bash
npx onchain-pulse-mcp
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "onchain-pulse": {
      "command": "npx",
      "args": ["-y", "onchain-pulse-mcp"]
    }
  }
}
```

### BYOK enrichment

Set any of these env vars to enrich responses with paid data sources. The server detects them automatically:

| Env var | Source | What it adds |
|---|---|---|
| `NANSEN_API_KEY` | Nansen | Smart-money 7d net flow |
| `GLASSNODE_API_KEY` | Glassnode | Exchange inflow series |
| `COINGLASS_API_KEY` | Coinglass | Cross-venue OI for BTC/ETH |
| `ARKHAM_API_KEY` | Arkham | Wallet entity labels |
| `CRYPTOQUANT_API_KEY` | CryptoQuant | (reserved for v0.2) |
| `LAEVITAS_API_KEY` | Laevitas | (reserved for v0.2) |

### Locale

Set `OPM_LANG=ko` for Korean `summary` strings (default `en`).

### Tools

| Tool | Args | Description |
|---|---|---|
| `get_market_pulse` | none | Composite pulse score 0–100 + reading |
| `get_etf_flow` | `window?` | ETF net flow over 1d/7d/30d |
| `get_stablecoin_pulse` | `window?` | Stablecoin supply Δ |
| `get_funding_oi` | `asset` | Funding/PCR/OI for BTC or ETH |
| `get_kr_premium` | `asset?` | Kimchi premium for BTC/ETH/all |
| `get_rwa_pulse` | `window?` | RWA TVL pulse |
```

- [ ] **Step 4: Run all tests + typecheck + build**

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all green.

- [ ] **Step 5: Commit + push + verify CI**

```bash
git add examples/rules/ .github/workflows/ci.yml README.md
git commit -m "feat: reference alert rules, GitHub Actions CI, README quickstart"
git push origin feat/v0.1-implementation
```

Then check `https://github.com/capitalparser/onchain-pulse-mcp/actions` — first CI run on the feature branch should pass. Merge to `main` is post-handoff (cross-model code review gate per HANDOFF.md), not part of this task.

---

## Acceptance Criteria (v0.1)

- [ ] `npm run test` reports 0 failures (now includes Task 8.5 history tests + Task 22.5 warmup tests).
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` produces `dist/index.js` (with shebang) and `dist/index.d.ts`.
- [ ] `node dist/index.js` starts an MCP server on stdio without errors.
- [ ] `node dist/index.js warmup` populates `~/.cache/onchain-pulse-mcp/history.json` with at least 3 of 7 keys (per ADR-0003 §"Warmup CLI" table).
- [ ] After warmup, calling `get_market_pulse` produces a non-trivial score (i.e., not deterministically 50) for keys whose history has ≥5 samples; remaining keys contribute z=0 with `confidence < 1.0` reflecting the gap honestly.
- [ ] Adding `onchain-pulse` to Claude Desktop config and asking *"call get_market_pulse"* returns a JSON `ToolResponse`.
- [ ] Setting `NANSEN_API_KEY=fake` (or any unused-but-set value) does not crash the server; the adapter handles 4xx gracefully via `safeJson`.
- [ ] All 5 reference YAML rules exist under `examples/rules/`: `etf-outflow-streak.yaml`, `funding-extreme.yaml`, `kr-premium-spike.yaml` (not `kimchi-spread-spike.yaml`), `stablecoin-burn-streak.yaml`, `rwa-tvl-drop.yaml`. (The earlier "6 rules" wording was a stale draft — there are 5, one per spec §"User-defined alerts" example category.)
- [ ] CI run on `feat/v0.1-implementation` passes.

---

## Out of scope (revisit in v0.2+)

Per the spec's Open Questions and Future Work sections:

- Backtesting harness for pulse score weights.
- B view (screening tools) and A view (timing tools).
- HTTP transport + Fly.io hosting.

> Note: The original "Real history series for `get_market_pulse`" deferral was promoted into v0.1 scope per ADR-0002 / ADR-0003 (Task 8.5 + Task 22.5).
