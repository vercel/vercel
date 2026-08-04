import { describe, expect, it } from 'vitest';
import getTeamById from '../../../../src/util/teams/get-team-by-id';
import getTeamByIdOrSlug from '../../../../src/util/teams/get-team-by-id-or-slug';
import { client } from '../../../mocks/client';
import { createTeam } from '../../../mocks/team';

describe('getTeamByIdOrSlug', () => {
  it('fetches a team by ID', async () => {
    const team = createTeam('team_example', 'example-team', 'Example Team');
    client.scenario.get('/teams/team_example', (_req, res) => {
      res.json(team);
    });

    const fetchedTeam = await getTeamByIdOrSlug(client, team.id);

    expect(fetchedTeam).toEqual(team);
  });

  it('fetches a team by slug', async () => {
    const team = createTeam('team_example', 'example-team', 'Example Team');
    client.scenario.get('/teams/example-team', (_req, res) => {
      res.json(team);
    });

    const fetchedTeam = await getTeamByIdOrSlug(client, team.slug);

    expect(fetchedTeam).toEqual(team);
  });

  it('does not send the current team as a query parameter', async () => {
    const team = createTeam('team_example', 'example-team', 'Example Team');
    client.config.currentTeam = 'team_other';
    let teamIdParam: string | null = null;
    client.scenario.get('/teams/team_example', (req, res) => {
      teamIdParam = req.query.teamId ? String(req.query.teamId) : null;
      res.json(team);
    });

    await getTeamByIdOrSlug(client, team.id);

    expect(teamIdParam).toBeNull();
  });

  it('hydrates the team-by-id cache', async () => {
    const team = createTeam('team_example', 'example-team', 'Example Team');
    let teamFetchCount = 0;
    client.scenario.get('/teams/example-team', (_req, res) => {
      teamFetchCount++;
      res.json(team);
    });

    await getTeamByIdOrSlug(client, team.slug);
    const cachedTeam = await getTeamById(client, team.id);

    expect(cachedTeam).toEqual(team);
    expect(teamFetchCount).toBe(1);
  });

  it('throws when the team is not found', async () => {
    client.scenario.get('/teams/missing-team', (_req, res) => {
      res.statusCode = 404;
      res.json({
        error: {
          code: 'not_found',
          message: 'Team not found by the given slug/id',
        },
      });
    });

    await expect(getTeamByIdOrSlug(client, 'missing-team')).rejects.toThrow();
  });
});
