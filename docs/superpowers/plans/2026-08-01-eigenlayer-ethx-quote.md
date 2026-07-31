# EigenLayer ETHx quote implementation plan

1. Add ETHx as the fourth exact covered strategy, move it from unquoted
   coverage, add its three permanent gaps, report context, and v4 schema.
2. Make the finalized RPC adapter append IDs 104--111, verify all pointers,
   decode the exact oracle tuple, and reconcile both direct full-precision
   conversions fail-closed.
3. Update public text, MCP description, README, CONTEXT, live gate, and tests
   without widening the two partial aggregates or seven null boundaries.
4. Verify focused tests, full tests, typecheck, build, generated artifact
   import, and source/artifact diff. No live RPC calls are part of this plan.
