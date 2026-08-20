import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MetricObservationSchema, type MetricObservation } from "./types.js";

export interface MetricObservationQuery {
  metricKey?: string;
  subjectRef?: string;
  startObservedAt?: string;
  endObservedAt?: string;
}

export interface MetricObservationStore {
  append(observation: MetricObservation): Promise<void>;
  readAll(): Promise<MetricObservation[]>;
  query(query: MetricObservationQuery): Promise<MetricObservation[]>;
}

function byObservedAtThenId(left: MetricObservation, right: MetricObservation): number {
  const timeDiff = Date.parse(left.observed_at) - Date.parse(right.observed_at);
  return timeDiff !== 0 ? timeDiff : left.id.localeCompare(right.id);
}

function matchesQuery(observation: MetricObservation, query: MetricObservationQuery): boolean {
  if (query.metricKey !== undefined && observation.metric_key !== query.metricKey) return false;
  if (query.subjectRef !== undefined && observation.subject_ref !== query.subjectRef) return false;
  if (query.startObservedAt !== undefined && Date.parse(observation.observed_at) < Date.parse(query.startObservedAt)) return false;
  if (query.endObservedAt !== undefined && Date.parse(observation.observed_at) > Date.parse(query.endObservedAt)) return false;
  return true;
}

export class JsonlMetricObservationStore implements MetricObservationStore {
  constructor(private readonly path: string) {}

  async append(observation: MetricObservation): Promise<void> {
    const parsed = MetricObservationSchema.parse(observation);
    const existing = await this.readAll();
    if (existing.some((item) => item.id === parsed.id)) {
      throw new Error(`duplicate metric observation id: ${parsed.id}`);
    }
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(parsed)}\n`, "utf8");
  }

  async readAll(): Promise<MetricObservation[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw error;
    }

    const observations: MetricObservation[] = [];
    for (const [index, line] of content.split("\n").entries()) {
      if (line.trim().length === 0) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSONL at line ${index + 1}`, { cause: error });
      }
      try {
        observations.push(MetricObservationSchema.parse(raw));
      } catch (error) {
        throw new Error(`invalid metric observation at line ${index + 1}`, { cause: error });
      }
    }

    const seen = new Set<string>();
    for (const observation of observations) {
      if (seen.has(observation.id)) {
        throw new Error(`duplicate metric observation id in persisted data: ${observation.id}`);
      }
      seen.add(observation.id);
    }
    return observations.sort(byObservedAtThenId);
  }

  async query(query: MetricObservationQuery): Promise<MetricObservation[]> {
    if (query.startObservedAt !== undefined) {
      MetricObservationSchema.shape.observed_at.parse(query.startObservedAt);
    }
    if (query.endObservedAt !== undefined) {
      MetricObservationSchema.shape.observed_at.parse(query.endObservedAt);
    }
    if (
      query.startObservedAt !== undefined
      && query.endObservedAt !== undefined
      && Date.parse(query.startObservedAt) > Date.parse(query.endObservedAt)
    ) {
      throw new Error("startObservedAt must be at or before endObservedAt");
    }
    const observations = await this.readAll();
    return observations.filter((item) => matchesQuery(item, query));
  }
}
