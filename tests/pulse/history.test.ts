import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeWindowDelta, makeFileHistoryStore } from "../../src/pulse/history.js";

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
    s.appendDatapoint("k", 2, new Date("2026-05-08T12:00:00Z"));
    s.appendDatapoint("k", 3, new Date("2026-05-09T01:00:00Z"));
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

  it("atomic write - no .tmp file remains after successful save", async () => {
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("k", 1, new Date());
    await s.save();
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("corrupt JSON: returns empty envelope and quarantines the bad file", async () => {
    writeFileSync(path, "{this is not valid JSON");
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s.load()).toEqual({});
    const quarantined = readdirSync(dir).filter((f) => f.startsWith("history.json.corrupt-"));
    expect(quarantined.length).toBe(1);
    s.appendDatapoint("k", 1, new Date("2026-05-08T00:00:00Z"));
    await s.save();
    const reloaded = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(reloaded.load().k).toEqual([1]);
  });

  it("partial write: pre-existing valid data survives a mid-write crash", async () => {
    const s1 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s1.appendDatapoint("k", 42, new Date("2026-05-08T00:00:00Z"));
    await s1.save();
    writeFileSync(`${path}.tmp`, "{partial");
    const s2 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s2.load().k).toEqual([42]);
    s2.appendDatapoint("k", 43, new Date("2026-05-09T00:00:00Z"));
    await s2.save();
    expect(existsSync(`${path}.tmp`)).toBe(false);
    const s3 = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    expect(s3.load().k).toEqual([42, 43]);
  });

  it("permission error on save: propagates as throw (no silent loss)", async () => {
    if (process.platform === "win32") return;
    const s = makeFileHistoryStore({ path, windowDays: 30, dedupHours: 24 });
    s.appendDatapoint("k", 1, new Date());
    await s.save();
    chmodSync(dir, 0o500);
    try {
      s.appendDatapoint("k", 2, new Date(Date.now() + 25 * 3600 * 1000));
      await expect(s.save()).rejects.toThrow();
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe("computeWindowDelta", () => {
  it("returns 0 when series shorter than window", () => {
    expect(computeWindowDelta([1, 2, 3], 4, 7)).toBe(0);
  });

  it("returns relative delta when series has enough points", () => {
    const series = [100, 100, 100, 100, 100, 100, 100, 100];
    expect(computeWindowDelta(series, 110, 7)).toBeCloseTo(0.1, 5);
  });

  it("returns 0 when historical reference is 0", () => {
    expect(computeWindowDelta([0, 0, 0, 0, 0, 0, 0, 0], 10, 7)).toBe(0);
  });
});
