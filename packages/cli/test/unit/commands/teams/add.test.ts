import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { createTeam, useTeams } from '../../../mocks/team';

describe('teams add', () => {
  const currentTeamId = 'team_123';
  const team = createTeam(currentTeamId, 'team-slug', 'My Team');

  beforeEach(() => {
    useUser();
    useTeams(team.id);
  });

  beforeEach(() => {
    client.config = {
      currentTeam: currentTeamId,
    };
  });

  client.scenario.post(`/teams`, (req, res) => {
    return res.json(team);
  });

  client.scenario.patch(`/teams/${team.id}`, (req, res) => {
    return res.json(team);
  });
  it('tracks telemetry events', async () => {
    client.setArgv('teams', 'add');
    const exitCodePromise = teams(client);

    await expect(client.stderr).toOutput(`Pick a team identifier for its URL`);

    client.stdin.write(`${team.slug}\n`);

    await expect(client.stderr).toOutput(`Pick a display name for your team`);

    client.stdin.write(`${team.name}\n`);
    await expect(client.stderr).toOutput(`Success`);

    client.stdin.write(`\n`);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add', value: 'add' },
    ]);
    await expect(exitCodePromise).resolves.toEqual(0);
  });
});
