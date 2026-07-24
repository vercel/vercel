import { describe, expect, it } from 'vitest';
import alerts from '../../../../src/commands/alerts';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('alerts groups', () => {
  const teamId = 'team_alert_groups_test';

  it('disables a group', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.patch('/alerts/v3/groups/grp_123', (_req, res) => {
      res.json({ id: 'grp_123', enabled: false });
    });

    client.setArgv('alerts', 'groups', 'disable', 'grp_123');
    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
  });

  it('enables a group', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };
    client.scenario.patch('/alerts/v3/groups/grp_123', (_req, res) => {
      res.json({ id: 'grp_123', enabled: true });
    });

    client.setArgv('alerts', 'groups', 'enable', 'grp_123');
    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
  });

  it('errors when group id is missing', async () => {
    useUser();
    useTeams(teamId);
    client.config = { currentTeam: teamId };

    client.setArgv('alerts', 'groups', 'disable');
    const exitCode = await alerts(client);
    expect(exitCode).toBe(2);
  });
});
