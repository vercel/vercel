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
  useStorageStores,
} from '../../../mocks/storage';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('storage list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    // Not linked: the command falls back to the configured team scope.
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  it('lists every store type with its connected projects as JSON', async () => {
    useStorageStores([
      connectedBlobStore({
        environmentVariables: ['BLOB_STORE_ID'],
        projectId: 'prj_1',
        projectName: 'web',
      }),
      edgeConfigStore(),
      marketplaceStore(),
    ]);

    client.setArgv('storage', 'list', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores).toEqual([
      {
        id: BLOB_STORE_ID,
        name: 'my-blob-store',
        type: 'blob',
        product: 'Vercel Blob',
        status: 'available',
        projects: [{ id: 'prj_1', name: 'web' }],
      },
      {
        id: EDGE_CONFIG_STORE_ID,
        name: 'flags',
        type: 'global-config',
        product: 'Vercel Global Config',
        status: 'available',
        projects: [],
      },
      {
        id: 'store_market123',
        name: 'my-acme-resource',
        type: 'integration',
        product: 'Acme',
        status: 'available',
        projects: [],
      },
    ]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('filters by --type and accepts provider aliases', async () => {
    useStorageStores([blobStore(), edgeConfigStore()]);

    // `edge-config` is the old name; the API may still report it as the type.
    client.setArgv('storage', 'list', '--type', 'edge-config', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores.map((store: { id: string }) => store.id)).toEqual([
      EDGE_CONFIG_STORE_ID,
    ]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'option:type', value: 'global-config' },
    ]);
  });

  it('prints a scannable table', async () => {
    useStorageStores([blobStore(), edgeConfigStore()]);

    client.setArgv('storage', 'list');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Store');
    expect(stderr).toContain('my-blob-store');
    expect(stderr).toContain('Vercel Blob');
    expect(stderr).toContain('flags');
    expect(stderr).toContain('Vercel Global Config');
    expect(stderr).not.toContain('Edge Config');
    expect(stderr).toContain('not connected');
    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('returns an empty list as JSON with exit 0', async () => {
    useStorageStores([]);

    client.setArgv('storage', 'list', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({ stores: [] });
  });

  it('names the filter in the empty message', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'list', '--type', 'global-config');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'No storage resources of type global-config found'
    );
  });

  it('prefers the linked project team over the configured team', async () => {
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_linked',
        name: 'linked',
        accountId: 'team_linked',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'team_linked', slug: 'linked-team', type: 'team' },
    });
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'list', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(client.config.currentTeam).toEqual('team_linked');
  });

  it('rejects positional arguments', async () => {
    useStorageStores([]);

    client.setArgv('storage', 'list', 'extra');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('Too many arguments');
  });
});
