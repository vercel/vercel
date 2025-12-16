/**
 * Example vercel.ts configuration showcasing the @vercel/config SDK
 *
 * This file demonstrates:
 * - Using the `routes` singleton for clean, readable routing configuration
 * - Type-safe path parameters via callback ({ userId, postId }) => ...
 * - Vercel project env vars via deploymentEnv() helper
 * - Transform options for setting request/response headers
 * - Conditional routing with has/missing conditions
 * - Cache control headers with pretty-cache-header syntax
 */

import { VercelConfig, routes, deploymentEnv } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'pnpm run generate-config',
  installCommand: 'pnpm install --no-frozen-lockfile',
  framework: 'nextjs',
  outputDirectory: `${process.env.framework}`,

  git: {
    deploymentEnabled: {
      dev: false,
      'internal-*': false,
    },
  },

  github: {
    autoAlias: false,
    autoJobCancelation: true,
  },

  crons: [
    { path: '/api/cleanup', schedule: '0 0 * * *' },
    { path: '/api/sync-users', schedule: '*/15 * * * *' },
    { path: '/api/weekly-report', schedule: '0 9 * * 1' },
  ],

  // Headers: Set custom headers and cache control
  headers: [
    // Cache-Control header with pretty-cache-header syntax
    routes.cacheControl('/static/(.*)', {
      public: true,
      maxAge: '1 week',
      immutable: true,
    }),

    // Custom headers for all API routes
    routes.header('/api/(.*)', [
      { key: 'x-api-version', value: '2.0' },
      { key: 'x-powered-by', value: 'Vercel Config SDK' },
    ]),

    // Conditional headers - only applied when host matches
    routes.header(
      '/secure/(.*)',
      [
        {
          key: 'strict-transport-security',
          value: 'max-age=31536000; includeSubDomains',
        },
        { key: 'x-content-type-options', value: 'nosniff' },
      ],
      {
        has: [{ type: 'host', value: 'secure.example.com' }],
      }
    ),
  ],

  // Rewrites: Proxy requests to different destinations
  rewrites: [
    // Simple rewrite with environment variable (no path params, just pass object)
    routes.rewrite('/(.*)', 'https://vercelstaging.example.com/$1', {
      requestHeaders: {
        'cdck-trust-proxy': deploymentEnv('CDCK_TRUST_PROXY_HEADER'),
      },
    }),

    // Path parameters with transforms
    // Type-safe: TypeScript knows userId and postId are available from the pattern
    routes.rewrite(
      '/users/:userId/posts/:postId',
      'https://api.example.com/users/$1/posts/$2',
      ({ userId, postId }) => ({
        requestHeaders: {
          'x-user-id': userId,
          authorization: `Bearer ${deploymentEnv('BEARER_TOKEN')}`,
        },
        responseHeaders: {
          'x-post-id': postId,
        },
      })
    ),

    // Basic rewrite without transforms
    routes.rewrite('/app', 'https://backend.example.com/app'),

    // Multiple transforms: headers and query parameters
    routes.rewrite(
      '/api/:version/(.*)',
      'https://api.backend.com/$1/$2',
      ({ version }) => ({
        requestHeaders: {
          'x-api-version': version,
          'x-api-key': deploymentEnv('API_KEY'),
          'x-region': deploymentEnv('REGION'),
        },
        responseHeaders: {
          'x-powered-by': 'Vercel Config SDK',
        },
        requestQuery: {
          format: 'json',
        },
      })
    ),

    // Conditional rewrite with "has" conditions (no transforms needed)
    // Only rewrites if user has admin/moderator role AND secure session cookie
    routes.rewrite('/admin/(.*)', 'https://admin.backend.com/$1', {
      has: [
        { type: 'header', key: 'x-user-role', inc: ['admin', 'moderator'] },
        { type: 'cookie', key: 'session', pre: 'secure-' },
      ],
    }),

    // Advanced conditions: has + missing with operators
    // Rewrites premium features only for API v2+ with auth, but not legacy auth
    routes.rewrite(
      '/api/premium/:feature',
      'https://premium-api.backend.com/$1',
      {
        has: [
          { type: 'header', key: 'x-api-version', gte: 2 },
          { type: 'header', key: 'authorization', pre: 'Bearer ' },
        ],
        missing: [{ type: 'header', key: 'x-legacy-auth' }],
      }
    ),
  ],

  // Redirects: Send users to different URLs with 3xx status codes
  redirects: [
    // Simple redirect
    routes.redirect('/', '/api/v1/users'),

    // Permanent redirect (308) with path parameters and transforms
    routes.redirect('/old/:userId', '/new/$1', ({ userId }) => ({
      permanent: true,
      requestHeaders: {
        'x-user-id': userId,
        'x-migration': 'true',
      },
    })),

    // Conditional redirect - redirect to login if no auth token
    routes.redirect('/dashboard/(.*)', '/login', {
      missing: [{ type: 'cookie', key: 'auth-token' }],
    }),

    // Host-based redirect - redirect non-www to www
    routes.redirect('/(.*)', 'https://www.example.com/$1', {
      has: [{ type: 'host', value: 'example.com' }],
    }),
  ],
};
