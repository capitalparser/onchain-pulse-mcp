import { describe, expect, it } from "vitest";
import {
  ROBINHOOD_CHAIN_REGISTRY,
  ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE,
  communityTokenByAddress,
} from "../../src/robinhood_chain_pulse/registry.js";

describe("Robinhood Chain registry", () => {
  it("pins the official chain boundary without inventing an official chain token", () => {
    expect(ROBINHOOD_CHAIN_REGISTRY.chain_id).toBe(4663);
    expect(ROBINHOOD_CHAIN_REGISTRY.native_gas_symbol).toBe("ETH");
    expect(ROBINHOOD_CHAIN_REGISTRY.official_chain_token).toBeNull();
    expect(ROBINHOOD_CHAIN_REGISTRY.rollup_stack).toBe("arbitrum");
    expect(ROBINHOOD_CHAIN_REGISTRY.settlement_layer).toBe("ethereum");
    expect(ROBINHOOD_CHAIN_REGISTRY.data_availability).toBe("ethereum_blobs");
  });

  it("keeps canonical assets separate from unaffiliated community tokens", () => {
    expect(ROBINHOOD_CHAIN_REGISTRY.canonical_tokens.WETH).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(ROBINHOOD_CHAIN_REGISTRY.canonical_tokens.USDG).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE).toHaveLength(3);
    expect(ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.every((token) => token.official_affiliation === false)).toBe(true);
    expect(new Set(ROBINHOOD_COMMUNITY_TOKEN_UNIVERSE.map((token) => token.address.toLowerCase())).size).toBe(3);
  });

  it("resolves research tokens by exact address rather than ticker", () => {
    const cashcat = communityTokenByAddress("0x020bfc650a365f8bb26819deaabf3e21291018b4");
    expect(cashcat?.symbol).toBe("CASHCAT");
    expect(communityTokenByAddress("0x0000000000000000000000000000000000000000")).toBeUndefined();
  });
});
