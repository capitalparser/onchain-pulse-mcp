import { makeContext } from "../adapters/base.js";
import { fetchRobinhoodChainCommunity } from "../adapters/robinhood_chain_community.js";
import { fetchRobinhoodChainDefiLlama } from "../adapters/robinhood_chain_defillama.js";
import { fetchRobinhoodChainMorpho } from "../adapters/robinhood_chain_morpho.js";
import type { EnvConfig } from "../env.js";
import { getRobinhoodChainPulse } from "../tools/get_robinhood_chain_pulse.js";
import type { RobinhoodChainPulseSnapshot } from "./types.js";

export async function runRobinhoodChainPulseCli(
  env: EnvConfig,
  options: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<RobinhoodChainPulseSnapshot> {
  const now = options.now ?? (() => new Date());
  const asOf = now();
  const ctx = makeContext(
    options.fetchImpl === undefined ? { env } : { env, fetchImpl: options.fetchImpl },
  );
  const [fundamentals, credit, community] = await Promise.all([
    fetchRobinhoodChainDefiLlama(ctx, asOf),
    fetchRobinhoodChainMorpho(ctx, asOf),
    fetchRobinhoodChainCommunity(ctx, asOf),
  ]);
  return getRobinhoodChainPulse({
    lang: env.lang,
    fundamentals,
    credit,
    community,
    now: asOf,
  });
}
