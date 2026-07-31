# EigenLayer OETH nominal quote v6 implementation plan

1. Add OETH at quote index 4/base index 5 and lock the nine-entry order and
   three-entry unquoted list with a literal RED-to-GREEN test.
2. Add nominal identity quote semantics, v6 schema/report context, and four
   permanent limitations while keeping broad metrics null.
3. Append finalized calls 114--119, strictly decode three pointers, uint64,
   ABI bool, and delay, and reject future rebase context.
4. Preserve prior IDs 1--113 and swETH/ETHx high-precision behavior; cover exact
   batches, negative evidence, zero/paused/delay context, stale v6, and no
   forbidden OETH calls.
5. Update English/Korean tool strings, server, README, CONTEXT, and live gate;
   run focused tests, full tests, typecheck, build, artifact import, and diff
   checks without live RPC, network, push, or merge.
