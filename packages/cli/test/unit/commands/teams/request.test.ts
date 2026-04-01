import { describe, it, expect } from 'vitest';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { client } from '../../../mocks/client';

describe('teams request', () => {
  const currentTeamId = 'team_req_test';

  describe('--help', () => {
    it('tracks telemetry', async () => {
      useUser();
      useTeams(currentTeamId);

      client.setArgv('teams', 'request', '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'teams:request',
        },
      ]);
    });
  });

  it('errors without team scope', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = {};

    client.setArgv('teams', 'request');
    const exitCode = await teams(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('team scope');
  });

  it('calls GET /v1/teams/:teamId/request for the current user', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };

    client.scenario.get(`/v1/teams/${currentTeamId}/request`, (_req, res) => {
      res.json({
        teamSlug: 'acme',
        teamName: 'Acme',
        confirmed: false,
        accessRequestedAt: 123,
        joinedFrom: { origin: 'github' },
      });
    });

    client.setArgv('teams', 'request');
    const exitCode = await teams(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Acme');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:request', value: 'request' },
    ]);
  });

  it('supports access-request alias and optional userId path', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };

    client.scenario.get(
      `/v1/teams/${currentTeamId}/request/user_xyz`,
      (_req, res) => {
        res.json({
          teamSlug: 'acme',
          teamName: 'Acme',
          confirmed: true,
          accessRequestedAt: 456,
          joinedFrom: { origin: 'email' },
        });
      }
    );

    client.setArgv('teams', 'access-request', 'user_xyz');
    await teams(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:request', value: 'access-request' },
    ]);
  });

  it('writes JSON with --format json', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };

    client.scenario.get(`/v1/teams/${currentTeamId}/request`, (_req, res) => {
      res.json({ teamSlug: 's', confirmed: false });
    });

    client.setArgv('teams', 'request', '--format', 'json');
    const exitCode = await teams(client);
    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim()).teamSlug).toBe('s');
  });
});
