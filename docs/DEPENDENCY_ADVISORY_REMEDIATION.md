# Dependency Advisory Remediation

Date: 2026-08-31  
Runtime checked: Node.js 24.15.0, npm 11.12.1

## Outcome

| Audit scope | Before | After |
|---|---:|---:|
| Full dependency graph | 14: 1 low, 5 moderate, 7 high, 1 critical | 1 low |
| Production dependencies (`--omit=dev`) | Not separately recorded in PR #53 | 0 |

The critical Vitest advisory and all previously reported moderate/high runtime
transitives were removed without `npm audit fix --force` or an out-of-range
override.

## Controlled upgrades

- `@modelcontextprotocol/sdk`: 1.29.0 to 1.30.0
- `cheerio`: 1.0.0 to 1.2.0
- `vitest`: 2.1.9 to 4.1.11
- compatible lockfile refreshes include `@hono/node-server` 2.1.1, Hono
  4.13.5, Undici 7.29.0, `ip-address` 10.7.0, `qs` 6.16.0, and other
  patched transitives

Vitest 4 officially requires Node.js 20 or newer and Vite 6 or newer. This
repository already requires Node.js 24. Two test helper return annotations that
discarded their callable mock signatures were removed for the Vitest 4 type
contract; test behavior was unchanged.

## Residual advisory

The full graph retains one low-severity advisory:

- `esbuild` 0.27.7 via the development-only Vitest/Vite, tsup, and tsx toolchain
- advisory: Windows development-server arbitrary file read
- production audit: not present
- repository runtime: read-only Node.js MCP/CLI; it does not expose the esbuild
  development server

The current upstream dependency ranges select esbuild 0.27.x. Forcing 0.28.2
through an npm override would place multiple build tools outside their declared
ranges, so this remediation does not do that. Remove the final advisory when
supported Vitest/Vite, tsup, and tsx releases accept a fixed esbuild range.

## Verification commands

```text
npm audit
npm audit --omit=dev
npm run typecheck
npm test
npm run build
```

## Sources

- [Vitest 4 migration guide](https://vitest.dev/guide/migration)
- [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)
