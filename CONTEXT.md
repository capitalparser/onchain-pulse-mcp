# CONTEXT.md — onchain-pulse-mcp

> Mattpocock-style domain dictionary. **Status: SEED** — awaiting `/grill-with-docs` to populate.

## Why this file exists

Codex and future contributors should be able to read this single page and use the *right names* for the *right things* in this codebase. Until `/grill-with-docs` runs, the terms below are provisional and may shift.

## Provisional ubiquitous language (subject to revision)

| Term | Provisional meaning | Source |
|---|---|---|
| **Mood (mood score)** | Composite 0–100 reading of onchain market risk appetite | spec §5.4 |
| **Verdict** | Bucketed mood: `risk-off` / `neutral` / `risk-on` / `unknown` | spec §5.3 |
| **Adapter** | Per-source data fetcher with free + optional BYOK paths | spec §5.1 |
| **BYOK** | Bring-Your-Own-Key — env-var-supplied paid API keys for enrichment | spec §5.6 |
| **Enriched** | Capability flag indicating BYOK key was used for this response | spec §5.3 |
| **Stale data** | List of sources that returned cached or fallback values, surfaced per response | spec §7 |
| **Confidence** | 0–1 ratio of input weight present vs total weight (renormalisation factor) | spec §5.4 |
| **Kimchi premium** | Korea-specific BTC/ETH price spread vs global USD price (proxied via USDT/KRW) | spec §5.1 (kr_layer) |
| **Funding reverse** | Sign-flip of funding rate contribution when |z| ≥ threshold (overheated positioning) | spec §5.4 |
| **Composite** | The act of combining 7 weighted-z inputs through sigmoid into a single mood score | spec §5.4 |

## Open domain questions for `/grill-with-docs`

1. Is "mood" the right top-level frame, or do users distinguish "regime" (longer-horizon) from "mood" (intraday)?
2. Is "verdict" overloaded? It implies normative; a neutral-only frame may serve agents better than risk-on/off.
3. Does the BYOK terminology need clearer per-key roles (enricher vs replacer)?
4. Is "adapter" the right boundary unit? (vs "source", "fetcher", "channel")
5. Korea layer terms — is "kimchi premium" idiomatic enough for an English-default OSS, or should the field be `kr_premium` exclusively in code?

## Glossary maintenance

When `/grill-with-docs` runs, replace this seed entirely with the agreed ubiquitous-language glossary. Any subsequent term additions during implementation must update both this file and the relevant ADR.
