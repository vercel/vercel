import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import listStores from '../../../../src/commands/blob/store-list';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import getProjectByIdOrName from '../../../../src/util/projects/get-project-by-id-or-name';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');
vi.mock('../../../../src/output-manager');

const mockedGetLinkFromDir = vi.mocked(linkModule.getLinkFromDir);
const mockedGetVercelDirectory = vi.mocked(linkModule.getVercelDirectory);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProjectByIdOrName = vi.mocked(getProjectByIdOrName);
const mockedOutput = vi.mocked(output);

describe('blob list-stores', () => {
  const selectInputMock = vi.fn();

  const mockStores = [
    {
      id: 'store_abc123def456ghij',
      name: 'my-store',
      type: 'blob',
      projectsMetadata: [
        {
          projectId: 'proj_123',
          name: 'my-project',
          environments: ['production'],
        },
      ],
    },
    {
      id: 'store_xyz789uvw012klmn',
      name: 'other-store',
      type: 'blob',
      projectsMetadata: [
        {
          projectId: 'proj_456',
          name: 'other-project',
          environments: ['preview'],
        },
      ],
    },
    {
      id: 'store_shared123456789',
      name: 'shared-store',
      type: 'blob',
      projectsMetadata: [
        {
          projectId: 'proj_123',
          name: 'my-project',
          environments: ['production'],
        },
        {
          projectId: 'proj_456',
          name: 'other-project',
          environments: ['preview'],
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    client.input.select = selectInputMock;

    // Default: linked project via dirLink
    mockedGetVercelDirectory.mockReturnValue('/test/.vercel');
    mockedGetLinkFromDir.mockResolvedValue({
      projectId: 'proj_123',
      orgId: 'org_123',
    });
    mockedGetProjectByIdOrName.mockResolvedValue({
      id: 'proj_123',
      name: 'my-project',
    } as any);

    // Default: fetch returns all stores
    client.fetch = vi.fn().mockResolvedValue({
      stores: mockStores,
    });

    // Default: cancel on first select
    selectInputMock.mockResolvedValue('');
  });

  describe('with linked project', () => {
    it('should filter stores to those connected to the linked project', async () => {
      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores', {
        method: 'GET',
        accountId: 'org_123',
      });

      // Should show select with only stores connected to proj_123
      expect(selectInputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select a store to view details',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'store_abc123def456ghij' }),
            expect.objectContaining({ value: 'store_shared123456789' }),
            expect.objectContaining({ name: 'Cancel', value: '' }),
          ]),
        })
      );

      // Should NOT include the store not connected to proj_123
      const choices = selectInputMock.mock.calls[0][0].choices;
      const storeValues = choices.map((c: { value: string }) => c.value);
      expect(storeValues).not.toContain('store_xyz789uvw012klmn');
    });

    it('should show project-specific header', async () => {
      await listStores(client, []);

      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Blob stores for project')
      );
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('my-project')
      );
    });
  });

  describe('without linked project', () => {
    beforeEach(() => {
      mockedGetLinkFromDir.mockResolvedValue(null);
      mockedGetScope.mockResolvedValue({
        contextName: 'my-team',
        team: { id: 'team_123', slug: 'my-team' } as any,
        user: {} as any,
      });
    });

    it('should show all team stores when no project is linked', async () => {
      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith('/v1/storage/stores', {
        method: 'GET',
        accountId: 'team_123',
      });

      // Should show all stores
      const choices = selectInputMock.mock.calls[0][0].choices;
      const storeValues = choices.map((c: { value: string }) => c.value);
      expect(storeValues).toContain('store_abc123def456ghij');
      expect(storeValues).toContain('store_xyz789uvw012klmn');
      expect(storeValues).toContain('store_shared123456789');
    });

    it('should show generic header', async () => {
      await listStores(client, []);

      expect(mockedOutput.log).toHaveBeenCalledWith('Blob stores:');
    });

    it('should return 1 when team is not found', async () => {
      mockedGetScope.mockResolvedValue({
        contextName: '',
        team: null,
        user: {} as any,
      });

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith('Team not found.');
    });
  });

  describe('store selection and details', () => {
    it('should show store details on selection', async () => {
      const storeDetails = {
        store: {
          id: 'store_abc123def456ghij',
          name: 'my-store',
          createdAt: 1640995200000,
          updatedAt: 1672531200000,
          billingState: 'active',
          size: 1048576,
          count: 42,
        },
      };

      // First call: list stores, second call: store details
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({ stores: mockStores })
        .mockResolvedValueOnce(storeDetails);

      selectInputMock.mockResolvedValueOnce('store_abc123def456ghij');

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);

      // Should have fetched store details
      expect(client.fetch).toHaveBeenCalledWith(
        '/v1/storage/stores/store_abc123def456ghij',
        {
          method: 'GET',
          accountId: 'org_123',
        }
      );

      // Should have printed store details
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('my-store')
      );

      // Select should only be called once (no loop)
      expect(selectInputMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty store list', () => {
    it('should show generic message when no stores found without linked project', async () => {
      mockedGetLinkFromDir.mockResolvedValue(null);
      mockedGetScope.mockResolvedValue({
        contextName: 'my-team',
        team: { id: 'team_123', slug: 'my-team' } as any,
        user: {} as any,
      });
      client.fetch = vi.fn().mockResolvedValue({ stores: [] });

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith('No blob stores found');
      expect(selectInputMock).not.toHaveBeenCalled();
    });

    it('should hint about --all when no stores found in linked project', async () => {
      client.fetch = vi.fn().mockResolvedValue({ stores: [] });

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('No blob stores connected to')
      );
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('--all')
      );
      expect(selectInputMock).not.toHaveBeenCalled();
    });

    it('should hint about --all when no stores match linked project', async () => {
      client.fetch = vi.fn().mockResolvedValue({
        stores: [
          {
            id: 'store_unrelated1234567',
            name: 'unrelated-store',
            type: 'blob',
            projectsMetadata: [
              { projectId: 'proj_other', name: 'other', environments: [] },
            ],
          },
        ],
      });

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('No blob stores connected to')
      );
      expect(mockedOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('--all')
      );
    });
  });

  describe('--all flag', () => {
    it('should show all team stores when --all is used in a linked project', async () => {
      const exitCode = await listStores(client, ['--all']);

      expect(exitCode).toBe(0);

      // Should show all stores, not just those connected to proj_123
      const choices = selectInputMock.mock.calls[0][0].choices;
      const storeValues = choices.map((c: { value: string }) => c.value);
      expect(storeValues).toContain('store_abc123def456ghij');
      expect(storeValues).toContain('store_xyz789uvw012klmn');
      expect(storeValues).toContain('store_shared123456789');
    });

    it('should show generic header with --all', async () => {
      await listStores(client, ['--all']);

      expect(mockedOutput.log).toHaveBeenCalledWith('Blob stores:');
    });

    it('should track --all flag in telemetry', async () => {
      await listStores(client, ['--all']);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:all', value: 'TRUE' },
      ]);
    });
  });

  describe('--json', () => {
    it('should print JSON to stdout and skip interactive UI', async () => {
      client.fetch = vi.fn().mockResolvedValue({
        stores: [
          {
            id: 'store_json',
            name: 'json-store',
            type: 'blob',
            region: 'cdg1',
            size: 5000,
            count: 10,
            billingState: 'active',
            status: 'available',
            createdAt: 1705420800000,
            updatedAt: 1705507200000,
            projectsMetadata: [
              { projectId: 'proj_123', name: 'my-project', environments: [] },
            ],
          },
        ],
      });

      const exitCode = await listStores(client, ['--json']);

      expect(exitCode).toBe(0);
      expect(selectInputMock).not.toHaveBeenCalled();
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.stores[0]).toMatchObject({
        id: 'store_json',
        name: 'json-store',
        region: 'cdg1',
        projects: [{ id: 'proj_123', name: 'my-project' }],
      });
    });

    it('should output empty stores array when none match', async () => {
      client.fetch = vi.fn().mockResolvedValue({ stores: [] });

      const exitCode = await listStores(client, ['--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        stores: [],
      });
    });

    it('should track json flag in telemetry', async () => {
      client.fetch = vi.fn().mockResolvedValue({ stores: mockStores });

      await listStores(client, ['--json']);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });
  });

  describe('--no-projects', () => {
    beforeEach(() => {
      (client.stdin as any).isTTY = false;
    });

    it('should omit Projects column from table output', async () => {
      client.fetch = vi.fn().mockResolvedValue({ stores: mockStores });

      const exitCode = await listStores(client, ['--no-projects']);

      expect(exitCode).toBe(0);
      const printCall = mockedOutput.print.mock.calls[0][0];
      expect(printCall).toContain('Name');
      expect(printCall).not.toContain('Projects');
    });

    it('should track --no-projects telemetry', async () => {
      client.fetch = vi.fn().mockResolvedValue({ stores: mockStores });

      await listStores(client, ['--no-projects']);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:no-projects', value: 'TRUE' },
      ]);
    });
  });

  describe('non-blob stores', () => {
    it('should exclude non-blob store types from results', async () => {
      client.fetch = vi.fn().mockResolvedValue({
        stores: [
          {
            id: 'blob-one',
            name: 'blob-store',
            type: 'blob',
            projectsMetadata: [],
          },
          {
            id: 'pg-one',
            name: 'postgres-store',
            type: 'postgres',
            projectsMetadata: [],
          },
        ],
      });

      const exitCode = await listStores(client, ['--all']);

      expect(exitCode).toBe(0);

      const choices = selectInputMock.mock.calls[0][0].choices;
      const storeValues = choices.map((c: { value: string }) => c.value);
      expect(storeValues).toContain('blob-one');
      expect(storeValues).not.toContain('pg-one');
    });
  });

  describe('non-TTY behavior', () => {
    beforeEach(() => {
      (client.stdin as any).isTTY = false;
    });

    it('should print table and exit for non-TTY', async () => {
      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      expect(selectInputMock).not.toHaveBeenCalled();
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('my-store')
      );
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('store_abc123def456ghij')
      );
    });

    it('should filter stores by project in non-TTY mode too', async () => {
      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
      // Should only contain stores for proj_123
      const printCall = mockedOutput.print.mock.calls[0][0];
      expect(printCall).toContain('my-store');
      expect(printCall).toContain('shared-store');
      expect(printCall).not.toContain('other-store');
    });
  });

  describe('cancel', () => {
    it('should exit cleanly on cancel', async () => {
      selectInputMock.mockResolvedValue('');

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const exitCode = await listStores(client, ['--invalid-flag']);

      expect(exitCode).toBe(1);
    });

    it('should return 1 when API call fails', async () => {
      client.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(1);
    });

    it('should return 1 when store details fetch fails', async () => {
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({ stores: mockStores })
        .mockRejectedValueOnce(new Error('Store not found'));

      selectInputMock.mockResolvedValueOnce('store_abc123def456ghij');

      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(1);
    });
  });

  describe('telemetry', () => {
    it('should initialize telemetry client', async () => {
      const exitCode = await listStores(client, []);

      expect(exitCode).toBe(0);
    });
  });
});
