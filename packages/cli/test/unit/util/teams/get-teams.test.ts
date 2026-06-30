import { describe, expect, it } from 'vitest';
import getTeamById from '../../../../src/util/teams/get-team-by-id';
import getTeams from '../../../../src/util/teams/get-teams';
import { client } from '../../../mocks/client';
import { createTeam } from '../../../mocks/team';

describe('getTeams', () => {
  it('reuses v1 teams within the same client invocation', async () => {
    const team = createTeam('team_second', 'second', 'Second');
    let fetchCount = 0;
    client.scenario.get('/v1/teams', (_req, res) => {
      fetchCount++;
      res.json({ teams: [team] });
    });

    const first = await getTeams(client);
    const second = await getTeams(client);

    expect(first).toEqual([team]);
    expect(second).toEqual([team]);
    expect(fetchCount).toBe(1);
  });

  it('hydrates the team-by-id cache from the v1 teams response', async () => {
    const team = createTeam('team_cached', 'cached', 'Cached');
    let listFetchCount = 0;
    let teamFetchCount = 0;
    client.scenario.get('/v1/teams', (_req, res) => {
      listFetchCount++;
      res.json({ teams: [team] });
    });
    client.scenario.get('/teams/team_cached', (_req, res) => {
      teamFetchCount++;
      res.json(team);
    });

    await getTeams(client);
    const fetchedTeam = await getTeamById(client, team.id);

    expect(fetchedTeam).toEqual(team);
    expect(listFetchCount).toBe(1);
    expect(teamFetchCount).toBe(0);
  });
});
