# Monorepos on Vercel

Vercel auto-detects monorepo tools (Turborepo, Nx) and workspace managers (pnpm, Yarn, npm). Each project in the monorepo gets its own Vercel project, linked via `vercel link --repo`.

## Quick Start

```bash
vercel link --repo    # link the whole repo
vercel pull           # pull env vars
vc dev                # local development
vercel deploy         # deploy
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

Running from a project subdirectory (e.g., `apps/web/`) skips the "which project?" prompt.

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
- **Linking while on the wrong team**: Use `vercel whoami` to check, `vercel teams switch` to change.
