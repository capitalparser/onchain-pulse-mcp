import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** Resolve path aliases so cooperating processes acquire the same sidecar lock. */
async function resolveStorePath(path: string): Promise<string> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const candidate = join(await realpath(dirname(absolutePath)), basename(absolutePath));
  let entry;
  try {
    entry = await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
    throw error;
  }
  let target = candidate;
  if (entry.isSymbolicLink()) {
    try {
      target = await realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("metric observation store path must resolve to a regular file");
      }
      throw error;
    }
    entry = await lstat(target);
  }
  if (!entry.isFile() || entry.nlink !== 1) {
    throw new Error("metric observation store path must resolve to a single-link regular file");
  }
  return target;
}

/**
 * Fail-fast, cross-process exclusion for local JSONL writers. No lease expiry or
 * automatic stale-lock removal: a paused owner must never lose its write lock.
 * The directory must be trusted and all writers must use this protocol.
 */
export async function withObservationWriteLock<T>(
  path: string,
  operation: (canonicalPath: string) => Promise<T>,
): Promise<T> {
  const canonicalPath = await resolveStorePath(path);
  const lockPath = `${canonicalPath}.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("metric observation store is locked");
    throw error;
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }), "utf8");
    return await operation(canonicalPath);
  } finally {
    try {
      await lock.close();
    } finally {
      await unlink(lockPath);
    }
  }
}
