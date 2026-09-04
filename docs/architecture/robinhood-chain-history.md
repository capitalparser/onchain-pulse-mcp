# Robinhood Chain point-in-time history

The command `npm run robinhood-chain-collect` performs one bounded research collection cycle. It reads `OPM_INTELLIGENCE_HISTORY_PATH`, appends canonical JSONL observations outside the repository, prints a bounded summary, and exits. It is not a daemon, scheduler, backfill, trading command, or HTTP history service.

Each cycle calls the DeFiLlama, Morpho, and community adapters once. The existing live pulse and persisted observations are derived from those same adapter results. The observation time is the retrieval-time pulse `as_of`; it does not claim the current provider export was historically available before retrieval. The ingestion time is recorded after the three families complete.

## Source scope

| Metrics | Source refs |
|---|---|
| TVL | `defillama:chains` |
| Stablecoin stock / seven-day change | `defillama-stablecoins:chains` / `defillama-stablecoins:history` |
| DEX activity | `defillama:dexs:robinhood-chain` |
| Application fees | `defillama:fees:robinhood-chain` |
| Morpho levels / changes | `morpho-api:markets:4663` / `morpho-api:market-history:4663` |
| Community breadth | DEX Screener plus the successful exact-address Blockscout or RPC verification refs for eligible tokens |

Missing numeric values emit no observation; a real zero is retained. Unique borrowers remain unavailable. Discrete capital, credit, breadth, fragility, and phase states are stored as one-hot observations; ETH capture is not stored as a numeric or predictive feature.

Feature definitions are `forward_only` and point-in-time safe. Identity includes value, source time, source refs, and methodology, but excludes ingestion time and quality-only gap/staleness dimensions. The CLI admits only sources approved for internal research by the canonical license registry. Commercial redistribution remains fail-closed unless each source is separately approved.
