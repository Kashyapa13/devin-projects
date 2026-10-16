# @company/testing

Testcontainers Postgres, deterministic seeds, k6 builder, Playwright
keyboard-mode helpers.

## API

- `pgHarness(app, image?)` — disposable Postgres (Testcontainers), DB
  name = app name; `{dsn, dbName, stop()}`.
- `defineSeeds({name: fn})` → registry; `runSeeds(db, registry, name,
  seedValue=42)` — deterministic fixtures via `mulberry32` PRNG.
- `k6ScenarioBuilder({name, baseUrl, vus, duration, requests,
  thresholds})` → k6 JS source.
- `keyboardMode(page)` — `pressSeq(keys)`, `expectFocusOrder(getFocused,
  expected)`; takes a minimal `PageLike` (Playwright `page` satisfies it).

## Usage

```ts
const pg = await pgHarness("fastlane");           // real PG, per-app DB
await runSeeds(pg, seeds, "kyc-seed-v1");         // synthetic only
const script = k6ScenarioBuilder({ ... });        // apps/*/scripts/perf/
```

Self-test: `tests/dummy-app.test.ts` runs a named seed against a real
Testcontainers PG (skips gracefully without docker).
