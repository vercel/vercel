# Monorepos on Vercel

> Exact syntax: `vercel link --help`, `vercel deploy --help`, `vercel pull --help`

Vercel auto-detects monorepo tools (Turborepo, Nx) and workspace managers (pnpm, Yarn, npm). Each project in the monorepo gets its own Vercel project.

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

## Anti-Patterns

- **Missing `build` task in turbo.json/nx.json**: Vercel requires an explicit build task. Without it, the build fails.
- **Adding a `build` script to package.json for transpilation**: Vercel handles TypeScript compilation. The turbo.json `build` task is for orchestration, not transpilation.
