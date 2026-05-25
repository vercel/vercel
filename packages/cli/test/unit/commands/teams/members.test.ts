import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';

describe('teams members', () => {
  it('errors when no team scope is set', async () => {
    client.config.currentTeam = undefined;
    client.setArgv('teams', 'members');

    const exitCode = await teams(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Team scope is required');
  });

  it('lists members in table output', async () => {
    client.config.currentTeam = 'team_123';
    client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
      expect(req.params.teamId).toBe('team_123');
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'one@example.com',
            username: 'one',
            role: 'MEMBER',
          },
        ],
      });
    });
    client.setArgv('teams', 'members');

    const exitCode = await teams(client);
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
    client.config.currentTeam = 'team_123';
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'one@example.com',
            username: 'one',
            role: 'MEMBER',
          },
        ],
      });
    });
    client.setArgv('teams', 'members', '--format', 'json');

    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    const output = client.stdout.getFullOutput();
    const jsonOutput = JSON.parse(output);
    expect(Array.isArray(jsonOutput.members)).toBe(true);
    expect(jsonOutput.members[0].uid).toBe('user_1');
  });
});
