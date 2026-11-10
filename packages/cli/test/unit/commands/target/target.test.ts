import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import target from '../../../../src/commands/target';
import { useUser } from '../../../mocks/user';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';

describe('environments', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('environments', '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'environments',
        },
      ]);
    });
  });

  it('should reject invalid arguments', async () => {
    // With permissive argument parsing (needed for subcommand flags to pass through),
    // invalid flags are treated as invalid subcommands and return exit code 2
    client.setArgv('environments', '--invalid');
    const exitCodePromise = target(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('names', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.stderr.isTTY = false;
    });

    it('lists environments when invoked without a subcommand', async () => {
      client.setArgv('environments');
      await expect(target(client)).resolves.toBe(0);
      expect(client.stderr.getFullOutput()).toContain('Environments found');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'default' },
      ]);
    });

    it.each([
      'environments',
      'environment',
    ])('runs `%s list` without a deprecation warning', async name => {
      client.setArgv(name, 'list');
      await expect(target(client)).resolves.toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it.each([
      'target',
      'targets',
    ])('keeps `%s list` working with a deprecation warning', async name => {
      client.setArgv(name, 'list');
      await expect(target(client)).resolves.toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        `\`vercel ${name}\` is deprecated. Use \`vercel environments\`.`
      );
      expect(stderr).toContain('Environments found');
    });

    it('runs list for --json without a subcommand', async () => {
      client.setArgv('environments', '--json');
      await expect(target(client)).resolves.toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toHaveProperty(
        'targets'
      );
      expect(client.telemetryEventStore.readonlyEvents).toContainEqual(
        expect.objectContaining({ key: 'subcommand:list', value: 'default' })
      );
    });

    it('rejects an unknown option without a subcommand', async () => {
      client.setArgv('environments', '--not-an-option');
      await expect(target(client)).resolves.toBe(2);
    });

    it('keeps the deprecation warning off stdout with --json', async () => {
      client.setArgv('target', 'list', '--json');
      await expect(target(client)).resolves.toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(JSON.parse(client.stdout.getFullOutput())).toHaveProperty(
        'targets'
      );
    });
  });

  it.each([
    [['--project', 'static']],
    [['--project=static']],
  ])('runs list for %j without a subcommand', async args => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      accountId: 'team_dummy',
    });
    client.cwd = setupTmpDir();
    client.config.currentTeam = 'team_dummy';
    client.setArgv('environments', ...args);
    await expect(target(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Environment');
  });
});
