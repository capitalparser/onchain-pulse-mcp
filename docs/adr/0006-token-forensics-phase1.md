# ADR-0006: Token Forensics Phase 1 Uses A Separate Snapshot Schema

- **Status**: Accepted
- **Date**: 2026-05-26

## Decision

`get_token_forensics` returns a `ForensicsSnapshot` rather than reusing the
macro `ToolResponse` schema.

## Context

The existing `ToolResponse` schema is built around macro Pulse, Score, and
Reading. Token forensics needs top sellers, top accumulators, pool context,
windowed flows, payment/source gaps, and CEX deposit risk. Reusing the macro
schema would overload `reading` and hide missing-data limitations.

## Consequences

- Macro pulse tools keep `ToolResponse`.
- Token-level forensics uses `ForensicsSnapshot`.
- Future paid wallet-flow or x402 integrations must expose `sources`,
  `stale_data`, `confidence`, and `gaps`.
- The tool remains non-prescriptive: no buy/sell/hold language.
