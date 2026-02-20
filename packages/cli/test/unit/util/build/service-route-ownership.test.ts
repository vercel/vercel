import type { Service } from '@vercel/build-utils';
import type { Route } from '@vercel/routing-utils';
import { describe, expect, test } from 'vitest';
import { scopeRoutesToServiceOwnership } from '../../../../src/util/build/service-route-ownership';

function createWebService(name: string, routePrefix: string): Service {
  return {
    name,
    type: 'web',
    workspace: '.',
    routePrefix,
    builder: {
      use: '@vercel/next',
      src: 'package.json',
    },
  };
}

function getRegex(route: Route): RegExp {
  if (!('src' in route) || typeof route.src !== 'string') {
    throw new Error('Expected route with src');
  }
  return new RegExp(route.src);
}

describe('scopeRoutesToServiceOwnership()', () => {
  test('scopes root service routes to exclude non-root service prefixes', () => {
    const owner = createWebService('web', '/');
    const routes: Route[] = [{ src: '^/(.*)/$', status: 308, continue: true }];
    const scoped = scopeRoutesToServiceOwnership({
      routes,
      owner,
      allServices: [
        owner,
        createWebService('fastapi-api', '/api/fastapi'),
        createWebService('express-api', '/api/express'),
      ],
    });

    const regex = getRegex(scoped[0]);
    expect(regex.test('/docs/')).toBe(true);
    expect(regex.test('/api/fastapi/')).toBe(false);
    expect(regex.test('/api/express/')).toBe(false);
  });

  test('scopes parent service routes while excluding descendant prefixes', () => {
    const owner = createWebService('api', '/api');
    const routes: Route[] = [{ src: '^/api(?:/.*)?$', continue: true }];
    const scoped = scopeRoutesToServiceOwnership({
      routes,
      owner,
      allServices: [
        createWebService('web', '/'),
        owner,
        createWebService('fastapi-api', '/api/fastapi'),
      ],
    });

    const regex = getRegex(scoped[0]);
    expect(regex.test('/api/users')).toBe(true);
    expect(regex.test('/api/fastapi/users')).toBe(false);
    expect(regex.test('/admin')).toBe(false);
  });

  test('preserves route capture groups after scoping', () => {
    const owner = createWebService('fastapi-api', '/api/fastapi');
    const routes: Route[] = [{ src: '^/api/fastapi/(.+)/(.*)$' }];
    const scoped = scopeRoutesToServiceOwnership({
      routes,
      owner,
      allServices: [createWebService('web', '/'), owner],
    });

    const match = getRegex(scoped[0]).exec('/api/fastapi/users/123');
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe('users');
    expect(match?.[2]).toBe('123');
  });

  test('scopes unanchored catch-all routes while preserving captures', () => {
    const owner = createWebService('web', '/');
    const routes: Route[] = [{ src: '/(.*)' }];
    const scoped = scopeRoutesToServiceOwnership({
      routes,
      owner,
      allServices: [owner, createWebService('dashboard', '/dashboard')],
    });

    const regex = getRegex(scoped[0]);
    expect(regex.test('/about')).toBe(true);
    expect(regex.test('/dashboard')).toBe(false);

    const match = regex.exec('/about/team');
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe('about/team');
  });
});
