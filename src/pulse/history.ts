import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

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
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`);
    } catch {
      // Continue with an empty envelope if quarantine itself is impossible.
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

export function computeWindowDelta(series: number[], current: number, days: number): number {
  if (series.length < days) return 0;
  const past = series[series.length - days] ?? 0;
  if (past === 0) return 0;
  return (current - past) / Math.abs(past);
}
