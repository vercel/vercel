import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVercelToken, getTokenPayload, isExpired } from './token-util';
import * as authConfig from './auth-config';
import { AccessTokenMissingError } from './auth-errors';

vi.mock('fs');
vi.mock('./token-io', () => ({
  getUserDataDir: vi.fn(() => '/mock/user/data'),
}));

describe('getVercelToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return token if valid and not expired', async () => {
    const validToken = {
      token: 'valid-access-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(validToken);

    const token = await getVercelToken();

    expect(token).toBe('valid-access-token');
  });

  it('should throw AccessTokenMissingError if auth config does not exist', async () => {
    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(null);

    await expect(getVercelToken()).rejects.toThrow(AccessTokenMissingError);
  });

  it('should throw AccessTokenMissingError if token is expired', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);

    await expect(getVercelToken()).rejects.toThrow(AccessTokenMissingError);
  });

  it('should treat token as valid if expiresAt is missing (--token case)', async () => {
    const tokenWithoutExpiry = {
      token: 'cli-provided-token',
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(tokenWithoutExpiry);

    const token = await getVercelToken();

    expect(token).toBe('cli-provided-token');
  });

  it('should throw AccessTokenMissingError when token expires within buffer', async () => {
    const almostExpiredToken = {
      token: 'almost-expired-token',
      expiresAt: Math.floor(Date.now() / 1000) + 60, // expires in 1 minute
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(almostExpiredToken);

    // With a 5-minute buffer, this token should be considered expired
    await expect(
      getVercelToken({ expirationBufferMs: 300000 })
    ).rejects.toThrow(AccessTokenMissingError);
  });
});

describe('getTokenPayload', () => {
  it('should decode a valid JWT payload', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user123', name: 'Test User', exp: 1234567890 })
    ).toString('base64url');
    const token = `${header}.${payload}.signature`;

    const result = getTokenPayload(token);

    expect(result).toEqual({
      sub: 'user123',
      name: 'Test User',
      exp: 1234567890,
    });
  });

  it('should throw for invalid token format', () => {
    expect(() => getTokenPayload('not-a-jwt')).toThrow(
      'Invalid token. Please run `vc env pull` and try again'
    );
  });
});

describe('isExpired', () => {
  it('should return true for expired token', () => {
    const payload = {
      sub: 'test',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) - 1000,
    };
    expect(isExpired(payload)).toBe(true);
  });

  it('should return false for valid token', () => {
    const payload = {
      sub: 'test',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    expect(isExpired(payload)).toBe(false);
  });

  it('should consider buffer when checking expiry', () => {
    const payload = {
      sub: 'test',
      name: 'test',
      exp: Math.floor(Date.now() / 1000) + 60, // expires in 1 minute
    };
    // Without buffer: valid
    expect(isExpired(payload)).toBe(false);
    // With 5-minute buffer: expired
    expect(isExpired(payload, 300000)).toBe(true);
  });
});
