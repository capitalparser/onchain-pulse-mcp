# Task 2 report: finalized osETH and mETH quotes

## Scope

- Changed only `src/adapters/eigenlayer_lst_eth_quotes_rpc.ts` and
  `tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts`.
- The quote adapter now selects the exact noncontiguous base strategy indices
  `[0, 1, 2, 6, 11]`, validates the five exact covered identities, and caches
  only a verified v2 combined snapshot.
- One post-base batch has IDs 92 through 100: rETH (92--93), cbETH (94),
  StakeWise controller osETH conversions (95--96), Mantle Staking pointers
  (97--98), and Mantle Staking mETH conversions (99--100).
- Both Mantle pointers are decoded as strict ABI address words and compared
  before either mETH conversion result is accepted. No PriceFeed call is made.

## RED -> GREEN evidence

1. RED: `npm test -- tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts`
   failed 10 of 12 cases against the v1 three-call adapter, including the
   expected v2/noncontiguous/direct-batch assertions.
2. GREEN focused adapters:
   `npm test -- tests/adapters/eigenlayer_eth_restaking_rpc.test.ts tests/adapters/eigenlayer_lst_eth_quotes_rpc.test.ts`
   passed 63 tests (quote adapter: 28).
3. GREEN domain:
   `npm test -- tests/eigenlayer_lst_eth_quotes/types.test.ts tests/eigenlayer_lst_eth_quotes/metrics.test.ts`
   passed 13 tests.
4. `npm run typecheck` passed.
5. `git diff --check` passed.

## Full offline suite

`npm test` ran with no live RPC and produced 822 passed, 11 skipped, and
exactly 2 failed tests. Both failures are unowned Task 3 public-tool fixture
tests in `tests/tools/get_eigenlayer_lst_eth_quotes.test.ts`; their old
three-entry fixture now correctly fails Task 1's five-entry domain requirement
(`Exactly five ordered covered quote inputs are required.`). This task does not
weaken the v2 domain or modify public-tool files.
