import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  BLOB_STORE_ID,
  blobStore,
  connectedBlobStore,
  marketplaceStore,
  mockUpdateConnection,
  mockUpgradeConnectionToOidc,
  useStorageStores,
} from '../../../mocks/storage';

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

const tokenOnlyConnection = () =>
  connectedBlobStore({
    projectId,
    projectName,
    environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
  });

const oidcConnection = () =>
  connectedBlobStore({
    projectId,
    projectName,
    environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
  });

describe('storage update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
  });

  it.each([
    'development',
    'production',
  ])('retains %s coverage in the optional local refresh suggestion', async environment => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: [environment],
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    mockUpdateConnection();
    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--prefix',
      'UPLOADS',
      '--yes',
      '--json'
    );
    expect(await storage(client)).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.environments).toEqual([environment]);
    if (environment === 'development') {
      expect(payload.next[0].command).toEqual(
        `vercel env pull --environment development --project ${projectId} --scope acme`
      );
    } else {
      expect(payload).not.toHaveProperty('next');
    }
  });

  it.each([
    'production',
    'preview',
  ])('suggests a development refresh when changing coverage to %s', async environment => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: ['development'],
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    const patches = mockUpdateConnection();
    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--environment',
      environment,
      '--yes',
      '--json'
    );

    expect(await storage(client)).toEqual(0);
    expect(patches[0].body).toMatchObject({
      envVarEnvironments: [environment],
    });
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.environments).toEqual([environment]);
    expect(payload.next[0].command).toEqual(
      `vercel env pull --environment development --project ${projectId} --scope acme`
    );
  });

  it('upgrades a static-token connection to OIDC and drops the token', async () => {
    useStorageStores([tokenOnlyConnection()], { after: [oidcConnection()] });
    const upgrades = mockUpgradeConnectionToOidc();
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'oidc',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].storeId).toEqual(BLOB_STORE_ID);
    expect(upgrades[0].connectionId).toEqual('spc_blob_1');
    expect(upgrades[0].headers['x-vercel-use-oidc']).toEqual('1');
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ skipReadWriteToken: true });
  });

  it('shows the exact env var changes in a dry run without mutating', async () => {
    useStorageStores([tokenOnlyConnection()]);
    const upgrades = mockUpgradeConnectionToOidc();
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'oidc',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(upgrades).toHaveLength(0);
    expect(patches).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      action: 'update',
      dryRun: true,
      applied: false,
      auth: { requested: 'oidc', effective: 'oidc', readWriteToken: false },
      envVars: {
        add: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
        remove: ['BLOB_READ_WRITE_TOKEN'],
        keep: [],
        source: 'computed',
      },
    });
  });

  it('keeps the static token when --add-rw-token accompanies the upgrade', async () => {
    useStorageStores([tokenOnlyConnection()]);
    const upgrades = mockUpgradeConnectionToOidc();
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'oidc',
      '--add-rw-token',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(upgrades).toHaveLength(1);
    expect(patches[0].body).toEqual({ skipReadWriteToken: false });
  });

  it('does not rotate credentials when only environments change', async () => {
    useStorageStores([
      connectedBlobStore({
        projectId,
        projectName,
        environments: ['production', 'preview', 'development'],
        environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
      }),
    ]);
    const upgrades = mockUpgradeConnectionToOidc();
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--environment',
      'production',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    // `--auth` defaults to the connection's current mode on update.
    expect(upgrades).toHaveLength(0);
    expect(patches[0].body).toEqual({
      envVarEnvironments: ['production'],
      skipReadWriteToken: false,
    });
  });

  it('re-adds the static token for --auth token --add-rw-token', async () => {
    useStorageStores([oidcConnection()]);
    const upgrades = mockUpgradeConnectionToOidc();
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'token',
      '--add-rw-token',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(upgrades).toHaveLength(0);
    expect(patches).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.envVars).toMatchObject({
      add: ['BLOB_READ_WRITE_TOKEN'],
      remove: [],
      keep: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
    });
    expect(payload.envVars.notes.join(' ')).toContain(
      'Vercel does not remove them'
    );
  });

  it('refuses --auth token without the explicit opt-in', async () => {
    useStorageStores([oidcConnection()]);
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'token',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(patches).toHaveLength(0);
    await expect(client.stderr).toOutput('--add-rw-token');
  });

  it('errors when nothing would change', async () => {
    useStorageStores([oidcConnection()]);
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'oidc',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    expect(patches).toHaveLength(0);
    await expect(client.stderr).toOutput('Nothing to update');
  });

  it('errors when the store is not connected to the project', async () => {
    useStorageStores([blobStore()]);

    client.setArgv('storage', 'update', 'my-blob-store', '--yes');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('is not connected to');
  });

  it('asks for --environment when a project has several connections', async () => {
    useStorageStores([
      blobStore({
        projectsMetadata: [
          {
            id: 'spc_a',
            projectId,
            name: projectName,
            environments: ['production'],
            envVarPrefix: null,
            environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
          },
          {
            id: 'spc_b',
            projectId,
            name: projectName,
            environments: ['preview'],
            envVarPrefix: 'PREVIEW',
            environmentVariables: ['PREVIEW_READ_WRITE_TOKEN'],
          },
        ],
      }),
    ]);

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--auth',
      'oidc',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Pass --environment to pick one');
  });

  it('re-scopes a marketplace connection without renaming its variables', async () => {
    useStorageStores([
      marketplaceStore({
        projectsMetadata: [
          {
            id: 'spc_market_1',
            projectId,
            name: projectName,
            environments: ['production', 'preview'],
            envVarPrefix: null,
            environmentVariables: ['ACME_API_KEY'],
          },
        ],
      }),
    ]);
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-acme-resource',
      '--environment',
      'production',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(patches).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.envVars).toMatchObject({
      add: [],
      remove: [],
      keep: ['ACME_API_KEY'],
      source: 'connection',
    });
    expect(payload.auth.effective).toEqual('provider-managed');
  });

  it('does not send a read-write-token knob for marketplace resources', async () => {
    useStorageStores([
      marketplaceStore({
        projectsMetadata: [
          {
            id: 'spc_market_1',
            projectId,
            name: projectName,
            environments: ['production', 'preview'],
            envVarPrefix: null,
            environmentVariables: ['ACME_API_KEY'],
          },
        ],
      }),
    ]);
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-acme-resource',
      '--environment',
      'production',
      '--yes'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(patches[0].body).toEqual({
      envVarEnvironments: ['production'],
    });
  });

  it('renames variables when the prefix changes', async () => {
    useStorageStores([tokenOnlyConnection()]);
    const patches = mockUpdateConnection();

    client.setArgv(
      'storage',
      'update',
      'my-blob-store',
      '--prefix',
      'UPLOADS',
      '--dry-run',
      '--json'
    );
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(patches).toHaveLength(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.envVars).toMatchObject({
      add: ['UPLOADS_READ_WRITE_TOKEN'],
      remove: ['BLOB_READ_WRITE_TOKEN'],
      keep: [],
    });
  });
});
