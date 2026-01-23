import { describe, expect, it, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultSdkKeys } from '../../../mocks/flags';

describe('flags sdk-keys', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags();
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    // Disable TTY to prevent interactive prompts
    client.stdin.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'sdk-keys', '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'flag:help',
          value: 'flags sdk-keys',
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('flags', 'sdk-keys');
    const exitCodePromise = flags(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('ls', () => {
    it('tracks `ls` subcommand', async () => {
      client.setArgv('flags', 'sdk-keys', 'ls');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
      ]);
    });

    it('lists SDK keys successfully', async () => {
      client.setArgv('flags', 'sdk-keys', 'ls');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });
  });

  describe('add', () => {
    it('tracks `add` subcommand', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'server',
        '--environment',
        'production'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'option:type',
          value: 'server',
        },
        {
          key: 'option:environment',
          value: 'production',
        },
      ]);
    });

    it('creates SDK key successfully', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'add',
        '--type',
        'server',
        '--environment',
        'production'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });
  });

  describe('rm', () => {
    it('tracks `rm` subcommand', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'rm',
        defaultSdkKeys[0].hashKey,
        '--yes'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:sdk-keys',
          value: 'sdk-keys',
        },
        {
          key: 'subcommand:rm',
          value: 'rm',
        },
        {
          key: 'argument:key',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('deletes SDK key successfully', async () => {
      client.setArgv(
        'flags',
        'sdk-keys',
        'rm',
        defaultSdkKeys[0].hashKey,
        '--yes'
      );
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
    });
  });
});
