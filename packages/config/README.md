# @vercel/config

TypeScript SDK for programmatically defining Vercel configuration. Write type-safe routing rules and build configuration in TypeScript instead of JSON.

## Installation

```bash
npm install @vercel/config
```

## Quick Start

Create a `vercel.ts` file in your project root:

```typescript
import { routes, deploymentEnv } from '@vercel/config/v1';
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'npm run build',
  framework: 'nextjs',

  rewrites: [
    // Simple rewrite
    routes.rewrite('/api/(.*)', 'https://backend.api.example.com/$1'),

    // Rewrite with transforms (no path params)
    routes.rewrite('/(.*)', 'https://api.example.com/$1', {
      requestHeaders: {
        authorization: `Bearer ${deploymentEnv('API_TOKEN')}`,
      },
    }),

    // Type-safe path parameters with callback
    routes.rewrite(
      '/users/:userId/posts/:postId',
      'https://api.example.com/users/$1/posts/$2',
      ({ userId, postId }) => ({
        requestHeaders: {
          'x-user-id': userId,
          'x-post-id': postId,
          authorization: `Bearer ${deploymentEnv('API_KEY')}`,
        },
      })
    ),
  ],

  redirects: [routes.redirect('/old-docs', '/docs', { permanent: true })],

  headers: [
    routes.cacheControl('/static/(.*)', {
      public: true,
      maxAge: '1 week',
      immutable: true,
    }),
  ],

  crons: [{ path: '/api/cleanup', schedule: '0 0 * * *' }],
};
```

## Features

- **Type-safe configuration** - Full TypeScript support with IDE autocomplete
- **Type-safe path parameters** - Extract `:userId` from patterns with full IntelliSense
- **Deployment environment variables** - Use `deploymentEnv()` for Vercel project env vars
- **Readable syntax** - Helper methods like `routes.redirect()`, `routes.rewrite()`, `routes.header()`
- **Transforms** - Modify request/response headers and query parameters on the fly
- **Conditions** - Advanced routing with `has` and `missing` conditions
- **CLI tools** - `compile` and `validate` commands for development

## Build-Time Compilation

Your `vercel.ts` is automatically compiled to `vercel.json` during:

```bash
vercel build
vercel dev
vercel deploy
```

No manual build step needed - the Vercel CLI handles compilation automatically.

## CLI Commands

For development and validation:

```bash
# Compile vercel.ts to JSON (output to stdout)
npx @vercel/config compile

# Validate config for errors and show summary
npx @vercel/config validate

# Generate vercel.json locally (for development)
npx @vercel/config generate
```

## Important Notes

- **One config file only**: You cannot have both `vercel.ts` and `vercel.json`.
- **Transforms compile to routes**: When you add transforms to rewrites/redirects (like `requestHeaders`), they're compiled to the lower-level `routes` primitive internally.
- **Automatic compilation**: The Vercel CLI compiles `vercel.ts` automatically.

## Learn More

- [Vercel Configuration Documentation](https://vercel.com/docs/projects/project-configuration)
- [Routing Documentation](https://vercel.com/docs/edge-network/routing)
