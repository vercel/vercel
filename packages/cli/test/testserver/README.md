# Testserver tests

These tests run the built CLI against a Testserver sandbox: real `vercel/api` services with fake data, the same stack `vercel/front`'s Playwright suite uses. They sit alongside the mock-based unit tests and don't replace them.

Each test gets its own container (test id). A local proxy adds the `test-id` header and forwards to the sandbox, and the CLI runs with `--api <proxy>`. The CLI needs no changes for this.

## Running

From the repo root:

```bash
pnpm test-testserver                                 # all tests
pnpm test-testserver test/testserver/commands/whoami # one folder
```

Paths are relative to `packages/cli`. The root script runs `pnpm --filter vercel run test-testserver`, without turbo, so extra arguments go to Vitest. From `packages/cli`, `pnpm test-testserver` does the same. Neither needs a manual build: by default the runner sandbox builds the CLI (see below), and a local run builds it on your machine first with `turbo run build:package --filter=vercel`.

`pnpm turbo run test-testserver --filter=vercel` still works, and still builds the CLI on your machine first through the task's `dependsOn`, which CI relies on. In runner mode that build is wasted work.

Wherever Vitest runs, a global setup fails the run if `dist/version.mjs` doesn't match `package.json`, and warns if anything in `src/` is newer than `dist/index.js`. Both checks are skipped when `VERCEL_CLI_TEST_BINARY` is set.

### Where the tests run

By default the tests run in a **runner sandbox**: a fresh Vercel Sandbox in `iad1`, the same region as the Testserver sandboxes. The runner builds the CLI from your checkout, then runs Vitest, the proxies and the CLI processes. Your machine does no build work. Its output streams to your terminal with paths rewritten to your checkout, and failure artifacts are downloaded to the usual `.results/` folder. The runner is stopped and deleted when the run ends. Ctrl-C, SIGTERM and closing the terminal (SIGHUP) stop it too. Pressing Ctrl-C again doesn't skip the stop, because exiting early would leave the runner running until its timeout. If the stop takes more than 2.5 minutes, the wrapper gives up and says so. Most of that allowance is for a snapshot being saved when the signal arrives: the wrapper lets it finish so later runs can use it.

The run stays on your machine, and builds the CLI there first, when:

- `CI` is set (the workflow builds the CLI, so the wrapper doesn't);
- a Testserver base is a loopback or private address, such as `http://127.0.0.1:4000` for `vercel/api`'s local `pnpm testserver`, because the runner can't reach it;
- `VERCEL_CLI_TEST_BINARY` is set, because the runner only tests the `dist/` it builds (no build here either: the binary is under test);
- `TESTSERVER_RUNNER=local` is set. Use this to attach a debugger, for a test that depends on macOS behavior, or to debug a build problem. The runner is Linux on Node 22.

To build on your machine and only test in the runner, the flow before the runner built the CLI, set `TESTSERVER_RUNNER_BUILD=local`. The wrapper runs `turbo run build:package --filter=vercel` here, and the runner starts from a dependency snapshot (`pnpm install --filter vercel...`, keyed by the lockfile and workspace manifests, about 30s to build in a 4-vCPU sandbox), has 2 vCPUs per Testserver sandbox (up to 16), and gets one tarball with the built `dist/`, its runtime workspace dependencies' published files, and the lane's files. Use it when the runner build is the problem but you still want the tests off your machine.

There is no fallback. If the runner can't start or build (credentials, quota, a failed snapshot build, a patch that doesn't apply, a failed `pnpm install` or turbo build), the run fails with the reason and the tail of the output, and suggests `TESTSERVER_RUNNER=local`. A failed build on your machine with `TESTSERVER_RUNNER_BUILD=local` prints only the reason, because `TESTSERVER_RUNNER=local` builds the same way.

**How the runner builds.** The runner starts from a snapshot of your branch's merge-base, `git merge-base HEAD main`, computed from your local refs without fetching. When `main` is missing or shares no history with your branch, it uses `origin/main` instead; when neither works, the run fails and suggests `git fetch origin main` or `TESTSERVER_RUNNER_BUILD=local`. The snapshot holds the toolchains (git, gcc, the base's pnpm, uv and Go at the versions `.github/workflows/cli-testserver.yml` pins, the Rust toolchain and targets in the base's `packages/python-analysis/rust-toolchain.toml`, and a uv-managed Python), the base's tracked files committed to a git index, a full `pnpm install`, and a full `turbo run build:package --filter=vercel` in turbo's local cache. Each run then:

1. uploads `git diff --binary <merge-base>` of your working tree (committed, staged and unstaged changes) plus your untracked files that aren't ignored, and applies and commits them in the runner;
2. runs `pnpm install --frozen-lockfile` only when the lockfile or a workspace `package.json` differs from the merge-base;
3. runs `turbo run build:package --filter=vercel --cache=local:rw`, which rebuilds only the packages your branch changed and their dependents. Everything else, `@vercel-internals/ipc-proxy` included, is a hit in the snapshot's local cache. Its output is prefixed `[runner build]`. A branch that changes one of turbo's global inputs, such as `.gitattributes` or the root `turbo.json`, changes every task hash, so each run rebuilds everything: about 35–60s of build on the runner. That lasts until the change reaches `main` and a rebase picks it up.

The runner uses no Turbo Remote Cache and gets no credential beyond the sandbox's own. Untracked files are uploaded on every run, so a large stray artifact slows each run down; ignore or delete it.

**The snapshot.** The first run on a new merge-base (after a rebase onto a newer `main`, for example) builds a snapshot remotely in a separate 8-vCPU build sandbox. That takes about 2–3 minutes, and its output is prefixed `[runner snapshot]` between two `──` rules naming that sandbox. Later runs on the same merge-base usually start the runner in about 2–3s, and sometimes take up to 10s. Snapshots are keyed by the merge-base, the recipe version, the runtime and region, and the runner project (team and project). They are cached per machine in `${XDG_CACHE_HOME:-~/.cache}/vercel-cli-testserver/runner-snapshots.json`, shared by all worktrees, and expire after 7 days. Two worktrees on the same new merge-base may each build the same snapshot at once; the last one to finish wins the cache entry. The OIDC token and the `TESTSERVER_RUNNER_*` override use separate snapshots. The runner gets at least 8 vCPUs for the build, or 2 per Testserver sandbox (up to 16) when that is more, and a 60-minute timeout (`TESTSERVER_RUNNER_TIMEOUT_MINUTES`), which stops it if the wrapper dies without cleaning up.

### Getting a token

Creating a sandbox needs an OIDC token for the `vercel/vercel` project, the one linked to this repo. Testserver trusts that project's development tokens. You don't have to manage the token. When the wrapper needs one, it mints a fresh token with the `vercel` CLI on your `PATH`:

```bash
vercel project token vercel --scope vercel --format=json
```

This needs `vercel` 53.3.0 or later, the first with `project token --format=json`, and `vercel login` with an account on the `vercel` team. The token lasts 12 hours and is never written to disk or sent into the runner.

When minting fails, the wrapper names the cause and the fix instead of passing on the CLI's error, which reports a lapsed login as `You do not have access to the specified account`. A missing `vercel`, a network failure and a `vercel` older than 53.3.0 show in the mint's own output; otherwise one `vercel whoami` tells a lapsed login from an account that isn't on the `vercel` team.

The runner sandbox needs the token on every run, so the wrapper mints one each time, while it checks the sandbox cache. With `TESTSERVER_RUNNER=local`, the token is only needed when a Testserver sandbox has to be created. Setting `TESTSERVER_BASE` alone doesn't avoid the token: to run with no token, combine it with `TESTSERVER_RUNNER=local`, or point it at a loopback address such as `http://127.0.0.1:4000`.

`VERCEL_TRUSTED_OIDC_IDP_TOKEN` or `VERCEL_OIDC_TOKEN`, if set, is used instead of minting.

Runner sandboxes and snapshots belong to the token's project, `vercel/vercel`. To put them elsewhere, set all three of `TESTSERVER_RUNNER_TOKEN`, `TESTSERVER_RUNNER_TEAM_ID` and `TESTSERVER_RUNNER_PROJECT_ID`. Setting only some of them is an error.

### Sandboxes and the cache

A sandbox handles at most 4 concurrent test ids before service boot slows down (front's measurement), so the lane runs 4 Vitest workers per sandbox. Each worker uses the sandbox `(VITEST_POOL_ID - 1) % sandboxes` (`sandbox-pool.ts`), which keeps every sandbox at 4 or fewer running test files.

`pnpm test-testserver` picks the sandboxes like this:

1. `TESTSERVER_BASES` (comma-separated) or `TESTSERVER_BASE`, if set. Use `http://127.0.0.1:4000` for `vercel/api`'s local `pnpm testserver`.
2. Under `CI`, nothing: the CI job sets `TESTSERVER_BASE`.
3. Otherwise one sandbox per 4 test files, up to 8 (`TESTSERVER_SANDBOXES=<n>` changes the maximum). Files, not tests, because tests in a file run one at a time. The wrapper counts the files with `vitest list` and the same arguments, so path filters, `-t` and `--shard` lower the count. If it can't count them (an error, or no result in 60s), it uses the live cached sandboxes, or one new sandbox. `TESTSERVER_SANDBOX_COUNT=<n>` asks for exactly `n` sandboxes instead and skips the count, for example to try a run on 8 sandboxes when the files only need 2.
4. The pool lives in `<repo root>/node_modules/.cache/testserver/`. Cached sandboxes in its `sandboxes.json` that still respond and have at least 30 minutes left are reused, freshest first. Entries without `created` and `ttl` aren't reused. The rest are created in parallel (8 at a time) with a 300-minute TTL and added to the cache. Unused cached sandboxes stay cached for later runs. Delete the directory to force new sandboxes. Runs before this layout cached to `node_modules/testserver_sandboxes.json`; that file is no longer read, and its sandboxes expire with their TTL. `TESTSERVER_BUILD` pins a build; the default is the latest stable one.

With no token, the wrapper uses whatever cached sandboxes are alive, even if that is fewer than the count. A runner can't start without a token, so this works only with `TESTSERVER_RUNNER=local` or the runner override variables.

One run uses the pool at a time. The wrapper holds `sandboxes.json.lock` until it exits, and releases it on Ctrl-C, SIGTERM or SIGHUP too. A second run in the same checkout creates its own sandboxes without reading or writing the cache, so parallel runs never share a sandbox. It records each one in `pending/<pid>.json` as soon as it exists, and the next run that gets the lock adds them to the cache once that run has ended, however it ended (Ctrl-C included). Later runs reuse them like any cached sandbox. Both runs write failure artifacts under the same `.results/` folder, but each failed test gets its own test-id directory, so a test that fails in both runs keeps both artifact sets. A lock left by a process that no longer exists is replaced. Each worktree has its own `node_modules`, so separate worktrees don't share a pool.

Stale-lock recovery is serialized by a short-lived `sandboxes.json.lock.reclaim` directory. If a process is killed during recovery, that directory can remain and later runs cannot reclaim a stale lock; they create uncached sandboxes instead. After stopping all Testserver runs in this checkout, remove the `sandboxes.json.lock.reclaim` directory from the pool directory to restore automatic recovery. Do not remove locks or recovery guards while runs are active.

Concurrent runs in one checkout also share `packages/cli/dist`. A run that builds the CLI on this machine (`TESTSERVER_RUNNER=local`, `TESTSERVER_RUNNER_BUILD=local`, or `pnpm turbo run test-testserver`) writes `dist/`, so a second run started meanwhile can test or upload a half-written build. Default runner runs build in the runner and don't touch your `dist/`. Nothing guards against this. Don't start two runs that build on this machine in one checkout at the same time; use a separate worktree instead.

Vitest runs the tests in one file one at a time, so wall time is roughly the total test time divided by 4 × sandboxes, plus the longest file. Keep test files small. Once the suite outgrows 8 sandboxes, raise `TESTSERVER_SANDBOXES`.

Each test gets a fresh Testserver container, and the container is cold. Measured on 2026-10-19, running `vercel env ls` four times in each of four containers on one sandbox:

- The first `GET /v2/user`, `GET /teams/…` and `GET /v9/projects/…` in a container take 1.2–1.3s, 2.1–2.4s and 1.7–2.1s. The same calls later in that container take 50–100ms.
- The first `vercel env ls` in a container takes 5.6–6.0s; later runs in the same container take 0.44–0.59s.
- The warmup is per container, not per sandbox: a container started 45s into the run was as slow as the first one.

With about 2s to create a container, 1.1s for the auth check, about 5s of warmup and about 0.5s per warm command:

- Five one-command tests: about 5 × (2s container + 1.1s auth + ~5s warmup + ~0.5s work), roughly 43s of test time.
- One five-command test: about 2 + 1.1 + 5 + 5 × 0.5, roughly 11s.

### Skip and fail

- No sandbox (no `TESTSERVER_BASES`/`TESTSERVER_BASE`, no live cache) and no `CI`: if the wrapper can't mint a token or the token is rejected, it prints why and exits 1 without running the tests.
- Running `vitest` directly without `TESTSERVER_BASES`/`TESTSERVER_BASE` and without `CI`: every test is skipped.
- No `TESTSERVER_BASE` under `CI`: every test fails. A missing sandbox in CI is an infrastructure failure.

## Writing a test

Tests go in `commands/<name>/<action>.test.ts`, mirroring `test/unit/commands/<name>/`. `test/unit/testserver-layout.test.ts` enforces this.

```ts
import { testserverTest as test, expect } from '../../fixtures/test';

test('creates the project on the server', async ({ login, cli, api }) => {
  const { team } = await login();
  const name = `created-${randomUUID().slice(0, 8)}`;
  const r = await cli.run(['project', 'create', name]);
  expect(r.exitCode, r.stderr).toBe(0);
  const project = await api<{ accountId: string }>(`/v9/projects/${name}`);
  expect(project.accountId).toBe(team.id);
});
```

- Call `login()` first. It seeds a user, a pro team and a token, and makes them the defaults for `cli` and `api`. Use raw `factories` only for shapes `login` can't make.
- `cli.run(args, opts?)` adds `--api`, `--token`, `--global-config` and `--scope <team slug>`. Pass `scope: false` to drop `--scope`. Check the exit code first, with stderr as the message: `expect(r.exitCode, r.stderr).toBe(0)`.
- After a write, check server state with `api(path)` (parsed JSON, throws on errors) or `api.raw(path)` (the `Response`). Both add `teamId` and the token.
- Set explicit names or ids on anything you read back. Factory defaults come from a fixed seed and repeat across containers.
- stdin is closed, so pass `--yes` to commands that prompt.
- Use `env add --type config` when a test checks pulled values; the default secret type pulls as `[SENSITIVE]`.
- No sleeps. Wait on server state with `expect.poll(() => api(...))`.
- Seed inside each test. Don't share seeded data through `beforeAll`.

The first CLI command in a container takes about 5 to 7s while services cold-start, and tests time out at 60s. A single `cli.run` is killed after 45s (`timeoutMs` overrides it), and any CLI process still running when a test times out is killed too. `testServer.warmup(serviceIds)` can pre-warm services if timings get tight.

## Debugging

The run shows progress as it happens:

- The wrapper prints how many sandboxes it wants and why, how many cached ones responded, and a box with every sandbox and its logs URL. With a runner it then prints `[runner]` lines for the runner start and the upload. Vitest's own output comes from the runner and sits between two `[runner] ──` rules: the first names the runner, the last gives Vitest's exit code. Paths in that output are rewritten to point at your checkout. It ends with a summary: `[testserver] total 45.1s: sandboxes 0.6s (2 reused, 0 created), runner: snapshot hit 0.0s, start 2.4s, upload 0.1 MB 0.3s, apply 0.4s, install skipped, build 12.3s, tests 27.0s, results 0.2s`. With `TESTSERVER_RUNNER_BUILD=local`, the runner phases start with `laptop build 20.1s`. Local runs end with `..., build 20.1s, tests 31.9s` instead, or `..., tests 31.9s` when they skip the build. With more than one sandbox, the `creating container` and `container ready` lines name the sandbox (`on sandbox 2/3`).
- During the run, `test/testserver/progress-reporter.ts` prints one line per step, prefixed with the time since the run started and the worker:

  ```
  +3.4s   w1  whoami > prints the logged-in username           container ready 3.3s
  +3.7s   w1  whoami > prints the logged-in username           seeded users 0.2s
  +6.1s   w1  whoami > prints the logged-in username           auth check 2.0s
  +6.1s   w1  whoami > prints the logged-in username           $ vercel whoami …
  +12.7s  w1  whoami > prints the logged-in username           ✓ exit 0 in 6.6s, 2 API requests
  +13.1s  w1  whoami > prints the logged-in username           ✓ passed 12.9s (container 3.3s | seed 0.7s ×3 | auth 2.0s | cli 6.6s ×1 | other 0.0s | teardown 0.4s)
  ```

  Lines from different workers at the same time are tests running in parallel. A CLI command still running after 10s prints `… still running` every 10s. `container` is `PUT /_/test`, `seed` is factory calls, `auth` is the `/v2/user/authenticate` check in `login()`, and `other` is the test's own code, such as `api` reads. CLI commands leave out the fixture-added `--api`, `--token` and `--global-config`.

The fixtures send these events with Vitest's `recordArtifact` (`fixtures/progress.ts`), so they arrive while the test runs. Passing `--reporter` on the command line replaces the configured reporters; add `--reporter=./test/testserver/progress-reporter.ts` to keep the progress lines.

When a test fails, its teardown writes `packages/cli/test/testserver/.results/<file>/<test-id>/`:

- `testserver.log.json`: the container's log (`/_/log?incomplete=true`)
- `factories.log.json`: every factory call and response
- `requests.json`: every request the CLI sent through the proxy, with status and timing
- `cli.json`: every CLI run's args, cwd, exit code, stdout and stderr

Token secrets are redacted. It also prints one stderr line with the test id, sandbox URL, logs URL (`<sandbox>/raw?testId=<id>`) and artifact folder.

With a runner, the wrapper downloads `.results/` after the run and merges it into your local folder, so the printed artifact folder is a local path. To step through a test in a debugger, run it with `TESTSERVER_RUNNER=local`.

## Not built yet

- Reusing one runner per worktree across runs. Each run starts a fresh runner.
- Splitting a run across several runner sandboxes (`vitest --shard`), for when the pool outgrows one runner.

- `scenarios`: shared multi-entity setups, added when a shape repeats across files.
- `authenticator.withToken`: authenticate with an existing token.
- Factory types for domains, aliases and other entities, added with the first tests that use them.
