# Node Backends on Vercel

Vercel supports Node.js backend frameworks as first-class apps. Express and Hono are the most common, but Fastify, Elysia, NestJS, H3, and Koa are also supported. Your app is the entrypoint — not the `api/` folder. No rewrites, no build scripts. Just export your app and deploy.

## Quick Start

```bash
# Express
npm init -y && npm i express
# Create server.ts that exports default app
vc dev       # local development
vc deploy    # deploy
```

## How It Works

1. Vercel detects the framework from `package.json` dependencies
2. Finds your entrypoint file (must import the framework)
3. Introspects your routes automatically — no `vercel.json` rewrites needed
4. Bundles and deploys as a single Lambda

## Entrypoint Detection

Vercel searches for these filenames (in order): `app`, `index`, `server`, `main`, `src/app`, `src/index`, `src/server`, `src/main`

With these extensions: `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`

The preferred entrypoint filename is `server.ts`. The file must import the framework (`import express from 'express'`, `import { Hono } from 'hono'`, etc.).

We recommend using `export default` for the app instance, but calling `.listen()` also works.

## Minimal Express App

```
my-app/
├── package.json
└── server.ts
```

**package.json:**

```json
{
  "type": "module",
  "dependencies": {
    "express": "5.1.0"
  }
}
```

**server.ts:**

```typescript
import express from 'express';

const app = express();

app.get('/', (_req, res) => {
  res.send('Hello Express!');
});

export default app;
```

## Minimal Hono App

**package.json:**

```json
{
  "type": "module",
  "dependencies": {
    "hono": "^4.8.9"
  }
}
```

**server.ts:**

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/', c => {
  return c.text('Hello Hono!');
});

export default app;
```

## Local Development

Run `vc dev` from the project root. Vercel runs your app directly with TypeScript support. No `dev` script is required, though you can add one if you prefer.

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

## Anti-Patterns

- **Putting routes in `api/` folder**: Your framework IS the app. Define routes in your app code, not as separate files in `api/`.
- **Adding `vercel.json` rewrites**: Routes are introspected automatically from your app. Rewrites are not needed.
- **Adding a `build` script**: Vercel handles TypeScript compilation and bundling. Don't add a build script for transpilation — it's not needed and can cause issues.
