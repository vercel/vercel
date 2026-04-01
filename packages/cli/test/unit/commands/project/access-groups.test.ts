import { describe, it, expect } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

describe('access-groups', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'access-groups', 'a', 'b');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'access-groups';

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

  it('prints a table', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get('/v1/access-groups', (req, res) => {
      expect(req.query.projectId).toBe(project.id);
      res.json({
        accessGroups: [
          {
            accessGroupId: 'ag_1',
            name: 'Engineering',
            slug: 'engineering',
            role: 'PROJECT_VIEWER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv('project', 'access-groups', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Engineering');
    expect(out).toContain('ag_1');
    expect(out).toContain('PROJECT_VIEWER');
  });

  it('writes JSON to stdout with --format json', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });
    client.scenario.get('/v1/access-groups', (_req, res) => {
      res.json({
        accessGroups: [{ accessGroupId: 'ag_x', name: 'Only' }],
        pagination: {},
      });
    });

    client.setArgv(
      'project',
      'access-groups',
      project.name!,
      '--format',
      'json'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.accessGroups).toHaveLength(1);
    expect(parsed.accessGroups[0].accessGroupId).toBe('ag_x');
  });
});
