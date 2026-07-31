import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchSkyEthCollateralCustody, SKY_CHAINLOG } from "../../src/adapters/sky_eth_collateral_rpc.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };
const RPC_URL = "https://rpc.example/credential-secret";
const VAT = "0x0000000000000000000000000000000000000001";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const RETH = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const JOINS = ["0x0000000000000000000000000000000000000010", "0x0000000000000000000000000000000000000011", "0x0000000000000000000000000000000000000012", "0x0000000000000000000000000000000000000013", "0x0000000000000000000000000000000000000014", "0x0000000000000000000000000000000000000015"];
const ILKS = ["ETH-A", "ETH-B", "ETH-C", "WSTETH-A", "WSTETH-B", "RETH-A"];
const TOKENS = [WETH, WETH, WETH, WSTETH, WSTETH, RETH];
const GET_ADDRESS = "0x21f8a721";
const VAT_SELECTOR = "0x36569e77";
const ILK_SELECTOR = "0xc5ce281e";
const GEM_SELECTOR = "0x7bd2bea7";
const DEC_SELECTOR = "0xb3bcfa82";
const LIVE_SELECTOR = "0x957aa58c";
const BALANCE_OF = "0x70a08231";
const WSTETH_QUOTE = "0xbb2952fc";
const RETH_QUOTE = "0x8b32fa23";

function response(body: unknown, ok = true): Response { return { ok, json: async () => body } as Response; }
function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }
function addressWord(value: string): string { return `${"0".repeat(24)}${value.slice(2).toLowerCase()}`; }
function asciiWord(value: string): string { return Buffer.from(value, "ascii").toString("hex").padEnd(64, "0"); }
function keyArg(value: string): string { return Buffer.from(value, "ascii").toString("hex").padEnd(64, "0"); }

function resultFor(request: { id: number; method: string; params: unknown[] }): unknown {
  if (request.method === "eth_chainId") return { jsonrpc: "2.0", id: request.id, result: "0x1" };
  if (request.method === "eth_getBlockByNumber") return { jsonrpc: "2.0", id: request.id, result: { number: "0x100", hash: `0x${"a".repeat(64)}`, timestamp: "0x65" } };
  const call = request.params[0] as { to: string; data: string };
  if (call.to.toLowerCase() === SKY_CHAINLOG.toLowerCase() && call.data.startsWith(GET_ADDRESS)) {
    const keys = ["MCD_VAT", "ETH", "WSTETH", "RETH", "MCD_JOIN_ETH_A", "MCD_JOIN_ETH_B", "MCD_JOIN_ETH_C", "MCD_JOIN_WSTETH_A", "MCD_JOIN_WSTETH_B", "MCD_JOIN_RETH_A"];
    const values = [VAT, WETH, WSTETH, RETH, ...JOINS];
    const index = keys.findIndex((key) => call.data === `${GET_ADDRESS}${keyArg(key)}`);
    if (index >= 0) return { jsonrpc: "2.0", id: request.id, result: `0x${addressWord(values[index]!)}` };
  }
  if (call.data.startsWith(BALANCE_OF)) {
    const index = JOINS.findIndex((join) => join.slice(2).toLowerCase() === call.data.slice(-40));
    if (index >= 0 && call.to.toLowerCase() === TOKENS[index]!.toLowerCase()) return { jsonrpc: "2.0", id: request.id, result: `0x${word(BigInt(index + 1))}` };
  }
  const index = JOINS.findIndex((join) => join.toLowerCase() === call.to.toLowerCase());
  if (index >= 0) {
    const values: Record<string, string> = {
      [VAT_SELECTOR]: `0x${addressWord(VAT)}`,
      [ILK_SELECTOR]: `0x${asciiWord(ILKS[index]!)}`,
      [GEM_SELECTOR]: `0x${addressWord(TOKENS[index]!)}`,
      [DEC_SELECTOR]: `0x${word(18n)}`,
      [LIVE_SELECTOR]: `0x${word(1n)}`,
      [`${BALANCE_OF}${JOINS[index]!.slice(2).toLowerCase().padStart(64, "0")}`]: `0x${word(BigInt(index + 1))}`,
    };
    if (values[call.data] !== undefined) return { jsonrpc: "2.0", id: request.id, result: values[call.data] };
  }
  if (call.to.toLowerCase() === WSTETH.toLowerCase() && call.data === `${WSTETH_QUOTE}${word(9n)}`) return { jsonrpc: "2.0", id: request.id, result: `0x${word(10n)}` };
  if (call.to.toLowerCase() === RETH.toLowerCase() && call.data === `${RETH_QUOTE}${word(6n)}`) return { jsonrpc: "2.0", id: request.id, result: `0x${word(7n)}` };
  throw new Error("unexpected test request");
}

function finalizedFetch(mutate?: (round: number, items: unknown[]) => unknown[]): ReturnType<typeof vi.fn> {
  let round = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    round += 1;
    const requests = JSON.parse(init.body as string) as Array<{ id: number; method: string; params: unknown[] }>;
    const items = requests.map(resultFor);
    return response((mutate?.(round, items) ?? items).reverse());
  });
}

describe("fetchSkyEthCollateralCustody", () => {
  it("returns bounded unavailable output without an internal RPC URL", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchSkyEthCollateralCustody({}, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "unavailable", verified_block: null, resolved_contracts: null, ilks: [], buckets: [] });
    expect(result.gaps[0]?.code).toBe("rpc_not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies one exact finalized mainnet snapshot in four batches and fifty logical calls", async () => {
    const fetchImpl = finalizedFetch();
    const result = await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(SKY_CHAINLOG).toBe("0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F");
    expect(result).toMatchObject({ status: "verified", verified_block: { number: 256, timestamp: 101 }, metrics: { sky_eth_family_adapter_custody_eth_wei: "23" } });
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds.map((round) => round.length)).toEqual([2, 10, 36, 2]);
    expect(rounds.flat()).toHaveLength(50);
    expect(new Set(rounds.flat().map((request: { id: number }) => request.id)).size).toBe(50);
  });

  it("uses deterministic Chainlog keys, exact ordered join layout, one finalized tag, and aggregate quote args", async () => {
    const fetchImpl = finalizedFetch();
    await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }));
    const rounds = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(rounds[1].map((request: { params: [{ data: string }] }) => request.params[0].data)).toEqual([
      "MCD_VAT", "ETH", "WSTETH", "RETH", "MCD_JOIN_ETH_A", "MCD_JOIN_ETH_B", "MCD_JOIN_ETH_C", "MCD_JOIN_WSTETH_A", "MCD_JOIN_WSTETH_B", "MCD_JOIN_RETH_A",
    ].map((key) => `${GET_ADDRESS}${keyArg(key)}`));
    expect(rounds[2].map((request: { params: [{ data: string }] }) => request.params[0].data.slice(0, 10))).toEqual(Array.from({ length: 6 }, () => [VAT_SELECTOR, ILK_SELECTOR, GEM_SELECTOR, DEC_SELECTOR, LIVE_SELECTOR, BALANCE_OF]).flat());
    expect(rounds.slice(1).flat().every((request: { params: unknown[] }) => request.params[1] === "0x100")).toBe(true);
    expect(rounds[3].map((request: { params: [{ data: string }] }) => request.params[0].data)).toEqual([`${WSTETH_QUOTE}${word(9n)}`, `${RETH_QUOTE}${word(6n)}`]);
  });

  it.each([
    ["an extra response", 2, (items: unknown[]) => [...items, { jsonrpc: "2.0", id: 99, result: "0x0" }], "rpc_access_gap"],
    ["a duplicate response id", 3, (items: unknown[]) => [{ ...(items[0] as object), id: (items[1] as { id: number }).id }, ...items.slice(1)], "rpc_access_gap"],
    ["a missing response", 3, (items: unknown[]) => items.slice(1), "rpc_access_gap"],
    ["a malformed envelope", 1, (items: unknown[]) => [{ ...(items[0] as object), jsonrpc: "1.0" }, items[1]!], "rpc_access_gap"],
    ["a non-mainnet chain", 1, (items: unknown[]) => [{ ...(items[0] as object), result: "0x2" }, items[1]!], "rpc_chain_mismatch"],
    ["a null finalized block", 1, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: null }], "rpc_finality_gap"],
    ["a zero Chainlog join", 2, (items: unknown[]) => [...items.slice(0, 4), { ...(items[4] as object), result: `0x${word(0n)}` }, ...items.slice(5)], "rpc_evidence_mismatch"],
    ["a malformed address word", 2, (items: unknown[]) => [{ ...(items[0] as object), result: "0x1234" }, ...items.slice(1)], "rpc_schema_drift"],
    ["a wrong join token", 3, (items: unknown[]) => [...items.slice(0, 2), { ...(items[2] as object), result: `0x${addressWord(RETH)}` }, ...items.slice(3)], "rpc_evidence_mismatch"],
    ["a wrong ilk", 3, (items: unknown[]) => [items[0]!, { ...(items[1] as object), result: `0x${asciiWord("BAD")}` }, ...items.slice(2)], "rpc_evidence_mismatch"],
    ["a wrong common Vat", 3, (items: unknown[]) => [{ ...(items[0] as object), result: `0x${addressWord("0x0000000000000000000000000000000000000099")}` }, ...items.slice(1)], "rpc_evidence_mismatch"],
    ["wrong decimals", 3, (items: unknown[]) => [...items.slice(0, 3), { ...(items[3] as object), result: `0x${word(17n)}` }, ...items.slice(4)], "rpc_evidence_mismatch"],
    ["wrong live", 3, (items: unknown[]) => [...items.slice(0, 4), { ...(items[4] as object), result: `0x${word(2n)}` }, ...items.slice(5)], "rpc_evidence_mismatch"],
    ["a short scalar quote", 4, (items: unknown[]) => [{ ...(items[0] as object), result: "0x1234" }, items[1]!], "rpc_schema_drift"],
  ])("fails closed without partial custody for %s", async (_name, round, mutate, code) => {
    const result = await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, makeContext({ env, fetchImpl: finalizedFetch((actualRound, items) => actualRound === round ? mutate(items) : items) as unknown as typeof fetch }));
    expect(result).toMatchObject({ status: "unavailable", ilks: [], buckets: [], resolved_contracts: null });
    expect(result.gaps[0]?.code).toBe(code);
  });

  it("binds one provider per context, hides provider details, coalesces, and only falls back to stale verified evidence", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = finalizedFetch();
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      await Promise.all([fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, ctx), fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, ctx)]);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      const rejected = await fetchSkyEthCollateralCustody({ rpcUrl: "https://rpc.example/other-secret" }, ctx);
      expect(rejected.gaps[0]?.code).toBe("rpc_access_gap");
      expect(JSON.stringify(rejected)).not.toContain("other-secret");
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider private detail"));
      const stale = await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.source_status[0]?.stale).toBe(true);
      expect(JSON.stringify(stale)).not.toContain("private detail");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache evidence that only fails the final Task 1 custody-total assertion", async () => {
    const fetchImpl = finalizedFetch((round, items) => {
      const attemptRound = ((round - 1) % 4) + 1;
      if (attemptRound === 3) return [...items.slice(0, 5), { ...(items[5] as object), result: `0x${word((2n ** 256n) - 1n)}` }, ...items.slice(6)];
      if (attemptRound === 4) return [{ ...(items[0] as object), result: `0x${word(1n)}` }, items[1]!];
      return items;
    });
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, ctx);
    expect(first).toMatchObject({ status: "unavailable", verified_block: null, ilks: [], buckets: [] });
    expect(first.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const second = await fetchSkyEthCollateralCustody({ rpcUrl: RPC_URL }, ctx);
    expect(second.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });
});
