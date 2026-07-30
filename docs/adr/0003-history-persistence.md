# ADR-0003: v0.1 History Persistence (Filesystem Ring Buffer)

- **Status**: Accepted
- **Date**: 2026-05-09
- **Decider**: Kim Kyung-jun
- **Driver**: ADR-0002 finding A1 (composite pulse score degenerates without history)

## Decision

v0.1 ships with a **filesystem-backed 30-day ring buffer** for the seven composite-input series. `handleMarketPulse` loads history at call time, appends the latest datapoint (deduped by 24h key), and feeds the loaded series into `computePulseScore`. Default location: `~/.cache/onchain-pulse-mcp/history.json` (overridable via `OPM_HISTORY_PATH` env or `pulse.yaml` `history_path`).

A separate CLI subcommand `npx onchain-pulse-mcp warmup` seeds the buffer by calling adapters once per simulated day across the last 30 days, using whatever historical endpoints each adapter supports. Adapters without a historical endpoint contribute progressively as the buffer fills over real elapsed days.

## Reconciliation with Spec §"Non-goals" N5

Spec §2 N5 reads "영속 저장소 (DB·Redis 안 씀, in-memory cache only)". This ADR amends N5: persistence ban applies to **shared/multi-process state stores** (DB, Redis, network filesystems). Per-installation local cache files are not state — they are an offline materialisation of inputs that adapters could fetch on demand if external endpoints permitted, which they do not at sufficient density for free-tier callers.

The MCP API surface remains stateless: every tool call returns a complete `Snapshot`; no server-side per-caller state; no session memory. The history file is shared across calls but is read-mostly and idempotent under correct write semantics (see "Concurrency" below).

This amendment is documented here rather than rewriting spec §2 N5, so the non-goal text continues to set the right expectation for B/A view persistence (which remains forbidden).

## Considered options

| Option | Verdict |
|---|---|
| Per-call historical fetch from Defillama / Coinglass | **Rejected**. 7 keys × 30 days = 210 datapoints fetched per `get_market_pulse` call. Free-tier rate limits exceeded in single-digit calls. |
| Cloud-hosted shared history (S3 / hosted DB) | **Rejected**. Pulls v0.1 into v0.4 HTTP-transport scope; OSS self-host model inverted. |
| Disabled composite score (ship raw tools only, defer composite to v0.2) | **Considered, rejected**. Equivalent to A1 option (b) — honest but cuts the headline tool. User chose A1-(a). |
| **Filesystem ring buffer (per installation)** | **Accepted**. Survives process restart, no external service, deterministic, testable. |

## Design

### Module: `src/pulse/history.ts`

```typescript
export interface HistoryStore {
  load(): Record<string, number[]>;                    // returns {key → [oldest..newest]}
  appendDatapoint(key: string, value: number, asOf: Date): void;
  save(): Promise<void>;                               // atomic write (tempfile + rename)
}

export function makeFileHistoryStore(opts: {
  path: string;
  windowDays: number;        // default 30
  dedupHours: number;        // default 24 — one datapoint per (key, day)
}): HistoryStore;
```

### Storage format

```json
{
  "version": 1,
  "window_days": 30,
  "series": {
    "etf_7d_net_flow_btc_eth": [
      { "asOf": "2026-04-10T00:00:00Z", "value": 120000000 },
      { "asOf": "2026-04-11T00:00:00Z", "value": 90000000 }
    ],
    "stablecoin_7d_supply_delta": [ ... ]
  }
}
```

Trim policy: on each `save()`, drop entries older than `now - window_days`. Append only if `asOf` exceeds the latest entry's `asOf` by `dedupHours` or more.

### Concurrency

- Same process, multiple `get_market_pulse` calls: tolerable race window is small (one datapoint per 24h dedup), but to prevent torn writes the store performs **atomic rename**: write to `history.json.tmp`, fsync, then `rename()` over `history.json`.
- Multi-process (two installations sharing the same file): out of scope. Default path is per-user `~/.cache/`; users running parallel servers should set distinct `OPM_HISTORY_PATH`.
- Read-during-write: callers may read a slightly older snapshot. Acceptable — at most one missed datapoint, regenerated on the next call.

### Warmup CLI

```bash
npx onchain-pulse-mcp warmup [--days 30] [--key etf_7d_net_flow_btc_eth,...]
```

Fetches whatever historical density each adapter offers:

| Key | Source | Density |
|---|---|---|
| `etf_7d_net_flow_btc_eth` | Farside Investors (daily CSV scrape) | Full 30d |
| `stablecoin_7d_supply_delta` | Defillama `/stablecoins` daily history | Full 30d |
| `btc_dominance_7d_delta` | CoinGecko `/global` (current only — single point) | 1d, then real-time accrual |
| `rwa_tvl_7d_delta` | Defillama `/protocols/{rwa}` history | Full 30d |
| `funding_avg_btc_eth` | Deribit `get_funding_rate_value` (range query) | Full 30d |
| `options_put_call_ratio` | Deribit options chain (current only — single point) | 1d, then real-time accrual |
| `upbit_netflow_7d_kr` | Upbit volume API (recent only) | 1d, then real-time accrual |

3 of 7 keys hydrate fully; 3 accrue over real elapsed days. `confidence` reflects this honestly via `activeWeightSum` once enough samples exist (≥5 per key).

### Config additions (`config/pulse.yaml`)

```yaml
history:
  path: ~/.cache/onchain-pulse-mcp/history.json   # overridable by OPM_HISTORY_PATH
  window_days: 30
  dedup_hours: 24
  min_samples_for_zscore: 5    # below this, contribute z=0 (existing behaviour)
```

## Test strategy

- **Unit (`tests/pulse/history.test.ts`)**: tmpfile path; round-trip load/append/save; trim past window; dedup within window.
- **Integration (`tests/server.test.ts` extension)**: with seeded `history.json` containing ≥5 samples for all 7 keys, `get_market_pulse` returns `score !== 50` and `confidence === 1.0`.
- **Warmup (`tests/cli/warmup.test.ts`)**: mocked adapter responses; assert ring buffer populated with expected daily cadence.
- **Regression (T1 from ADR-0002)**: explicitly exercise the production path with empty file → first call writes one datapoint → second call (same day) does not duplicate.

## Consequences

- One new src module (`pulse/history.ts`), one new CLI command, one config section, three test files. Plan grows by ~150 lines (Task 8.5).
- `handleMarketPulse` becomes responsible for one filesystem read + one filesystem write per call. Cache TTL on adapter side already prevents excess external calls; history I/O is local and small (<100 KB).
- Plan's `Out of scope` first bullet is removed (history is now in scope).
- Acceptance criteria gain: `warmup` seeds ≥5 samples per supported key; `get_market_pulse` after warmup returns non-50 score for the golden fixture-equivalent scenario.

## Follow-ups

- [ ] Cross-platform path resolution: `~/.cache/` is XDG default on Linux; macOS uses `~/Library/Caches/`; Windows uses `%LOCALAPPDATA%`. Codex implementation should use `env-paths` or equivalent.
- [ ] Backup / migration strategy if the schema changes in v0.2 — `version: 1` field in the JSON envelope already anticipates this.
- [ ] Clear-cache / reset CLI subcommand: `npx onchain-pulse-mcp reset-history`. Defer to v0.2 unless trivial.
