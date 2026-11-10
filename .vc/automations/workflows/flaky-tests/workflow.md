---
description: Find flaky tests in test.yml from passing reruns; request a fix for each named test and diagnostics for each hang
on: { every: 6h }
experimental_board:
  space: cli-health
actions:
  github.read_actions: { workflows: [test.yml] }
  factory.request_change: { maxPerDay: 3, labels: [flaky test fix] }
---

This workflow keeps `.github/workflows/test.yml` free of flaky tests. A scheduled run finds them
and calls `request_change` once for each. Every request starts a code-change Task that receives
these same instructions. If you are that Task, go to "Fixing a flaky test" at the end.

For both discovery and code-change Tasks, load the experimental-board skill. Before investigating,
read related findings and threads for the same test, hang or CLI symptom; support discovery shares
this space. Use linked Tasks and PRs for context; verify current evidence with the available
tools and existing-work checks before reusing it. The board does not replace log evidence,
reproduction or request keys.

Share useful evidence, failed hypotheses, questions and actionable next steps while working,
linking the originating Task and relevant run, test path or PR. Read relevant replies before
requesting a change or finishing; respond to corrections and link the outcome back to the original
thread, including unresolved blockers. Do not post routine status logs or request duplicate work.
Posting a finding or fix does not wake another agent or start a review.

## Finding flaky tests (scheduled run)

`test.yml` runs only on pull requests to `main`. When someone hits a flaky test, they rerun the
failed jobs and the rerun passes. Those reruns are the strongest evidence of a flaky test, so start
there.

### 1. Find reruns that passed

List the last 7 days of `test.yml` runs with `list_workflow_runs`, using `days: 7` and
`conclusion: success`, and follow `nextPage` until it is null; every page stays within those 7 days.
Keep every run whose `attempt` is above 1: it was rerun and then passed.

For each of those runs, call `list_run_jobs` with `attempt: 1`. The jobs that failed in attempt 1
failed and then passed on the same commit. Ignore the `Summary` job; it only reports other jobs.

### 2. Read why each first attempt failed

For each failed job from step 1, call `read_job_log` with `match` set to
`[" FAIL ", "AssertionError", "(retry x", "chunk timed out", "watchdog", "Test Files", "being used by another process"]`.
Read the lines around a match with `offset` and `limit` when you need the error. What the matches
mean here:

- ` FAIL  <file> > <suite> > <test>` names a failing test, and `AssertionError` its error.
- `× <test> (retry x3)` failed on all three Vitest retries in that attempt.
- `[test] chunk timed out after 1200s` or `watchdog timeout` means the shard was killed because
  something in it hung. The log does not name the hung file.
- `being used by another process` is a Windows file lock.

Read at most about 60 job logs. When the same job name fails in runs from two or more branches,
read one log from each of up to three branches before deciding what failed; do not judge a job
from a single branch's log. When it fails the same way in several runs, count the rest from
`list_run_jobs`.

### 3. Group and rank

Group the failures by the tests that failed, not by the error text: two failures are the same
group when they name the same failing test in their `FAIL` or `×` lines, even if the errors
differ. A hang groups by shard, unless its log names the test file that had not finished
(`[test] start <file>` with no matching `end`) or the file that opened a handle still open (the
`hanging-process` reporter prints it); then it is a **located hang**, grouped by that file. For each
group, count the reruns, the distinct branches, and the jobs (operating system and Node version)
it hit.

Rank named tests and located hangs together, by distinct branches and then by reruns. Rank
unlocated hangs separately, the same way; they get their own request slot below.

### 4. Request fixes

A group is a flaky test to fix when all of these hold:

- It names a failing test in a `FAIL` or `×` line, or it is a located hang whose log names the
  file. One branch is enough: the rerun passed on the same commit, so the test itself is
  intermittent. (The fix Task still checks whether that pull request's own changes caused it.)
- It is not infrastructure. These are infrastructure here, never flaky tests: `Setup Turborepo
  Remote Cache` failing with HTTP 503 or 504; Cargo, crates.io, DNS, or HTTP/2 download errors;
  pnpm or npm registry errors during install; a Windows file lock on the runner's own files during
  setup; deployments rejected because Node 20 is discontinued; and cancelled runs.

An unlocated hang (`chunk timed out` or `watchdog`, and no file named) that hit two or more
distinct branches gets a **diagnostics** request, not a fix: a fix guessed from the last finished
file does not reproduce. The diagnostics change makes the next hang name its file; the run after
that requests the fix as a located hang.

Call `request_change` for at most three groups per run: the two highest-ranked named tests or
located hangs (both are fixes), then the highest-ranked unlocated hang that qualifies (a
diagnostics request). The third slot is only for an unlocated hang: fixes never take it, and a
run requests at most one unlocated hang. Use these keys exactly, so later runs recognize the
same problem:

- A failing test: its name as the `FAIL` line prints it, `<file> > <suite> > <test>`, such as
  `test/unit/commands/deploy/index.test.ts > deploy > creates a deployment`. Title:
  `Fix flaky test: ` and the test name.
- A located hang: `hang:` and the file as the log prints it, such as
  `hang:test/unit/commands/deploy/index.test.ts`. Title: `Fix flaky test: ` and the file,
  then ` hang`.
- An unlocated hang: `diagnose:` and the job name without the runner and Node version, such as
  `diagnose:CLI Unit / 6/7` for `CLI Unit / ubuntu-latest/node24 / 6/7`. Title:
  `Add hang diagnostics: CLI Unit shard 6/7`.

In the problem, give the reruns and distinct branches, the jobs it hit, two or three run and job
links, the log lines that show the failure, and your best guess at the cause in one sentence. For
a hang, also give the last test files the log shows finishing before the watchdog fired.

When `request_change` returns `existing`, that problem is already being handled or was handled
recently; do not request it again under another key. When it returns `deferred`, stop requesting.

Finish with the ranked list of groups, which ones you requested and the Task each returned, and
which you skipped and why.

## Fixing a flaky test (code-change Task)

Load the `fix-vi-flaky-test` skill and follow it, after `code-change`. The findings in your
instructions are what the scheduled run saw; read the linked logs yourself before you decide
anything.

If the title starts with `Add hang diagnostics`, follow the skill's "Hang diagnostics" section
instead of reproducing the hang.
