# AGENTS.md

Guidelines for AI agents working on the Vercel monorepo.

## Repository Structure

This is a pnpm monorepo containing 44+ packages for the Vercel CLI and runtimes:

- `/packages/*` - Public npm packages (@vercel scope)
- `/internals/*` - Internal shared packages (@vercel-internals scope)
- `/crates` - Rust workspace
- `/examples` - Framework examples for testing
- `/utils` - Build and test utilities

## Essential Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm type-check       # TypeScript validation
pnpm lint             # ESLint check
pnpm test-unit        # Run unit tests
pnpm test-e2e         # Run e2e tests
```

Run tests for a specific package:

```bash
cd packages/<name>
pnpm test-unit
```

## Changesets

**Always create a changeset when making a PR that affects packages.**

```bash
pnpm changeset
```

A changeset is a markdown file in `.changeset/` with YAML frontmatter listing affected packages and their bump type (patch/minor/major).

### Changeset Rules

1. If your change modifies a package in `/packages/*`, include it in the changeset frontmatter
2. If your change only affects non-package files (docs, config, examples, internal tooling), create a changeset with **empty frontmatter** - just the description
3. Packages in `/internals/*`, `/api`, and `/examples` are ignored by changesets (see `.changeset/config.json`)

Example changeset for a package change:

```md
---
'@vercel/node': patch
---

Fixed edge case in serverless function bundling.
```

Example changeset for non-package changes:

```md
---
---

Updated CI workflow configuration.
```

## Code Style

- **Formatting**: Prettier with single quotes, trailing commas (es5), no parens for single arrow params
- **Linting**: ESLint with TypeScript rules
- **No unused variables**: `@typescript-eslint/no-unused-vars` is enforced
- **No focused/disabled tests**: `jest/no-focused-tests` and `jest/no-disabled-tests` are errors
- **Use `slice()` over `substr()`**: substr is deprecated

Run before committing:

```bash
pnpm prettier --write .
pnpm lint
```

## Testing Patterns

- **Unit tests**: Jest or Vitest, located in `packages/<name>/test/unit/`
- **E2E tests**: Fixture-based, test real deployments
- **Affected testing**: CI only runs tests for changed packages and dependents

When adding tests:

```typescript
// Vitest style
import { describe, test, expect } from 'vitest';

describe('feature', () => {
  test('should work', () => {
    expect(true).toBe(true);
  });
});
```

### Investigating Test Failures

Many tests in this repo deploy to Vercel. When a test fails, investigate whether the deployment itself failed:

1. **Check the test output** for a deployment URL (e.g., `https://my-project-xxx.vercel.app`)

2. **Get deployment details** using the Vercel CLI (expected to be available locally). Always use `--scope zero-conf-vtest314` for e2e/integration test deployments:

   ```bash
   # List recent deployments for a project
   vercel ls <project-name> --scope zero-conf-vtest314

   # Get deployment logs by URL or deployment ID
   vercel logs <deployment-url-or-id> --scope zero-conf-vtest314

   # Inspect deployment details
   vercel inspect <deployment-url-or-id> --scope zero-conf-vtest314
   ```

3. **Common deployment failure causes**:

   - Build errors (check `vercel logs`)
   - Connection reset issues (network flakiness)
   - Timeouts - both build timeouts and response timeouts when tests make HTTP requests
   - Framework detection issues
   - **Deployment Protection** - if a test fails making requests to a deployment URL and you see auth-related errors or redirects, the project may have Deployment Protection enabled. Check the project settings and disable it for the test project.

4. **For CI failures**, deployment URLs are usually printed in the test output. Copy the URL and run `vercel logs <url> --scope zero-conf-vtest314` locally to see the full build output.

5. **If the Vercel CLI returns an authentication error** (e.g., "No existing credentials found"), provide the exact command to the user so they can run it themselves after authenticating. Then resume the investigation once the user provides the output or confirms auth is available.

6. **Compare with previous successful deployments** to determine if an issue is new:

   ```bash
   # List recent deployments to find successful vs failed ones
   vercel ls <project-name> --scope zero-conf-vtest314

   # Get deployment ID from inspect
   vercel inspect <deployment-url> --scope zero-conf-vtest314
   ```

   Note: `vercel logs` only works for deployments in "Ready" state. For failed deployments or to get full build logs, use the Vercel API directly:

   ```bash
   # Get build logs via API (works for both successful and failed deployments)
   curl -s -H "Authorization: Bearer $(cat ~/.vercel/auth.json | jq -r '.token')" \
     "https://api.vercel.com/v2/deployments/<deployment-id>/events?teamId=team_dC6tJLPHCIbKnx9RAz6Dvsya" \
     | jq -r '.[].payload.text // empty'
   ```

   Compare logs between a failing and a recent successful deployment to identify what changed.

## Package Development

Each package follows this structure:

```
packages/<name>/
├── src/
│   └── index.ts      # Main entry
├── test/
├── package.json
├── tsconfig.json     # Extends ../../tsconfig.base.json
└── build.mjs         # esbuild config (if applicable)
```

Workspace dependencies use `workspace:*`:

```json
{
  "dependencies": {
    "@vercel/build-utils": "workspace:*"
  }
}
```

### New Package Setup

When creating a new package, configure it for public npm access:

```json
{
  "name": "@vercel/new-package",
  "publishConfig": {
    "access": "public"
  }
}
```

## Runtime Packages

Runtime packages (node, python, go, ruby, rust) implement the Builder API:

```typescript
export const version = 3;

export async function build(options: BuildOptions): Promise<BuildResult> {
  // Build implementation
}

// Optional exports
export async function prepareCache(
  options: PrepareCacheOptions
): Promise<Files> {}
export async function startDevServer(
  options: StartDevServerOptions
): Promise<StartDevServerResult> {}
```

## CLI Development

Test the CLI against an external repository:

```bash
cd packages/cli
pnpm vercel --cwd /path/to/external/repo
```

This runs your local CLI build against any project without needing to install it globally.

## Common Pitfalls

1. **Don't use `console.log` in CLI package** - `no-console` rule is enforced there
2. **Don't skip CI hooks** - Lint and type checks run in pre-commit
3. **Don't forget type-check** - Run `pnpm type-check` before pushing
4. **Don't modify examples for testing** - They're used for integration tests
