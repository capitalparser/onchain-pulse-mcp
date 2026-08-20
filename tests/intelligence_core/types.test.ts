import { describe, expect, it } from "vitest";
import {
  EconomicEventSchema,
  EntityRelationshipSchema,
  EntitySchema,
  RawEvidenceSchema,
} from "../../src/intelligence_core/types.js";

const times = {
  source_at: "2026-08-20T00:00:00.000Z",
  observed_at: "2026-08-20T00:01:00.000Z",
  ingested_at: "2026-08-20T00:02:00.000Z",
};

describe("intelligence core canonical contracts", () => {
  it("parses evidence with bounded provenance and rejects time inversion", () => {
    const evidence = {
      id: "evidence-1",
      source: "ethereum_rpc",
      source_type: "chain_rpc",
      ...times,
      methodology_version: "raw-evidence-v1",
      subject_refs: ["ethereum"],
      evidence_ref: "block:123",
      stale: false,
      confidence: 1,
      metadata: {},
    };
    expect(RawEvidenceSchema.parse(evidence)).toMatchObject({ id: "evidence-1", confidence: 1 });
    expect(() => RawEvidenceSchema.parse({
      ...evidence,
      observed_at: "2026-08-19T23:59:00.000Z",
    })).toThrow(/observed_at must be at or after source_at/);
  });

  it("keeps entity labels attributable to a source", () => {
    const entity = EntitySchema.parse({
      id: "entity:coinbase",
      type: "exchange",
      display_name: "Coinbase",
      identifiers: [{ namespace: "slug", value: "coinbase" }],
      labels: [{
        label: "Coinbase",
        category: "centralized_exchange",
        source: "provider-x",
        confidence: 0.95,
        observed_at: times.observed_at,
      }],
      confidence: 0.95,
      methodology_version: "entity-resolution-v1",
    });
    expect(entity.labels[0]?.source).toBe("provider-x");
  });

  it("represents graph relationships without implying certainty", () => {
    const relationship = EntityRelationshipSchema.parse({
      id: "rel-1",
      from_entity_id: "entity:wallet:abc",
      to_entity_id: "entity:coinbase",
      type: "associated_with",
      observed_at: times.observed_at,
      source_refs: ["evidence-1"],
      confidence: 0.6,
      methodology_version: "entity-resolution-v1",
    });
    expect(relationship.confidence).toBe(0.6);
  });

  it("requires economic events to reference evidence and at least one economic dimension", () => {
    const event = {
      id: "event-1",
      type: "stake",
      chain: "ethereum",
      transaction_ref: "0xabc",
      protocol_ref: "lido",
      actor_entity_ids: ["entity:wallet:abc"],
      assets: [{ asset_ref: "ETH", amount: "10", unit: "ETH" }],
      dimensions: ["demand", "yield", "ownership"],
      raw_evidence_ids: ["evidence-1"],
      ...times,
      confidence: 0.9,
      methodology_version: "economic-event-v1",
      metadata: {},
    };
    expect(EconomicEventSchema.parse(event)).toMatchObject({ type: "stake", confidence: 0.9 });
    expect(() => EconomicEventSchema.parse({ ...event, dimensions: [] })).toThrow();
    expect(() => EconomicEventSchema.parse({ ...event, raw_evidence_ids: [] })).toThrow();
  });
});
