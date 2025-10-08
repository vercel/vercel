import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import getStore from '../../../../src/commands/blob/store-get';
import * as linkModule from '../../../../src/util/projects/link';
import output from '../../../../src/output-manager';
import dfns from 'date-fns';
import type { BlobRWToken } from '../../../../src/util/blob/token';

// Mock the external dependencies
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');
const formatSpy = vi.spyOn(dfns, 'format');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedOutput = vi.mocked(output);

describe('blob store get', () => {
  const textInputMock = vi.fn().mockResolvedValue('store_1234567890123456');

  const noToken: BlobRWToken = { success: false, error: 'No token found' };
  const token: BlobRWToken = {
    success: true,
    token: 'vercel_blob_rw_123456_abcdefghijk',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    client.fetch = vi.fn().mockResolvedValue({
      store: {
        id: 'store_test123456789012',
        name: 'my-test-store',
        createdAt: 1640995200000, // 2022-01-01 00:00:00
        updatedAt: 1672531200000, // 2023-01-01 00:00:00
        billingState: 'active',
        size: 1048576, // 1MB
      },
    });

    client.input.text = textInputMock;

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

    formatSpy.mockImplementation(date => new Date(date).toISOString());
  });

  describe('successful store retrieval', () => {
    it('should get store with provided ID', async () => {
      const storeId = 'store_provided_12345678';
      client.setArgv('blob', 'store', 'get', storeId);

      const exitCode = await getStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(mockedGetLinkedProject).toHaveBeenCalledWith(client);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
      expect(mockedOutput.debug).toHaveBeenCalledWith('Getting blob store');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob store');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('Blob Store: my-test-store')
      );
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('store_test123456789012')
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:storeId',
          value: 'store_provided_12345678',
        },
      ]);
    });

    it('should auto-detect store ID from token when not provided', async () => {
      client.setArgv('blob', 'store', 'get');

      const exitCode = await getStore(client, [], token);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        '/v1/storage/stores/store_123456',
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
      expect(textInputMock).not.toHaveBeenCalled();
    });

    it('should prompt for store ID when token parsing fails', async () => {
      const exitCode = await getStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(textInputMock).toHaveBeenCalledWith({
        message: 'Enter the ID of the blob store you want to remove',
        validate: expect.any(Function),
      });
      expect(client.fetch).toHaveBeenCalledWith(
        '/v1/storage/stores/store_1234567890123456',
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
    });

    it('should include accountId when project is linked', async () => {
      const storeId = 'store_linked_test_123';

      const exitCode = await getStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
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

      const storeId = 'store_unlinked_test123';
      const exitCode = await getStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: undefined,
        }
      );
    });
  });

  describe('store information display', () => {
    it('should format store information correctly', async () => {
      client.fetch = vi.fn().mockResolvedValue({
        store: {
          id: 'store_display_test_123',
          name: 'Display Test Store',
          createdAt: 1640995200000, // 2022-01-01 00:00:00 UTC
          updatedAt: 1672531200000, // 2023-01-01 00:00:00 UTC
          billingState: 'active',
          size: 2097152, // 2MB
        },
      });

      const exitCode = await getStore(
        client,
        ['store_display_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining(
          'Blob Store: Display Test Store (store_display_test_123)\nBilling State: Active\nSize: 2MB\nCreated At: 2022-01-01T00:00:00.000Z\nUpdated At: 2023-01-01T00:00:00.000Z'
        )
      );
      expect(formatSpy).toHaveBeenCalledWith(
        new Date(1640995200000),
        'MM/DD/YYYY HH:mm:ss.SS'
      );
      expect(formatSpy).toHaveBeenCalledWith(
        new Date(1672531200000),
        'MM/DD/YYYY HH:mm:ss.SS'
      );
    });

    it('should handle different billing states', async () => {
      // Test active state (should show as "Active")
      client.fetch = vi.fn().mockResolvedValue({
        store: {
          id: 'store_billing_test_123',
          name: 'Billing Test Store',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          billingState: 'active',
          size: 1024,
        },
      });

      let exitCode = await getStore(
        client,
        ['store_billing_test_123'],
        noToken
      );
      expect(exitCode).toBe(0);
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('Billing State: Active')
      );

      // Test non-active states (should show as "Inactive")
      const inactiveStates = ['suspended', 'cancelled', 'trial'];
      for (const billingState of inactiveStates) {
        client.fetch = vi.fn().mockResolvedValue({
          store: {
            id: 'store_billing_test_123',
            name: 'Billing Test Store',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            billingState,
            size: 1024,
          },
        });

        exitCode = await getStore(client, ['store_billing_test_123'], noToken);
        expect(exitCode).toBe(0);
        expect(mockedOutput.print).toHaveBeenCalledWith(
          expect.stringContaining('Billing State: Inactive')
        );
      }
    });

    const sizeCases = [
      { size: 0, expected: '0B' },
      { size: 1024, expected: '1KB' },
      { size: 1048576, expected: '1MB' },
      { size: 1073741824, expected: '1GB' },
    ];

    it.each(sizeCases)(
      'should format different store sizes correctly',
      async ({ size, expected }) => {
        client.fetch = vi.fn().mockResolvedValue({
          store: {
            id: 'store_size_test_123',
            name: 'Size Test Store',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            billingState: 'active',
            size,
          },
        });

        const exitCode = await getStore(
          client,
          ['store_size_test_123'],
          noToken
        );
        expect(exitCode).toBe(0);
        expect(mockedOutput.print).toHaveBeenCalledWith(
          expect.stringContaining(`Size: ${expected}`)
        );
      }
    );
  });

  describe('store ID validation and detection', () => {
    it('should extract store ID from different token formats', async () => {
      const tokenCases = [
        'vercel_blob_rw_store_abcdef_xyz123',
        'vercel_blob_rw_store_123456_abcdefghijk',
        'vercel_blob_rw_store_999999_token_suffix',
      ];

      for (const token of tokenCases) {
        const [, , , id] = token.split('_');
        const expectedStoreId = `store_${id}`;

        const exitCode = await getStore(client, [], {
          token,
          success: true,
        });
        expect(exitCode).toBe(0);
        expect(client.fetch).toHaveBeenCalledWith(
          `/v1/storage/stores/${expectedStoreId}`,
          {
            method: 'GET',
            accountId: 'org_123',
          }
        );
      }
    });

    it('should use prompted store ID when token fails', async () => {
      const promptedStoreId = 'store_prompted_test_123';
      textInputMock.mockResolvedValueOnce(promptedStoreId);

      const exitCode = await getStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${promptedStoreId}`,
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

      const exitCode = await getStore(client, ['--invalid-flag'], noToken);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when store retrieval fails', async () => {
      const apiError = new Error('Store not found');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await getStore(
        client,
        ['store_not_found_123456'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob store');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await getStore(
        client,
        ['store_network_error_test'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });

    it('should handle 404 errors for non-existent stores', async () => {
      const notFoundError = new Error('Store not found');
      client.fetch = vi.fn().mockRejectedValue(notFoundError);

      const exitCode = await getStore(
        client,
        ['store_does_not_exist123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });

    it('should handle permission errors', async () => {
      const permissionError = new Error('Insufficient permissions');
      client.fetch = vi.fn().mockRejectedValue(permissionError);

      const exitCode = await getStore(
        client,
        ['store_permission_denied1'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.print).not.toHaveBeenCalled();
    });
  });

  describe('telemetry tracking', () => {
    it('should track store ID argument when provided', async () => {
      const exitCode = await getStore(
        client,
        ['store_telemetry_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:storeId',
          value: 'store_telemetry_test_123',
        },
      ]);
    });

    it('should track store ID argument when auto-detected', async () => {
      const exitCode = await getStore(client, [], token);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:storeId',
          value: 'store_123456',
        },
      ]);
    });

    it('should track store ID argument when prompted', async () => {
      const exitCode = await getStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:storeId',
          value: 'store_1234567890123456',
        },
      ]);
    });
  });

  describe('API call behavior', () => {
    it('should make GET request to correct endpoint', async () => {
      const storeId = 'store_endpoint_test_123';

      const exitCode = await getStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
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
      const exitCode = await getStore(client, [storeId], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId: 'org_different_456',
        }
      );
    });

    it('should handle various store response formats', async () => {
      const storeResponses = [
        {
          id: 'store_format_test_123',
          name: 'Format Test Store',
          createdAt: 1640995200000,
          updatedAt: 1672531200000,
          billingState: 'active',
          size: 1024,
        },
        {
          id: 'store_format_test_456',
          name: 'Another Store',
          createdAt: 1609459200000,
          updatedAt: 1640995200000,
          billingState: 'suspended',
          size: 0,
        },
      ];

      for (const storeData of storeResponses) {
        client.fetch = vi.fn().mockResolvedValue({ store: storeData });

        const exitCode = await getStore(client, [storeData.id], noToken);
        expect(exitCode).toBe(0);
        expect(mockedOutput.print).toHaveBeenCalledWith(
          expect.stringContaining(`Blob Store: ${storeData.name}`)
        );
      }
    });
  });

  describe('interactive prompt behavior', () => {
    it('should show correct prompt message', async () => {
      const exitCode = await getStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(textInputMock).toHaveBeenCalledWith({
        message: 'Enter the ID of the blob store you want to remove',
        validate: expect.any(Function),
      });
    });

    it('should use prompted store ID in API call', async () => {
      const promptedStoreId = 'store_prompted_test_123';
      textInputMock.mockResolvedValueOnce(promptedStoreId);

      const exitCode = await getStore(client, [], noToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${promptedStoreId}`,
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during retrieval and stop on success', async () => {
      const exitCode = await getStore(
        client,
        ['store_spinner_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob store');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
    });

    it('should not stop spinner on retrieval error', async () => {
      const retrievalError = new Error('Retrieval failed');
      client.fetch = vi.fn().mockRejectedValue(retrievalError);

      const exitCode = await getStore(
        client,
        ['store_error_test_123'],
        noToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob store');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });

    it('should show debug output', async () => {
      const exitCode = await getStore(
        client,
        ['store_debug_test_123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.debug).toHaveBeenCalledWith('Getting blob store');
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

      const exitCode = await getStore(
        client,
        ['store_team_test_123456'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        '/v1/storage/stores/store_team_test_123456',
        {
          method: 'GET',
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

      const exitCode = await getStore(
        client,
        ['store_personal_test123'],
        noToken
      );

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        '/v1/storage/stores/store_personal_test123',
        {
          method: 'GET',
          accountId: 'user_123',
        }
      );
    });
  });
});
