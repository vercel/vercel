import { describe, expect, it, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import { createTestFlags } from './fixtures';
import type { Flag } from '../../../../src/util/flags/types';

describe('flags unarchive', () => {
  let testFlags: Flag[];

  beforeEach(() => {
    testFlags = createTestFlags();
    testFlags[0].state = 'archived';
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useFlags(testFlags);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'unarchive';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks `unarchive` subcommand', async () => {
    client.setArgv('flags', 'unarchive', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:unarchive',
        value: 'unarchive',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('unarchives an archived flag successfully with --yes', async () => {
    client.setArgv('flags', 'unarchive', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0]).toMatchObject({
      state: 'active',
      message: 'Unarchive',
    });
  });

  it('unarchives with --project when the cwd is not linked', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;

    client.setArgv(
      'flags',
      'unarchive',
      testFlags[0].slug,
      '--project',
      'vercel-flags-test',
      '--yes'
    );
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(testFlags[0]).toMatchObject({
      state: 'active',
      message: 'Unarchive',
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:unarchive', value: 'unarchive' },
      { key: 'argument:flag', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('errors in non-interactive mode without --yes', async () => {
    client.stdin.isTTY = false;
    client.setArgv('flags', 'unarchive', testFlags[0].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --yes'
    );
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'unarchive');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('errors when flag is not found', async () => {
    client.setArgv('flags', 'unarchive', 'nonexistent-flag', '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Flag not found');
  });

  it('warns when flag is already active', async () => {
    testFlags[0].state = 'active';

    client.setArgv('flags', 'unarchive', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('already active');
  });
});
