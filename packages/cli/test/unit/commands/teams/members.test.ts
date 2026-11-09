import stripAnsi from 'strip-ansi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { help } from '../../../../src/commands/help';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { membersSubcommand } from '../../../../src/commands/teams/command';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

function useResolvedTeam({
  invoiceRecipient,
}: {
  invoiceRecipient?: string;
} = {}) {
  client.scenario.get('/teams/:teamId', (req, res) => {
    expect(req.params.teamId).toBe('team_123');
    res.json({
      id: 'team_123',
      name: 'Acme',
      slug: 'acme',
      ...(invoiceRecipient ? { billing: { email: invoiceRecipient } } : {}),
    });
  });
}

describe('teams members', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
    client.stdin.isTTY = true;
  });

  it('invites a user through the members command', async () => {
    client.config.currentTeam = 'team_123';
    useUser();
    useTeams('team_123');
    client.scenario.post('/teams/:teamId/members', (req, res) => {
      expect(req.params.teamId).toBe('team_123');
      expect(req.body).toEqual({ email: 'new@example.com' });
      res.json({ username: 'new-user' });
    });
    client.setArgv('teams', 'members', 'invite', 'new@example.com');

    await expect(teams(client)).resolves.toBe(0);
    await expect(client.stderr).toOutput('new@example.com');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members invite' },
      { key: 'argument:email', value: 'ONE' },
    ]);
  });

  it('removes the resolved member only after confirmation', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
      expect(req.params.teamId).toBe('team_123');
      expect(req.query.search).toBe('octocat@example.com');
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'octocat@example.com',
            username: 'octocat',
          },
        ],
      });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (req, res) => {
      expect(req.params.teamId).toBe('team_123');
      expect(req.params.uid).toBe('user_1');
      deleted = true;
      res.json({ id: 'team_123' });
    });
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(0);
    expect(deleted).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Remove this team member?', false);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Team');
    expect(stderr).toContain('Acme (acme)');
    expect(stderr).toContain('Member');
    expect(stderr).toContain('octocat (octocat@example.com)');
    expect(stderr).toContain('✓ Removed');
    expect(stderr).not.toContain('Remove octocat from team team_123');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:members', value: 'members remove' },
    ]);
  });

  it('keeps the member when confirmation is declined', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      deleted = true;
      res.json({ id: 'team_123' });
    });
    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(0);
    expect(deleted).toBe(false);
    await expect(client.stderr).toOutput('Canceled.');
  });

  it('does not remove a member in non-interactive mode', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      deleted = true;
      res.json({ id: 'team_123' });
    });
    client.nonInteractive = true;
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.setArgv(
      'teams',
      'members',
      'remove',
      'octocat@example.com',
      '--non-interactive'
    );

    await expect(teams(client)).rejects.toThrow('exit:1');
    expect(deleted).toBe(false);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
    });
    expect(payload.message).toBe(
      'To remove this team member, rerun the command in an interactive terminal and confirm the prompt. No team member was removed.'
    );
    expect(payload.hint).toBe(
      'Run this command in an interactive terminal to review and confirm removal.'
    );
    expect(payload.data).toEqual({
      team: { id: 'team_123', name: 'Acme', slug: 'acme' },
      member: {
        uid: 'user_1',
        email: 'octocat@example.com',
        username: 'octocat',
      },
    });
    expect(payload.next[0].command).not.toContain('--non-interactive');
  });

  it('removes non-interactive mode from the missing-member recovery command', async () => {
    client.nonInteractive = true;
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.setArgv('teams', 'members', 'remove', '--non-interactive');

    await expect(teams(client)).rejects.toThrow('exit:2');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(payload.next[0].command).toContain('teams members remove <member>');
    expect(payload.next[0].command).not.toContain('--non-interactive');
  });

  it('hands off invoice delivery before removing its current recipient', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'octocat@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    let recipientUpdated = false;
    client.scenario.patch('/stripe/invoices/settings', (req, res) => {
      expect(req.query.teamId).toBe('team_123');
      expect(req.body).toEqual({ email: 'billing@acme.com' });
      recipientUpdated = true;
      res.json({ email: 'billing@acme.com' });
    });
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      expect(recipientUpdated).toBe(true);
      res.json({ id: 'team_123' });
    });
    const text = vi
      .spyOn(client.input, 'text')
      .mockResolvedValue('billing@acme.com');
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'Update the invoice recipient and remove this team member?',
      false
    );
    expect(text).toHaveBeenCalledWith({
      message: 'New invoice recipient?',
      validate: expect.any(Function),
    });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Invoices currently go to octocat@example.com. Future invoices will be sent to:'
    );
    expect(stderr).toContain('Invoice To');
    expect(stderr).toContain('New Recipient');
    expect(stderr).toContain('billing@acme.com');
    expect(stderr).toContain('✓ Updated');
    expect(stderr).toContain('✓ Removed');
  });

  it('does not infer invoice recipient ownership from a fuzzy member search', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'ann@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
      expect(req.query.search).toBe('joann');
      res.json({
        members: [
          {
            uid: 'user_1',
            email: 'notifications@acme.com',
            username: 'joann',
          },
        ],
      });
    });
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      res.json({ id: 'team_123' });
    });
    const text = vi.spyOn(client.input, 'text');
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'remove', 'joann');

    await expect(teams(client)).resolves.toBe(0);
    expect(text).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Remove this team member?', false);
  });

  it('requires an interactive terminal to hand off invoices before removal', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'octocat@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      deleted = true;
      res.json({ id: 'team_123' });
    });
    client.nonInteractive = true;
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.setArgv(
      'teams',
      'members',
      'remove',
      'octocat@example.com',
      '--non-interactive'
    );

    await expect(teams(client)).rejects.toThrow('exit:1');
    expect(deleted).toBe(false);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'missing_requirements',
      userActionRequired: true,
      message:
        'Invoices currently go to this team member. Rerun this command in an interactive terminal to choose where future invoices are sent.',
      data: { invoiceRecipient: 'octocat@example.com' },
    });
    expect(payload.missing).toEqual(['interactive_terminal']);
    expect(payload.hint).toBe(
      'Run this command in an interactive terminal to choose a new invoice recipient.'
    );
    expect(payload.next[0].command).toContain('teams members remove <member>');
    expect(payload.next[0].command).not.toContain('invoice-recipient');
    expect(payload.next[0].command).not.toContain('--non-interactive');
  });

  it('does not remove a member when the invoice-recipient update fails', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'octocat@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    client.scenario.patch('/stripe/invoices/settings', (_req, res) => {
      res.status(403).json({ error: { message: 'Forbidden' } });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      deleted = true;
      res.json({ id: 'team_123' });
    });
    vi.spyOn(client.input, 'text').mockResolvedValue('billing@acme.com');
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(1);
    expect(deleted).toBe(false);
    await expect(client.stderr).toOutput(
      "Couldn't update the invoice recipient. Check your billing permissions or try again."
    );
  });

  it('does not accept the departing member as the new invoice recipient', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'octocat@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    const text = vi
      .spyOn(client.input, 'text')
      .mockResolvedValue('OCTOCAT@example.com');
    const confirm = vi.spyOn(client.input, 'confirm');
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(2);
    expect(text).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    await expect(client.stderr).toOutput(
      'Choose a different invoice recipient. That address belongs to the team member being removed.'
    );
  });

  it('does not prompt when stdin is not a TTY', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    const confirm = vi.spyOn(client.input, 'confirm');
    client.stdin.isTTY = false;
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      message:
        'To remove this team member, rerun the command in an interactive terminal and confirm the prompt. No team member was removed.',
    });
  });

  it('prompts for a new invoice recipient before removing its current recipient', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam({ invoiceRecipient: 'octocat@example.com' });
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    client.scenario.patch('/stripe/invoices/settings', (req, res) => {
      expect(req.body).toEqual({ email: 'billing@acme.com' });
      res.json({ email: 'billing@acme.com' });
    });
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      res.json({ id: 'team_123' });
    });
    const text = vi
      .spyOn(client.input, 'text')
      .mockResolvedValue('billing@acme.com');
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'remove', 'octocat@example.com');

    await expect(teams(client)).resolves.toBe(0);
    expect(text).toHaveBeenCalledWith({
      message: 'New invoice recipient?',
      validate: expect.any(Function),
    });
  });

  it('keeps JSON results on stdout and the resolved preview on stderr', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (_req, res) => {
      res.json({
        members: [
          { uid: 'user_1', email: 'octocat@example.com', username: 'octocat' },
        ],
      });
    });
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (_req, res) => {
      res.json({ id: 'team_123' });
    });
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv(
      'teams',
      'members',
      'remove',
      'octocat@example.com',
      '--json'
    );

    await expect(teams(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput().trim())).toEqual({
      id: 'team_123',
    });
    await expect(client.stderr).toOutput('Acme (acme)');
    expect(client.stderr.getFullOutput()).not.toContain('Removed');
  });

  it('resolves a member by uid through the fallback lookup', async () => {
    client.config.currentTeam = 'team_123';
    useResolvedTeam();
    client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
      if (req.query.filterByUserIds === 'user_1') {
        res.json({ members: [{ uid: 'user_1', username: 'octocat' }] });
        return;
      }
      expect(req.query.search).toBe('user_1');
      res.json({ members: [] });
    });
    let deleted = false;
    client.scenario.delete('/v2/teams/:teamId/members/:uid', (req, res) => {
      expect(req.params.uid).toBe('user_1');
      deleted = true;
      res.json({ id: 'team_123' });
    });
    vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('teams', 'members', 'rm', 'user_1');

    await expect(teams(client)).resolves.toBe(0);
    expect(deleted).toBe(true);
  });

  it('describes the full members command surface in help', () => {
    const output = help(membersSubcommand, {
      stream: { isTTY: false },
      columns: 120,
    });
    expect(output).toContain(
      'List, invite, or remove members from the current team'
    );
    expect(output).not.toContain('invoice-recipient');
  });

  it('shows invite help from the nested members command', async () => {
    client.setArgv('teams', 'members', 'invite', '--help');

    await expect(teams(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'vercel teams members invite [email]...'
    );
  });

  it('shows remove help from the nested members command', async () => {
    client.setArgv('teams', 'members', 'remove', '--help');

    await expect(teams(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'vercel teams members remove <member>'
    );
  });

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
      expect(req.query.limit).toBe('5');
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
    client.setArgv('teams', 'members', '--limit', '5');

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

  it('uses the next timestamp as the API until cursor', async () => {
    client.config.currentTeam = 'team_123';
    client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
      expect(req.query.until).toBe('1584722256178');
      expect(req.query.next).toBeUndefined();
      res.json({
        members: [],
        pagination: {
          count: 0,
          next: null,
          prev: 1584722256178,
        },
      });
    });
    client.setArgv('teams', 'members', '--next', '1584722256178');

    const exitCode = await teams(client);
    expect(exitCode).toBe(0);
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
  describe('--next cursor', () => {
    it('still reads the hidden -N as --next, and warns', async () => {
      client.config.currentTeam = 'team_123';
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v2/teams/:teamId/members', (req, res) => {
        queries.push(req.query);
        res.json({
          members: [],
          pagination: { count: 0, next: 1584722256000 },
        });
      });
      client.setArgv('teams', 'members', '-N', '1584722256178');

      expect(await teams(client)).toBe(0);
      expect(queries[0].until).toBe('1584722256178');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('! -N is deprecated. Use --next.');
      expect(stripAnsi(stderr)).toMatch(
        /^ *Next page:\r?\n {4}vercel teams members --next 1584722256000$/m
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      client.config.currentTeam = 'team_123';
      client.setArgv('teams', 'members', '--next', 'oops');

      expect(await teams(client)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
