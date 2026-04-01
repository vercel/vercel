import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import project from '../../../../src/commands/project';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project members', () => {
  it('lists project members in table output', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/projects/:idOrName/members', (req, res) => {
      expect(req.params.idOrName).toBe('prj_123');
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'one@example.com',
            username: 'one',
            role: 'PROJECT_VIEWER',
            computedProjectRole: 'PROJECT_VIEWER',
            teamRole: 'MEMBER',
          },
        ],
      });
    });

    client.setArgv('project', 'members', 'my-project');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('user_1');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:members',
        value: 'members',
      },
    ]);
  });

  it('outputs valid JSON with --format json', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.get('/v1/projects/:idOrName/members', (_req, res) => {
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'one@example.com',
            username: 'one',
            role: 'PROJECT_VIEWER',
            computedProjectRole: 'PROJECT_VIEWER',
            teamRole: 'MEMBER',
          },
        ],
      });
    });

    client.setArgv('project', 'members', 'my-project', '--format', 'json');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(Array.isArray(jsonOutput.members)).toBe(true);
    expect(jsonOutput.members[0].uid).toBe('user_1');
  });

  it('validates limit range', async () => {
    client.setArgv('project', 'members', '--limit', '0');
    const exitCode = await project(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      '`--limit` must be a number between 1 and 100.'
    );
  });
});
