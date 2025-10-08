import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import removeStore from '../../../../src/commands/blob/store-remove';
import * as linkModule from '../../../../src/util/projects/link';
import output from '../../../../src/output-manager';
import type { BlobRWToken } from '../../../../src/util/blob/token';

// Mock the external dependencies
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedOutput = vi.mocked(output);

describe('blob store remove', () => {
  const textInputMock = vi.fn().mockResolvedValue('store_1234567890123456');
  const confirmInputMock = vi.fn().mockResolvedValue(true);

  const noToken: BlobRWToken = { success: false, error: 'No token' };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks - mock different responses for GET and DELETE
    client.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        store: { id: 'store_1234567890123456', name: 'Test Store' },
      }) // GET response
      .mockResolvedValueOnce({}); // DELETE response

    client.input.text = textInputMock;
    client.input.confirm = confirmInputMock;

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

      // Should first fetch store details
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );

      // Should show confirmation prompt
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This action cannot be undone.',
        false
      );

      // Should then delete the store
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${storeId}`,
        {
          method: 'DELETE',
          accountId: 'org_123',
        }
      );

      expect(mockedOutput.debug).toHaveBeenCalledWith('Deleting blob store');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob store');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob store deleted');
    });

    it('should prompt for store ID when not provided', async () => {
      client.setArgv('blob', 'store', 'remove');

      const exitCode = await removeStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(textInputMock).toHaveBeenCalledWith({
        message: 'Enter the ID of the blob store you want to remove',
        validate: expect.any(Function),
      });

      // Should first fetch store details
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_1234567890123456',
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );

      // Should then delete the store
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        '/v1/storage/stores/blob/store_1234567890123456',
        {
          method: 'DELETE',
          accountId: 'org_123',
        }
      );
    });

    it('should include accountId when project is linked', async () => {
      const storeId = 'store_linked12345678901';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      // Should use accountId for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${storeId}`,
        {
          method: 'DELETE',
          accountId: 'org_123',
        }
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

      // Should not include accountId for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: undefined,
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${storeId}`,
        {
          method: 'DELETE',
          accountId: undefined,
        }
      );
    });

    it('should not delete store when user declines confirmation', async () => {
      confirmInputMock.mockResolvedValueOnce(false);
      const storeId = 'store_declined_test_123';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      // Should fetch store details
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );

      // Should show confirmation prompt
      expect(confirmInputMock).toHaveBeenCalledWith(
        'Are you sure you want to remove Test Store (store_1234567890123456)? This action cannot be undone.',
        false
      );

      // Should NOT make delete request
      expect(client.fetch).toHaveBeenCalledTimes(1);

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
        {
          method: 'GET',
          accountId: 'org_123',
        }
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
      // Should not attempt DELETE since GET failed
      expect(client.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return 1 when deletion fails after successful fetch', async () => {
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          store: { id: 'store_123', name: 'Test Store' },
        }) // GET succeeds
        .mockRejectedValueOnce(new Error('Delete failed')); // DELETE fails

      const exitCode = await removeStore(
        client,
        ['store_delete_fail_123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
      expect(client.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('API call behavior', () => {
    it('should make GET and DELETE requests to correct endpoints', async () => {
      const storeId = 'store_endpoint_test_12345';

      const exitCode = await removeStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);

      // Should first make GET request
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );

      // Should then make DELETE request
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${storeId}`,
        {
          method: 'DELETE',
          accountId: 'org_123',
        }
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

      // Should use different org ID for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_different_456',
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${storeId}`,
        {
          method: 'DELETE',
          accountId: 'org_different_456',
        }
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
        // Reset mocks for each iteration
        client.fetch = vi
          .fn()
          .mockResolvedValueOnce({ store: { id: storeId, name: 'Test Store' } })
          .mockResolvedValueOnce({});

        const exitCode = await removeStore(client, [storeId], noToken);
        expect(exitCode).toBe(0);

        // Should make both GET and DELETE requests
        expect(client.fetch).toHaveBeenNthCalledWith(
          1,
          `/v1/storage/stores/${storeId}`,
          {
            method: 'GET',
            accountId: 'org_123',
          }
        );
        expect(client.fetch).toHaveBeenNthCalledWith(
          2,
          `/v1/storage/stores/blob/${storeId}`,
          {
            method: 'DELETE',
            accountId: 'org_123',
          }
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

      // Should use prompted store ID for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        `/v1/storage/stores/${promptedStoreId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        `/v1/storage/stores/blob/${promptedStoreId}`,
        {
          method: 'DELETE',
          accountId: 'org_123',
        }
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

      // Should use team account ID for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_team_test_123456',
        {
          method: 'GET',
          accountId: 'team_123',
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        '/v1/storage/stores/blob/store_team_test_123456',
        {
          method: 'DELETE',
          accountId: 'team_123',
        }
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

      // Should use personal account ID for both GET and DELETE
      expect(client.fetch).toHaveBeenNthCalledWith(
        1,
        '/v1/storage/stores/store_personal_test123',
        {
          method: 'GET',
          accountId: 'user_123',
        }
      );
      expect(client.fetch).toHaveBeenNthCalledWith(
        2,
        '/v1/storage/stores/blob/store_personal_test123',
        {
          method: 'DELETE',
          accountId: 'user_123',
        }
      );
    });
  });
});
