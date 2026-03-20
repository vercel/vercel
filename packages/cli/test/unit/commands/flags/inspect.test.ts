import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultFlags } from '../../../mocks/flags';

describe('flags inspect', () => {
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
  });

  it('tracks `inspect` subcommand', async () => {
    client.setArgv('flags', 'inspect', 'my-feature');
    await flags(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
    ]);
  });

  it('shows flag details', async () => {
    client.setArgv('flags', 'inspect', defaultFlags[0].slug);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Created:');
    expect(output).toContain('Updated:');
    expect(output).toContain('false: Off');
    expect(output).toContain('id: off');
    expect(output).toContain('true: On');
    expect(output).toContain('id: on');
    expect(output).toContain('production: custom');
    expect(output).toContain('preview: On');
    expect(output).toContain('development: On');
    expect(output).not.toContain('production: active');
  });

  it('shows the served value for simple environments', async () => {
    client.setArgv('flags', 'inspect', defaultFlags[1].slug);
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('production: Control');
  });

  it('shows the served paused value for inactive environments', async () => {
    defaultFlags[1].environments.production.active = false;

    try {
      client.setArgv('flags', 'inspect', defaultFlags[1].slug);
      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('production: Control');
    } finally {
      defaultFlags[1].environments.production.active = true;
    }
  });

  it('returns error when flag argument is missing', async () => {
    client.setArgv('flags', 'inspect');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('returns error when flag is not found', async () => {
    client.setArgv('flags', 'inspect', 'nonexistent-flag');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Flag not found');
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'inspect';

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
});
