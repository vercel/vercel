---
---

Fix flaky CLI unit CI caused by missing Go toolchain for packages depending on `@vercel-internals/ipc-proxy`.

- Add `needsGo` detection in `utils/chunk-tests.js` (mirrors `needsRust`) so any package depending on `@vercel-internals/ipc-proxy` or `@vercel/go` — notably the `vercel` CLI — gets Go installed via `actions/setup-go` instead of falling back to a network download.
- Update `.github/workflows/test.yml` to install Go when `matrix.needsGo` is true for both unit and e2e jobs.
- Harden `internals/ipc-proxy/build.mjs` Go fallback: validate cached GOROOT by checking `src/context/context.go`, retry download up to 3x with backoff, timeout fetches, and clean partial extracts to avoid poisoning retries (fixes `package context is not in std` / `TypeError: terminated` seen in run 29277311707).
