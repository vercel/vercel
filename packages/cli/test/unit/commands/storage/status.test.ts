import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  BLOB_STORE_ID,
  blobStore,
  connectedBlobStore,
  marketplaceStore,
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

describe('storage status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    // Scope-wide reads (`--all`, or naming a store) resolve the team instead
    // of a linked project.
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  it('reports the credential mode and env vars of the linked project', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: ['production', 'preview'],
        environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
      }),
      blobStore({ id: 'store_unused', name: 'unused-store' }),
    ]);

    client.setArgv('storage', 'status', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores).toHaveLength(1);
    expect(payload.stores[0]).toMatchObject({
      id: BLOB_STORE_ID,
      name: 'my-blob-store',
      type: 'blob',
      product: 'Vercel Blob',
      connections: [
        {
          id: 'spc_blob_1',
          project: { id: projectId, name: projectName },
          environments: ['production', 'preview'],
          envVarPrefix: null,
          auth: 'oidc',
          environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
        },
      ],
    });
  });

  it('reports a static-token connection as token auth', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);

    client.setArgv('storage', 'status', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores[0].connections[0].auth).toEqual('token');
  });

  it('reports marketplace resources as provider-managed', async () => {
    useStorageStores([
      marketplaceStore({
        projectsMetadata: [
          {
            id: 'spc_market_1',
            projectId,
            name: projectName,
            environments: ['production'],
            envVarPrefix: null,
            environmentVariables: ['ACME_API_KEY'],
          },
        ],
      }),
    ]);

    client.setArgv('storage', 'status', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores[0]).toMatchObject({
      product: 'Acme',
      type: 'integration',
      connections: [{ auth: 'provider-managed' }],
    });
  });

  it('shows every project connected to a named store', async () => {
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

    client.setArgv('storage', 'status', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(
      payload.stores[0].connections.map((c: any) => c.project.name)
    ).toEqual(['app-a', 'app-b']);
  });

  it('lists every resource in the scope with --all', async () => {
    useStorageStores([
      blobStore(),
      marketplaceStore(),
      blobStore({ id: 'store_pg', name: 'my-pg', type: 'postgres' }),
    ]);

    client.setArgv('storage', 'status', '--all', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores.map((store: any) => store.product)).toEqual([
      'Vercel Blob',
      'Acme',
      'Vercel Postgres',
    ]);
  });

  it('prints a human-readable table', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: ['production'],
        environmentVariables: ['BLOB_STORE_ID'],
      }),
    ]);

    client.setArgv('storage', 'status');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('my-blob-store');
    expect(stderr).toContain('oidc (no static credentials)');
    expect(stderr).toContain('BLOB_STORE_ID');
  });

  it('says so when the project has no storage connections', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'status');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No storage resources are connected');
  });

  it('errors when the named store does not exist', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'status', 'nope');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No storage resource nope found');
  });

  it('reads a named store without a linked project', async () => {
    mockedGetLinkedProject.mockResolvedValue({ status: 'not_linked' } as never);
    useStorageStores([
      connectedBlobStore({
        projectId: 'prj_a',
        projectName: 'app-a',
        environments: ['production'],
        environmentVariables: ['BLOB_STORE_ID'],
      }),
    ]);

    client.setArgv('storage', 'status', 'my-blob-store', '--json');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.stores[0].connections[0].project.name).toEqual('app-a');
  });

  it('narrows to one project with --project', async () => {
    useStorageStores([
      blobStore({
        projectsMetadata: [
          {
            id: 'spc_a',
            projectId,
            name: projectName,
            environments: ['production'],
            envVarPrefix: null,
            environmentVariables: ['BLOB_STORE_ID'],
          },
          {
            id: 'spc_b',
            projectId: 'prj_other',
            name: 'other-project',
            environments: ['preview'],
            envVarPrefix: null,
            environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
          },
        ],
      }),
    ]);

    client.setArgv(
      'storage',
      'status',
      'my-blob-store',
      '--project',
      projectName,
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(
      payload.stores[0].connections.map((c: { id: string }) => c.id)
    ).toEqual(['spc_a']);
  });

  it('rejects --all together with --project', async () => {
    client.setArgv('storage', 'status', '--all', '--project', projectName);
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      '--all and --project cannot be combined.'
    );
  });
});
