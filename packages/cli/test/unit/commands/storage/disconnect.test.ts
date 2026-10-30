import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  BLOB_STORE_ID,
  blobStore,
  connectedBlobStore,
  mockDisconnectAllConnections,
  mockDisconnectConnection,
  useStorageStores,
} from '../../../mocks/storage';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

const projectId = 'prj_storage_test';
const projectName = 'storage-project';

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: projectId,
      name: projectName,
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'team_dummy', slug: 'acme', type: 'team' },
  });
}

describe('storage disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
  });

  it('removes the connection and reports the exact variables removed', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: ['production', 'preview'],
        environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      }),
    ]);
    const calls = mockDisconnectConnection();

    client.setArgv('storage', 'disconnect', 'my-blob-store');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput('- BLOB_STORE_ID');
    await expect(client.stderr).toOutput(
      `Disconnect my-blob-store from ${projectName}? This removes 2`
    );
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].storeId).toEqual(BLOB_STORE_ID);
    expect(calls[0].connectionId).toEqual('spc_blob_1');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Removed: BLOB_STORE_ID, BLOB_WEBHOOK_PUBLIC_KEY');
  });

  it('does nothing when the confirmation is declined', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      }),
    ]);
    const calls = mockDisconnectConnection();

    client.setArgv('storage', 'disconnect', 'my-blob-store');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput('Disconnect my-blob-store from');
    client.stdin.write('n\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
    expect(calls).toHaveLength(0);
  });

  it('rejects --yes since disconnecting always requires confirmation', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_STORE_ID'],
      }),
    ]);
    const calls = mockDisconnectConnection();

    client.setArgv('storage', 'disconnect', 'my-blob-store', '--yes');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    expect(calls).toHaveLength(0);
    await expect(client.stderr).toOutput('unknown or unexpected option: --yes');
  });

  it('rejects --json without --dry-run', async () => {
    const calls = mockDisconnectConnection();

    client.setArgv('storage', 'disconnect', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    expect(calls).toHaveLength(0);
    await expect(client.stderr).toOutput('--json requires --dry-run');
  });

  it('lists the removals in a dry run without mutating', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    const calls = mockDisconnectConnection();

    client.setArgv(
      'storage',
      'disconnect',
      'my-blob-store',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(calls).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      action: 'disconnect',
      dryRun: true,
      applied: false,
      projects: [{ id: projectId, name: projectName }],
      envVars: {
        add: [],
        remove: ['BLOB_READ_WRITE_TOKEN'],
        keep: [],
        source: 'connection',
      },
    });
    expect(payload).not.toHaveProperty('auth');
  });

  it('disconnects every project with --all', async () => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
    useStorageStores([
      blobStore({
        projectsMetadata: [
          {
            id: 'spc_a',
            projectId: 'prj_a',
            name: 'app-a',
            environments: ['production'],
            envVarPrefix: null,
            environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
          },
          {
            id: 'spc_b',
            projectId: 'prj_b',
            name: 'app-b',
            environments: ['preview'],
            envVarPrefix: null,
            environmentVariables: ['BLOB_STORE_ID'],
          },
        ],
      }),
    ]);
    const single = mockDisconnectConnection();
    const all = mockDisconnectAllConnections();

    client.setArgv('storage', 'disconnect', 'my-blob-store', '--all');
    const exitCodePromise = storage(client);

    await expect(client.stderr).toOutput(
      'Disconnect my-blob-store from 2 projects? This removes 2'
    );
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(single).toHaveLength(0);
    expect(all).toHaveLength(1);
    expect(all[0].storeId).toEqual(BLOB_STORE_ID);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('app-a');
    expect(stderr).toContain('app-b');
  });

  it('rejects --all together with --project', async () => {
    client.setArgv(
      'storage',
      'disconnect',
      'my-blob-store',
      '--all',
      '--project',
      'other'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      '--all and --project cannot be combined.'
    );
  });

  it('errors when the store is not connected to the project', async () => {
    useStorageStores([blobStore()]);
    const calls = mockDisconnectConnection();

    client.setArgv('storage', 'disconnect', 'my-blob-store');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(calls).toHaveLength(0);
    await expect(client.stderr).toOutput('is not connected to');
  });

  it('emits action_required and tells the user what to run in non-interactive mode', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    const calls = mockDisconnectConnection();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      _code?: number
    ) => {
      throw new Error('exit');
    }) as () => never);

    client.nonInteractive = true;
    client.setArgv(
      'storage',
      'disconnect',
      'my-blob-store',
      '--project',
      projectName
    );

    await expect(storage(client)).rejects.toThrow('exit');
    expect(calls).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'interactive_confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
      hint: expect.stringContaining('interactive terminal'),
      message: expect.stringContaining('interactive confirmation'),
      next: expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining(
            `storage disconnect my-blob-store --project ${projectName}`
          ),
          when: 'Review the change set and confirm in a terminal',
        }),
        expect.objectContaining({
          command: expect.stringContaining('--dry-run --json'),
        }),
      ]),
    });

    exitSpy.mockRestore();
  });

  it('refuses to run without a TTY', async () => {
    const calls = mockDisconnectConnection();

    (client.stdin as { isTTY: boolean }).isTTY = false;
    client.setArgv('storage', 'disconnect', 'my-blob-store');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(calls).toHaveLength(0);
    await expect(client.stderr).toOutput(
      'must be confirmed in an interactive terminal'
    );
  });

  it('still allows --dry-run in non-interactive mode', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    const calls = mockDisconnectConnection();

    client.nonInteractive = true;
    client.setArgv(
      'storage',
      'disconnect',
      'my-blob-store',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(calls).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      action: 'disconnect',
      dryRun: true,
      applied: false,
      envVars: { remove: ['BLOB_READ_WRITE_TOKEN'] },
    });
  });
});
