import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  BLOB_STORE_ID,
  MARKETPLACE_STORE_ID,
  blobStore,
  connectedBlobStore,
  marketplaceStore,
  mockConnectStore,
  mockConnectStoreError,
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

function lastBody(calls: { body: unknown }[]): Record<string, unknown> {
  return calls[calls.length - 1].body as Record<string, unknown>;
}

describe('storage connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
  });

  it.each([
    'development',
    'production',
    'preview',
  ])('suggests a scoped local refresh only for %s connections that affect development', async environment => {
    useStorageStores([blobStore()]);
    mockConnectStore();
    client.setArgv(
      'storage',
      'connect',
      'my-blob-store',
      '--project',
      'explicit-project',
      '--environment',
      environment,
      '--yes',
      '--json',
      '--token',
      'test-secret'
    );
    expect(await storage(client)).toEqual(0);
    expect(mockedGetLinkedProject).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        projectName: 'explicit-project',
        projectNameIsExplicit: true,
      })
    );
    const payload = JSON.parse(client.stdout.getFullOutput());
    if (environment === 'development') {
      expect(payload.next).toEqual([
        {
          command: `vercel env pull --environment development --project ${projectId} --scope acme`,
          when: 'if needed, refresh local development variables in .env.local',
        },
      ]);
    } else {
      expect(payload).not.toHaveProperty('next');
    }
    expect(client.stdout.getFullOutput()).not.toContain('test-secret');
  });

  describe('credential modes', () => {
    it('defaults to OIDC: sends the opt-in header and suppresses the static token', async () => {
      useStorageStores([blobStore()], {
        after: [
          connectedBlobStore({
            projectId,
            projectName,
            environmentVariables: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
          }),
        ],
      });
      const calls = mockConnectStore();

      client.setArgv('storage', 'connect', 'my-blob-store', '--yes');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].storeId).toEqual(BLOB_STORE_ID);
      expect(calls[0].headers['x-vercel-use-oidc']).toEqual('1');
      expect(lastBody(calls)).toEqual({
        projectId,
        envVarEnvironments: ['production', 'preview', 'development'],
        skipReadWriteToken: true,
      });
      await expect(client.stderr).toOutput('BLOB_STORE_ID');
    });

    it('keeps the static token only when --add-rw-token is passed', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--add-rw-token',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].headers['x-vercel-use-oidc']).toEqual('1');
      expect(lastBody(calls)).not.toHaveProperty('skipReadWriteToken');
    });

    it('refuses --auth token without the explicit --add-rw-token opt-in', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--auth',
        'token',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput(
        '--auth token writes a long-lived read-write token'
      );
      await expect(client.stderr).toOutput('--add-rw-token');
    });

    it('sends no OIDC header for --auth token --add-rw-token', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--auth',
        'token',
        '--add-rw-token',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].headers['x-vercel-use-oidc']).toBeUndefined();
      expect(lastBody(calls)).not.toHaveProperty('skipReadWriteToken');
    });

    it('rejects an unknown --auth value', async () => {
      useStorageStores([blobStore()]);

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--auth',
        'sso',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid --auth value: "sso"');
    });
  });

  describe('dry run', () => {
    it('prints the exact env var changes as JSON and mutates nothing', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--dry-run',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        action: 'connect',
        dryRun: true,
        applied: false,
        store: {
          id: BLOB_STORE_ID,
          name: 'my-blob-store',
          type: 'blob',
          product: 'Vercel Blob',
        },
        projects: [{ id: projectId, name: projectName }],
        environments: ['production', 'preview', 'development'],
        envVarPrefix: null,
        auth: { requested: 'oidc', effective: 'oidc', readWriteToken: false },
        envVars: {
          add: ['BLOB_STORE_ID', 'BLOB_WEBHOOK_PUBLIC_KEY'],
          remove: [],
          keep: [],
          source: 'computed',
        },
      });
    });

    it('prints the env var changes as text and mutates nothing', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv('storage', 'connect', 'my-blob-store', '--dry-run');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Storage connect plan (dry run)');
      expect(stderr).toContain('+ BLOB_STORE_ID');
      expect(stderr).toContain('+ BLOB_WEBHOOK_PUBLIC_KEY');
      expect(stderr).toContain('Credentials     oidc (no static credentials)');
      expect(stderr).toContain('No changes applied.');
    });

    it('includes the static token in the plan when --add-rw-token is passed', async () => {
      useStorageStores([blobStore()]);
      mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--add-rw-token',
        '--dry-run',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.envVars.add).toEqual([
        'BLOB_READ_WRITE_TOKEN',
        'BLOB_STORE_ID',
        'BLOB_WEBHOOK_PUBLIC_KEY',
      ]);
      expect(payload.auth).toEqual({
        requested: 'oidc',
        effective: 'oidc',
        readWriteToken: true,
      });
    });
  });

  describe('marketplace resources', () => {
    it('connects through the same resource identifier', async () => {
      useStorageStores([marketplaceStore()], {
        after: [
          marketplaceStore({
            projectsMetadata: [
              {
                id: 'spc_market_1',
                projectId,
                name: projectName,
                environments: ['production'],
                envVarPrefix: null,
                environmentVariables: ['ACME_API_KEY', 'ACME_DATABASE_URL'],
              },
            ],
          }),
        ],
      });
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-acme-resource',
        '--environment',
        'production',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].storeId).toEqual(MARKETPLACE_STORE_ID);
      // Provider-managed credentials: no read-write token knob is sent.
      expect(lastBody(calls)).toEqual({
        projectId,
        envVarEnvironments: ['production'],
      });
      await expect(client.stderr).toOutput('ACME_API_KEY');
    });

    it('reports provider-named variables as unresolved in a dry run', async () => {
      useStorageStores([marketplaceStore()]);

      client.setArgv(
        'storage',
        'connect',
        'my-acme-resource',
        '--dry-run',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.envVars.source).toEqual('provider');
      expect(payload.envVars.add).toEqual([]);
      expect(payload.auth.effective).toEqual('provider-managed');
      expect(payload.envVars.notes.join(' ')).toContain('Acme');
    });

    it('previews provider names from a sibling connection', async () => {
      useStorageStores([
        marketplaceStore({
          projectsMetadata: [
            {
              id: 'spc_market_other',
              projectId: 'prj_other',
              name: 'other-project',
              environments: ['production'],
              envVarPrefix: null,
              environmentVariables: ['ACME_API_KEY'],
            },
          ],
        }),
      ]);

      client.setArgv(
        'storage',
        'connect',
        'my-acme-resource',
        '--dry-run',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.envVars).toMatchObject({
        add: ['ACME_API_KEY'],
        source: 'connection',
      });
    });

    it('rejects --add-rw-token for a provider-managed resource', async () => {
      useStorageStores([marketplaceStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-acme-resource',
        '--add-rw-token',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput(
        '--add-rw-token only applies to Vercel Blob stores'
      );
    });
  });

  describe('prefix', () => {
    it('applies the prefix to the computed names', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--prefix',
        'UPLOADS',
        '--dry-run',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.envVarPrefix).toEqual('UPLOADS');
      expect(payload.envVars.add).toEqual([
        'UPLOADS_STORE_ID',
        'UPLOADS_WEBHOOK_PUBLIC_KEY',
      ]);
    });

    it('normalizes a trailing underscore so names never double up', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--prefix',
        'UPLOADS_',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(lastBody(calls)).toMatchObject({ envVarPrefix: 'UPLOADS' });
    });

    it('rejects an invalid prefix', async () => {
      useStorageStores([blobStore()]);

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--prefix',
        '1bad',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid --prefix value.');
    });
  });

  describe('errors', () => {
    it('errors when the store does not exist', async () => {
      useStorageStores([blobStore()]);

      client.setArgv('storage', 'connect', 'nope', '--yes');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'No storage resource nope found in this scope.'
      );
    });

    it('errors when the store name is ambiguous', async () => {
      useStorageStores([
        blobStore({ id: 'store_a', name: 'dupe' }),
        blobStore({ id: 'store_b', name: 'dupe' }),
      ]);

      client.setArgv('storage', 'connect', 'dupe', '--yes');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'More than one storage resource is named dupe'
      );
    });

    it('errors when the project is already connected in a target environment', async () => {
      useStorageStores([
        connectedBlobStore({
          projectId,
          projectName,
          environments: ['production'],
          environmentVariables: ['BLOB_READ_WRITE_TOKEN'],
        }),
      ]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--environment',
        'production',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput('is already connected');
      await expect(client.stderr).toOutput('storage update my-blob-store');
    });

    it('errors on an invalid --environment value', async () => {
      useStorageStores([blobStore()]);

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--environment',
        'staging',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'Invalid environment value: "staging"'
      );
    });

    it('errors when --json is used without --yes or --dry-run', async () => {
      client.setArgv('storage', 'connect', 'my-blob-store', '--json');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        '--json requires --yes or --dry-run'
      );
    });

    it('errors when no store is given', async () => {
      client.setArgv('storage', 'connect');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'You must specify a storage resource'
      );
    });

    it('rewrites the env var collision error with prefix guidance', async () => {
      useStorageStores([blobStore()]);
      mockConnectStoreError(400, {
        error: {
          code: 'bad_request',
          message:
            'This project already has an existing environment variable with name BLOB_STORE_ID in one of the chosen environments',
        },
      });

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--environment',
        'production',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'env var BLOB_STORE_ID already exists'
      );
      await expect(client.stderr).toOutput('--prefix');
    });

    it('names the project and team in the suggested env remove command', async () => {
      useStorageStores([blobStore()]);
      mockConnectStoreError(400, {
        error: {
          code: 'bad_request',
          message:
            'This project already has an existing environment variable with name BLOB_STORE_ID in one of the chosen environments',
        },
      });

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--environment',
        'production',
        '--yes',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'env_var_conflict',
      });
      // `env remove` must not fall back to the local link, which may point at a
      // different project or team than the one being connected.
      expect(payload.next[0].command).toEqual(
        `vercel env remove BLOB_STORE_ID production --project ${projectName} --scope acme`
      );
      expect(client.stderr.getFullOutput()).toContain('--prefix');
    });

    it('writes the error payload to stdout when --json is requested interactively', async () => {
      useStorageStores([]);

      client.setArgv('storage', 'connect', 'missing-store', '--yes', '--json');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'not_found',
      });
      expect(client.stderr.getFullOutput()).toContain(
        'No storage resource missing-store found'
      );
    });

    it('emits a structured confirmation payload in non-interactive mode', async () => {
      useStorageStores([blobStore()]);
      mockConnectStore();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        _code?: number
      ) => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('storage', 'connect', 'my-blob-store');

      await expect(storage(client)).rejects.toThrow('exit');
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
        next: expect.arrayContaining([
          expect.objectContaining({
            command: expect.stringContaining('--yes'),
          }),
        ]),
      });

      exitSpy.mockRestore();
    });
  });

  describe('environments', () => {
    it('passes the requested environments through', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv(
        'storage',
        'connect',
        'my-blob-store',
        '--environment',
        'production',
        '--environment',
        'preview',
        '--yes'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(lastBody(calls)).toMatchObject({
        envVarEnvironments: ['production', 'preview'],
      });
    });

    it('accepts a store ID as the resource identifier', async () => {
      useStorageStores([blobStore()]);
      const calls = mockConnectStore();

      client.setArgv('storage', 'connect', BLOB_STORE_ID, '--yes');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].storeId).toEqual(BLOB_STORE_ID);
    });
  });
  it('does not describe unknown provider variable names as no changes', async () => {
    useStorageStores([marketplaceStore()]);
    client.setArgv('storage', 'connect', 'my-acme-resource', '--dry-run');
    expect(await storage(client)).toEqual(0);
    const text = client.stderr.getFullOutput();
    expect(text).toContain('names unavailable');
    expect(text).toContain('Acme names the variables');
    expect(text).not.toContain('no changes');
    expect(client.stdout.getFullOutput()).toEqual('');
  });
});
