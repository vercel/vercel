# Affected Testing Strategy

CI uses the repository-pinned Turbo version to select executable test tasks from
`turbo run --affected --dry=json`. Turbo follows task inputs and dependencies;
`utils/plan-tests.js` passes the selected tasks to `utils/chunk-tests.js` to retain
file chunks, operating systems, and Node.js versions.

The plan includes unit tests, repository utility tests, native Rust/Python tests,
and the artifact, builder, independent, Node-version, Next.js, and development
E2E entrypoints. Dependency builds stay in Turbo's execution graph and are not
scheduled as separate test jobs. Invalid plans fail the setup job; they never
fall back to an empty successful matrix.

## Local Preview

Install the repository's Node.js dependencies, Rust toolchain, and `uv` first.
These tools are required even for native workspace graph discovery.

```bash
# Preview affected tests against a specific base and head.
TURBO_SCM_BASE=origin/main TURBO_SCM_HEAD=HEAD pnpm exec node utils/plan-tests.js

# Preview every test task, as used by the nightly workflow.
pnpm exec node utils/plan-tests.js
```

The command prints JSON with `unitBatches`, `e2eTests`, package counts, and the
selected strategy. In GitHub Actions it also writes those values to
`GITHUB_OUTPUT`. No test or deployment is executed by planning.

## Coverage and Limits

- Pull requests provide both `TURBO_SCM_BASE` and `TURBO_SCM_HEAD`.
- With no comparison context, the planner selects the full test graph.
- Workflow, root dependency/configuration, shared test utility, CLI entrypoint,
  and build-utils source changes retain full E2E coverage.
- Unit jobs are partitioned into batches of at most 256 cells, GitHub's matrix
  limit. Batches run sequentially through `test-unit-matrix.yml`; each retains
  the existing maximum of 75 concurrent unit jobs. No runner or test is dropped.
- E2E jobs retain their separate 75-job concurrency cap and deployment-artifact
  readiness checks.
- Nightly runs disable Turbo caching and keep a single test attempt.

Planner regression tests live in `utils/plan-tests.test.js`; chunk and runner
coverage lives in `utils/chunk-tests.test.js`.
