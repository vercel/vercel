import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, useFlagsConnections } from '../../../mocks/flags';

describe('flags connections', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useProject({
      ...defaultProject,
      id: 'storefront',
      name: 'storefront',
      accountId: 'team_dummy',
    });
    useProject({
      ...defaultProject,
      id: 'checkout',
      name: 'checkout',
      accountId: 'team_dummy',
    });
    useUnknownProject();
    useFlags();
    useFlagsConnections();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.stdin.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'connections', '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:connections', value: 'connections' },
        { key: 'flag:help', value: 'flags connections' },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('flags', 'connections');
    await expect(flags(client)).resolves.toBe(2);
  });

  describe('ls', () => {
    it('lists the consumers of the linked project', async () => {
      client.setArgv('flags', 'connections', 'ls');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const combined = `${client.stderr.getFullOutput()}\n${client.stdout.getFullOutput()}`;
      expect(combined).toContain('Consumer Project');
      expect(combined).toContain('storefront');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:connections', value: 'connections' },
        { key: 'subcommand:ls', value: 'ls' },
      ]);
    });

    it('lists the sources of a consumer project with --role consumer', async () => {
      client.setArgv(
        'flags',
        'connections',
        'ls',
        '--role',
        'consumer',
        '--project',
        'storefront',
        '--json'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.role).toEqual('consumer');
      expect(json.connections).toEqual([
        expect.objectContaining({
          sourceProjectId: 'vercel-flags-test',
          consumerProjectId: 'storefront',
        }),
      ]);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:connections', value: 'connections' },
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:project', value: '[REDACTED]' },
        { key: 'option:role', value: 'consumer' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('tells a consumer without sources how to get connected', async () => {
      client.setArgv(
        'flags',
        'connections',
        'ls',
        '--role',
        'consumer',
        '--project',
        'checkout'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('may not read the flags of any project');
      expect(stderr).toContain(
        'flags connections add checkout --project <source-project>'
      );
    });

    it('rejects an unknown role', async () => {
      client.setArgv('flags', 'connections', 'ls', '--role', 'owner');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain('Invalid role: owner');
    });
  });

  describe('add', () => {
    it('connects a consumer project by name', async () => {
      client.setArgv('flags', 'connections', 'add', 'checkout');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain(
        'checkout may now read the flags of vercel-flags-test'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:connections', value: 'connections' },
        { key: 'subcommand:add', value: 'add' },
        { key: 'argument:consumer-project', value: '[REDACTED]' },
      ]);
    });

    it('requires a consumer project', async () => {
      client.setArgv('flags', 'connections', 'add');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        'name or ID of the consumer project'
      );
    });

    it('errors when the consumer project does not exist', async () => {
      client.setArgv('flags', 'connections', 'add', 'missing-project');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Project "missing-project" was not found'
      );
    });

    it('refuses to connect a project to itself', async () => {
      client.setArgv('flags', 'connections', 'add', 'vercel-flags-test');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        'cannot be connected to its own flags'
      );
    });

    it('treats an existing connection as done', async () => {
      client.setArgv('flags', 'connections', 'add', 'storefront');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'storefront already may read the flags of vercel-flags-test'
      );
    });

    it('uses --project as the source project', async () => {
      client.setArgv(
        'flags',
        'connections',
        'add',
        'storefront',
        '--project',
        'checkout'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'storefront may now read the flags of checkout'
      );
    });

    it('keeps --project on the suggested command in non-interactive mode', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'flags',
        'connections',
        'add',
        '--project',
        'checkout',
        '--non-interactive'
      );

      const exitCode = await flags(client);

      expect(exitCode).toBe(2);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.reason).toBe('missing_arguments');
      expect(parsed.next[0].command).toContain('flags connections add');
      expect(parsed.next[0].command).toContain('--project checkout');
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('rm', () => {
    it('removes a connection with --yes', async () => {
      client.setArgv('flags', 'connections', 'rm', 'storefront', '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain(
        'storefront may no longer read the flags of vercel-flags-test'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:connections', value: 'connections' },
        { key: 'subcommand:rm', value: 'rm' },
        { key: 'argument:consumer-project', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });

    it('errors when the connection does not exist', async () => {
      client.setArgv('flags', 'connections', 'rm', 'checkout', '--yes');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('was not found');
    });

    it('requires --yes in non-interactive mode and keeps --project on the suggestion', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'flags',
        'connections',
        'rm',
        'storefront',
        '--project',
        'vercel-flags-test',
        '--non-interactive'
      );

      const exitCode = await flags(client);

      expect(exitCode).toBe(1);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('confirmation_required');
      expect(parsed.next[0].command).toContain(
        'flags connections remove storefront --yes'
      );
      expect(parsed.next[0].command).toContain('--project vercel-flags-test');
      expect(parsed.next[0].command).toContain('--non-interactive');
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('asks for confirmation and aborts on no', async () => {
      client.stdin.isTTY = true;
      client.setArgv('flags', 'connections', 'rm', 'storefront');
      const exitCodePromise = flags(client);

      await expect(client.stderr).toOutput(
        'Stop storefront from reading the flags of vercel-flags-test?'
      );
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('Aborted');
    });
  });
});
