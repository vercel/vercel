---
---

Fix flaky/hanging CI caused by missing Go toolchain for packages depending on `@vercel-internals/ipc-proxy`.

- Add `needsGo` detection in `utils/chunk-tests.js` (mirrors `needsRust`) with transitive dep-graph walk, so any package depending (directly or transitively) on `@vercel-internals/ipc-proxy` or `@vercel/go` — notably the `vercel` CLI — gets Go installed via `actions/setup-go` instead of falling back to a network download.
- Update `.github/workflows/test.yml` to install Go when `matrix.needsGo` is true for both unit and e2e jobs, and add per-step `timeout-minutes` (25m unit, 35m e2e) so a hanging chunk fails fast instead of burning the full 120m job timeout.
- Harden `internals/ipc-proxy/build.mjs` Go fallback: scope the hard-fail guard to `GITHUB_ACTIONS` only (not the broader `CI` flag), so the Vercel deployment preview build — which sets `CI` but has no `needsGo` matrix and no preinstalled Go — can still use the timeout/retry-protected download fallback. For GitHub Actions jobs, fail fast with an actionable error when Go is missing (GH Actions jobs should have it via setup-go when needsGo is true). For local dev validate cached GOROOT by checking `src/context/context.go`, retry download up to 3x with backoff, timeout fetches (120s), and clean partial extracts to avoid poisoning retries. Fixes:
  - `package context is not in std` / `TypeError: terminated` seen in run 29277311707 (hard fail)
  - mac CLI unit chunks hanging >60m in run 29276172195 / job 86905800503 (unbounded fetch stall on macOS without system Go)
  - deployment build breakage seen after `CI`-scoped guard in 29284817917, which caused `Wait for deployment tarballs` failures in all E2E jobs.
- Harden `packages/cli/scripts/vitest-run.mjs`: replace `spawnSync` with async `spawn` + 20m watchdog that SIGTERM → SIGKILL on hang, preventing a leaked fork handle from holding the job open for 120m. Surfaces actionable `exit 124` on timeout.
