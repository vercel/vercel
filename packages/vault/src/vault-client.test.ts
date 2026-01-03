import { describe, test, expect, vi, beforeEach } from 'vitest';
import { VaultClient } from './vault-client';
import * as oidc from '@vercel/oidc';
import * as apiClient from './api-client';
import { VaultNotFoundError } from './errors';

// Mock dependencies
vi.mock('@vercel/oidc');
vi.mock('./api-client');

describe('VaultClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    test('should use default base URL', () => {
      const client = new VaultClient();
      expect(client).toBeInstanceOf(VaultClient);
    });

    test('should use custom base URL', () => {
      const client = new VaultClient({ baseUrl: 'https://custom.api.com' });
      expect(client).toBeInstanceOf(VaultClient);
    });
  });

  describe('getSecret', () => {
    test('should fetch secret with auto-extracted context', async () => {
      // Mock OIDC token with claims
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);

      const mockResponse = {
        data: { apiKey: 'secret-value' },
        metadata: { version: 1, createdAt: Date.now() },
      };

      vi.mocked(apiClient.fetchSecret).mockResolvedValue(mockResponse);

      const client = new VaultClient();
      const result = await client.getSecret('my-secret');

      expect(result).toEqual(mockResponse);
      expect(apiClient.fetchSecret).toHaveBeenCalledWith({
        baseUrl: 'https://api.vercel.com',
        token: mockToken,
        teamId: 'team_abc',
        projectId: 'prj_xyz',
        path: 'my-secret',
        environment: 'PRODUCTION',
        version: undefined,
      });
    });

    test('should allow environment override', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret', { environment: 'PREVIEW' });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'PREVIEW',
        })
      );
    });

    test('should allow version parameter', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 2, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret', { version: 2 });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
        })
      );
    });

    test('should allow teamId override', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret', { teamId: 'team_override' });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team_override',
        })
      );
    });

    test('should allow projectId override', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret', { projectId: 'prj_override' });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'prj_override',
        })
      );
    });

    test('should handle not found errors', async () => {
      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(
        createMockToken({ owner_id: 'team', project_id: 'prj' })
      );

      vi.mocked(apiClient.fetchSecret).mockRejectedValue(
        new VaultNotFoundError('missing-secret')
      );

      const client = new VaultClient();

      await expect(client.getSecret('missing-secret')).rejects.toThrow(
        VaultNotFoundError
      );
    });

    test('should use custom base URL', async () => {
      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(
        createMockToken({ owner_id: 'team', project_id: 'prj' })
      );
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient({ baseUrl: 'https://custom.api.com' });
      await client.getSecret('test');

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://custom.api.com',
        })
      );
    });

    test('should use global secrets when global flag is true', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('global-secret', { global: true });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: '',
        })
      );
    });

    test('should use environment from JWT token if not overridden', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
        environment: 'preview',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret');

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'PREVIEW',
        })
      );
    });

    test('should prefer explicit environment over JWT environment', async () => {
      const mockToken = createMockToken({
        owner_id: 'team_abc',
        project_id: 'prj_xyz',
        environment: 'preview',
      });

      vi.mocked(oidc.getVercelOidcToken).mockResolvedValue(mockToken);
      vi.mocked(apiClient.fetchSecret).mockResolvedValue({
        data: {},
        metadata: { version: 1, createdAt: Date.now() },
      });

      const client = new VaultClient();
      await client.getSecret('my-secret', { environment: 'DEVELOPMENT' });

      expect(apiClient.fetchSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'DEVELOPMENT',
        })
      );
    });
  });
});

function createMockToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}
