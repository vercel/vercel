import { afterEach, describe, expect, it, vi } from 'vitest';
import teams from '../../../../src/commands/teams';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('teams requests', () => {
  const currentTeamId = 'team_requests_test';

  afterEach(() => {
    client.nonInteractive = false;
    vi.restoreAllMocks();
  });

  it('lists pending access requests', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };
    client.scenario.get(`/v2/teams/${currentTeamId}/members`, (_req, res) => {
      res.json({
        members: [
          {
            uid: 'user_pending',
            username: 'pending-user',
            email: 'pending@example.com',
            confirmed: false,
            accessRequestedAt: Date.now(),
          },
          {
            uid: 'user_confirmed',
            username: 'confirmed-user',
            confirmed: true,
          },
        ],
      });
    });

    client.setArgv('teams', 'requests', 'ls');
    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('user_pending');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:requests', value: 'requests' },
    ]);
  });

  it('approves a pending request', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };
    client.scenario.patch(
      `/v1/teams/${currentTeamId}/members/user_pending`,
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv('teams', 'requests', 'approve', 'user_pending');
    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Approved access request');
  });

  it('rejects a pending request with --yes', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };
    client.scenario.delete(
      `/v1/teams/${currentTeamId}/members/user_pending`,
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    client.setArgv('teams', 'requests', 'reject', 'user_pending', '--yes');
    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Rejected access request');
  });

  it('requires --yes for reject in non-interactive mode', async () => {
    useUser();
    useTeams(currentTeamId);
    client.config = { currentTeam: currentTeamId };
    client.nonInteractive = true;

    client.setArgv('teams', 'requests', 'reject', 'user_pending');

    const exitCode = await teams(client);
    expect(exitCode).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'confirmation_required',
    });
  });
});
