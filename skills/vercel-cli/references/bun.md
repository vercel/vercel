# Bun on Vercel

Vercel supports Bun as a runtime. To enable it, add `"bunVersion": "1.x"` to your `vercel.json`:

```json
{
  "bunVersion": "1.x"
}
```

That's it. Vercel will use Bun instead of Node.js to run your project.

This works with any framework — backend apps (Express, Hono, Elysia), frontend frameworks, or anything else. Bun is used as the runtime, so Bun-specific APIs and features are available.

## Example: Elysia with Bun

Elysia is a Bun-native framework. To use it on Vercel:

**vercel.json:**

```json
{
  "bunVersion": "1.x"
}
```

**package.json:**

```json
{
  "type": "module",
  "dependencies": {
    "elysia": "^1.0.0"
  }
}
```

**server.ts:**

```typescript
import { Elysia } from 'elysia';

const app = new Elysia().get('/', () => 'Hello Elysia!');

export default app;
```

## Example: Next.js with Bun

**vercel.json:**

```json
{
  "bunVersion": "1.x"
}
```

**package.json:**

```json
{
  "scripts": {
    "dev": "bun run --bun next dev",
    "build": "bun run --bun next build"
  }
}
```

## Anti-Patterns

- **Forgetting `bunVersion` in `vercel.json`**: Without it, your project runs on Node.js. Bun-specific APIs (like `Bun.file()`) will fail at runtime.
