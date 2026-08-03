# Affected Testing Strategy

The test workflow uses Turborepo's native affected-package detection. Package
test scripts are executable Turbo tasks; the workflow does not generate package
or test-file manifests.

## Pull Requests

Each test lane checks out the pull request head with full Git history and sets:

- `TURBO_SCM_BASE` to the pull request base commit.
- `TURBO_SCM_HEAD` to the pull request head commit.

The lane then runs its task with `--affected`, for example:

```bash
turbo run vitest-unit --affected
turbo run vitest-e2e --affected
```

Turbo runs the task in directly changed packages and affected dependents. The
complete task is executed in every affected package; Vitest does not perform a
second changed-file reduction.

## Global Changes

Repository-wide inputs are declared in `turbo.json` under `globalDependencies`.
These include workflows, the lockfile, root package and cache-key metadata,
shared test helpers, test and build utilities, CLI startup code, and root Vitest
configuration. Changes to them invalidate tasks across the workspace.

## Test Lanes

- `vitest-unit`: Linux and macOS on Node.js 20 and 22, plus Windows on Node.js 22.
  The CLI unit suite runs separately in seven Vitest shards on each platform.
- `vitest-e2e`: Primary E2E coverage on Linux and Node.js 22.
- `vitest-e2e-node-20`: Firewall E2E coverage on Linux and Node.js 20.
- `test-e2e-node-all-versions`: CLI integration coverage on Node.js 20, 22,
  and 24.
- `test-next-local`: Local Next.js integration coverage on Node.js 22.
- `test-dev`: CLI development coverage on Linux and macOS with Node.js 22.

The workflow uses a globally installed Turbo for a dry run before installing
workspace dependencies. Lanes with no affected task skip dependency,
toolchain, and deployment setup.

## Local Reproduction

The comparison commits and full Git history must be available locally:

```bash
TURBO_SCM_BASE=<base-sha> \
TURBO_SCM_HEAD=<head-sha> \
pnpm turbo run vitest-unit --affected --dry=json
```

Remove `--dry=json` to execute the affected unit tests. Replace `vitest-unit`
with an E2E lane task to reproduce that lane.

Packages participate in a lane by defining a script with the lane's exact task
name. The same task must be configured in the root `turbo.json`.
