import { describe, expect, test } from 'vitest';
import type { Route } from '@vercel/routing-utils';
import { suppressAutoSubdomainRoutesByUserRoutes } from '../../../../src/util/build/service-subdomain-route-precedence';

describe('suppressAutoSubdomainRoutesByUserRoutes()', () => {
  test('suppresses auto route when user route has same src and host', () => {
    const autoHostRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/_/api',
        has: [{ type: 'host', value: { pre: 'api.' } }],
        check: true,
      },
      {
        src: '^/(?!_/api(?:/|$))(.*)$',
        dest: '/_/api/$1',
        has: [{ type: 'host', value: { pre: 'api.' } }],
        check: true,
      },
    ];
    const userRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/custom-api',
        has: [{ type: 'host', value: { pre: 'api.' } }],
      },
    ];

    const result = suppressAutoSubdomainRoutesByUserRoutes({
      autoSubdomainRoutes: autoHostRoutes,
      userRoutes,
    });

    expect(result).toEqual([autoHostRoutes[1]]);
  });

  test('does not suppress when user route has different source', () => {
    const autoHostRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/_/api',
        has: [{ type: 'host', value: { eq: 'api.example.com' } }],
        check: true,
      },
    ];
    const userRoutes: Route[] = [
      {
        src: '^/health$',
        dest: '/healthz',
        has: [{ type: 'host', value: { eq: 'api.example.com' } }],
      },
    ];

    const result = suppressAutoSubdomainRoutesByUserRoutes({
      autoSubdomainRoutes: autoHostRoutes,
      userRoutes,
    });

    expect(result).toEqual(autoHostRoutes);
  });

  test('does not suppress when user route includes non-host condition', () => {
    const autoHostRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/_/api',
        has: [{ type: 'host', value: { eq: 'api.example.com' } }],
        check: true,
      },
    ];
    const userRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/custom-api',
        has: [
          { type: 'host', value: { eq: 'api.example.com' } },
          { type: 'header', key: 'x-beta', value: '1' },
        ],
      },
    ];

    const result = suppressAutoSubdomainRoutesByUserRoutes({
      autoSubdomainRoutes: autoHostRoutes,
      userRoutes,
    });

    expect(result).toEqual(autoHostRoutes);
  });

  test('returns null when all auto routes are suppressed', () => {
    const autoHostRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/_/api',
        has: [{ type: 'host', value: { eq: 'api.example.com' } }],
        check: true,
      },
    ];
    const userRoutes: Route[] = [
      {
        src: '^/$',
        dest: '/custom-api',
        has: [{ type: 'host', value: { eq: 'api.example.com' } }],
      },
    ];

    const result = suppressAutoSubdomainRoutesByUserRoutes({
      autoSubdomainRoutes: autoHostRoutes,
      userRoutes,
    });

    expect(result).toBeNull();
  });
});
