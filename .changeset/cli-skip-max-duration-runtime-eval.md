---
'@vercel/build-utils': minor
'vercel': patch
---

Evaluate the `maxDuration` upper bound at validation time so `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` works regardless of import order.

The gate was read when `@vercel/build-utils`' `functionsSchema` was constructed and when the CLI compiled its `vercel.json` validator — both at module load. Any process that imports these modules before setting the env var baked in the default 900-second maximum and ignored the flag, failing with `Invalid vercel.json - functions[...].maxDuration should be <= 900`.

`@vercel/build-utils` now exposes `getFunctionsSchema()`, which reads the limit at call time (the existing `functionsSchema` const is kept but deprecated). The CLI builds and compiles its config validator lazily, caching one validator per resolved limit, so setting the variable after import takes effect. Default behavior is unchanged — the 900s maximum, the lower bound, and the integer check are all still enforced when the variable is unset.
