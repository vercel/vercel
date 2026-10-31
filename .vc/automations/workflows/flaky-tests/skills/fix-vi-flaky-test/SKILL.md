---
name: fix-vi-flaky-test
description: Set up the Factory sandbox for vercel-internal's tests, then reproduce and fix one flaky test that the flaky-tests workflow found, or add diagnostics for a shard hang.
---

# Fix a flaky test in vercel-internal

You were asked to fix one flaky test from `test.yml`, or to add diagnostics for a shard hang.
Your instructions list the attempts that failed and then passed on rerun, their branches, and log
lines. `code-change` covers publishing; this skill covers this repository's tests.

A test seen on one branch may be that pull request's own problem: check whether the pull request
changed the failing test or what it tests (`git log` on the pinned commit, or the run's PR). If it
did, finish without a change and say so.

## Set up the sandbox

The sandbox has Node and pnpm but no C compiler or Rust, and part of the build needs both. Its
Linux varies (Ubuntu with `apt-get`, or Amazon Linux with `dnf`). Run these once, from the
workspace root (about four minutes in all):

```bash
if command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq gcc libc6-dev; else sudo dnf install -y -q gcc; fi
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y -q --profile minimal --default-toolchain 1.96.1 --target wasm32-wasip2
```

Then install dependencies with `install_dependencies` and filter `vercel...`, and build what the
CLI's tests import:

```bash
. "$HOME/.cargo/env"
cd repo/packages/python-analysis && pnpm run build:wasm && cd ../..
pnpm --filter "vercel^..." run build
```

Use `pnpm --filter`, not `turbo`: Turbo also needs Cargo just to read the task graph. For a test in
another package, build `"<package>^..."` instead.

## Run the test

- One CLI unit test file: `cd repo/packages/cli && node ./scripts/test.mjs --run --retry=0 <file>`.
- One CLI Unit shard, the same files as `CLI Unit / … / 6/7`:
  `VITEST_SHARD=6/7 node ./scripts/test.mjs --run --retry=0 test/unit/` (about two minutes).
- Vitest retries every failed test three times in this repository. Always pass `--retry=0` when
  reproducing, and run the test or shard several times; a flaky test usually passes once.

## A hang: `[test] chunk timed out after 1200s`

`scripts/test.mjs` kills a test chunk after 20 minutes. The tests in it passed, but something one
of them started kept the Vitest worker alive: a server, socket, stream, timer, or child process
that was never closed. A plain log does not name the test; once the diagnostics below are in
`main`, it names the file that had not finished or that opened the leaked handle, and your Task
title is `Fix flaky test: <file> hang`. Start in that file's setup and teardown. Run the shard with
`--reporter=default --reporter=hanging-process` to print what is still open when the run ends, and
compare the log's last finished test files across the failed runs.

Known history: #1334 (closed without merging) found that `vercel deploy` returned without closing
its deployment-events stream, so the unit tests' mock server `close()` waited on that socket and
shard 6/7 hung right after `test/unit/commands/deploy/index.test.ts` passed. #992 later shipped
that teardown, and the shard still hangs on commits that include it, so that is not the cause.
Never raise the watchdog's timeout.

## Hang diagnostics (`Add hang diagnostics: …` Tasks)

A full run of the shard in the sandbox did not hang, so do not try to reproduce it. Make the next
CI hang name its test instead. Change `packages/cli/scripts/test.mjs` so that:

1. Vitest runs with `--reporter=default --reporter=hanging-process` (built into Vitest 4.1). When
   every test has finished but the process stays alive, it prints the handles keeping it open and
   the file that created each.
2. When the watchdog fires, the log says which test files had started and not finished. The
   default reporter prints a file only when it finishes, so add file start lines: a small custom
   reporter module passed with `--reporter=./scripts/<name>.mjs` that writes `[test] start <file>`
   and `[test] end <file> <ms>` to stderr, or an equivalent you can show working. Print the list
   of started-but-unfinished files from `test.mjs` right before it sends SIGTERM if you can track
   it; otherwise the start/end lines are enough to read it from the log.

Keep the normal output otherwise unchanged, keep the 20-minute timeout, and keep `--retry=0`
working. Run one shard locally with the change (`VITEST_SHARD=6/7 node ./scripts/test.mjs --run
--retry=0 test/unit/`) and paste the new lines in the PR. This is a CI change, not a product
change; the changeset is still required.

## Tests the sandbox cannot run

- Integration and E2E tests (`test/integration-*.test.ts`, `test-e2e*`, `test-dev`,
  `test-next-local*`) deploy to real Vercel and need `VERCEL_TOKEN` and `VERCEL_TEAM_ID`, which the
  sandbox does not have.
- Failures only on Windows or macOS jobs.

For these, fix a cause you can point to in the code and the logs, such as state left over between
retries or a missing wait, and say in the PR that you could not run the test here and why; the
PR's CI runs it. If you cannot point to a cause, end with `report_blocked` and what you checked.

## The pull request

Add a changeset as `AGENTS.md` describes. In the body, link the failed runs, then give the cause,
the fix, the exact commands you ran with their results, and what you could not run.
