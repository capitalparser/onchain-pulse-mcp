import { describe, expect, it } from "vitest";
import { normalizeEntityIdentifier, resolveEntityClaims, type EntityResolutionClaim } from "../../src/intelligence_core/entity_resolution.js";

const address = "0xAbCdEfabcdefABCDefabCDefAbcDefABcdefABCD";

function claim(overrides: Partial<EntityResolutionClaim> = {}): EntityResolutionClaim {
  return {
    entity_id: "entity:binance",
    entity_type: "exchange",
    display_name: "Binance",
    identifier_namespace: "ethereum:address",
    identifier_value: address,
    label: "Binance Hot Wallet",
    category: "cex",
    source_ref: "provider-a:label",
    confidence: 0.9,
    observed_at: "2026-08-20T00:00:00.000Z",
    valid_from: "2026-01-01T00:00:00.000Z",
    methodology_version: "provider-a-v1",
    reviewed: false,
    ...overrides,
  };
}

describe("entity resolution", () => {
  it("normalizes EVM identifiers deterministically", () => {
    expect(normalizeEntityIdentifier("Ethereum:Address", address)).toEqual({
      namespace: "ethereum:address",
      value: address.toLowerCase(),
    });
  });

  it("resolves agreeing claims while retaining provider provenance", () => {
    const result = resolveEntityClaims({
      cutoffAt: "2026-08-21T00:00:00.000Z",
      claims: [
        claim(),
        claim({ source_ref: "reviewed:internal", confidence: 0.95, reviewed: true, display_name: "Binance" }),
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.entity.id).toBe("entity:binance");
    expect(result.entity.identifiers[0]?.value).toBe(address.toLowerCase());
    expect(result.entity.confidence).toBe(0.95);
    expect(result.source_refs).toEqual(["provider-a:label", "reviewed:internal"]);
  });

  it("fails closed when active claims disagree on owner or type", () => {
    const result = resolveEntityClaims({
      cutoffAt: "2026-08-21T00:00:00.000Z",
      claims: [
        claim(),
        claim({ entity_id: "entity:jump", entity_type: "market_maker", display_name: "Jump", source_ref: "provider-b:label" }),
      ],
    });
    expect(result).toMatchObject({
      status: "ambiguous",
      candidate_entity_ids: ["entity:binance", "entity:jump"],
    });
  });

  it("does not use expired or future claims at the cutoff", () => {
    const result = resolveEntityClaims({
      cutoffAt: "2026-08-21T00:00:00.000Z",
      claims: [
        claim({ valid_to: "2026-08-01T00:00:00.000Z" }),
        claim({ observed_at: "2026-08-22T00:00:00.000Z", source_ref: "provider-b:label" }),
      ],
    });
    expect(result.status).toBe("unresolved");
  });

  it("does not inflate confidence above the strongest source claim", () => {
    const result = resolveEntityClaims({
      cutoffAt: "2026-08-21T00:00:00.000Z",
      claims: [claim({ confidence: 0.7 }), claim({ confidence: 0.8, source_ref: "provider-b:label" })],
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.entity.confidence).toBe(0.8);
  });
});
