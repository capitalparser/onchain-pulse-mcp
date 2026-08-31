# ADR-0007: Preserve Bounded MCP Tool Error Results

- **Status**: Accepted
- **Date**: 2026-08-31

## Decision

The current `0.x` MCP wire contract preserves exactly three bounded tool-result
errors:

```json
{"error":"unknown_tool"}
{"error":"invalid_arguments"}
{"error":"tool_execution_failed"}
```

Each is returned as one text content item with `isError: true`. The server does
not echo the requested tool name, rejected arguments, exception text, provider
payloads, URLs, or credentials. One shared constructor owns this schema for all
tools.

## Context

PR #53 replaced raw exception messages with bounded codes across the shared MCP
server. Existing consumers may now depend on those codes. The MCP tools
specification distinguishes protocol errors such as an unknown tool from errors
reported inside a tool result, while also allowing input-validation and API
failures to be returned with `isError: true` so a model can act on them.

Changing `unknown_tool` to a JSON-RPC protocol error immediately after the
bounded-result release would create a second compatibility change without a
versioned migration. This ADR therefore records the current behavior rather
than silently changing it during a Robinhood Chain follow-up.

## Compatibility boundary

- `unknown_tool`, `invalid_arguments`, and `tool_execution_failed` remain stable
  result codes for the `0.x` line.
- The public payload is the exact bounded object above; no diagnostic detail is
  added to it.
- Internal logs may gain diagnostics later only if they redact credentials,
  caller input, and raw provider payloads.
- A future major-version transport contract may move `unknown_tool` to a
  protocol-level error. That requires a migration note and consumer tests.
- Tools that successfully return a bounded `unavailable` or `partial` Snapshot
  have not failed at the MCP transport layer and must not use these error codes.

## Consequences

- Shared transport behavior is regression-tested independently of any one tool.
- Existing consumers keep their current parsing contract.
- The known specification alignment question is explicit and deferred to a
  versioned interface change rather than being hidden in feature work.

## Source

- [Model Context Protocol tools specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
