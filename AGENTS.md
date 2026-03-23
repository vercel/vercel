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

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
