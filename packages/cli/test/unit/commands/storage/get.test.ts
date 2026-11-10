import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  BLOB_STORE_ID,
  blobStore,
  connectedBlobStore,
  EDGE_CONFIG_STORE_ID,
  edgeConfigStore,
  marketplaceStore,
  mockGetGlobalConfig,
  useStorageStores,
} from '../../../mocks/storage';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('storage get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_storage_test',
        name: 'storage-project',
        accountId: 'team_dummy',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'team_dummy', slug: 'acme', type: 'team' },
    });
    useUser();
    useTeams('team_dummy');
  });

  it('shows Blob details, connections, and the dashboard link as JSON', async () => {
    const listed = connectedBlobStore({
      environmentVariables: ['BLOB_STORE_ID'],
      environments: ['production', 'preview'],
      projectId: 'prj_1',
      projectName: 'web',
    });
    useStorageStores([listed], {
      after: [
        {
          ...listed,
          ...({
            region: 'iad1',
            access: 'private',
            size: 2048,
            count: 7,
            billingState: 'active',
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_100_000,
          } as Record<string, unknown>),
        },
      ],
    });

    client.setArgv('storage', 'get', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toEqual({
      id: BLOB_STORE_ID,
      name: 'my-blob-store',
      type: 'blob',
      product: 'Vercel Blob',
      status: 'available',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      dashboardUrl: `https://vercel.com/acme/~/stores/blob/${BLOB_STORE_ID}`,
      details: {
        region: 'iad1',
        access: 'private',
        size: 2048,
        count: 7,
        billingState: 'active',
        baseUrl: 'blob123.private.blob.vercel-storage.com',
      },
      connections: [
        {
          id: 'spc_blob_1',
          project: { id: 'prj_1', name: 'web' },
          environments: ['production', 'preview'],
        },
      ],
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'get' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'argument:store', value: '[REDACTED]' },
    ]);
  });

  it('enriches a Global Config from its own API', async () => {
    useStorageStores([edgeConfigStore()]);
    mockGetGlobalConfig({ itemCount: 3, sizeInBytes: 128, digest: 'abc' });

    client.setArgv('storage', 'get', EDGE_CONFIG_STORE_ID, '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      id: EDGE_CONFIG_STORE_ID,
      type: 'global-config',
      product: 'Vercel Global Config',
      details: { slug: 'flags', itemCount: 3, sizeInBytes: 128, digest: 'abc' },
      connections: [],
    });
  });

  describe('when a Blob store and a Global Config share a name', () => {
    const sameName = () => [
      blobStore({ name: 'uploads' }),
      edgeConfigStore({ name: 'uploads' }),
    ];

    it('asks for --type or an ID', async () => {
      useStorageStores(sameName());

      client.setArgv('storage', 'get', 'uploads', '--json');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'ambiguous_store',
      });
      expect(payload.message).toContain(`${BLOB_STORE_ID} (blob)`);
      expect(payload.message).toContain(
        `${EDGE_CONFIG_STORE_ID} (global-config)`
      );
      expect(payload.message).toContain('--type');
    });

    it('resolves the Blob store with --type blob', async () => {
      useStorageStores(sameName());

      client.setArgv('storage', 'get', 'uploads', '--type', 'blob', '--json');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ id: BLOB_STORE_ID, type: 'blob' });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:inspect', value: 'get' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'argument:store', value: '[REDACTED]' },
        { key: 'option:type', value: 'blob' },
      ]);
    });

    it('resolves the Global Config with --type global-config', async () => {
      useStorageStores(sameName());
      mockGetGlobalConfig();

      client.setArgv(
        'storage',
        'get',
        'uploads',
        '--type',
        'global-config',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        id: EDGE_CONFIG_STORE_ID,
        type: 'global-config',
      });
    });

    it('reports not found when --type excludes every match', async () => {
      useStorageStores(sameName());

      client.setArgv('storage', 'get', 'uploads', '--type', 'integration');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('No storage resource uploads found');
    });
  });

  it('prints an aligned detail block', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'inspect', 'my-blob-store');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Store');
    expect(stderr).toContain('my-blob-store');
    expect(stderr).toContain(BLOB_STORE_ID);
    expect(stderr).toContain('Vercel Blob');
    expect(stderr).toContain('not connected');
    expect(stderr).not.toMatch(/^[▲✓!] /m);
    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('falls back to the generic fields for a store type without a provider', async () => {
    useStorageStores([marketplaceStore()]);

    client.setArgv('storage', 'get', 'my-acme-resource', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      type: 'integration',
      product: 'Acme',
      details: {},
    });
  });

  it('errors when the store does not exist', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'get', 'missing', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({ status: 'error', reason: 'not_found' });
    expect(payload.next[0].command).toEqual('vercel storage list');
  });

  it('requires a store argument', async () => {
    client.setArgv('storage', 'get');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('You must specify a storage resource');
  });

  it('runs as inspect without a deprecation warning', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'inspect', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      id: BLOB_STORE_ID,
    });
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'argument:store', value: '[REDACTED]' },
    ]);
  });

  it('warns when invoked as the deprecated get name', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'get', 'my-blob-store');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      '`vercel storage get` is deprecated. Use `vercel storage inspect`.'
    );
  });

  it('keeps stderr clean when invoked as get with --json', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'get', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      id: BLOB_STORE_ID,
    });
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });
});
