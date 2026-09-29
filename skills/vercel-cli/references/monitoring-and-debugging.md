# Monitoring & Debugging

## Diagnostic Ladder

1. Identify the project, scope, and time window from supplied context and deployment evidence.
2. Inspect the relevant deployment's status, source, target, timestamps, and aliases.
3. Query logs and metrics for the affected window; narrow by the observed error, route, or deployment.
4. If evidence is unavailable, distinguish permission, subscription, retention, and no-data cases. Use other available evidence without treating missing telemetry as healthy behavior.

For an incident with a supplied deployment URL, inspect that exact identity before deriving a project name. For broader regressions, compare nearby deployments with a meaningful good/bad boundary.

## Build Failures

Start with deployment metadata and build logs before exploring source control. Capture the install command, package manager, build command, monorepo scope, restored cache, and first fatal error. Fix the causal error before chasing incidental warnings.

If source is implicated, inspect the files named by the trace and relevant package, lockfile, or build configuration. Compare a nearby successful deployment's source and build inputs. Other branches passing does not by itself disprove a dependency, cache, or configuration explanation.

Separate the proven root cause, likely trigger, and remaining uncertainty. Validate a build hypothesis with the resulting deployment's final state rather than reporting success while it is still building.

## Build Performance and Machine Sizing

Inspect a successful deployment's build logs for current cores/memory, total duration, and slowest phases. An implausible `0ms` is missing telemetry, not an instant build. Recommend a larger machine only with evidence of CPU or memory pressure; otherwise address the dominant phase.

## Logs and Metrics

Historical logs need a bounded query window. A row limit constrains output/page size but is not a substitute for narrowing the backend time range. Reserve streaming for a live investigation. Automatic deployment selection can resolve a Git branch or recent deployment rather than production; verify it before interpreting the logs.

Discover metric IDs, dimensions, aggregations, and filter syntax from the installed schema/help. Copy their exact names instead of maintaining a parallel list or translating dimensions to a guessed naming convention. Schema discovery is team-scoped; project filtering belongs to the metric query.

Use bounded windows and group counts for metrics. Aggregate trends, sampled details, and individual request traces support different conclusions; state the evidence behind a diagnosis.

## Preview Access

The CLI's authenticated preview request path handles Deployment Protection. Use it when the execution environment can reach deployment hosts instead of disabling protection or managing bypass secrets unnecessarily. A network or permission limitation is not evidence that the deployment is broken.
