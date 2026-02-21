import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import removeStore from '../../../../src/commands/blob/store-remove';
import * as linkModule from '../../../../src/util/projects/link';
import * as envPullModule from '../../../../src/commands/env/pull';
import output from '../../../../src/output-manager';
import type { BlobRWToken } from '../../../../src/util/blob/token';

// Mock the external dependencies
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');
vi.mock('../../../../src/commands/env/pull');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedEnvPullCommandLogic = vi.mocked(envPullModule.envPullCommandLogic);
const mockedOutput = vi.mocked(output);

function mockFetchForRemove(
  storeData: { id: string; name: string },
  connections: { project: { name: string } }[] = []
) {
  return vi
    .fn()
    .mockResolvedValueOnce({ store: storeData }) // GET store
    .mockResolvedValueOnce({ connections }) // GET connections
    .mockResolvedValueOnce({}) // DELETE connections
    .mockResolvedValueOnce({}); // DELETE store
}

describe('blob store remove', () => {
  const textInputMock = vi.fn().mockResolvedValue('store_1234567890123456');
  const confirmInputMock = vi.fn().mockResolvedValue(true);

  const noToken: BlobRWToken = { success: false, error: 'No token' };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    client.fetch = mockFetchForRemove({
      id: 'store_1234567890123456',
      name: 'Test Store',
    });

    client.input.text = textInputMock;
    client.input.confirm = confirmInputMock;

    mockedEnvPullCommandLogic.mockResolvedValue(undefined);

    // Default linked project mock
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'proj_123',
        name: 'my-project',
        accountId: 'org_123',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'org_123', slug: 'my-org', type: 'user' },
    });
  });

  describe('successful store deletion', () => {
    it('should delete store with provided ID', async () => {
      const storeId = 'store_abcd1234567890efgh';
      client.setArgv('blob', 'store', 'remove', storeId);

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(mockedGetLinkedProject).toHaveBeenCalledWith(client);

      // Should fetch store details and connections
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: 'org_123' }
      );

      // Should show confirmation prompt
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This action cannot be undone.',
        false
      );

      // Should remove connections first, then delete store
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'DELETE', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${storeId}`,
        { method: 'DELETE', accountId: 'org_123' }
      );

      expect(mockedOutput.debug).toHaveBeenCalledWith('Deleting blob store');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob store');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob store deleted');

      // Should auto-pull env vars since project is linked
      expect(mockedEnvPullCommandLogic).toHaveBeenCalledWith(
        client,
        '.env.local',
        true,
        'development',
        expect.objectContaining({ status: 'linked' }),
        undefined,
        client.cwd,
        'vercel-cli:blob:store-remove'
      );
    });

    it('should show connected projects in confirmation message', async () => {
      client.fetch = mockFetchForRemove(
        { id: 'store_1234567890123456', name: 'Test Store' },
        [{ project: { name: 'my-app' } }, { project: { name: 'my-site' } }]
      );

      const storeId = 'store_abcd1234567890efgh';
      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This store is connected to my-app, my-site. This action cannot be undone.',
        false
      );
    });

    it('should show remaining project count when more than 2 connections', async () => {
      client.fetch = mockFetchForRemove(
        { id: 'store_1234567890123456', name: 'Test Store' },
        [
          { project: { name: 'app1' } },
          { project: { name: 'app2' } },
          { project: { name: 'app3' } },
          { project: { name: 'app4' } },
        ]
      );

      const storeId = 'store_abcd1234567890efgh';
      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This store is connected to app1, app2 and 2 other projects. This action cannot be undone.',
        false
      );
    });

    it('should prompt for store ID when not provided', async () => {
      client.setArgv('blob', 'store', 'remove');

      const exitCode = await removeStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(textInputMock).toHaveBeenCalledWith({
        message: 'Enter the ID of the blob store you want to remove',
        validate: expect.any(Function),
      });

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_1234567890123456',
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        '/v1/storage/stores/store_1234567890123456/connections',
        { method: 'DELETE', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        '/v1/storage/stores/blob/store_1234567890123456',
        { method: 'DELETE', accountId: 'org_123' }
      );
    });

    it('should include accountId when project is linked', async () => {
      const storeId = 'store_linked12345678901';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'DELETE', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${storeId}`,
        { method: 'DELETE', accountId: 'org_123' }
      );
    });

    it('should not include accountId when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        org: null,
        project: null,
        status: 'not_linked',
      });

      const storeId = 'store_unlinked123456789';
      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: undefined }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: undefined }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'DELETE', accountId: undefined }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${storeId}`,
        { method: 'DELETE', accountId: undefined }
      );

      // Should NOT auto-pull env vars since project is not linked
      expect(mockedEnvPullCommandLogic).not.toHaveBeenCalled();
    });

    it('should not delete store when user declines confirmation', async () => {
      confirmInputMock.mockResolvedValueOnce(false);
      const storeId = 'store_declined_test_123';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      // Should fetch store details and connections
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_123' }
      );

      // Should show confirmation prompt
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This action cannot be undone.',
        false
      );

      // Should NOT make delete requests (only 2 GETs)
      expect(client.fetch).toHaveBeenCalledTimes(2);

      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store not removed'
      );
    });

    it('should derive store ID from token when no ID provided and token is available', async () => {
      client.setArgv('blob', 'store', 'remove');

      const exitCode = await removeStore(client, [], {
        success: true,
        token: 'blob_rw_token_xyz789_additional_data',
      });

      expect(exitCode).toBe(0);

      // Should NOT prompt for store ID since it's derived from token
      expect(textInputMock).not.toHaveBeenCalled();

      // Should use derived store ID
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_xyz789',
        { method: 'GET', accountId: 'org_123' }
      );
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const parseError = new Error('Invalid argument');
      vi.doMock('../../../../src/util/get-args', () => ({
        parseArguments: vi.fn().mockImplementation(() => {
          throw parseError;
        }),
      }));

      const exitCode = await removeStore(client, ['--invalid-flag'], noToken);
      expect(exitCode).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await removeStore(
        client,
        ['store_network_error_test'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should handle 404 errors for non-existent stores', async () => {
      const notFoundError = new Error('Store not found');
      client.fetch = vi.fn().mockRejectedValue(notFoundError);

      const exitCode = await removeStore(
        client,
        ['store_does_not_exist123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should handle permission errors', async () => {
      const permissionError = new Error('Insufficient permissions');
      client.fetch = vi.fn().mockRejectedValue(permissionError);

      const exitCode = await removeStore(
        client,
        ['store_permission_denied1'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when store fetch fails', async () => {
      const fetchError = new Error('Store fetch failed');
      client.fetch = vi.fn().mockRejectedValueOnce(fetchError);

      const exitCode = await removeStore(
        client,
        ['store_fetch_fail_123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when deletion fails after successful fetch', async () => {
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          store: { id: 'store_123', name: 'Test Store' },
        }) // GET store
        .mockResolvedValueOnce({ connections: [] }) // GET connections
        .mockResolvedValueOnce({}) // DELETE connections succeeds
        .mockRejectedValueOnce(new Error('Delete failed')); // DELETE store fails

      const exitCode = await removeStore(
        client,
        ['store_delete_fail_123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
      expect(client.fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('API call behavior', () => {
    it('should make GET store, GET connections, DELETE connections, and DELETE store requests to correct endpoints', async () => {
      const storeId = 'store_endpoint_test_12345';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'DELETE', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${storeId}`,
        { method: 'DELETE', accountId: 'org_123' }
      );
    });

    it('should handle different organization IDs', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'linked',
        project: {
          id: 'proj_456',
          name: 'different-project',
          accountId: 'org_different_456',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        },
        org: { id: 'org_different_456', slug: 'different-org', type: 'team' },
      });

      const storeId = 'store_different_org_test';
      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_different_456' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: 'org_different_456' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'DELETE', accountId: 'org_different_456' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${storeId}`,
        { method: 'DELETE', accountId: 'org_different_456' }
      );
    });

    it('should handle various store ID formats', async () => {
      const storeIdFormats = [
        'store_1234567890123456', // standard format
        'blob_abcdefghijklmnop', // different prefix
        '1234567890123456789012', // no prefix
        'STORE_UPPERCASE_TEST12', // uppercase
        'mixed_Case_StOrE_Id123', // mixed case
      ];

      for (const storeId of storeIdFormats) {
        client.fetch = mockFetchForRemove({
          id: storeId,
          name: 'Test Store',
        });

        const exitCode = await removeStore(client, [storeId], noToken);
        expect(exitCode).toBe(0);

        expect(client.fetch).toHaveBeenNthCalledWith(
          1,
          `/v1/storage/stores/${storeId}`,
          { method: 'GET', accountId: 'org_123' }
        );
        expect(client.fetch).toHaveBeenNthCalledWith(
          3,
          `/v1/storage/stores/${storeId}/connections`,
          { method: 'DELETE', accountId: 'org_123' }
        );
        expect(client.fetch).toHaveBeenNthCalledWith(
          4,
          `/v1/storage/stores/blob/${storeId}`,
          { method: 'DELETE', accountId: 'org_123' }
        );
      }
    });
  });

  describe('interactive prompt behavior', () => {
    it('should show correct prompt message', async () => {
      const exitCode = await removeStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(textInputMock).toHaveBeenCalledWith({
        message: 'Enter the ID of the blob store you want to remove',
        validate: expect.any(Function),
      });
    });

    it('should use prompted store ID in API call', async () => {
      const promptedStoreId = 'store_prompted_test_123';
      textInputMock.mockResolvedValueOnce(promptedStoreId);

      const exitCode = await removeStore(client, [], noToken);

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${promptedStoreId}`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        `/v1/storage/stores/${promptedStoreId}/connections`,
        { method: 'DELETE', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        `/v1/storage/stores/blob/${promptedStoreId}`,
        { method: 'DELETE', accountId: 'org_123' }
      );
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during deletion and stop on success', async () => {
      const exitCode = await removeStore(
        client,
        ['store_spinner_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob store');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob store deleted');
    });

    it('should show debug output', async () => {
      const exitCode = await removeStore(
        client,
        ['store_debug_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.debug).toHaveBeenCalledWith('Deleting blob store');
    });
  });

  describe('project linking scenarios', () => {
    it('should work with team organizations', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'linked',
        project: {
          id: 'proj_team',
          name: 'team-project',
          accountId: 'team_123',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        },
        org: { id: 'team_123', slug: 'my-team', type: 'team' },
      });

      const exitCode = await removeStore(
        client,
        ['store_team_test_123456'],
        noToken
      );

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_team_test_123456',
        { method: 'GET', accountId: 'team_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        '/v1/storage/stores/store_team_test_123456/connections',
        { method: 'GET', accountId: 'team_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        '/v1/storage/stores/store_team_test_123456/connections',
        { method: 'DELETE', accountId: 'team_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        '/v1/storage/stores/blob/store_team_test_123456',
        { method: 'DELETE', accountId: 'team_123' }
      );
    });

    it('should work with personal accounts', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'linked',
        project: {
          id: 'proj_personal',
          name: 'personal-project',
          accountId: 'user_123',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        },
        org: { id: 'user_123', slug: 'my-user', type: 'user' },
      });

      const exitCode = await removeStore(
        client,
        ['store_personal_test123'],
        noToken
      );

      expect(exitCode).toBe(0);

      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_personal_test123',
        { method: 'GET', accountId: 'user_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        '/v1/storage/stores/store_personal_test123/connections',
        { method: 'GET', accountId: 'user_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        3,
        '/v1/storage/stores/store_personal_test123/connections',
        { method: 'DELETE', accountId: 'user_123' }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        4,
        '/v1/storage/stores/blob/store_personal_test123',
        { method: 'DELETE', accountId: 'user_123' }
      );
    });
  });
});
