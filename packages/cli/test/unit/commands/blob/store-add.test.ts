import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import addStore from '../../../../src/commands/blob/store-add';
import * as linkModule from '../../../../src/util/projects/link';
import * as selectOrgModule from '../../../../src/util/input/select-org';
import * as connectResourceModule from '../../../../src/util/integration-resource/connect-resource-to-project';
import * as envPullModule from '../../../../src/commands/env/pull';
import output from '../../../../src/output-manager';

// Mock the external dependencies
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/input/select-org');
vi.mock(
  '../../../../src/util/integration-resource/connect-resource-to-project'
);
vi.mock('../../../../src/output-manager');
vi.mock('../../../../src/commands/env/pull');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedSelectOrg = vi.mocked(selectOrgModule.default);
const mockedConnectResourceToProject = vi.mocked(
  connectResourceModule.connectResourceToProject
);
const mockedEnvPullCommandLogic = vi.mocked(envPullModule.envPullCommandLogic);
const mockedOutput = vi.mocked(output);

function mockProjectListFetch(
  projects: Array<{
    id: string;
    name: string;
    updatedAt: number;
    createdAt: number;
  }>,
  pagination: { count: number; next: number | null } = {
    count: projects.length,
    next: null,
  },
  storeResponse: { store: { id: string; region?: string } } = {
    store: { id: 'store_test123' },
  }
) {
  client.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/v9/projects?limit=100') {
      return Promise.resolve({ projects, pagination });
    }
    return Promise.resolve(storeResponse);
  });
}

const defaultProjects = [
  {
    id: 'proj_123',
    name: 'my-project',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  },
  {
    id: 'proj_456',
    name: 'other-project',
    updatedAt: Date.now() - 1000,
    createdAt: Date.now() - 1000,
  },
];

describe('blob store add', () => {
  const textInputMock = vi.fn().mockResolvedValue('test-store-name');
  const selectInputMock = vi.fn().mockResolvedValue('proj_selected');
  const confirmInputMock = vi.fn().mockResolvedValue(true);
  const checkboxInputMock = vi
    .fn()
    .mockResolvedValue(['production', 'preview', 'development']);

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Mock output.link to return the URL text
    mockedOutput.link.mockImplementation((text: string) => text);

    mockProjectListFetch(defaultProjects);

    client.input.text = textInputMock;
    client.input.select = selectInputMock;
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
    mockedEnvPullCommandLogic.mockResolvedValue(undefined);
  });

  describe('successful store creation', () => {
    it('should create store with provided name and selected project', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        '--access',
        'public',
        'my-test-store'
      );

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'my-test-store',
      ]);

      expect(exitCode).toBe(0);
      expect(selectInputMock).toHaveBeenCalledWith({
        message: 'Select a project to link to the blob store:',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: 'my-project', value: 'proj_123' }),
        ]),
      });
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'my-test-store',
          region: 'iad1',
          access: 'public',
          projectId: 'proj_selected',
          version: '2',
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
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Access: public. Learn more:')
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

    it('should show private access docs link for private stores', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        '--access',
        'private',
        'my-private-store'
      );

      const exitCode = await addStore(client, [
        '--access',
        'private',
        'my-private-store',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Access: private. Learn more:')
      );
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://vercel.com/docs/vercel-blob/private-storage'
        )
      );
    });

    it('should create store with specified region', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        '--access',
        'public',
        'my-test-store',
        '--region',
        'sfo1'
      );
      mockProjectListFetch(
        defaultProjects,
        { count: 2, next: null },
        {
          store: { id: 'store_test123', region: 'sfo1' },
        }
      );

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'my-test-store',
        '--region',
        'sfo1',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'my-test-store',
          region: 'sfo1',
          access: 'public',
          projectId: 'proj_selected',
          version: '2',
        }),
        accountId: 'org_123',
      });
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Blob store created: my-test-store (store_test123) in sfo1'
      );
    });

    it('should display region in success message when API returns region', async () => {
      client.setArgv(
        'blob',
        'store',
        'add',
        '--access',
        'public',
        'region-display-store'
      );
      mockProjectListFetch(
        defaultProjects,
        { count: 2, next: null },
        {
          store: { id: 'store_test123', region: 'iad1' },
        }
      );

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'region-display-store',
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
    });
  });

  describe('project selection', () => {
    it('should show project select when projects fit on one page', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(0);
      expect(selectInputMock).toHaveBeenCalledWith({
        message: 'Select a project to link to the blob store:',
        choices: [
          { name: 'my-project', value: 'proj_123' },
          { name: 'other-project', value: 'proj_456' },
        ],
      });
    });

    it('should sort projects by updatedAt (newest first)', async () => {
      mockProjectListFetch([
        {
          id: 'proj_old',
          name: 'old-project',
          updatedAt: 1000,
          createdAt: 1000,
        },
        {
          id: 'proj_new',
          name: 'new-project',
          updatedAt: 3000,
          createdAt: 3000,
        },
        {
          id: 'proj_mid',
          name: 'mid-project',
          updatedAt: 2000,
          createdAt: 2000,
        },
      ]);

      await addStore(client, ['--access', 'public', 'test-store']);

      expect(selectInputMock).toHaveBeenCalledWith({
        message: 'Select a project to link to the blob store:',
        choices: [
          { name: 'new-project', value: 'proj_new' },
          { name: 'mid-project', value: 'proj_mid' },
          { name: 'old-project', value: 'proj_old' },
        ],
      });
    });

    it('should use text input when there are more projects than one page', async () => {
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/v9/projects?limit=100') {
          return Promise.resolve({
            projects: [
              {
                id: 'proj_1',
                name: 'project-1',
                updatedAt: Date.now(),
                createdAt: Date.now(),
              },
            ],
            pagination: { count: 100, next: 12345 },
          });
        }
        if (url === `/v9/projects/${encodeURIComponent('typed-project')}`) {
          return Promise.resolve({
            id: 'proj_typed',
            name: 'typed-project',
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return Promise.resolve({ store: { id: 'store_test123' } });
      });

      client.input.text = vi.fn().mockImplementation(async opts => {
        if (opts.message.includes('project')) {
          return 'typed-project';
        }
        return 'test-store-name';
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(0);
    });

    it('should return 1 when no projects are found', async () => {
      mockProjectListFetch([]);

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'No projects found. Create a project first before creating a blob store.'
      );
    });
  });

  describe('--project flag', () => {
    it('should skip interactive selection when --project is provided', async () => {
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === `/v9/projects/${encodeURIComponent('proj_123')}`) {
          return Promise.resolve({
            id: 'proj_123',
            name: 'my-project',
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return Promise.resolve({
          store: { id: 'store_test123' },
        });
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'my-test-store',
        '--project',
        'proj_123',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'my-test-store',
          region: 'iad1',
          access: 'public',
          projectId: 'proj_123',
          version: '2',
        }),
        accountId: 'org_123',
      });
    });

    it('should return 1 when --project references a non-existent project', async () => {
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (
          url === `/v9/projects/${encodeURIComponent('non-existent-project')}`
        ) {
          const err = new Error('Not Found') as any;
          err.status = 404;
          err.code = 'not_found';
          return Promise.reject(err);
        }
        return Promise.resolve({
          store: { id: 'store_test123' },
        });
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'my-test-store',
        '--project',
        'non-existent-project',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Project not found: non-existent-project'
      );
    });

    it('should track --project in telemetry', async () => {
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === `/v9/projects/${encodeURIComponent('proj_123')}`) {
          return Promise.resolve({
            id: 'proj_123',
            name: 'my-project',
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return Promise.resolve({
          store: { id: 'store_test123' },
        });
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'my-test-store',
        '--project',
        'proj_123',
      ]);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:access', value: 'public' },
        { key: 'option:project', value: '[REDACTED]' },
      ]);
    });
  });

  describe('non-interactive mode', () => {
    it('should fail when no --project flag in non-TTY and projects exist', async () => {
      (client.stdin as any).isTTY = false;

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Missing required flag --project. Use --project <id-or-name> to specify the project in non-interactive mode.'
      );
    });

    it('should succeed with --project flag in non-TTY mode', async () => {
      (client.stdin as any).isTTY = false;
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === `/v9/projects/${encodeURIComponent('my-project')}`) {
          return Promise.resolve({
            id: 'proj_123',
            name: 'my-project',
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return Promise.resolve({
          store: { id: 'store_test123' },
        });
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
        '--project',
        'my-project',
      ]);

      expect(exitCode).toBe(0);
    });
  });

  describe('not_linked org selection', () => {
    it('should prompt for org when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        org: null,
        project: null,
        status: 'not_linked',
      });
      mockedSelectOrg.mockResolvedValue({
        id: 'org_from_prompt',
        slug: 'prompted-org',
        type: 'team',
      });

      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === `/v9/projects/${encodeURIComponent('my-project')}`) {
          return Promise.resolve({
            id: 'proj_123',
            name: 'my-project',
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return Promise.resolve({
          store: { id: 'store_test123' },
        });
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
        '--project',
        'my-project',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedSelectOrg).toHaveBeenCalledWith(
        client,
        'Which scope should own the blob store?'
      );
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores/blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-store',
          region: 'iad1',
          access: 'public',
          projectId: 'proj_123',
          version: '2',
        }),
        accountId: 'org_from_prompt',
      });
    });
  });

  describe('project linking', () => {
    it('should link store to project when confirmed', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
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
        { accountId: 'org_123' }
      );
      expect(mockedEnvPullCommandLogic).toHaveBeenCalledWith(
        client,
        '.env.local',
        true,
        'development',
        expect.objectContaining({ status: 'linked' }),
        undefined,
        client.cwd,
        'vercel-cli:blob:store-add'
      );
    });

    it('should not link store when user declines', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(false);

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(0);
      expect(client.input.checkbox).not.toHaveBeenCalled();
      expect(mockedConnectResourceToProject).not.toHaveBeenCalled();
      expect(mockedEnvPullCommandLogic).not.toHaveBeenCalled();
    });

    it('should auto-link with all environments when --yes is passed', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'private',
        'ci-store',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(client.input.checkbox).not.toHaveBeenCalled();
      expect(mockedConnectResourceToProject).toHaveBeenCalledWith(
        client,
        'proj_123',
        'store_test123',
        ['production', 'preview', 'development'],
        { accountId: 'org_123' }
      );
    });

    it('should use --environment flags when provided with --yes', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'private',
        'ci-store',
        '--yes',
        '--environment',
        'production',
        '--environment',
        'preview',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedConnectResourceToProject).toHaveBeenCalledWith(
        client,
        'proj_123',
        'store_test123',
        ['production', 'preview'],
        { accountId: 'org_123' }
      );
    });

    it('should reject invalid --environment values', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'private',
        'ci-store',
        '--environment',
        'staging',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment value')
      );
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const exitCode = await addStore(client, ['--invalid-flag']);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when --access flag is missing in non-TTY', async () => {
      (client.stdin as any).isTTY = false;
      const exitCode = await addStore(client, ['test-store']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Missing required --access flag. Must be 'public' or 'private'."
      );
    });

    it('should prompt for access type when --access flag is missing in TTY', async () => {
      client.input.select = vi.fn().mockImplementation(opts => {
        if (opts.message.includes('access type')) {
          return Promise.resolve('private');
        }
        return Promise.resolve('proj_selected');
      });

      const exitCode = await addStore(client, ['test-store']);

      expect(exitCode).toBe(0);
      expect(client.input.select).toHaveBeenCalledWith({
        message: 'Choose the access type for the blob store',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: 'Private', value: 'private' }),
          expect.objectContaining({ name: 'Public', value: 'public' }),
        ]),
      });
    });

    it('should return 1 when store creation fails', async () => {
      const apiError = new Error('Store creation failed');
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/v9/projects?limit=100') {
          return Promise.resolve({
            projects: [
              {
                id: 'proj_123',
                name: 'my-project',
                updatedAt: Date.now(),
                createdAt: Date.now(),
              },
            ],
            pagination: { count: 1, next: null },
          });
        }
        return Promise.reject(apiError);
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'test-store',
      ]);

      expect(exitCode).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      client.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/v9/projects?limit=100') {
          return Promise.resolve({
            projects: [
              {
                id: 'proj_123',
                name: 'my-project',
                updatedAt: Date.now(),
                createdAt: Date.now(),
              },
            ],
            pagination: { count: 1, next: null },
          });
        }
        return Promise.reject(apiError);
      });

      const exitCode = await addStore(client, [
        '--access',
        'public',
        'failing-store',
      ]);

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });
  });

  describe('telemetry tracking', () => {
    it('should track name argument when provided', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'public',
        'telemetry-test-store',
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
  });

  describe('interactive prompt validation', () => {
    it('should validate store name length correctly', async () => {
      client.setArgv('blob', 'store', 'add', '--access', 'public');
      await addStore(client, ['--access', 'public']);

      const textCall = textInputMock.mock.calls[0][0];
      const validateFn = textCall.validate;

      expect(validateFn('a')).toBe('Name must be at least 5 characters long');
      expect(validateFn('abcd')).toBe(
        'Name must be at least 5 characters long'
      );
      expect(validateFn('abcde')).toBe(true);
      expect(validateFn('valid-store-name')).toBe(true);
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during store creation and stop on success', async () => {
      const exitCode = await addStore(client, [
        '--access',
        'public',
        'spinner-test',
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
        '--access',
        'public',
        'link-spinner-test',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith(
        'Connecting link-spinner-test to my-project...'
      );
    });
  });
});
