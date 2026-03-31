import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project access-groups', () => {
  it('lists project access groups in table output', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/access-groups', (req, res) => {
      expect(req.query.projectId).toBe('prj_123');
      res.json({
        accessGroups: [
          {
            id: 'ag_123',
            name: 'Frontend',
            role: 'PROJECT_DEVELOPER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv('project', 'access-groups', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('ag_123');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:access-groups',
        value: 'access-groups',
      },
    ]);
  });

  it('outputs valid JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/access-groups', (_req, res) => {
      res.json({
        accessGroups: [
          {
            id: 'ag_123',
            name: 'Frontend',
            role: 'PROJECT_DEVELOPER',
          },
        ],
        pagination: { count: 1, next: null },
      });
    });

    client.setArgv(
      'project',
      'access-groups',
      'my-project',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(Array.isArray(jsonOutput.accessGroups)).toBe(true);
    expect(jsonOutput.accessGroups[0].id).toBe('ag_123');
  });

  it('validates limit range', async () => {
    client.setArgv('project', 'access-groups', '--limit', '0');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      '`--limit` must be a number between 1 and 100.'
    );
  });
});
