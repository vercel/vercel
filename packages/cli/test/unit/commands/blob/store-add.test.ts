import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import addStore from '../../../../src/commands/blob/store-add';
import * as linkModule from '../../../../src/util/projects/link';
import * as connectResourceModule from '../../../../src/util/integration-resource/connect-resource-to-project';
import output from '../../../../src/output-manager';

// Mock the external dependencies
vi.mock('../../../../src/util/projects/link');
vi.mock(
  '../../../../src/util/integration-resource/connect-resource-to-project'
);
vi.mock('../../../../src/output-manager');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedConnectResourceToProject = vi.mocked(
  connectResourceModule.connectResourceToProject
);
const mockedOutput = vi.mocked(output);

describe('blob store add', () => {
  const textInputMock = vi.fn().mockResolvedValue('test-store-name');
  const confirmInputMock = vi.fn().mockResolvedValue(true);
  const checkboxInputMock = vi
    .fn()
    .mockResolvedValue(['production', 'preview', 'development']);

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    client.fetch = vi.fn().mockResolvedValue({
      store: { id: 'store_test123' },
    });

    client.input.text = textInputMock;
    client.input.confirm = confirmInputMock;
    client.input.checkbox = checkboxInputMock;

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

    mockedConnectResourceToProject.mockResolvedValue(undefined);
  });

  describe('successful store creation', () => {
    it('should create store with provided name and track telemetry', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'my-test-store',
        '--access',
        'public'
      );

      const exitCode = await addStore(client, [
        'my-test-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'my-test-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: 'org_123',
      });
      expect(mockedOutput.debug).toHaveBeenCalledWith(
        'Creating new blob store'
      );
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Creating new blob store'
      );
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: my-test-store (store_test123)'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should create store with specified region and track telemetry', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'my-test-store',
        '--region',
        'sfo1',
        '--access',
        'public'
      );
      client.fetch = vi.fn().mockResolvedValue({
        store: { id: 'store_test123', region: 'sfo1' },
      });

      const exitCode = await addStore(client, [
        'my-test-store',
        '--region',
        'sfo1',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'my-test-store',
          region: 'sfo1',
          access: 'public',
        }),
        accountId: 'org_123',
      });
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: my-test-store (store_test123) in sfo1'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:region',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should use default region when no region is specified', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'default-region-store',
        '--access',
        'public'
      );

      const exitCode = await addStore(client, [
        'default-region-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'default-region-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: 'org_123',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should display region in success message when API returns region', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'region-display-store',
        '--access',
        'public'
      );
      client.fetch = vi.fn().mockResolvedValue({
        store: { id: 'store_test123', region: 'iad1' },
      });

      const exitCode = await addStore(client, [
        'region-display-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: region-display-store (store_test123) in iad1'
      );
    });

    it('should prompt for name when not provided', async () => {
      client.setArgv('blob', 'store', 'add', '--access', 'public');

      const exitCode = await addStore(client, ['--access', 'public']);

      expect(exitCode).toBe(0);
      expect(client.input.text).toHaveBeenCalledWith({
        message: 'Enter a name for your blob store',
        validate: expect.any(Function),
      });
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-store-name',
          region: 'iad1',
          access: 'public',
        }),
        accountId: 'org_123',
      });
    });

    it('should create store with private access when specified', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'private-store',
        '--access',
        'private'
      );

      const exitCode = await addStore(client, [
        'private-store',
        '--access',
        'private',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'private-store',
          region: 'iad1',
          access: 'private',
        }),
        accountId: 'org_123',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'private',
        },
      ]);
    });

    it('should create store with public access when specified', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'public-store',
        '--access',
        'public'
      );

      const exitCode = await addStore(client, [
        'public-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'public-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: 'org_123',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should return 1 when --access has invalid value', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        'invalid-access-store',
        '--access',
        'invalid'
      );

      const exitCode = await addStore(client, [
        'invalid-access-store',
        '--access',
        'invalid',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Invalid access level: invalid. Must be either 'private' or 'public'"
      );
      expect(client.fetch).not.toHaveBeenCalled();
    });

    it('should return 1 when --access is not provided', async () => {
      client.setArgv('blob', 'store', 'add', 'no-access-store');

      const exitCode = await addStore(client, ['no-access-store']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Missing access level. Must specify --access with either 'private' or 'public'"
      );
      expect(client.fetch).not.toHaveBeenCalled();
    });
  });

  describe('project linking', () => {
    it('should link store to project when confirmed', async () => {
      const exitCode = await addStore(client, [
        'test-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.input.confirm).toHaveBeenCalledWith(
        'Would you like to link this blob store to my-project?',
        true
      );
      expect(client.input.checkbox).toHaveBeenCalledWith({
        message: 'Select environments',
        choices: [
          { name: 'Production', value: 'production', checked: true },
          { name: 'Preview', value: 'preview', checked: true },
          { name: 'Development', value: 'development', checked: true },
        ],
      });
      expect(mockedConnectResourceToProject).toHaveBeenCalledWith(
        client,
        'proj_123',
        'store_test123',
        ['production', 'preview', 'development'],
        'org_123'
      );
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: test-store (store_test123)'
      );
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store test-store linked to my-project. Make sure to pull the new environment variables using `vercel env pull`'
      );
    });

    it('should not link store when user declines', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(false);

      const exitCode = await addStore(client, [
        'test-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.input.confirm).toHaveBeenCalledWith(
        'Would you like to link this blob store to my-project?',
        true
      );
      expect(client.input.checkbox).not.toHaveBeenCalled();
      expect(mockedConnectResourceToProject).not.toHaveBeenCalled();
    });

    it('should handle linking with selected environments', async () => {
      client.input.checkbox = vi.fn().mockResolvedValue(['production']);

      const exitCode = await addStore(client, [
        'prod-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedConnectResourceToProject).toHaveBeenCalledWith(
        client,
        'proj_123',
        'store_test123',
        ['production'],
        'org_123'
      );
    });

    it('should skip linking when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        org: null,
        project: null,
        status: 'not_linked',
      });

      const exitCode = await addStore(client, [
        'standalone-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'standalone-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: undefined,
      });
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(mockedConnectResourceToProject).not.toHaveBeenCalled();
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

      const exitCode = await addStore(client, ['--invalid-flag']);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when store creation fails', async () => {
      const apiError = new Error('Store creation failed');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await addStore(client, [
        'test-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Creating new blob store'
      );
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await addStore(client, [
        'failing-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should handle linking errors after store creation', async () => {
      const linkError = new Error('Linking failed');
      mockedConnectResourceToProject.mockRejectedValue(linkError);

      // This should still succeed even if linking fails
      await expect(
        addStore(client, ['test-store', '--access', 'public'])
      ).rejects.toThrow('Linking failed');

      // Store should still be created successfully
      expect(client.fetch).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: test-store (store_test123)'
      );
    });
  });

  describe('telemetry tracking', () => {
    it('should track name argument when provided', async () => {
      const exitCode = await addStore(client, [
        'telemetry-test-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should track name argument even when prompted', async () => {
      const exitCode = await addStore(client, ['--access', 'public']);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:name',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should not track telemetry when no name is provided or prompted', async () => {
      // Mock input to return undefined/empty
      client.input.text = vi.fn().mockResolvedValue('');

      const exitCode = await addStore(client, ['--access', 'public']);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });
  });

  describe('API call behavior', () => {
    it('should include accountId when project is linked', async () => {
      const exitCode = await addStore(client, [
        'linked-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'linked-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: 'org_123',
      });
    });

    it('should not include accountId when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        org: null,
        project: null,
        status: 'not_linked',
      });

      const exitCode = await addStore(client, [
        'unlinked-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'unlinked-store',
          region: 'iad1',
          access: 'public',
        }),
        accountId: undefined,
      });
    });

    it('should handle different store IDs from API response', async () => {
      client.fetch = vi.fn().mockResolvedValue({
        store: { id: 'store_custom_id_456' },
      });

      const exitCode = await addStore(client, [
        'custom-store',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: custom-store (store_custom_id_456)'
      );
    });
  });

  describe('interactive prompt validation', () => {
    it('should validate store name length correctly', async () => {
      client.setArgv('blob', 'store', 'add', '--access', 'public');
      await addStore(client, ['--access', 'public']);

      const textCall = textInputMock.mock.calls[0][0];
      const validateFn = textCall.validate;

      // Test various name lengths
      expect(validateFn('a')).toBe('Name must be at least 5 characters long');
      expect(validateFn('ab')).toBe('Name must be at least 5 characters long');
      expect(validateFn('abc')).toBe('Name must be at least 5 characters long');
      expect(validateFn('abcd')).toBe(
        'Name must be at least 5 characters long'
      );
      expect(validateFn('abcde')).toBe(true);
      expect(validateFn('valid-store-name')).toBe(true);
      expect(validateFn('very-long-store-name-with-lots-of-characters')).toBe(
        true
      );
    });

    it('should show correct confirmation message with project name', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'linked',
        project: {
          id: 'proj_456',
          name: 'different-project',
          accountId: 'org_456',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        },
        org: { id: 'org_456', slug: 'different-org', type: 'user' },
      });

      const exitCode = await addStore(client, [
        'confirmation-test',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(client.input.confirm).toHaveBeenCalledWith(
        'Would you like to link this blob store to different-project?',
        true
      );
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during store creation and stop on success', async () => {
      const exitCode = await addStore(client, [
        'spinner-test',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Creating new blob store'
      );
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: spinner-test (store_test123)'
      );
    });

    it('should show linking spinner when connecting to project', async () => {
      const exitCode = await addStore(client, [
        'link-spinner-test',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Connecting link-spinner-test to my-project...'
      );
    });

    it('should not stop spinner on creation error', async () => {
      const apiError = new Error('Creation failed');
      client.fetch = vi.fn().mockRejectedValue(apiError);

      const exitCode = await addStore(client, [
        'error-test',
        '--access',
        'public',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Creating new blob store'
      );
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });
  });
});
