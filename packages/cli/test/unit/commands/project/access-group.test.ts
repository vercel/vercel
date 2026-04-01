import { describe, it, expect } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { client } from '../../../mocks/client';

describe('access-group', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'access-group', '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:access-group',
        },
      ]);
    });
  });

  it('errors without id-or-name', async () => {
    useUser();
    client.setArgv('project', 'access-group');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('Invalid number of arguments');
  });

  it('fetches and prints JSON', async () => {
    useUser();
    useTeams('team_dummy');
    client.scenario.get('/v1/access-groups/:slug', (req, res) => {
      expect(req.params.slug).toBe('my-group');
      res.json({
        accessGroupId: 'ag_abc',
        name: 'My Group',
        slug: 'my-group',
      });
    });

    client.setArgv('project', 'access-group', 'my-group');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    const parsed = JSON.parse(client.stdout.getFullOutput().trim());
    expect(parsed.slug).toBe('my-group');
    expect(parsed.accessGroupId).toBe('ag_abc');
  });
});
