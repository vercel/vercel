import { describe, expect, it } from 'vitest';
import {
  deriveStripPrefix,
  extractRoutePrefix,
  normalizeServiceRouting,
} from '../src/services/route-claims';

describe('extractRoutePrefix()', () => {
  it.each([
    ['/api/:path*', '/api'],
    ['/api', '/api'],
    ['/:path*', '/'],
    ['/', '/'],
    ['/api/v1/:path*', '/api/v1'],
    ['/api/health', '/api/health'],
  ])('extracts prefix of %s as %s', (path, expected) => {
    const result = extractRoutePrefix(path);
    expect(result).toEqual({ prefix: expected });
  });

  it.each([
    ['/api/users/:id/view/:path*'],
    ['/:tenant/api/:path*'],
    ['/api/:id/view'],
  ])('rejects interior dynamic segment in %s', path => {
    const result = extractRoutePrefix(path);
    expect('error' in result).toBe(true);
  });
});

describe('deriveStripPrefix()', () => {
  it.each([
    ['/api/:path*', '/:path*', '/api'],
    ['/api/users/:id/view/:path*', '/users/:id/view/:path*', '/api'],
    ['/v1/:path*', '/:path*', '/v1'],
    ['/api/health', '/health', '/api'],
    ['/api/v1/:path*', '/v1/:path*', '/api'],
  ])('derives strip prefix for %s -> %s as %s', (path, forward, expected) => {
    const result = deriveStripPrefix(path, forward);
    expect(result).toEqual({ stripPrefix: expected });
  });

  it.each([
    ['/api/:path*', undefined],
    ['/api/:path*', '/api/:path*'],
    ['/api/health', '/api/health'],
  ])('treats %s -> %s as identity (no strip)', (path, forward) => {
    const result = deriveStripPrefix(path, forward);
    expect(result).toEqual({ stripPrefix: undefined });
  });

  it.each([
    ['/api/:suffix*', '/:path*'], // tail param name mismatch
    ['/:tenant/api/:path*', '/:path*'], // would strip a dynamic segment
    ['/api/foo', '/bar'], // arbitrary rewrite, not a prefix strip
    ['/api/:path*', '/api/v2/:path*'], // forward longer than path
  ])('rejects non-prefix forward %s -> %s', (path, forward) => {
    const result = deriveStripPrefix(path, forward);
    expect('error' in result).toBe(true);
  });
});

describe('normalizeServiceRouting()', () => {
  it('resolves a single prefix catch-all with forward strip', () => {
    const { routing, error } = normalizeServiceRouting('api', [
      { paths: ['/api/:path*'], forward: { path: '/:path*' } },
    ]);
    expect(error).toBeUndefined();
    expect(routing).toEqual({
      entries: [{ prefix: '/api', stripPrefix: '/api' }],
      subdomain: undefined,
    });
  });

  it('resolves a bare string as an identity prefix', () => {
    const { routing, error } = normalizeServiceRouting('api', ['/api']);
    expect(error).toBeUndefined();
    expect(routing?.entries).toEqual([
      { prefix: '/api', stripPrefix: undefined },
    ]);
  });

  it('allows multiple paths in one entry that strip to the same namespace', () => {
    const { routing, error } = normalizeServiceRouting('api', [
      { paths: ['/api/:path*', '/v1/:path*'], forward: { path: '/:path*' } },
    ]);
    expect(error).toBeUndefined();
    expect(routing?.entries).toEqual([
      { prefix: '/api', stripPrefix: '/api' },
      { prefix: '/v1', stripPrefix: '/v1' },
    ]);
  });

  it('allows multiple entries that strip to the same namespace', () => {
    const { routing, error } = normalizeServiceRouting('api', [
      { paths: ['/api/:path*'], forward: { path: '/:path*' } },
      { paths: ['/v1/:path*'], forward: { path: '/:path*' } },
    ]);
    expect(error).toBeUndefined();
    expect(routing?.entries).toEqual([
      { prefix: '/api', stripPrefix: '/api' },
      { prefix: '/v1', stripPrefix: '/v1' },
    ]);
  });

  it('rejects multiple routes that resolve to different namespaces', () => {
    const { error } = normalizeServiceRouting('api', [
      { paths: ['/api/:path*'], forward: { path: '/:path*' } },
      { paths: ['/admin/:path*'] },
    ]);
    expect(error?.code).toBe('INCOHERENT_SERVICE_NAMESPACE');
  });

  it('captures a host entry as the subdomain', () => {
    const { routing, error } = normalizeServiceRouting('api', [
      { paths: ['/api/:path*'], forward: { path: '/:path*' } },
      { host: { subdomain: 'api' } },
    ]);
    expect(error).toBeUndefined();
    expect(routing?.subdomain).toBe('api');
  });

  it('rejects more than one host entry', () => {
    const { error } = normalizeServiceRouting('api', [
      { host: { subdomain: 'api' } },
      { host: { subdomain: 'api2' } },
    ]);
    expect(error?.code).toBe('INVALID_ROUTING');
  });

  it('rejects an entry with an empty paths array', () => {
    const { error } = normalizeServiceRouting('api', [
      { paths: [], forward: { path: '/:path*' } },
    ]);
    expect(error?.code).toBe('INVALID_ROUTING');
  });

  it('rejects the reserved internal prefix', () => {
    const { error } = normalizeServiceRouting('api', ['/_svc/foo']);
    expect(error?.code).toBe('RESERVED_ROUTE_PREFIX');
  });

  it('rejects interior dynamic params (Tier C)', () => {
    const { error } = normalizeServiceRouting('api', [
      {
        paths: ['/api/users/:id/view/:path*'],
        forward: { path: '/users/:id/view/:path*' },
      },
    ]);
    expect(error?.code).toBe('UNSUPPORTED_ROUTING_PATH');
  });

  it('rejects arbitrary (non-prefix) forwards', () => {
    const { error } = normalizeServiceRouting('api', [
      { paths: ['/api/foo'], forward: { path: '/bar' } },
    ]);
    expect(error?.code).toBe('UNSUPPORTED_FORWARD');
  });
});
