# CLI Integration Tests

This directory contains end-to-end integration tests for the Vercel CLI. These tests create real projects and deployments on Vercel.

## Project Cleanup

Integration tests create Vercel projects during test runs. Tests that create projects with **random names** clean up after themselves using the `deleteProject` helper in a `finally` block. Tests that use **fixed fixture names** do not clean up, as these projects are reused across test runs.

### Random Project Name Patterns (Cleaned Up Automatically)

These patterns are used for projects created fresh each test run. The tests delete these projects after completion:

| Pattern                        | Regex                                    | Source File                                  |
| ------------------------------ | ---------------------------------------- | -------------------------------------------- |
| `project-link-dev-*`           | `^project-link-dev-[a-z0-9]+$`           | integration-1.test.ts, integration-2.test.ts |
| `project-sensitive-env-vars-*` | `^project-sensitive-env-vars-[a-z0-9]+$` | integration-2.test.ts                        |
| `project-override-env-vars-*`  | `^project-override-env-vars-[a-z0-9]+$`  | integration-2.test.ts                        |
| `project-link-legacy-*`        | `^project-link-legacy-[a-z0-9]+$`        | integration-2.test.ts                        |
| `dev-proxy-headers-and-env-*`  | `^dev-proxy-headers-and-env-[a-z0-9]+$`  | integration-2.test.ts                        |
| `vc-projects-add-*`            | `^vc-projects-add-[a-z0-9]+$`            | integration-3.test.ts                        |
| `link-env-pull-*`              | `^link-env-pull-[a-z0-9]+$`              | integration-link-env-pull.test.ts            |
| `link-env-decline-*`           | `^link-env-decline-[a-z0-9]+$`           | integration-link-env-pull.test.ts            |
| `link-env-yes-*`               | `^link-env-yes-[a-z0-9]+$`               | integration-link-env-pull.test.ts            |

All use the format `${prefix}-${Math.random().toString(36).split('.')[1]}` which produces a random alphanumeric suffix.

**Combined regex to match all test-created projects (for manual cleanup of abandoned projects):**

```regex
^(project-link-dev|project-sensitive-env-vars|project-override-env-vars|project-link-legacy|dev-proxy-headers-and-env|vc-projects-add|link-env-pull|link-env-decline|link-env-yes)-[a-z0-9]+$
```

### Persistent Project Names (DO NOT Delete)

These projects are reused across test runs and should NOT be cleaned up:

#### Fixture-based projects (linked via `vcLink()`)

These are created when tests run `vcLink()` which uses `link --yes`, defaulting to the directory name as the project name:

- `static-deployment`
- `build-output-api-raw`
- `deploy-default-with-prebuilt-preview`
- `deploy-default-with-conflicting-sub-directory`
- `vercel-json-configuration-overrides-link`
- `api-env`
- `project-link-gitignore`
- `output` (subdirectory of deploy-default-with-sub-directory)
- `list` (subdirectory fixture)

#### Projects with hardcoded names in config files

Defined in `helpers/prepare.js`:

| Project Name                     | Location                                                |
| -------------------------------- | ------------------------------------------------------- |
| `now-revert-alias-{12-char-hex}` | Created once per test session                           |
| `redirects-v2`                   | prepare.js line 148                                     |
| `original`                       | prepare.js line 188 (local-config-v2 fixture)           |
| `secondary`                      | prepare.js line 193 (local-config-v2 fixture)           |
| `root-level`                     | prepare.js line 200 (local-config-above-target fixture) |
| `nested-level`                   | prepare.js line 205 (local-config-above-target fixture) |

## Writing New Tests

When writing new integration tests that create projects:

1. **Use a random project name** with a recognizable prefix:

   ```typescript
   const projectName = `my-test-prefix-${Math.random().toString(36).split('.')[1]}`;
   ```

2. **Always clean up** using a `try/finally` block with the `deleteProject` helper:

   ```typescript
   import { deleteProject } from './helpers/api-fetch';

   try {
     // ... test code that creates project ...
   } finally {
     await deleteProject(projectName);
   }
   ```

   The `deleteProject` helper logs errors but does not throw, so test failures are not masked by cleanup failures.

3. **Add the pattern** to the "Random Project Name Patterns" table above for documentation.

## Test Files

- `integration-1.test.ts` - Deploy, link, and env variable tests
- `integration-2.test.ts` - More deploy, link, dev, and build tests
- `integration-3.test.ts` - Project commands, deploy metadata, and validation tests
- `integration-link-env-pull.test.ts` - Link command with env pull functionality
