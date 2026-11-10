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
  mockDeleteBlobStore,
  mockDeleteGlobalConfig,
  mockDisconnectAllConnections,
  useStorageStores,
} from '../../../mocks/storage';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('storage delete', () => {
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

  it('previews the store, confirms, disconnects, and deletes a Blob store', async () => {
    useStorageStores([
      connectedBlobStore({
        environmentVariables: ['BLOB_STORE_ID'],
        projectId: 'prj_1',
        projectName: 'web',
      }),
    ]);
    const disconnects = mockDisconnectAllConnections();
    const deleted = mockDeleteBlobStore();

    client.setArgv('storage', 'delete', 'my-blob-store');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput('my-blob-store');
    await expect(client.stderr).toOutput('web');
    await expect(client.stderr).toOutput('Delete my-blob-store?');
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(disconnects).toHaveLength(1);
    expect(disconnects[0].storeId).toEqual(BLOB_STORE_ID);
    expect(deleted).toEqual([BLOB_STORE_ID]);
    const stderr = client.stderr.getFullOutput();
    // The prompt wraps in a narrow terminal, so check the consequence here.
    expect(stderr).toContain('disconnects it from 1 project');
    expect(stderr).toContain('✓ Deleted');
    expect(stderr).toContain('Disconnected');
    expect(stderr).toContain('vercel env pull');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:delete', value: 'delete' },
      { key: 'argument:store', value: '[REDACTED]' },
    ]);
  });

  it('disconnects a Global Config before deleting it through its own endpoint', async () => {
    useStorageStores([edgeConfigStore()]);
    const disconnects = mockDisconnectAllConnections();
    const deleted = mockDeleteGlobalConfig();

    client.setArgv('storage', 'delete', 'flags');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput(
      'Delete flags? This cannot be undone.'
    );
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(deleted).toEqual([EDGE_CONFIG_STORE_ID]);
    // The API refuses to delete a Global Config a project still uses.
    expect(disconnects).toHaveLength(1);
    expect(disconnects[0].storeId).toEqual(EDGE_CONFIG_STORE_ID);
  });

  it('uses --type to pick between same-named stores', async () => {
    useStorageStores([
      blobStore({ name: 'uploads' }),
      edgeConfigStore({ name: 'uploads' }),
    ]);
    mockDisconnectAllConnections();
    const deletedBlobs = mockDeleteBlobStore();
    const deletedConfigs = mockDeleteGlobalConfig();

    client.setArgv('storage', 'delete', 'uploads', '--type', 'global-config');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput('Delete uploads?');
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(deletedConfigs).toEqual([EDGE_CONFIG_STORE_ID]);
    expect(deletedBlobs).toHaveLength(0);
  });

  it('refuses an ambiguous name without --type', async () => {
    useStorageStores([
      blobStore({ name: 'uploads' }),
      edgeConfigStore({ name: 'uploads' }),
    ]);
    const deleted = mockDeleteBlobStore();

    client.setArgv('storage', 'delete', 'uploads');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(deleted).toHaveLength(0);
    await expect(client.stderr).toOutput('Pass --type <type> or a store ID');
  });

  it('defaults the confirmation to No and deletes nothing when declined', async () => {
    useStorageStores([blobStore()]);
    const deleted = mockDeleteBlobStore();

    client.setArgv('storage', 'delete', 'my-blob-store');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput('Delete my-blob-store?');
    client.stdin.write('\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(deleted).toHaveLength(0);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('refuses to run non-interactively and points a human at the command', async () => {
    useStorageStores([blobStore()]);
    const deleted = mockDeleteBlobStore();
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`exit ${code}`);
    }) as never);

    client.setArgv('storage', 'delete', 'my-blob-store', '--type', 'blob');
    await expect(storage(client)).rejects.toThrow('exit 1');

    expect(deleted).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'interactive_confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.next[0].command).toEqual(
      'vercel storage delete my-blob-store --type blob'
    );
    expect(payload.next[1].command).toEqual(
      'vercel storage inspect my-blob-store --json'
    );
    exitSpy.mockRestore();
  });

  it('refuses when stdin is not a TTY even without --non-interactive', async () => {
    useStorageStores([blobStore()]);
    const deleted = mockDeleteBlobStore();
    client.stdin.isTTY = false;

    client.setArgv('storage', 'delete', 'my-blob-store');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(deleted).toHaveLength(0);
    await expect(client.stderr).toOutput('Confirmation required');
  });

  it('reports a missing store non-interactively instead of asking for confirmation', async () => {
    useStorageStores([blobStore()]);
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`exit ${code}`);
    }) as never);

    client.setArgv('storage', 'delete', 'missing');
    await expect(storage(client)).rejects.toThrow('exit 1');

    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'not_found',
    });
    exitSpy.mockRestore();
  });

  it('redirects Marketplace resources non-interactively instead of asking for confirmation', async () => {
    useStorageStores([marketplaceStore()]);
    client.nonInteractive = true;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`exit ${code}`);
    }) as never);

    client.setArgv('storage', 'delete', 'my-acme-resource');
    await expect(storage(client)).rejects.toThrow('exit 2');

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(payload.next[0].command).toEqual(
      'vercel integration resource delete my-acme-resource'
    );
    exitSpy.mockRestore();
  });

  it('points Marketplace resources at integration resource delete', async () => {
    useStorageStores([marketplaceStore()]);
    const deleted = mockDeleteBlobStore();

    client.setArgv('storage', 'delete', 'my-acme-resource');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    expect(deleted).toHaveLength(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'my-acme-resource is a Marketplace resource (Acme)'
    );
    expect(stderr).toContain('vercel integration resource delete');
    expect(stderr).not.toContain('integration-resource');
    expect(stderr).not.toContain('dashboard');
  });

  it('rejects other store types the CLI cannot delete', async () => {
    useStorageStores([
      marketplaceStore({
        id: 'store_pg',
        name: 'my-postgres',
        type: 'postgres',
        product: undefined,
      }),
    ]);

    client.setArgv('storage', 'delete', 'my-postgres');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      'Vercel Postgres stores cannot be deleted with the CLI yet'
    );
  });

  it('errors when the store does not exist', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'delete', 'missing');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No storage resource missing found');
  });

  it('requires a store argument', async () => {
    client.setArgv('storage', 'delete');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('You must specify a storage resource');
  });
});
