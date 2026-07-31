# EigenLayer swETH quote v5 implementation plan

1. Add swETH at fixed quote index 5 and base strategy index 7; reduce the
   unquoted legacy list to four entries.
2. Add strict output/report-context schemas, exact rate floor arithmetic, and
   permanent gap accounting. Preserve only two partial aggregate metrics.
3. Append finalized RPC IDs 112--113, validate the default and timestamp
   relation, and version the standalone cache to v5.
4. Cover the literal RED-to-GREEN contract with domain, arithmetic, malformed
   response, batch, tool-localization, and live-gated tests.
5. Update English/Korean public boundaries and run focused tests, full tests,
   typecheck, build, and artifact import without live RPC, push, or merge.
