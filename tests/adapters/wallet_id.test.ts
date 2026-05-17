import { describe, it, expect } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import { walletId } from "../../src/adapters/wallet_id.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

type Labels = Record<string, { entity?: string; category?: string }>;

function labelsOf(data: Record<string, unknown>): Labels {
  return data.labels as Labels;
}

describe("wallet_id adapter", () => {
  it("free path returns empty label set with stale=false", async () => {
    const ctx = makeContext({ env });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels).toEqual({});
    expect(r.sources).toEqual([]);
    expect(r.stale).toBe(false);
  });

  it("BYOK path queries Arkham when ARKHAM_API_KEY set", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { arkham: "a-1" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(r.data.labels).toEqual({ "0xabc": { entity: "Binance" } });
    expect(r.sources).toContain("arkham");
  });

  it("F16 BYOK path queries Nansen labels when NANSEN_API_KEY set", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { nansen: "n-1" } },
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const u = url.toString();
        if (u.includes("nansen.ai") && u.includes("entity")) {
          const headers = Object.fromEntries(new Headers(init?.headers ?? {}).entries());
          if (headers.apikey !== "n-1") return new Response("forbidden", { status: 403 });
          return new Response(JSON.stringify({ "0xabc": { label: "Smart Money", category: "smart_money" } }), {
            status: 200,
          });
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    const labels = labelsOf(r.data);
    expect(labels["0xabc"]?.entity).toBe("Smart Money");
    expect(labels["0xabc"]?.category).toBe("smart_money");
    expect(r.sources).toContain("nansen");
  });

  it("F16 Arkham + Nansen merged: Arkham wins on conflict; Nansen fills gaps", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { arkham: "a-1", nansen: "n-1" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        if (u.includes("nansen.ai")) {
          return new Response(
            JSON.stringify({
              "0xabc": { label: "Bin (Nansen)", category: "exchange" },
              "0xdef": { label: "Whale", category: "smart_money" },
            }),
            { status: 200 },
          );
        }
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc", "0xdef"] }, ctx);
    const labels = labelsOf(r.data);
    expect(labels["0xabc"]?.entity).toBe("Binance");
    expect(labels["0xabc"]?.category).toBe("exchange");
    expect(labels["0xdef"]?.entity).toBe("Whale");
    expect(r.sources).toEqual(expect.arrayContaining(["arkham", "nansen"]));
  });

  it("F16 Nansen 401 fail-safe: Arkham labels survive, stale_data annotated", async () => {
    const ctx = makeContext({
      env: { ...env, byok: { arkham: "a-1", nansen: "bad-key" } },
      fetchImpl: (async (url: string | URL | Request) => {
        const u = url.toString();
        if (u.includes("arkhamintelligence")) {
          return new Response(JSON.stringify({ "0xabc": { entity: "Binance" } }), { status: 200 });
        }
        if (u.includes("nansen.ai")) return new Response("unauthorized", { status: 401 });
        return new Response("nf", { status: 404 });
      }) as typeof fetch,
    });
    const r = await walletId.fetch({ addresses: ["0xabc"] }, ctx);
    expect(labelsOf(r.data)["0xabc"]?.entity).toBe("Binance");
    expect(r.sources).toContain("arkham");
    expect(r.sources).not.toContain("nansen");
    expect(r.stale_data).toContain("nansen:auth_rejected");
  });

  it("capabilities reports enrichment when arkham or nansen key set", () => {
    expect(walletId.capabilities(env).byok_active).toEqual([]);
    expect(walletId.capabilities({ ...env, byok: { arkham: "k" } }).byok_active).toContain("arkham");
    expect(walletId.capabilities({ ...env, byok: { nansen: "k" } }).byok_active).toContain("nansen");
  });
});
