# Monorepos on Vercel

Vercel auto-detects monorepo tools (Turborepo, Nx) and workspace managers (pnpm, Yarn, npm). Each project in the monorepo gets its own Vercel project, linked via `vercel link --repo`.

## Quick Start

```bash
vercel link --repo    # link the whole repo
vercel project inspect --non-interactive # verify the selected owner and project
vercel pull                             # pull settings and env data into .vercel/
vc dev                                  # local development
vercel deploy                           # deploy
```

## Linking

Use `vercel link --repo` to create `.vercel/repo.json`, which maps directories to Vercel projects:

```json
{
  "orgId": "org_xxxxx",
  "projects": [
    { "id": "prj_xxxxx", "name": "web", "directory": "apps/web" },
    { "id": "prj_yyyyy", "name": "api", "directory": "apps/api" }
  ]
}
```

The deepest configured directory containing the working directory wins. If no mapping matches, interactive repo resolution prompts among the configured projects; non-interactive repo resolution currently selects the sole configured project or remains unresolved when multiple choices exist. Commands that set up projects may then enter a linking flow. Being inside an app directory does not by itself verify the target, so run `vercel project inspect --non-interactive` and stop on `link_required` or a mismatch before consequential commands.

## Root Directory

Set `rootDirectory` in `vercel.json` when your app isn't at the repo root:

```json
{
  "rootDirectory": "apps/api"
}
```

## Turborepo

Turborepo requires an explicit `build` task. Define it in `turbo.json`:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["VERCEL"],
      "outputs": [".next/**", "!.next/cache/**", ".vercel/output/**", "dist/**"]
    }
  }
}
```

Vercel automatically generates the right build command — you don't need to configure it. If you need a manual override in `vercel.json`:

```json
{
  "buildCommand": "turbo run build --filter={packages/my-app}..."
}
```

### turbo-ignore

Vercel auto-sets `npx turbo-ignore` as the "Ignored Build Step" command, which skips builds when a project's dependencies haven't changed.

## Nx

Nx requires a build target. Define it in `nx.json`:

```json
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"]
    }
  }
}
```

## Example: Turborepo + pnpm + Hono

```
root/
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── vercel.json
├── apps/
│   └── api/
│       ├── package.json
│       └── server.ts
└── packages/
    └── shared/
        ├── package.json
        └── src/index.ts
```

**pnpm-workspace.yaml:**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**vercel.json:**

```json
{
  "rootDirectory": "apps/api"
}
```

**apps/api/server.ts:**

```typescript
import { Hono } from 'hono';
import { greet } from '@repo/shared';

const app = new Hono();
app.get('/', c => c.text(greet('world')));

export default app;
```

## Anti-Patterns

- **Using `vercel link` instead of `vercel link --repo`**: Creates `project.json` which only tracks one project. Use `--repo` for monorepos.
- **Missing `build` task in turbo.json/nx.json**: Vercel requires an explicit build task. Without it, the build fails.
- **Adding a `build` script to package.json for transpilation**: Vercel handles TypeScript compilation. The turbo.json `build` task is for orchestration, not transpilation.
- **Assuming an app directory proves project context**: Verify the resolved owner and project with `vercel project inspect --non-interactive`. `vercel whoami --format json` reports authentication and team context, not the linked project.
