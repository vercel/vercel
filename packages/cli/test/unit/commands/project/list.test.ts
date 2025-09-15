import { describe, it, expect } from 'vitest';
import createLineIterator from 'line-async-iterator';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

import { parseSpacedTableRow } from '../../../helpers/parse-table';
import assert from 'node:assert';

describe('list', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'list', 'balderdash');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'list';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('--update-required', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--update-required');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `flag:update-required`,
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--next', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--next', '1');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `option:next`,
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--json', () => {
    it('should track flag', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--json');
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: `subcommand:list`,
          value: 'ls',
        },
        {
          key: `flag:json`,
          value: 'TRUE',
        },
      ]);
    });

    it('should output projects in JSON format', async () => {
      const user = useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls', '--json');
      await projects(client);

      const output = client.stdout.getFullOutput();

      const parsedOutput = JSON.parse(output);
      expect(parsedOutput).toMatchObject({
        projects: expect.arrayContaining([
          expect.objectContaining({
            name: project.project.name,
            id: project.project.id,
            latestProductionUrl: expect.any(String),
            updatedAt: expect.any(Number),
            nodeVersion: null,
            deprecated: false,
          }),
        ]),
        pagination: expect.any(Object),
        contextName: user.username,
        elapsed: expect.any(String),
      });
    });
  });

  it('should list projects', async () => {
    const user = useUser();
    useTeams('team_dummy');
    const project = useProject({
      ...defaultProject,
    });

    client.setArgv('project', 'ls');
    await projects(client);

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual(`Fetching projects in ${user.username}`);

    line = await lines.next();
    expect(line.value).toContain(user.username);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Project Name',
      'Latest Production URL',
      'Updated',
      'Node Version',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.pop();
    expect(data).toEqual([project.project.name, 'https://foobar.com']);
  });

  it('should list projects when there is no production deployment', async () => {
    const user = useUser();
    useTeams('team_dummy');
    assert(defaultProject.targets?.production);
    const project = useProject({
      ...defaultProject,
      targets: {
        production: {
          ...defaultProject.targets.production,
          alias: [],
        },
      },
    });

    client.setArgv('project', 'ls');
    await projects(client);

    const lines = createLineIterator(client.stderr);

    let line = await lines.next();
    expect(line.value).toEqual(`Fetching projects in ${user.username}`);

    line = await lines.next();
    expect(line.value).toContain(user.username);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    const header = parseSpacedTableRow(line.value!);
    expect(header).toEqual([
      'Project Name',
      'Latest Production URL',
      'Updated',
      'Node Version',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.pop();
    expect(data).toEqual([project.project.name, '--']);
  });
});
