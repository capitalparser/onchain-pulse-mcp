# Task 1: Five-Token v2 Domain and Partial Metrics

## Scope

- `src/eigenlayer_lst_eth_quotes/types.ts`
- `src/eigenlayer_lst_eth_quotes/metrics.ts`
- `tests/eigenlayer_lst_eth_quotes/types.test.ts`
- `tests/eigenlayer_lst_eth_quotes/metrics.test.ts`

No RPC adapter, public tool, server, package, documentation, network, live,
push, or PR change was made.

## RED evidence

Before production edits, the required focused command was run:

```text
npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
exit 1; 8 failed, 5 passed
```

The observed failures were the expected v1/three-token behavior: the covered
strategy constant omitted osETH and mETH, the unquoted set still contained
them, v2 snapshots did not parse, and the builder threw `Exactly three ordered
covered quote inputs are required.` for a five-entry fixture.

## GREEN evidence

After the domain-only implementation:

```text
npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts
exit 0; 2 files passed, 13 tests passed

npm run typecheck
exit 0

git diff --check
exit 0
```

The focused tests cover the exact `stETH,rETH,cbETH,osETH,mETH` order and
identities; v2/5-of-12 coverage; seven unquoted labels; direct rETH/osETH/mETH
quotes; cbETH nonzero-rate floor arithmetic; zero values; all permanent gaps;
atomic unavailable evidence; malformed, non-bigint, negative, missing,
uint256, product, and sum failures; and direct/rate contamination rejection.

## Full offline suite status

```text
npm test
exit 1; 67 files passed, 2 failed, 9 skipped; 801 tests passed, 22 failed, 11 skipped
```

The 22 failures are all in unowned v1 consumers scheduled for later plan
tasks: 20 in `tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts` and 2 in
`tests/tools/get_eigenlayer_lst_eth_quotes.test.ts`. They still construct or
assert the three-token/v1 adapter and public-tool contract. No out-of-scope
file was changed to mask those pending Task 2/3 failures.
