import { describe, expect, it, vi } from 'vitest';
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
          role: 'MEMBER',
        },
      ],
      pagination: { count: 1, next: null, prev: null },
    });
  });
}

describe('teams members remove', () => {
  it('removes a member with --yes (no prompt)', async () => {
    useUser();
    const team = useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    let deleted = false;
    client.scenario.delete(
      '/v1/teams/team_123/members/user_ada',
      (_req, res) => {
        deleted = true;
        res.json({ id: 'team_123' });
      }
    );

    client.setArgv('teams', 'members', 'remove', 'ada@example.com', '--yes');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(deleted).toBe(true);
    await expect(client.stderr).toOutput(`Removed ada from ${team.name}`);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members' },
      { key: 'subcommand:remove', value: 'remove' },
      { key: 'argument:member', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('prompts for confirmation in a TTY and removes on yes', async () => {
    useUser();
    const team = useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    let deleted = false;
    client.scenario.delete(
      '/v1/teams/team_123/members/user_ada',
      (_req, res) => {
        deleted = true;
        res.json({ id: 'team_123' });
      }
    );

    client.setArgv('teams', 'members', 'remove', 'ada');
    const exitCodePromise = teams(client);

    await expect(client.stderr).toOutput(
      `The member ada will be removed from ${team.name}.`
    );
    client.stdin.write('y\n');

    const exitCode = await exitCodePromise;
    expect(exitCode).toBe(0);
    expect(deleted).toBe(true);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members' },
      { key: 'subcommand:remove', value: 'remove' },
      { key: 'argument:member', value: '[REDACTED]' },
    ]);
  });

  it('exits in non-interactive mode without --yes', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');
    client.nonInteractive = true;

    let deleted = false;
    client.scenario.delete(
      '/v1/teams/team_123/members/user_ada',
      (_req, res) => {
        deleted = true;
        res.json({ id: 'team_123' });
      }
    );

    vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('exit');
    }) as () => never);

    client.setArgv('teams', 'members', 'remove', 'ada@example.com');

    await expect(teams(client)).rejects.toThrow('exit');
    expect(deleted).toBe(false);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'confirmation_required',
      message: expect.stringMatching(/--yes/),
      next: expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining('--yes'),
        }),
      ]),
    });
  });

  it('supports the rm alias', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    client.scenario.delete(
      '/v1/teams/team_123/members/user_ada',
      (_req, res) => {
        res.json({ id: 'team_123' });
      }
    );

    client.setArgv('teams', 'members', 'rm', 'ada@example.com', '--yes');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members' },
      { key: 'subcommand:remove', value: 'rm' },
      { key: 'argument:member', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('errors when the member cannot be found', async () => {
    useUser();
    useTeam('team_123');
    client.config.currentTeam = 'team_123';
    useMembers('team_123');

    client.setArgv('teams', 'members', 'remove', 'nobody@example.com', '--yes');
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'No member matching "nobody@example.com"'
    );
  });
});
