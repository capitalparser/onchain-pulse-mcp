import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadTelegramAlertState,
  saveTelegramAlertState,
  type TelegramAlertState,
} from "../../src/alerts/state.js";

describe("Telegram alert state", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("atomically persists only the validated operational state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-telegram-state-"));
    directories.push(directory);
    const path = join(directory, "nested", "state.json");
    const state: TelegramAlertState = {
      version: 1,
      lastDeliveredFingerprint: "a".repeat(64),
      pendingAlert: {
        shouldNotify: true,
        fingerprint: "b".repeat(64),
        events: [{ kind: "source_health", message: "Snapshot quality is partial, stale, or has reported gaps." }],
      },
    };

    await saveTelegramAlertState(path, state);

    expect(await loadTelegramAlertState(path)).toEqual(state);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: 1,
      last_delivered_fingerprint: "a".repeat(64),
      pending_alert: state.pendingAlert,
    });
    expect((await readdir(join(directory, "nested"))).filter((name) => name.includes(".tmp"))).toEqual([]);
    expect(JSON.stringify(await loadTelegramAlertState(path))).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  it("rejects malformed persisted state instead of treating it as a valid baseline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opm-telegram-state-"));
    directories.push(directory);
    const path = join(directory, "state.json");
    await writeFile(path, JSON.stringify({ version: 99, botToken: "secret" }));

    await expect(loadTelegramAlertState(path)).rejects.toThrow("telegram_alert_state_invalid");
  });
});
