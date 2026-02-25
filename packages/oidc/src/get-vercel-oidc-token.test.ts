import { describe, beforeEach, afterEach, test, vi, expect } from 'vitest';

vi.mock('./get-context', () => ({
  getContext: () => ({ headers: {} }),
}));

import { getVercelOidcToken } from './get-vercel-oidc-token';
import * as tokenUtil from './token-util';
import * as token from './token';

describe('getVercelOidcToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  afterEach(() => {
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  test('should return valid token from env', async () => {
    const validToken = createValidToken();
    process.env.VERCEL_OIDC_TOKEN = validToken;

    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 + 43200,
    });

    const result = await getVercelOidcToken();
    expect(result).toBe(validToken);
  });

  test('should refresh when token is expired', async () => {
    const expiredToken = createExpiredToken();
    const newToken = createValidToken('new-token');

    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    vi.spyOn(token, 'refreshToken').mockImplementation(async () => {
      process.env.VERCEL_OIDC_TOKEN = newToken;
    });

    const result = await getVercelOidcToken();
    expect(result).toBe(newToken);
    expect(token.refreshToken).toHaveBeenCalledWith(undefined);
  });

  test('should pass options to refreshToken', async () => {
    const expiredToken = createExpiredToken();
    const newToken = createValidToken('custom-token');

    process.env.VERCEL_OIDC_TOKEN = expiredToken;

    vi.spyOn(tokenUtil, 'getTokenPayload')
      .mockReturnValueOnce({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 - 1000,
      })
      .mockReturnValue({
        sub: 'test-sub',
        name: 'test-name',
        exp: Date.now() / 1000 + 43200,
      });

    vi.spyOn(token, 'refreshToken').mockImplementation(async () => {
      process.env.VERCEL_OIDC_TOKEN = newToken;
    });

    const options = { team: 'my-team', project: 'my-project' };
    const result = await getVercelOidcToken(options);

    expect(result).toBe(newToken);
    expect(token.refreshToken).toHaveBeenCalledWith(options);
  });

  test('should not refresh when token is valid even with options provided', async () => {
    const validToken = createValidToken();
    process.env.VERCEL_OIDC_TOKEN = validToken;

    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 + 43200,
    });

    const refreshSpy = vi.spyOn(token, 'refreshToken');

    const result = await getVercelOidcToken({
      team: 'custom-team',
      project: 'custom-project',
    });

    expect(result).toBe(validToken);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  test('should throw error when no token and refresh fails', async () => {
    vi.spyOn(token, 'refreshToken').mockRejectedValue(
      new Error('Vercel CLI not found.')
    );

    await expect(getVercelOidcToken()).rejects.toThrow(/Vercel CLI not found/);
  });

  test('should throw error when token is invalid format', async () => {
    process.env.VERCEL_OIDC_TOKEN = 'not-a-jwt-token';

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Invalid token\. Please run `vc env pull` and try again/
    );
  });

  test('should throw error when token is expired and CLI fails', async () => {
    process.env.VERCEL_OIDC_TOKEN = createExpiredToken();

    vi.spyOn(tokenUtil, 'getTokenPayload').mockReturnValue({
      sub: 'test-sub',
      name: 'test-name',
      exp: Date.now() / 1000 - 1000,
    });

    vi.spyOn(token, 'refreshToken').mockRejectedValue(
      new Error('Failed to refresh OIDC token: Unauthorized')
    );

    await expect(getVercelOidcToken()).rejects.toThrow(
      /Failed to refresh OIDC token: Unauthorized/
    );
  });
});

function createExpiredToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: 1,
      iat: 1,
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature`;
}

function createValidToken(value = 'valid-token'): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'test-sub',
      exp: Math.floor(Date.now() / 1000) + 43200,
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url');
  return `${header}.${payload}.fake_signature_${value}`;
}
