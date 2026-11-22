import { describe, expect, it } from 'vitest';
import {
  existsOnNpm,
  findMissingPackages,
  formatMissingError,
} from '../../utils/check-npm-packages-exist.mjs';

/**
 * @param {number} status
 */
function fakeFetch(status) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push([url, init.method]);
    return { status, ok: status >= 200 && status < 300 };
  };
  return { calls, impl };
}

describe('existsOnNpm', () => {
  it('HEADs the registry with the scope slash encoded', async () => {
    const { calls, impl } = fakeFetch(200);
    await expect(existsOnNpm('@vercel/oidc', impl)).resolves.toBe(true);
    expect(calls).toEqual([
      ['https://registry.npmjs.org/@vercel%2foidc', 'HEAD'],
    ]);
  });

  it('returns false when npm has never seen the package', async () => {
    const { impl } = fakeFetch(404);
    await expect(existsOnNpm('@vercel/oidc-verify', impl)).resolves.toBe(false);
  });

  it('throws on other registry errors instead of reporting missing', async () => {
    const { impl } = fakeFetch(503);
    await expect(existsOnNpm('@vercel/oidc', impl)).rejects.toThrow(
      'Unexpected 503 from https://registry.npmjs.org/@vercel%2foidc'
    );
  });
});

describe('findMissingPackages', () => {
  it('returns only the packages that are not on npm', async () => {
    const missing = await findMissingPackages(
      ['@vercel/oidc', '@vercel/oidc-verify', 'vercel'],
      { exists: async name => name !== '@vercel/oidc-verify' }
    );
    expect(missing).toEqual(['@vercel/oidc-verify']);
  });

  it('returns nothing when every package exists', async () => {
    const missing = await findMissingPackages(['@vercel/oidc', 'vercel'], {
      exists: async () => true,
    });
    expect(missing).toEqual([]);
  });
});

describe('formatMissingError', () => {
  it('names the missing packages and what to send IT', () => {
    const message = formatMissingError(['@vercel/a', '@vercel/b']);
    expect(message).toContain('Not on npm yet: @vercel/a, @vercel/b');
    expect(message).toContain('Packages:     @vercel/a, @vercel/b');
    expect(message).toContain('Repository:   vercel/vercel-internal');
    expect(message).toContain('Workflow:     release.yml');
    expect(message).toContain('Environment:  release');
    expect(message).toContain(
      'How to ask: https://app.notion.com/p/3f9e06b059c4818e9582c545651c42e9'
    );
    expect(message).toContain('"private": true');
  });
});
