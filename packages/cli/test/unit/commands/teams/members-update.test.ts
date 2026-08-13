import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import teams from '../../../../src/commands/teams';

function useMembers(teamId: string) {
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    res.json({
      members: [
        {
          uid: 'user_ada',
          email: 'ada@example.com',
          username: 'ada',
          role: 'VIEWER',
        },
        {
          uid: 'user_grace',
          email: 'grace@example.com',
          username: 'grace',
          role: 'MEMBER',
        },
      ],
      pagination: { count: 2, next: null, prev: null },
    });
  });
}

describe('teams members update', () => {
  it("updates a member's role by email", async () => {
    useUser();
    const team = useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    let patchedRole: unknown;
    client.scenario.patch('/v1/teams/team_123/members/user_ada', (req, res) => {
      patchedRole = req.body.role;
      res.json({ id: 'team_123' });
    });

    client.setArgv(
      'teams',
      'members',
      'update',
      'ada@example.com',
      '--role',
      'MEMBER'
    );
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchedRole).toBe('MEMBER');
    await expect(client.stderr).toOutput(`role MEMBER on ${team.name}`);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members' },
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:member', value: '[REDACTED]' },
      { key: 'option:role', value: 'MEMBER' },
    ]);
  });

  it('accepts a lowercase role and normalizes it for the API', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    let patchedRole: unknown;
    client.scenario.patch(
      '/v1/teams/team_123/members/user_grace',
      (req, res) => {
        patchedRole = req.body.role;
        res.json({ id: 'team_123' });
      }
    );

    client.setArgv(
      'teams',
      'members',
      'update',
      'grace',
      '--role',
      'developer'
    );
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchedRole).toBe('DEVELOPER');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members' },
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:member', value: '[REDACTED]' },
      { key: 'option:role', value: 'DEVELOPER' },
    ]);
  });

  it('rejects an invalid role without calling the API', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    let patchCalled = false;
    client.scenario.patch(
      '/v1/teams/team_123/members/user_ada',
      (_req, res) => {
        patchCalled = true;
        res.json({ id: 'team_123' });
      }
    );

    client.setArgv(
      'teams',
      'members',
      'update',
      'ada@example.com',
      '--role',
      'superadmin'
    );
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    expect(patchCalled).toBe(false);
    await expect(client.stderr).toOutput('Invalid role "superadmin"');
  });

  it('errors when --role is missing', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';

    client.setArgv('teams', 'members', 'update', 'ada@example.com');
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('`--role` flag is required');
  });

  it('errors when the member cannot be found', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    client.setArgv(
      'teams',
      'members',
      'update',
      'nobody@example.com',
      '--role',
      'MEMBER'
    );
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'No member matching "nobody@example.com"'
    );
  });
});
