import type { Lang } from "../types.js";
import type { RobinhoodDefiLlamaResult } from "../adapters/robinhood_chain_defillama.js";
import type { RobinhoodMorphoResult } from "../adapters/robinhood_chain_morpho.js";
import type { RobinhoodCommunityResult } from "../adapters/robinhood_chain_community.js";
import { buildRobinhoodChainPulse } from "../robinhood_chain_pulse/metrics.js";
import type { RobinhoodChainPulseSnapshot } from "../robinhood_chain_pulse/types.js";

export function getRobinhoodChainPulse(args: {
  lang: Lang;
  fundamentals: RobinhoodDefiLlamaResult;
  credit: RobinhoodMorphoResult;
  community: RobinhoodCommunityResult;
  now: Date;
}): RobinhoodChainPulseSnapshot {
  return buildRobinhoodChainPulse(args);
}
