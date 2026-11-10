import { beforeEach, describe, expect, it, vi } from 'vitest';
import storage from '../../../../src/commands/storage';
import * as linkModule from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';
import {
  mockCreateBlobStore,
  mockCreateGlobalConfig,
} from '../../../mocks/storage';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

function mockLinkedProject() {
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
}

describe('storage create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    useUser();
    useTeams('team_dummy');
  });

  describe('blob', () => {
    it('creates a Blob store and reports it as JSON', async () => {
      const calls = mockCreateBlobStore({
        id: 'store_new123',
        region: 'fra1',
        access: 'private',
      });

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'private',
        '--region',
        'fra1',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toEqual({
        name: 'my-uploads',
        access: 'private',
        region: 'fra1',
      });
      expect(calls[0].query.teamId).toEqual('team_dummy');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'ok',
        store: {
          id: 'store_new123',
          name: 'my-uploads',
          type: 'blob',
          product: 'Vercel Blob',
          details: { region: 'fra1', access: 'private' },
        },
        next: [
          {
            command: 'vercel storage connect my-uploads --yes',
            when: 'connect the new store to the linked project',
          },
        ],
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:create', value: 'create' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:type', value: 'blob' },
        { key: 'option:access', value: 'private' },
        { key: 'option:region', value: '[REDACTED]' },
      ]);
    });

    it('suggests --project in next[] when no project is linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
      } as never);
      mockCreateBlobStore({ id: 'store_new123', region: 'iad1' });

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'public',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.next).toEqual([
        {
          command:
            'vercel storage connect my-uploads --project <project> --yes',
          when: 'connect the new store to a project (replace <project>)',
        },
      ]);
    });

    it('defaults the region to iad1 and prints a result block', async () => {
      const calls = mockCreateBlobStore({ id: 'store_new123', region: 'iad1' });

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'public'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].body).toMatchObject({ region: 'iad1' });
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('✓ Created');
      expect(stderr).toContain('my-uploads');
      expect(stderr).toContain('store_new123');
      expect(stderr).toContain('Vercel Blob');
      expect(stderr).toContain('vercel storage connect my-uploads');
      expect(stderr).not.toMatch(/^[▲✓!] (ID|Type|Region|Access)\s/m);
      expect(client.stdout.getFullOutput()).toEqual('');
    });

    it('requires --access in non-interactive mode and creates nothing', async () => {
      const calls = mockCreateBlobStore();
      client.nonInteractive = true;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`exit ${code}`);
      }) as never);

      client.setArgv('storage', 'create', 'my-uploads', '--type', 'blob');
      await expect(storage(client)).rejects.toThrow('exit 2');

      expect(calls).toHaveLength(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.message).toContain('--access');
      exitSpy.mockRestore();
    });

    it('prompts for --access interactively', async () => {
      const calls = mockCreateBlobStore();

      client.setArgv('storage', 'create', 'my-uploads', '--type', 'blob');
      const exitCodePromise = storage(client);

      await expect(client.stderr).toOutput('Choose the access type');
      client.stdin.write('\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(calls[0].body).toMatchObject({ access: 'private' });
    });

    it('rejects an invalid --access value', async () => {
      const calls = mockCreateBlobStore();

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'internal'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput('Invalid --access value');
    });

    it('rejects flags that belong to another provider', async () => {
      const calls = mockCreateBlobStore();

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'public',
        '--items',
        '{}'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput(
        '--items does not apply to Vercel Blob stores'
      );
    });
  });

  describe('global-config', () => {
    it('creates a Global Config with initial items', async () => {
      const calls = mockCreateGlobalConfig({
        id: 'ecfg_new123',
        slug: 'flags',
        itemCount: 1,
      });

      client.setArgv(
        'storage',
        'create',
        'flags',
        '--type',
        'global-config',
        '--items',
        '{"enabled":true}',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toEqual({
        slug: 'flags',
        items: { enabled: true },
      });

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.store).toEqual({
        id: 'ecfg_new123',
        name: 'flags',
        type: 'global-config',
        product: 'Vercel Global Config',
        details: { itemCount: 1 },
      });
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:create', value: 'create' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:type', value: 'global-config' },
        { key: 'option:items', value: '[REDACTED]' },
      ]);
    });

    it('accepts the legacy edge-config spelling for --type', async () => {
      const calls = mockCreateGlobalConfig();

      client.setArgv('storage', 'create', 'flags', '--type', 'edge-config');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(0);
      expect(calls[0].body).toEqual({ slug: 'flags' });
      expect(client.stderr.getFullOutput()).toContain('✓ Created');
    });

    it('rejects --items that is not a JSON object', async () => {
      const calls = mockCreateGlobalConfig();

      client.setArgv(
        'storage',
        'create',
        'flags',
        '--type',
        'global-config',
        '--items',
        '[1,2]'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      expect(calls).toHaveLength(0);
      await expect(client.stderr).toOutput('--items must be a JSON object');
    });
  });

  describe('shared validation', () => {
    it('requires --type in non-interactive mode and offers one command per provider', async () => {
      client.nonInteractive = true;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
        code?: number
      ) => {
        throw new Error(`exit ${code}`);
      }) as never);

      client.setArgv('storage', 'create', 'my-uploads');
      await expect(storage(client)).rejects.toThrow('exit 2');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(
        payload.next.map((step: { command: string }) => step.command)
      ).toEqual([
        'vercel storage create <name> --type blob',
        'vercel storage create <name> --type global-config',
      ]);
      exitSpy.mockRestore();
    });

    it('rejects an unknown --type', async () => {
      client.setArgv('storage', 'create', 'thing', '--type', 'postgres-ish');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'Unknown store type "postgres-ish". Known types: blob, global-config'
      );
      await expect(client.stderr).toOutput('vercel integration add');
    });

    it('requires a name', async () => {
      client.setArgv('storage', 'create', '--type', 'blob');
      const exitCode = await storage(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('You must specify a name');
    });

    it('reports API failures as api_error', async () => {
      client.scenario.post('/:version/storage/stores/blob', (_req, res) => {
        res.status(402).json({
          error: { code: 'payment_required', message: 'Upgrade your plan' },
        });
      });

      client.setArgv(
        'storage',
        'create',
        'my-uploads',
        '--type',
        'blob',
        '--access',
        'public',
        '--json'
      );
      const exitCode = await storage(client);

      expect(exitCode).toEqual(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ status: 'error', reason: 'api_error' });
      expect(payload.message).toContain('Upgrade your plan');
    });
  });
});
