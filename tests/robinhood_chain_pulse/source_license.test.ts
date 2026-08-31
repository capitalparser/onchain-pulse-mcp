import { describe, expect, it } from "vitest";
import { assessSourceForCommercialRedistribution } from "../../src/intelligence_core/source_license.js";

describe("Robinhood Chain Pulse source licensing", () => {
  it.each([
    "robinhood-chain-docs:https://docs.robinhood.com/chain/",
    "morpho-api:markets:4663",
    "dexscreener:robinhood:registered-tokens",
    "robinhood-blockscout:token:0x020bfc650a365f8bb26819deaabf3e21291018b4",
    "robinhood-rpc:chain:4663",
    "robinhood-rpc:token:0x020bfc650a365f8bb26819deaabf3e21291018b4",
  ])("fails closed for commercial redistribution of %s", (sourceRef: string) => {
    const assessment = assessSourceForCommercialRedistribution(sourceRef);
    expect(assessment.policy).not.toBeNull();
    expect(assessment.commerciallyRedistributable).toBe(false);
    expect(assessment.policy?.attributionRequired).toBe(true);
  });

  it("registers the official Robinhood RPC as attributed internal-research evidence requiring commercial review", () => {
    const assessment = assessSourceForCommercialRedistribution("robinhood-rpc:chain:4663");

    expect(assessment.policy).toMatchObject({
      sourcePrefix: "robinhood-rpc",
      status: "commercial_review_required",
      attributionRequired: true,
      evidenceUrl: "https://docs.robinhood.com/chain/connecting/",
      reviewedAt: "2026-08-31",
    });
    expect(assessment.commerciallyRedistributable).toBe(false);
  });
});
