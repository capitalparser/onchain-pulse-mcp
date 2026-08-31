# Immutable intelligence research export

The `intelligence-export` command creates an offline, checksum-bound source
artifact for `upbit-autotrader-research`. It reads only the configured
append-only intelligence JSONL store and does not call a network source.

```bash
OPM_INTELLIGENCE_HISTORY_PATH=/sealed/input/intelligence-history.jsonl \
npm run intelligence-export -- \
  --output /new/immutable/path/onchain-research-export.json \
  --cutoff-at 2026-08-31T00:00:00.000Z \
  --source-commit <exact-40-character-commit> \
  --metric-key eth.net_issuance_eth
```

Repeat `--metric-key` for additional candidate metrics. The command refuses to
overwrite an existing output.

The artifact contains:

- the canonical repository and exact source commit supplied for the audited
  checkout;
- a frozen feature-registry subset and checksum;
- a frozen source-license registry and checksum, including a separate internal
  research admission status;
- only observations whose `observed_at` and `ingested_at` do not exceed the
  cutoff;
- data-quality range/count metadata and a whole-export checksum.

An absent or empty store produces zero observations and the explicit gap
`no_observations_at_cutoff`. It is a valid audit artifact but not market
evidence and cannot satisfy a research data-readiness gate. A source with
`commercial_contract_required`, `blocked`, or unknown licensing is not admitted
for internal research by this export contract.

The command does not choose a hypothesis metric, threshold, transformation, or
outcome horizon. Supplying a metric key means only “include this canonical
series if present.” Research remains responsible for its human-reviewed
operationalization and untouched-evaluation policy.
