# CLI subprocess scenarios

These tests run the built CLI (`scripts/start.js` → `dist/index.js`) in a fresh
Node process for each scenario. Each scenario gets its own fake loopback API,
temporary home, global config, and workspace. No credentials or outbound network
access are required.

```bash
cd packages/cli
pnpm build
pnpm test test/scenario/
```

Local runs fail if `dist` is missing or older than `src/`. In CI, Turbo builds
the CLI before `test-unit` through `build:package`.

## Boundary

- `harness/guard.cjs` is preloaded into the CLI process. It allows TCP only to
  the scenario API port on loopback and records/blocks other sockets, UDP,
  non-loopback DNS lookups, and nested child processes.
- The child environment is constructed from scratch. Host credentials, proxy
  variables, `NODE_OPTIONS`, `HOME`, and XDG directories are not inherited.
- Every workspace has `.vercel/repo.json`, so repo-root lookup stops before
  `git rev-parse`.
- Unhandled API routes return 404 (not retried) and are recorded in
  `api.unhandled`; scenarios assert that list is empty.
- App-principal scenarios use `VERCEL_CLI_INTERNAL_TEST_OAUTH_ISSUER` to point
  OAuth discovery and introspection at the loopback fake API. The CLI accepts
  only a literal `http://127.0.0.1:<port>` or `http://[::1]:<port>` origin.
- For API error scenarios, use a 4xx other than 403 or 429 unless the test
  targets that status. `Client.fetch` retries 5xx responses with backoff and
  waits for Retry-After plus up to 30s of skew on 429. Endpoints often map 403
  to `InvalidToken`. Never return SAML errors with a `teamId`, because they
  start reauthentication.

The fake API checks wire behavior against small fixtures. It does not prove live
API conformance, so keep direct unit tests and live integration tests.
