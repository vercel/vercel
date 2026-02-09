import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVercelCliToken } from './token-util';
import * as authConfig from './auth-config';
import * as oauth from './oauth';
import {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';

vi.mock('fs');
vi.mock('./token-io', () => ({
  getUserDataDir: vi.fn(() => '/mock/user/data'),
  findRootDir: vi.fn(() => '/mock/root'),
}));

describe('getVercelCliToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return token if valid and not expired', async () => {
    const validToken = {
      token: 'valid-access-token',
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(validToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});

    const token = await getVercelCliToken();

    expect(token).toBe('valid-access-token');
    expect(authConfig.writeAuthConfig).not.toHaveBeenCalled();
  });

  it('should throw AccessTokenMissingError if auth config does not exist', async () => {
    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(null);

    await expect(getVercelCliToken()).rejects.toThrow(AccessTokenMissingError);
  });

  it('should refresh token if expired and refresh token exists', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }),
    } as Response;

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    const token = await getVercelCliToken();

    expect(token).toBe('new-access-token');
    expect(oauth.refreshTokenRequest).toHaveBeenCalledWith({
      refresh_token: 'valid-refresh-token',
    });
    expect(authConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: expect.any(Number),
      })
    );
  });

  it('should clear auth and throw RefreshAccessTokenFailedError if token expired and no refresh token', async () => {
    const expiredTokenNoRefresh = {
      token: 'expired-access-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(
      expiredTokenNoRefresh
    );
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});

    await expect(getVercelCliToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(authConfig.writeAuthConfig).toHaveBeenCalledWith({});
  });

  it('should clear auth and throw RefreshAccessTokenFailedError if refresh fails with OAuth error', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'invalid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    const mockErrorResponse = {
      ok: false,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Refresh token expired',
      }),
    } as Response;

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockErrorResponse);

    await expect(getVercelCliToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(authConfig.writeAuthConfig).toHaveBeenCalledWith({});
  });

  it('should clear auth and throw RefreshAccessTokenFailedError if refresh fails with network error', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockRejectedValue(
      new Error('Network error')
    );

    await expect(getVercelCliToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(authConfig.writeAuthConfig).toHaveBeenCalledWith({});
  });

  it('should treat token as valid if expiresAt is missing (--token case)', async () => {
    const tokenWithoutExpiry = {
      token: 'cli-provided-token',
    };

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(tokenWithoutExpiry);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});

    const token = await getVercelCliToken();

    expect(token).toBe('cli-provided-token');
    expect(authConfig.writeAuthConfig).not.toHaveBeenCalled();
  });

  it('should preserve new refresh token if provided in response', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }),
    } as Response;

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    await getVercelCliToken();

    expect(authConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: 'new-refresh-token',
      })
    );
  });

  it('should not overwrite refresh token if not provided in response', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'existing-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        // No refresh_token in response
      }),
    } as Response;

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    await getVercelCliToken();

    const writeCall = vi.mocked(authConfig.writeAuthConfig).mock.calls[0][0];
    expect(writeCall).not.toHaveProperty('refreshToken');
  });

  it('should calculate expiresAt correctly from expires_in', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 7200, // 2 hours
      }),
    } as Response;

    vi.spyOn(authConfig, 'readAuthConfig').mockReturnValue(expiredToken);
    vi.spyOn(authConfig, 'writeAuthConfig').mockImplementation(() => {});
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    const beforeCall = Math.floor(Date.now() / 1000);
    await getVercelCliToken();
    const afterCall = Math.floor(Date.now() / 1000);

    const writeCall = vi.mocked(authConfig.writeAuthConfig).mock.calls[0][0];
    expect(writeCall.expiresAt).toBeGreaterThanOrEqual(beforeCall + 7200);
    expect(writeCall.expiresAt).toBeLessThanOrEqual(afterCall + 7200);
  });
});
