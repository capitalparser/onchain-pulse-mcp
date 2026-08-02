import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { EthValueCaptureSnapshotSchema, type EthValueCaptureSnapshot } from "../eth_value_capture/types.js";
import type { EthValueAlert, EthValueAlertEventKind } from "./evaluator.js";

const AlertEventSchema = z.object({
  kind: z.enum(["regime_transition", "source_health", "confidence_drop"] satisfies [EthValueAlertEventKind, ...EthValueAlertEventKind[]]),
  message: z.string().min(1),
}).strict();

const AlertSchema = z.object({
  shouldNotify: z.boolean(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  events: z.array(AlertEventSchema),
}).strict();

const PersistedTelegramAlertStateSchema = z.object({
  version: z.literal(1),
  previous_snapshot: EthValueCaptureSnapshotSchema.optional(),
  last_delivered_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  pending_alert: AlertSchema.optional(),
}).strict();

export interface TelegramAlertState {
  version: 1;
  previousSnapshot?: EthValueCaptureSnapshot;
  lastDeliveredFingerprint?: string;
  pendingAlert?: EthValueAlert;
}

export class TelegramAlertStateError extends Error {
  constructor() {
    super("telegram_alert_state_invalid");
  }
}

function fromPersisted(value: z.infer<typeof PersistedTelegramAlertStateSchema>): TelegramAlertState {
  return {
    version: 1,
    previousSnapshot: value.previous_snapshot,
    lastDeliveredFingerprint: value.last_delivered_fingerprint,
    pendingAlert: value.pending_alert,
  };
}

function toPersisted(state: TelegramAlertState) {
  return {
    version: 1 as const,
    ...(state.previousSnapshot === undefined ? {} : { previous_snapshot: state.previousSnapshot }),
    ...(state.lastDeliveredFingerprint === undefined ? {} : { last_delivered_fingerprint: state.lastDeliveredFingerprint }),
    ...(state.pendingAlert === undefined ? {} : { pending_alert: state.pendingAlert }),
  };
}

export async function loadTelegramAlertState(path: string): Promise<TelegramAlertState | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") {
      return undefined;
    }
    throw new TelegramAlertStateError();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TelegramAlertStateError();
  }
  const parsed = PersistedTelegramAlertStateSchema.safeParse(value);
  if (!parsed.success) throw new TelegramAlertStateError();
  return fromPersisted(parsed.data);
}

export async function saveTelegramAlertState(path: string, state: TelegramAlertState): Promise<void> {
  const parsed = PersistedTelegramAlertStateSchema.safeParse(toPersisted(state));
  if (!parsed.success) throw new TelegramAlertStateError();

  const directory = dirname(path);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, JSON.stringify(parsed.data), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => undefined);
    throw new TelegramAlertStateError();
  }
}
