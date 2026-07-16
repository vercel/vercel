# Monitoring & Debugging

Observability from the CLI: deployments, logs, metrics, activity, and regression hunting. Run `vercel logs --help`, `vercel metrics --help`, `vercel inspect --help`, etc. for flags; this file covers diagnostic workflows and behavior that help output cannot tell you.

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

Discovery commands beyond the ladders: `vercel metrics schema --format=json` lists available metrics (pass a metric or prefix to inspect one), `vercel activity types --format json --scope <team>` lists activity types, and `vercel httpstat /api/health --deployment <deployment-url>` probes a single endpoint with timing breakdown.

## Logs

With `--follow` and no deployment, the CLI tries the latest deployment on the current Git branch, your latest deployment, then the latest production deployment. Use `--environment production` or `--environment preview` to constrain automatic resolution.

In agents, pipes, and CI, log messages expand automatically; do not add `--expand` solely for non-TTY output.

Use `--follow` only for live debugging. Historical log queries should be bounded with `--since`, `--until`, and `--limit`.

## Metrics

Inspect schema before querying unfamiliar metrics. Use bounded time windows and group limits when grouping results:

```bash
vercel metrics schema vercel.function_invocation
vercel metrics vercel.function_invocation.count -f "http_status ge 500" --group-by error_code --since 1h --format=json
```

## Inspecting Deployments

If a redeploy is meant to validate a build-cache or branch-specific hypothesis,
inspect (or `vercel inspect --wait`) until the new deployment reaches `Ready` or
`Error`; do not stop at `Building` unless the user only asked to start the
deployment.

## `vercel curl` — Access Preview Deployments

**Use `vercel curl` to access preview deploys.** It handles deployment protection automatically — no need to disable protection or manage bypass secrets. Extra curl arguments go after `--`:

```bash
vercel curl /api/health --deployment $PREVIEW_URL
vercel curl /api/data --deployment $PREVIEW_URL -- -X POST -d '{"key":"value"}'
```

**Do not disable deployment protection.** Use `vercel curl` instead.

## Finding Regressions

`vercel bisect` performs a binary search across deployments to find which one introduced a problem. Pass `--run <script>` to automate the good/bad judgment instead of answering prompts interactively.

## Cache

For CDN purge, tag invalidation, and destructive cache deletion, see `references/project-infra.md`.
