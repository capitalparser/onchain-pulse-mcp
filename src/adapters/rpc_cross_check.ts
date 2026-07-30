import type { Adapter, AdapterContext } from "./base.js";
import type { EnvConfig } from "../env.js";
import type { AdapterResult } from "../types.js";

interface Input {
  chain: string;
  tokenAddress: string;
  wallets: string[];
  maxWallets?: number;
}

const DEFAULT_MAX_WALLETS = 20;
const HARD_MAX_WALLETS = 50;

export const rpcCrossCheck: Adapter<Input> = {
  name: "rpc_cross_check",
  ttlMs: 60_000,

  capabilities(_env: EnvConfig) {
    return { byok_active: [], sources: [] };
  },

  async fetch(input: Input, _ctx: AdapterContext): Promise<AdapterResult> {
    const maxWallets = Math.min(input.maxWallets ?? DEFAULT_MAX_WALLETS, HARD_MAX_WALLETS);
    const checkedWallets = input.wallets.slice(0, maxWallets);
    const skippedWalletCount = Math.max(input.wallets.length - checkedWallets.length, 0);

    const staleData =
      checkedWallets.length === 0 ? ["rpc_cross_check:no_wallets"] : ["rpc_cross_check:network_not_configured"];

    return {
      data: {
        chain: input.chain,
        token_address: input.tokenAddress,
        checked_wallets: checkedWallets,
        skipped_wallet_count: skippedWalletCount,
      },
      sources: [],
      asOf: new Date().toISOString(),
      stale: false,
      stale_data: staleData,
    };
  },
};

