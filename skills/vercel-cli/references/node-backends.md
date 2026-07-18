# Node Backends on Vercel

> Exact syntax: `vercel deploy --help`, `vercel dev --help`

Vercel supports Node.js backend frameworks (Express, Hono, Fastify, Elysia, NestJS, H3, Koa) as first-class apps. Your app is the entrypoint — not the `api/` folder. No rewrites, no build scripts.

## How It Works

1. Vercel detects the framework from `package.json` dependencies
2. Finds your entrypoint file (must import the framework)
3. Introspects your routes automatically — no `vercel.json` rewrites needed
4. Bundles and deploys as a single Lambda

## Entrypoint Detection

Vercel searches for these filenames: `app`, `index`, `server`, `main`, `src/app`, `src/index`, `src/server`, `src/main`

With these extensions: `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`

The preferred entrypoint filename is `server.ts`. The file must import the framework (`import express from 'express'`, `import { Hono } from 'hono'`, etc.).

We recommend using `export default` for the app instance, but calling `.listen()` also works.

## Local Development

Run `vc dev` from the project root. Vercel runs your app directly with TypeScript support. No `dev` script is required.

Static files in `public/` are served automatically.

## Configuration

Most apps need zero configuration. Optional `vercel.json` settings:

```json
{
  "functions": {
    "server.ts": {
      "includeFiles": "views/**/*"
    }
  }
}
```

## Bun Runtime

Add `"bunVersion": "1.x"` to `vercel.json` to run on Bun instead of Node.js (works with any framework). Without it the project silently runs on Node.js and Bun-specific APIs like `Bun.file()` fail at runtime.

## Anti-Patterns

- **Putting routes in `api/` folder**: Your framework IS the app. Define routes in your app code, not as separate files in `api/`.
- **Adding `vercel.json` rewrites**: Routes are introspected automatically from your app. Rewrites are not needed.
- **Adding a `build` script**: Vercel handles TypeScript compilation and bundling. Don't add a build script for transpilation — it's not needed and can cause issues.
