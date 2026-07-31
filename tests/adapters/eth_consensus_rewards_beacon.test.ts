import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../src/adapters/base.js";
import {
  fetchEthConsensusRewardsBeacon,
  fetchFinalizedEthConsensusRewardsBeaconEpoch,
} from "../../src/adapters/eth_consensus_rewards_beacon.js";

const env = { byok: {}, lang: "en" as const, historyPath: "/tmp/history.json" };

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchEthConsensusRewardsBeacon", () => {
  it("resolves only the validated finalized epoch for the opt-in live check", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => json(finality(10)));

    const finalizedEpoch = await fetchFinalizedEthConsensusRewardsBeaconEpoch(
      "https://beacon.example/private-token",
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(finalizedEpoch).toBe(11);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).pathname).toMatch(
      /\/eth\/v1\/beacon\/states\/head\/finality_checkpoints$/,
    );
  });

  it("returns beacon_not_configured without calling fetch", async () => {
    const fetchImpl = vi.fn();

    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toEqual(["beacon_not_configured"]);
  });

  it("verifies one finalized epoch with one canonical block and 31 proven missed slots", async () => {
    const fetchImpl = finalizedEpochFetch(10);

    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: true, beaconUrl: "https://beacon.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result).toMatchObject({
      status: "verified",
      verified_epoch: {
        epoch: 10,
        start_slot: 320,
        end_slot: 351,
        finalized_epoch: 11,
        proposed_block_count: 1,
        missed_slot_count: 31,
        attestation_validator_count: 1,
        sync_reward_entry_count: 1,
      },
      metrics: {
        attestation_net_reward: { gwei: "8", eth: "0.000000008" },
        sync_committee_net_reward: { gwei: "-2", eth: "-0.000000002" },
        block_proposer_reward: { gwei: "10", eth: "0.00000001" },
        observed_consensus_reward: { gwei: "16", eth: "0.000000016" },
      },
    });
    expect(result.blocks).toEqual([
      {
        slot: 320,
        block_root: root(1),
        proposer_index: 7,
        block_proposer_reward: { gwei: "10", eth: "0.00000001" },
        sync_committee_net_reward: { gwei: "-2", eth: "-0.000000002" },
      },
    ]);
  });

  it("rejects duplicate validator indices in an official-shaped sync reward response", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => {
      if (url.pathname.includes("/rewards/sync_committee/")) {
        return {
          ...response,
          data: [
            response.data[0],
            { ...response.data[0], reward: "7" },
          ],
        };
      }
      return response;
    });

    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.gaps.map((gap) => gap.code)).toEqual(["beacon_evidence_mismatch"]);
    expect(result.metrics.observed_consensus_reward).toBeNull();
  });

  it("uses the official URL, method, omitted validator bodies, and at most eight concurrent requests", async () => {
    const active = { value: 0, max: 0 };
    const fetchImpl = allProposedEpochFetch(10, active);

    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    expect(active.max).toBeLessThanOrEqual(8);
    const calls = fetchImpl.mock.calls;
    expect(calls).toHaveLength(98);
    expect(new URL(String(calls[0]?.[0])).pathname).toBe("/eth/v1/beacon/states/head/finality_checkpoints");
    expect(calls[0]?.[1]).toEqual({ method: "GET" });
    const attestation = calls.find(([input]) => new URL(String(input)).pathname.endsWith("/rewards/attestations/10"));
    expect(attestation?.[1]).toEqual({ method: "POST" });
    expect((attestation?.[1] as RequestInit).body).toBeUndefined();
    const sync = calls.find(([input]) => new URL(String(input)).pathname.includes("/rewards/sync_committee/"));
    expect(sync?.[1]).toEqual({ method: "POST" });
    expect((sync?.[1] as RequestInit).body).toBeUndefined();
    const slots = calls.filter(([input]) => new URL(String(input)).pathname.endsWith("/headers")).map(([input]) => Number(new URL(String(input)).searchParams.get("slot")));
    expect(slots).toEqual(Array.from({ length: 32 }, (_, offset) => 320 + offset));
  });

  it.each(["", "   ", undefined, null])("does not fetch whitespace or malformed Beacon configuration %#", async (beaconUrl) => {
    const fetchImpl = vi.fn();
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl } as unknown as Parameters<typeof fetchEthConsensusRewardsBeacon>[0],
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.gaps[0]?.code).toBe("beacon_not_configured");
  });

  it("preserves a configured base path and query credential on every official endpoint", async () => {
    const fetchImpl = finalizedEpochFetch(10);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://provider.example/private-token?api_key=credential#discard-me" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    for (const [input] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toMatch(/^\/private-token\/eth\/v1\/beacon\//);
      expect(url.searchParams.get("api_key")).toBe("credential");
      expect(url.hash).toBe("");
    }
    const headerUrls = fetchImpl.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/headers"));
    expect(headerUrls.map((url) => url.searchParams.get("slot"))).toEqual(Array.from({ length: 32 }, (_, offset) => String(320 + offset)));
    expect(JSON.stringify(result)).not.toContain("credential");
  });

  it("preserves every untouched provider-query byte while replacing only a colliding slot", async () => {
    const fetchImpl = finalizedEpochFetch(10);
    const base = "https://user:pass@provider.example:8443/private-token?api_key=a%20~+b%26c&tag=one%2Ftwo&tag=three%3Dfour&encoded=%26%3D&=empty-key&flag&slot=base%20slot#discard-me";
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: base },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    const untouched = "api_key=a%20~+b%26c&tag=one%2Ftwo&tag=three%3Dfour&encoded=%26%3D&=empty-key&flag";
    for (const [input] of fetchImpl.mock.calls) {
      const rawUrl = String(input);
      expect(rawUrl).toMatch(/^https:\/\/user:pass@provider\.example:8443\/private-token\/eth\/v1\/beacon\//);
      const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
      if (rawUrl.includes("/headers?")) {
        const slot = new URL(rawUrl).searchParams.get("slot");
        expect(query).toBe(`${untouched}&slot=${slot}`);
      } else {
        expect(query).toBe(`${untouched}&slot=base%20slot`);
      }
      expect(rawUrl).not.toContain("#");
    }
    expect(JSON.stringify(result)).not.toContain("a%20~+b%26c");
  });

  it.each([
    ["requested epoch equals finalized epoch", finality(9)],
    ["optimistic finality evidence", { ...finality(10), execution_optimistic: true }],
  ])("rejects %s before requesting rewards or headers", async (_name, finalityResponse) => {
    const fetchImpl = vi.fn(async () => json(finalityResponse));
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("beacon_finality_gap");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the one canonical header while ignoring non-canonical alternatives", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => {
      if (url.pathname.endsWith("/headers") && url.searchParams.get("slot") === "320") {
        return {
          ...response,
          data: [nonCanonicalHeader(320), ...response.data],
        };
      }
      return response;
    });
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/key" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("verified");
    expect(result.verified_epoch?.proposed_block_count).toBe(1);
  });

  it("rejects a non-empty header response without one canonical block", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => url.pathname.endsWith("/headers") && url.searchParams.get("slot") === "320"
      ? { ...response, data: [nonCanonicalHeader(320)] }
      : response);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("beacon_evidence_mismatch");
  });

  it("rejects malformed non-canonical header candidates as schema drift", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => url.pathname.endsWith("/headers") && url.searchParams.get("slot") === "320"
      ? { ...response, data: [{ canonical: false }] }
      : response);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("beacon_schema_drift");
  });

  it.each([
    ["a 404 header response", (_url: URL, response: Response) => response, 404],
    ["two canonical headers", (url: URL, response: ResponseBody) => url.pathname.endsWith("/headers") && url.searchParams.get("slot") === "320" ? { ...response, data: [response.data[0], response.data[0]] } : response, undefined],
    ["a canonical slot mismatch", (url: URL, response: ResponseBody) => url.pathname.endsWith("/headers") && url.searchParams.get("slot") === "320" ? header(321) : response, undefined],
  ])("does not turn %s into a missed slot", async (_name, mutate, status) => {
    const fetchImpl = finalizedEpochFetch(10, mutate as ResponseMutator, status);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.status).toBe("unavailable");
    expect(result.metrics.observed_consensus_reward).toBeNull();
    expect(result.gaps[0]?.code).toBe(status === 404 ? "beacon_access_gap" : "beacon_evidence_mismatch");
  });

  it.each([
    ["optimistic attestation rewards", (url: URL, response: ResponseBody) => url.pathname.includes("/attestations/") ? { ...response, execution_optimistic: true } : response, "beacon_finality_gap"],
    ["unfinalized missed-slot headers", (url: URL, response: ResponseBody) => url.pathname.endsWith("/headers") ? { ...response, finalized: false } : response, "beacon_finality_gap"],
    ["malformed required attestation array", (url: URL, response: ResponseBody) => url.pathname.includes("/attestations/") ? { ...response, data: { ...response.data, ideal_rewards: "wrong" } } : response, "beacon_schema_drift"],
    ["a mismatched proposer index", (url: URL, response: ResponseBody) => url.pathname.includes("/rewards/blocks/") ? { ...response, data: { ...response.data, proposer_index: "8" } } : response, "beacon_evidence_mismatch"],
  ])("returns a bounded unavailable snapshot for %s", async (_name, mutate, code) => {
    const fetchImpl = finalizedEpochFetch(10, mutate as ResponseMutator);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("accepts and sums a Uint64 inclusion_delay attestation component", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => url.pathname.includes("/attestations/")
      ? { ...response, data: {
        ...response.data,
        ideal_rewards: [{ ...response.data.ideal_rewards[0], inclusion_delay: "5" }],
        total_rewards: [{ ...response.data.total_rewards[0], inclusion_delay: "5" }],
      } }
      : response);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.metrics.attestation_net_reward).toEqual({ gwei: "13", eth: "0.000000013" });
    expect(result.metrics.observed_consensus_reward).toEqual({ gwei: "21", eth: "0.000000021" });
  });

  it("rejects a negative inclusion_delay as schema drift", async () => {
    const fetchImpl = finalizedEpochFetch(10, (url, response) => url.pathname.includes("/attestations/")
      ? { ...response, data: {
        ...response.data,
        total_rewards: [{ ...response.data.total_rewards[0], inclusion_delay: "-1" }],
      } }
      : response);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("beacon_schema_drift");
  });

  it.each([
    ["a thrown request", () => Promise.reject(new Error("provider secret detail"))],
    ["invalid JSON", () => ({ ok: true, json: async () => { throw new Error("provider secret detail"); } } as unknown as Response)],
  ])("contains %s as an access gap without provider details", async (_name, broken) => {
    const fetchImpl = vi.fn().mockImplementationOnce(broken);
    const result = await fetchEthConsensusRewardsBeacon(
      { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/credential" },
      makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch }),
    );

    expect(result.gaps[0]?.code).toBe("beacon_access_gap");
    expect(JSON.stringify(result)).not.toContain("provider secret detail");
    expect(JSON.stringify(result)).not.toContain("credential");
  });

  it("binds the first provider URL to one adapter context without exposing either URL", async () => {
    const fetchImpl = finalizedEpochFetch(10);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchEthConsensusRewardsBeacon({ epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/first-secret" }, ctx);
    const result = await fetchEthConsensusRewardsBeacon({ epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/second-secret" }, ctx);

    expect(result.gaps[0]?.code).toBe("beacon_access_gap");
    expect(JSON.stringify(result)).not.toContain("second-secret");
  });

  it("reuses verified cache entries, deduplicates identical concurrent work, and returns one stale gap after refresh failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00Z"));
    const fetchImpl = finalizedEpochFetch(10);
    const ctx = makeContext({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const input = { epoch: 10, includeBlocks: false, beaconUrl: "https://beacon.example/secret" };

    const [first, concurrent] = await Promise.all([
      fetchEthConsensusRewardsBeacon(input, ctx),
      fetchEthConsensusRewardsBeacon(input, ctx),
    ]);
    expect(first).toEqual(concurrent);
    expect(fetchImpl).toHaveBeenCalledTimes(36);
    await fetchEthConsensusRewardsBeacon(input, ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(36);

    vi.advanceTimersByTime(30 * 60_000 + 1);
    fetchImpl.mockImplementation(async () => { throw new Error("provider secret detail"); });
    const stale = await fetchEthConsensusRewardsBeacon(input, ctx);
    expect(stale.status).toBe("verified");
    expect(stale.source_status.every((status) => status.stale)).toBe(true);
    expect(stale.gaps.filter((gap) => gap.code === "source_stale")).toHaveLength(1);
    expect(JSON.stringify(stale)).not.toContain("provider secret detail");
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function root(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function finality(epoch: number) {
  return {
    execution_optimistic: false,
    finalized: true,
    data: {
      previous_justified: { epoch: String(epoch - 1), root: root(2) },
      current_justified: { epoch: String(epoch), root: root(3) },
      finalized: { epoch: String(epoch + 1), root: root(4) },
    },
  };
}

function attestationRewards() {
  return {
    execution_optimistic: false,
    finalized: true,
    data: {
      ideal_rewards: [{ effective_balance: "32000000000", head: "3", target: "2", source: "4", inactivity: "-1" }],
      total_rewards: [{ validator_index: "9", head: "3", target: "2", source: "4", inactivity: "-1" }],
    },
  };
}

function header(slot: number) {
  return {
    execution_optimistic: false,
    finalized: true,
    data: [{
      root: root(1),
      canonical: true,
      header: { message: { slot: String(slot), proposer_index: "7", parent_root: root(5), state_root: root(6), body_root: root(7) }, signature: `0x${"0".repeat(192)}` },
    }],
  };
}

function nonCanonicalHeader(slot: number) {
  return {
    root: root(8),
    canonical: false,
    header: { message: { slot: String(slot), proposer_index: "8", parent_root: root(9), state_root: root(10), body_root: root(11) }, signature: `0x${"1".repeat(192)}` },
  };
}

function headerFor(slot: number) {
  const blockRoot = root(slot + 1);
  return {
    execution_optimistic: false,
    finalized: true,
    data: [{
      root: blockRoot,
      canonical: true,
      header: { message: { slot: String(slot), proposer_index: "7", parent_root: root(5), state_root: root(6), body_root: root(7) }, signature: `0x${"0".repeat(192)}` },
    }],
  };
}

function missedSlot() {
  return { execution_optimistic: false, finalized: true, data: [] };
}

function blockRewards() {
  return {
    execution_optimistic: false,
    finalized: true,
    data: { proposer_index: "7", total: "10", attestations: "5", sync_aggregate: "2", proposer_slashings: "1", attester_slashings: "2" },
  };
}

function syncRewards() {
  return { execution_optimistic: false, finalized: true, data: [{ validator_index: "9", reward: "-2" }] };
}

type ResponseBody = { execution_optimistic: boolean; finalized: boolean; data: any };
type ResponseMutator = (url: URL, response: ResponseBody) => ResponseBody;

function finalizedEpochFetch(epoch: number, mutate: ResponseMutator = (_url, response) => response, forcedStatus?: number) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    if (forcedStatus !== undefined && url.pathname.endsWith("/headers")) return json({ code: forcedStatus, message: "provider secret" }, forcedStatus);
    if (url.pathname.endsWith("/finality_checkpoints")) return json(mutate(url, finality(epoch)));
    if (url.pathname.endsWith(`/rewards/attestations/${epoch}`)) return json(mutate(url, attestationRewards()));
    if (url.pathname.endsWith("/headers")) return json(mutate(url, url.searchParams.get("slot") === String(epoch * 32) ? header(epoch * 32) : missedSlot()));
    if (url.pathname.endsWith(`/rewards/blocks/${root(1)}`)) return json(mutate(url, blockRewards()));
    if (url.pathname.endsWith(`/rewards/sync_committee/${root(1)}`)) return json(mutate(url, syncRewards()));
    throw new Error(`unexpected ${url.pathname}`);
  });
}

function allProposedEpochFetch(epoch: number, active: { value: number; max: number }) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    active.value += 1;
    active.max = Math.max(active.max, active.value);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active.value -= 1;
    const url = new URL(String(input));
    if (url.pathname.endsWith("/finality_checkpoints")) return json(finality(epoch));
    if (url.pathname.endsWith(`/rewards/attestations/${epoch}`)) return json(attestationRewards());
    if (url.pathname.endsWith("/headers")) return json(headerFor(Number(url.searchParams.get("slot"))));
    if (url.pathname.includes("/rewards/blocks/")) return json(blockRewards());
    if (url.pathname.includes("/rewards/sync_committee/")) return json(syncRewards());
    throw new Error(`unexpected ${url.pathname}`);
  });
}
