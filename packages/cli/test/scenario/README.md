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
- The CLI needs no test-only configuration. Most scenarios pass
  `--api <fake origin>`. Scenarios that need OAuth (app principals) run with
  the production API origin instead, because the CLI refuses token
  introspection for custom API origins. For those runs, the guard rewrites
  `fetch` requests for `https://vercel.com` and `https://api.vercel.com` to
  the fake API (`routeProductionOrigins`).
- For API error scenarios, use a 4xx other than 403 or 429 unless the test
  targets that status. `Client.fetch` retries 5xx responses with backoff and
  waits for Retry-After plus up to 30s of skew on 429. Endpoints often map 403
  to `InvalidToken`. Never return SAML errors with a `teamId`, because they
  start reauthentication.

The fake API checks wire behavior against small fixtures. It does not prove live
API conformance, so keep direct unit tests and live integration tests.

## Portable world-state scenarios

`portable/` holds scenarios that a second-language runner (for example the Go
port) can consume without Node or TypeScript. Each scenario states an input
`world` (server entities and persisted local CLI state), `conditions` (faults),
an `invoke` (argv and token), and the expected outcome, stdout, API operations,
and full world after. `portable/RUNNER-CONTRACT.md` is the normative contract.

- Author scenarios as typed object literals in `portable/cases/`, and fake API
  conformance vectors in `portable/vectors/`. Helpers in `portable/authoring/`
  only compose worlds; write every expected answer literally.
- The Zod schemas in `portable/model/` and the TS sources are the only source
  of truth. Nothing generated is checked in. `portable/runner/load.ts` builds
  the artifacts in memory, and the rest of the runner reads only those
  serialized artifacts.
- Run `pnpm scenarios:generate [outDir]` in `packages/cli` to export the
  canonical JSON for another runner. The default `outDir` is
  `portable/generated/`, which is gitignored.
- `portable.test.ts` runs each generated scenario through
  `portable/runner/`.
  `fake-api-vectors.test.ts` checks the world-driven fake API against the
  vectors.

These tests stay TypeScript-only because they depend on the Node preload guard
or test the harness itself:

- `guard.test.ts`;
- `whoami.test.ts`: the Git fallback without a repo link, and a missing route.
