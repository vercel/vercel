import ms from 'ms';
import { describe, expect, beforeEach, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import target from '../../../../src/commands/target';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useTeams } from '../../../mocks/team';
import createLineIterator from 'line-async-iterator';
import { parseSpacedTableRow } from '../../../helpers/parse-table';

describe('target ls', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      client.setArgv('target', 'ls', 'balderdash');
      const exitCode = await target(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'target';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = target(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:list`,
        },
      ]);
    });
  });

  describe('telemetry', () => {
    beforeEach(() => {
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.stderr.isTTY = false;
    });

    it('tracks invocation', async () => {
      const subcommandActual = 'list';
      client.setArgv('target', subcommandActual);
      const exitCode = await target(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: subcommandActual,
        },
      ]);
    });

    it('tracks invocation of alias command name', async () => {
      const subcommandActual = 'ls';
      client.setArgv('target', subcommandActual);
      const exitCode = await target(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: subcommandActual,
        },
      ]);
    });
  });

  it('should show custom environments with `vc target ls`', async () => {
    useUser();
    const teams = useTeams('team_dummy');
    const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    const { project } = useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
      customEnvironments: [
        {
          id: 'env_8DTiPYD33Rcvu2hQwYAdw0rwLquY',
          slug: 'her',
          createdAt: 1717176548879,
          updatedAt: 1717176548879,
          type: 'preview',
          description: '',
          branchMatcher: {
            type: 'endsWith',
            pattern: 'her',
          },
        },
        {
          id: 'env_ph1tjPP20xp8VAuiFsYt4rhRYGys',
          slug: 'ano',
          createdAt: 1717176506341,
          updatedAt: 1717176506341,
          type: 'preview',
          description: '',
          branchMatcher: {
            type: 'startsWith',
            pattern: 'ano',
          },
        },
      ],
    });
    client.cwd = setupUnitFixture('commands/deploy/static');
    client.stderr.isTTY = false;
    client.setArgv('target', 'ls');
    const exitCode = await target(client);
    expect(exitCode).toEqual(0);

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual('Retrieving project…');

    line = await lines.next();
    expect(line.value).toEqual(
      `Fetching custom environments for ${team.slug}/${project.name}`
    );

    line = await lines.next();
    expect(line.value).contains(
      `> 5 Environments found under ${team.slug}/${project.name}`
    );

    line = await lines.next();
    expect(line.value).contains(``);

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Target Name',
      'Branch Tracking',
      'Type',
      'Updated',
    ]);

    line = await lines.next();
    expect(parseSpacedTableRow(line.value!)).toEqual([
      'Production',
      'main',
      'Production',
      '-',
    ]);

    line = await lines.next();
    expect(parseSpacedTableRow(line.value!)).toEqual([
      'Preview',
      'All unassigned git branches',
      'Preview',
      '-',
    ]);

    line = await lines.next();
    expect(parseSpacedTableRow(line.value!)).toEqual([
      'Development',
      'Accessible via CLI',
      'Development',
      '-',
    ]);

    line = await lines.next();
    expect(parseSpacedTableRow(line.value!)).toEqual([
      'ano',
      'ano*',
      'Preview',
      String(ms(Date.now() - project.customEnvironments![0].updatedAt)),
    ]);

    line = await lines.next();
    expect(parseSpacedTableRow(line.value!)).toEqual([
      'her',
      '*her',
      'Preview',
      String(ms(Date.now() - project.customEnvironments![0].updatedAt)),
    ]);
  });
});
