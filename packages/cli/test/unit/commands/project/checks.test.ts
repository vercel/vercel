import { describe, it, expect } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

describe('checks', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'checks', '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:checks',
        },
      ]);
    });
  });

  it('rejects invalid --blocks', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'p' });

    client.setArgv('project', 'checks', 'p', '--blocks', 'invalid');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('--blocks');
  });

  it('prints a table', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.get(`/v2/projects/${project.id}/checks`, (req, res) => {
      expect(req.query.blocks).toBeUndefined();
      res.json({
        checks: [
          {
            id: 'chk_1',
            name: 'Lint',
            blocks: 'deployment-start',
            target: 'preview',
          },
        ],
      });
    });

    client.setArgv('project', 'checks', project.name!);
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Lint');
    expect(client.stderr.getFullOutput()).toContain('chk_1');
  });

  it('passes blocks query param', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
    });

    client.scenario.get(`/v2/projects/${project.id}/checks`, (req, res) => {
      expect(req.query.blocks).toBe('deployment-alias');
      res.json({ checks: [] });
    });

    client.setArgv(
      'project',
      'checks',
      project.name!,
      '--blocks',
      'deployment-alias'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No checks configured');
  });
});
