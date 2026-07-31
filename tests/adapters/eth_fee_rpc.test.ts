import { describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { fetchEthFeeRpc } from "../../src/adapters/eth_fee_rpc.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("fetchEthFeeRpc", () => {
  it("returns a bounded unavailable snapshot without fetching when RPC is absent", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
    expect(result.gaps).toEqual([{ code: "rpc_not_configured", detail: "Ethereum RPC is not configured." }]);
    expect(result.metrics).toEqual({
      execution_fee: null,
      base_fee_burn: null,
      priority_fee: null,
      blob_fee_burn: null,
      gross_fee: null,
      total_burn: null,
    });
  });

  it("defends the 64-block bound before any RPC request", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchEthFeeRpc(
      { startBlock: 100, endBlock: 164, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )).rejects.toThrow("bounded ordered block range");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("associates shuffled paired JSON-RPC responses by id and calculates exact blob and non-blob totals", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, result: { number: "0x65" } }))
      .mockResolvedValueOnce(response([
        { jsonrpc: "2.0", id: 5, result: [receipt(101, 3, 4, 21, 7, 3)] },
        { jsonrpc: "2.0", id: 2, result: block(100, [hash(1), hash(2)], 10, 5) },
        { jsonrpc: "2.0", id: 4, result: block(101, [hash(3)], 20, 4, 7) },
        { jsonrpc: "2.0", id: 3, result: [receipt(100, 1, 2, 13), receipt(100, 2, 3, 12)] },
      ]));

    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 101, includeBlocks: true, rpcUrl: "https://secret.example/key" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    expect(result.metrics).toEqual({
      execution_fee: { wei: "146", eth: "0.000000000000000146" },
      base_fee_burn: { wei: "130", eth: "0.00000000000000013" },
      priority_fee: { wei: "16", eth: "0.000000000000000016" },
      blob_fee_burn: { wei: "21", eth: "0.000000000000000021" },
      gross_fee: { wei: "167", eth: "0.000000000000000167" },
      total_burn: { wei: "151", eth: "0.000000000000000151" },
    });
    expect(result.blocks?.map((item) => item.block_number)).toEqual([100, 101]);
  });

  it("uses official finalized and paired block-receipt request parameters", async () => {
    const fetchImpl = oneBlockFetch(100);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });

    await fetchEthFeeRpc({ startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" }, ctx);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["finalized", false],
    });
    expect(JSON.parse((fetchImpl.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual([
      { jsonrpc: "2.0", id: 2, method: "eth_getBlockByNumber", params: ["0x64", false] },
      { jsonrpc: "2.0", id: 3, method: "eth_getBlockReceipts", params: ["0x64"] },
    ]);
  });

  it("rejects a requested range newer than the finalized head without requesting evidence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ jsonrpc: "2.0", id: 1, result: { number: "0x63" } }));
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("rpc_finality_gap");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a null finalized result", { jsonrpc: "2.0", id: 1, result: null }],
    ["a wrong finalized response id", { jsonrpc: "2.0", id: 2, result: { number: "0x64" } }],
  ])("does not begin evidence collection after %s", async (_name, finalizedResponse) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(finalizedResponse));
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", (items: unknown[]) => items.slice(0, 1)],
    ["duplicate", (items: unknown[]) => [items[0], items[0]]],
    ["unexpected", (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: 99 }, items[1]]],
    ["string", (items: unknown[]) => [{ ...(items[0] as Record<string, unknown>), id: "2" }, items[1]]],
  ])("returns rpc_access_gap for %s batch response ids", async (_name, mutate) => {
    const fetchImpl = oneBlockFetch(100, (batch) => mutate(batch));
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.gaps[0]?.code).toBe("rpc_access_gap");
  });

  it.each([
    ["thrown fetch", () => Promise.reject(new Error("provider detail"))],
    ["HTTP failure", () => response({ hidden: "provider detail" }, false)],
    ["invalid JSON", () => ({ ok: true, json: async () => { throw new Error("provider detail"); } } as unknown as Response)],
    ["JSON-RPC error", () => response([{ jsonrpc: "2.0", id: 2, error: { message: "provider detail" } }, { jsonrpc: "2.0", id: 3, result: [] }])],
  ])("contains %s as an access gap without provider details", async (_name, broken) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, result: { number: "0x64" } }))
      .mockImplementationOnce(broken);
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("rpc_access_gap");
    expect(JSON.stringify(result)).not.toContain("provider detail");
    expect(JSON.stringify(result)).not.toContain("https://provider.example/credential");
  });

  it.each([
    ["a leading-zero quantity", (batch: unknown[]) => { ((batch[0] as { result: Record<string, unknown> }).result).gasUsed = "0x05"; }],
    ["an uppercase hash", (batch: unknown[]) => { ((batch[0] as { result: Record<string, unknown> }).result).hash = hash(10).replace(/a$/, "A"); }],
    ["a receipt with only one blob field", (batch: unknown[]) => { ((batch[1] as { result: Record<string, unknown>[] }).result)[0]!.blobGasUsed = "0x1"; }],
    ["a null block", (batch: unknown[]) => { (batch[0] as { result: unknown }).result = null; }],
  ])("returns rpc_schema_drift for %s", async (_name, mutate) => {
    const fetchImpl = oneBlockFetch(100, mutate);
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("rpc_schema_drift");
  });

  it("returns an evidence mismatch rather than a partial total when receipt identity does not reconcile", async () => {
    const fetchImpl = oneBlockFetch(100, (batch) => {
      ((batch[1] as { result: Record<string, unknown>[] }).result)[0]!.transactionHash = hash(99);
    });
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("rpc_evidence_mismatch");
    expect(result.metrics.execution_fee).toBeNull();
  });

  it("chunks a 21-block range into paired batches of at most 20 blocks", async () => {
    const fetchImpl = rangeFetch(100, 120);
    const result = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 120, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchImpl.mock.calls[1]?.[1] as RequestInit).body as string)).toHaveLength(40);
    expect(JSON.parse((fetchImpl.mock.calls[2]?.[1] as RequestInit).body as string)).toHaveLength(2);
  });

  it("omits block rows by default and includes every ordered block only when requested", async () => {
    const omitted = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: oneBlockFetch(100) as unknown as typeof fetch }),
    );
    const included = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: true, rpcUrl: "https://provider.example/secret" },
      makeContext({ env, fetchImpl: oneBlockFetch(100) as unknown as typeof fetch }),
    );

    expect(omitted.blocks).toBeUndefined();
    expect(included.blocks?.map((item) => item.block_number)).toEqual([100]);
  });

  it("reuses a verified cache entry for an identical request without retaining the RPC URL", async () => {
    const fetchImpl = oneBlockFetch(100);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const first = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://one.example/private-one" }, ctx,
    );
    const second = await fetchEthFeeRpc(
      { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://two.example/private-two" }, ctx,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).not.toContain("private-one");
    expect(JSON.stringify(second)).not.toContain("private-two");
  });

  it("deduplicates concurrent identical work", async () => {
    let resolveFinal: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFinal = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(response([
        { jsonrpc: "2.0", id: 2, result: block(100, [hash(1)], 10, 5) },
        { jsonrpc: "2.0", id: 3, result: [receipt(100, 1, 5, 10)] },
      ])));
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const input = { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" };
    const first = fetchEthFeeRpc(input, ctx);
    const second = fetchEthFeeRpc(input, ctx);
    resolveFinal!(response({ jsonrpc: "2.0", id: 1, result: { number: "0x64" } }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns stale verified finalized evidence when a refresh fails after TTL expiry", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = oneBlockFetch(100);
      const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
      const input = { startBlock: 100, endBlock: 100, includeBlocks: false, rpcUrl: "https://provider.example/secret" };
      await expect(fetchEthFeeRpc(input, ctx)).resolves.toMatchObject({ status: "verified", gaps: [] });
      vi.advanceTimersByTime(30 * 60_000 + 1);
      fetchImpl.mockRejectedValueOnce(new Error("provider unavailable"));

      const stale = await fetchEthFeeRpc(input, ctx);
      expect(stale.status).toBe("verified");
      expect(stale.gaps.map((gap) => gap.code)).toEqual(["source_stale"]);
      expect(stale.source_status.every((status) => status.stale)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

function hash(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function quantity(value: number): string {
  return `0x${value.toString(16)}`;
}

function block(number: number, transactions: string[], baseFee: number, gasUsed: number, blobGasUsed?: number): Record<string, unknown> {
  return {
    number: quantity(number),
    hash: hash(number),
    baseFeePerGas: quantity(baseFee),
    gasUsed: quantity(gasUsed),
    ...(blobGasUsed === undefined ? {} : { blobGasUsed: quantity(blobGasUsed) }),
    transactions,
  };
}

function receipt(blockNumber: number, transaction: number, gasUsed: number, effectiveGasPrice: number, blobGasUsed?: number, blobGasPrice?: number): Record<string, unknown> {
  return {
    blockNumber: quantity(blockNumber),
    blockHash: hash(blockNumber),
    transactionHash: hash(transaction),
    transactionIndex: quantity(transaction === 1 ? 0 : transaction === 2 ? 1 : 0),
    gasUsed: quantity(gasUsed),
    effectiveGasPrice: quantity(effectiveGasPrice),
    ...(blobGasUsed === undefined ? {} : { blobGasUsed: quantity(blobGasUsed), blobGasPrice: quantity(blobGasPrice!) }),
  };
}

function oneBlockFetch(blockNumber: number, mutate?: (batch: unknown[]) => unknown) {
  return vi.fn()
    .mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, result: { number: quantity(blockNumber) } }))
    .mockImplementationOnce(() => {
      const batch: unknown[] = [
        { jsonrpc: "2.0", id: 2, result: block(blockNumber, [hash(1)], 10, 5) },
        { jsonrpc: "2.0", id: 3, result: [receipt(blockNumber, 1, 5, 10)] },
      ];
      return Promise.resolve(response(mutate?.(batch) ?? batch));
    });
}

function rangeFetch(start: number, end: number) {
  let batchCount = 0;
  return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as Array<{ id: number; method: string; params: string[] }> | { id: number };
    if (!Array.isArray(request)) return Promise.resolve(response({ jsonrpc: "2.0", id: 1, result: { number: quantity(end) } }));
    const result = request.map((item) => {
      const blockNumber = Number(BigInt(item.params[0]!));
      return item.method === "eth_getBlockByNumber"
        ? { jsonrpc: "2.0", id: item.id, result: block(blockNumber, [], 1, 0) }
        : { jsonrpc: "2.0", id: item.id, result: [] };
    });
    batchCount += 1;
    return Promise.resolve(response(batchCount === 1 ? result.reverse() : result));
  });
}
