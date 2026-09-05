import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlMetricObservationStore } from "../../src/intelligence_core/store.js";
import type { MetricObservation } from "../../src/intelligence_core/types.js";
import { withObservationWriteLock } from "../../src/intelligence_core/write_lock.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "opm-write-safety-"));
  directories.push(dir);
  const path = join(dir, "history.jsonl");
  return { dir, path, store: new JsonlMetricObservationStore(path) };
}

function row(id: string): MetricObservation {
  return {
    id, metric_key: "eth.total_burn_eth", subject_ref: "ethereum", value: 1, unit: "ETH",
    source_at: "2026-08-20T00:00:00.000Z", observed_at: "2026-08-20T00:00:00.000Z",
    ingested_at: "2026-08-20T00:00:00.000Z", confidence: 1,
    source_refs: ["test:source"], methodology_version: "test-v1", dimensions: {},
  };
}

describe("canonical JSONL write safety", () => {
  it("separates a valid unterminated final row without rewriting existing bytes", async () => {
    const { path, store } = await makeStore();
    const prefix = JSON.stringify(row("a"));
    await writeFile(path, prefix, "utf8");
    await store.append(row("b"));
    expect(await readFile(path, "utf8")).toBe(`${prefix}\n${JSON.stringify(row("b"))}\n`);
    expect((await store.readAll()).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps trailing whitespace and CRLF history intact", async () => {
    const { path, store } = await makeStore();
    const prefix = `${JSON.stringify(row("a"))}\r\n  `;
    await writeFile(path, prefix, "utf8");
    await store.appendMany([row("b"), row("c")]);
    expect((await readFile(path, "utf8")).startsWith(`${prefix}\n`)).toBe(true);
    expect((await store.readAll()).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects an entire invalid batch before creating a directory or lock", async () => {
    const { dir } = await makeStore();
    const path = join(dir, "new", "history.jsonl");
    const store = new JsonlMetricObservationStore(path);
    await expect(store.appendMany([row("a"), { ...row("b"), confidence: 2 }])).rejects.toThrow();
    await expect(readdir(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    await store.appendMany([]);
    await expect(readdir(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not append to corrupt history and releases only its own lock", async () => {
    const { dir, path, store } = await makeStore();
    await writeFile(path, "not-json", "utf8");
    await expect(store.append(row("a"))).rejects.toThrow(/invalid JSONL/);
    expect(await readFile(path, "utf8")).toBe("not-json");
    expect(await readdir(dir)).toEqual(["history.jsonl"]);
  });

  it("cleans up after duplicate rejection and permits the next valid batch", async () => {
    const { dir, path, store } = await makeStore();
    await store.append(row("a"));
    const before = await readFile(path, "utf8");
    await expect(store.appendMany([row("b"), row("a")])).rejects.toThrow(/duplicate/);
    expect(await readFile(path, "utf8")).toBe(before);
    await store.append(row("b"));
    expect(await readdir(dir)).toEqual(["history.jsonl"]);
    expect(await store.readAll()).toHaveLength(2);
  });

  it("refuses an existing sidecar lock without changing or deleting it", async () => {
    const { path, store } = await makeStore();
    await writeFile(`${path}.lock`, "owner-must-be-investigated", "utf8");
    await expect(store.append(row("a"))).rejects.toThrow(/^metric observation store is locked$/);
    expect(await readFile(`${path}.lock`, "utf8")).toBe("owner-must-be-investigated");
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("excludes a separate store instance throughout read-check-append", async () => {
    const { path, store } = await makeStore();
    await withObservationWriteLock(path, async () => {
      const owner = JSON.parse(await readFile(`${path}.lock`, "utf8")) as { pid: number };
      expect(owner.pid).toBe(process.pid);
      await expect(new JsonlMetricObservationStore(path).append(row("a"))).rejects.toThrow(/store is locked/);
    });
    await store.append(row("a"));
    expect(await store.readAll()).toHaveLength(1);
  });

  it("excludes a writer in another Node process", async () => {
    const { path } = await makeStore();
    const moduleUrl = new URL("../../src/intelligence_core/write_lock.ts", import.meta.url).href;
    const script = `
      import { withObservationWriteLock } from ${JSON.stringify(moduleUrl)};
      try {
        await withObservationWriteLock(process.argv[1], async () => {});
        process.exitCode = 2;
      } catch (error) {
        if (error.message !== "metric observation store is locked") throw error;
        process.stdout.write("blocked");
      }
    `;
    await withObservationWriteLock(path, async () => {
      const { stdout } = await promisify(execFile)(process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", script, path], { timeout: 4000 });
      expect(stdout).toBe("blocked");
    });
  });

  it("never persists duplicate ids from concurrent store instances", async () => {
    const { path, store } = await makeStore();
    const results = await Promise.allSettled([
      store.append(row("a")), new JsonlMetricObservationStore(path).append(row("a")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await store.readAll()).toHaveLength(1);
  });

  it("releases the lock when the guarded operation fails", async () => {
    const { dir, path } = await makeStore();
    await expect(withObservationWriteLock(path, async () => { throw new Error("injected"); }))
      .rejects.toThrow("injected");
    expect(await readdir(dir)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("uses one lock for file and parent-directory symlink aliases", async () => {
    const { dir, path, store } = await makeStore();
    await store.append(row("a"));
    const alias = join(dir, "alias.jsonl");
    await symlink(path, alias);
    const parentAlias = join(dir, "alias-directory");
    await symlink(dir, parentAlias);
    await withObservationWriteLock(path, async () => {
      await expect(new JsonlMetricObservationStore(alias).append(row("b"))).rejects.toThrow(/locked/);
      await expect(new JsonlMetricObservationStore(join(parentAlias, "history.jsonl")).append(row("b")))
        .rejects.toThrow(/locked/);
    });
    await new JsonlMetricObservationStore(alias).append(row("b"));
    expect(await store.readAll()).toHaveLength(2);
  });

  it("rejects hard-linked history rather than allowing independent path locks", async () => {
    const { dir, path, store } = await makeStore();
    await store.append(row("a"));
    await link(path, join(dir, "hard-link.jsonl"));
    await expect(store.append(row("b"))).rejects.toThrow(/single-link regular file/);
    expect(await store.readAll()).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")("rejects dangling symlinks and non-regular targets", async () => {
    const { dir } = await makeStore();
    const alias = join(dir, "dangling.jsonl");
    await symlink(join(dir, "missing.jsonl"), alias);
    await expect(new JsonlMetricObservationStore(alias).append(row("a"))).rejects.toThrow(/regular file/);
    const directory = join(dir, "not-a-file");
    await mkdir(directory);
    await expect(new JsonlMetricObservationStore(directory).append(row("a"))).rejects.toThrow(/regular file/);
    await expect(readFile(join(dir, "missing.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
