# Monitoring & Debugging

> Exact syntax: `vercel logs --help`, `vercel inspect --help`, `vercel metrics --help`, `vercel traces --help`, `vercel activity --help`, `vercel curl --help`, `vercel httpstat --help`, `vercel bisect --help`

## Diagnostic Ladder

For production issues, start broad and narrow with bounded commands:

1. Identify project and scope.
2. List recent deployments: `vercel list <project> --scope <team> --status READY --format json`.
3. Inspect the relevant deployment: `vercel inspect <deployment-url>`.
4. Check logs for a bounded window: `vercel logs <deployment-url> --since 1h --limit 100 --json`.
5. If metrics are available, inspect schema first, then query a relevant metric with a bounded time window and group-by.
6. If logs or metrics are unavailable, report the permission, subscription, retention, or no-data limitation and use deployments, activity, or inspect output as fallback evidence.

## Build Failure Ladder

For deployment build failures, start from deployment evidence before source
control exploration:

1. Inspect deployment metadata: project, team/scope, branch, commit, target,
   status, timestamp, and aliases.
2. Inspect build logs with `vercel inspect <deployment-url> --logs`.
3. Capture install command, package manager version, build command,
   monorepo/Turbo scope, restored build cache ID, and the first fatal error.
4. Reduce the first fatal error before chasing warnings.
5. If source is implicated, inspect only the app/package files, lockfile, build
   config, and files named in the trace.
6. Compare with a nearby successful deployment of the same project: commit,
   cache ID, install command, package manager version, build command, package
   scope, and source provenance.
7. Separate proven root cause from likely trigger.

For branch-specific failures, "other branches pass" does not by itself disprove
the root cause. Compare cache IDs, install graphs, lockfile/package diffs, build
command, package scope, and source provenance before explaining why one branch
fails.

Use confidence language in conclusions:

- Logs prove `<root cause>`.
- Branch comparison shows `<facts>`.
- Likely trigger is `<hypothesis>`.
- Not yet proven is `<remaining uncertainty>`.
- Validate by `<specific redeploy/test/check>`.

## Logs

Use `--follow` only for live debugging. Historical log queries should be bounded with `--since`, `--until`, and `--limit`.

## Metrics

Inspect schema before querying unfamiliar metrics. Use bounded time windows and group limits when grouping results.

## Inspecting Deployments

If a redeploy is meant to validate a build-cache or branch-specific hypothesis,
inspect or wait until the new deployment reaches `Ready` or `Error`; do not stop
at `Building` unless the user only asked to start the deployment.

## `vercel curl` — Access Preview Deployments

`vercel curl` handles deployment protection automatically — no need to manage bypass secrets.

## Request Traces

`vercel traces` fetches captured request traces for a project (`--open` renders them in a viewer). Useful when logs alone do not explain latency or routing behavior.

## Finding Regressions

`vercel bisect` performs a binary search across deployments to find which one introduced a problem.
