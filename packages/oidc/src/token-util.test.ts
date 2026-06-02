import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVercelToken } from './token-util';
import * as cliConfig from '@vercel/cli-config';
import * as oauth from './oauth';
import {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';

vi.mock('@vercel/cli-exec', () => ({
  execVercelCli: vi.fn(),
  VercelCliError: class VercelCliError extends Error {},
}));
vi.mock('@vercel/cli-config', () => ({
  getGlobalPathConfig: vi.fn(() => '/mock/user/data/com.vercel.cli'),
  tryReadAuthConfig: vi.fn(),
  writeAuthConfig: vi.fn(),
}));
vi.mock('fs');
vi.mock('./token-io', () => ({
  getUserDataDir: vi.fn(() => '/mock/user/data'),
  findRootDir: vi.fn(() => '/mock/root'),
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
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
    };

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(validToken);

    const token = await getVercelToken();

    expect(token).toBe('valid-access-token');
    expect(cliConfig.writeAuthConfig).not.toHaveBeenCalled();
  });

  it('should throw AccessTokenMissingError if auth config does not exist', async () => {
    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(null);

    await expect(getVercelToken()).rejects.toThrow(AccessTokenMissingError);
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

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    const token = await getVercelToken();

    expect(token).toBe('new-access-token');
    expect(oauth.refreshTokenRequest).toHaveBeenCalledWith({
      refresh_token: 'valid-refresh-token',
    });
    expect(cliConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: expect.any(Number),
      })
    );
  });

  it('should refresh token when only refreshToken is present', async () => {
    const refreshOnlyToken = {
      refreshToken: 'valid-refresh-token',
    };

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    } as Response;

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(refreshOnlyToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    const token = await getVercelToken();

    expect(token).toBe('new-access-token');
    expect(oauth.refreshTokenRequest).toHaveBeenCalledWith({
      refresh_token: 'valid-refresh-token',
    });
  });

  it('should clear auth and throw RefreshAccessTokenFailedError if token expired and no refresh token', async () => {
    const expiredTokenNoRefresh = {
      token: 'expired-access-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(
      expiredTokenNoRefresh
    );

    await expect(getVercelToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(cliConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.any(String),
      {}
    );
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

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockErrorResponse);

    await expect(getVercelToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(cliConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.any(String),
      {}
    );
  });

  it('should clear auth and throw RefreshAccessTokenFailedError if refresh fails with network error', async () => {
    const expiredToken = {
      token: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    };

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockRejectedValue(
      new Error('Network error')
    );

    await expect(getVercelToken()).rejects.toThrow(
      RefreshAccessTokenFailedError
    );
    expect(cliConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.any(String),
      {}
    );
  });

  it('should treat token as valid if expiresAt is missing (--token case)', async () => {
    const tokenWithoutExpiry = {
      token: 'cli-provided-token',
    };

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(tokenWithoutExpiry);

    const token = await getVercelToken();

    expect(token).toBe('cli-provided-token');
    expect(cliConfig.writeAuthConfig).not.toHaveBeenCalled();
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

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    await getVercelToken();

    expect(cliConfig.writeAuthConfig).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        refreshToken: 'new-refresh-token',
      })
    );
  });

  it('should preserve refresh token if not provided in response', async () => {
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

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    await getVercelToken();

    const writeCall = vi.mocked(cliConfig.writeAuthConfig).mock.calls[0][1];
    expect(writeCall).toHaveProperty('refreshToken', 'existing-refresh-token');
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

    vi.mocked(cliConfig.tryReadAuthConfig).mockReturnValue(expiredToken);
    vi.spyOn(oauth, 'refreshTokenRequest').mockResolvedValue(mockResponse);

    const beforeCall = Math.floor(Date.now() / 1000);
    await getVercelToken();
    const afterCall = Math.floor(Date.now() / 1000);

    const writeCall = vi.mocked(cliConfig.writeAuthConfig).mock.calls[0][1];
    expect(writeCall.expiresAt).toBeGreaterThanOrEqual(beforeCall + 7200);
    expect(writeCall.expiresAt).toBeLessThanOrEqual(afterCall + 7200);
  });
});
