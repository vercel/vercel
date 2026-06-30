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

**Always create a changeset for all PRs.**

```bash
pnpm changeset
```

A changeset is a markdown file in `.changeset/` with YAML frontmatter listing affected packages and their bump type (patch/minor/major).

### Changeset Rules

1. Every PR must include a changeset (use empty frontmatter for non-package changes).
2. If your change modifies a package in `/packages/*`, include it in the changeset frontmatter
3. If your change only affects non-package files (docs, config, examples, internal tooling), create a changeset with **empty frontmatter** - just the description
4. Packages in `/internals/*`, `/api`, and `/examples` are ignored by changesets (see `.changeset/config.json`)

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

## Cursor Cloud specific instructions

Setup (`pnpm install`/`pnpm build`/`pnpm lint`/`pnpm test-unit`) is handled by the startup update script; the notes below are non-obvious caveats for this environment.

- **Node 22** (`.nvmrc`). pnpm is provided through corepack (pinned `pnpm@10.29.3`). Corepack shows an interactive download prompt on first use — set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` for non-interactive runs (the update script does this).
- This repo installs with **no npm auth** — it only consumes public `@vercel/*` and `workspace:*` packages. The benign warning `Issue while reading "~/.npmrc". Failed to replace env in config: ${NPM_TOKEN}` appears because the injected `NPM_RC` is a template expecting an `NPM_TOKEN` secret (used by the sibling `front`/`api` repos, not this one) — it does not affect builds/tests here.
- **Running the built CLI:** after `pnpm build`, invoke `node packages/cli/dist/vc.js <cmd>` (or `cd packages/cli && pnpm vercel <cmd>`, which rebuilds first).
- **Remote CLI commands (`whoami`, `deploy`, `pull`) need a valid token.** They read `VERCEL_TOKEN` from the env. If no valid token is available, exercise the core build pipeline fully offline: in a project dir, write a stub `.vercel/project.json` that **includes a `settings` field** (e.g. `{"projectId":"x","orgId":"y","settings":{"framework":null}}`) and run `vc build` — it produces `.vercel/output` with zero network/auth. The `settings` field is required; without it the CLI tries to retrieve the project from the API. Unset `VERCEL_TOKEN` if an invalid one is present in the env (`env -u VERCEL_TOKEN vc build`), or it will be rejected before the offline path runs.
- **Per-package `vitest-unit` only globs test files** (it feeds a generated root config); it does not execute tests by itself. To actually run tests, use root `pnpm test-unit`, or run `pnpm exec vitest run <file>` inside a package (e.g. `packages/error-utils`).
