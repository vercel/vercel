import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

function useRemoveBudget() {
  let query: unknown;
  client.scenario.delete('/ai-gateway/budgets', (req, res) => {
    query = req.query;
    res.json({});
  });
  return () => query;
}

function useListDefaults(defaults: unknown[]) {
  client.scenario.get('/ai-gateway/budgets/defaults/list', (_req, res) => {
    res.json({ defaults });
  });
}

const apiKey = { id: 'key_123', name: 'prod-key', purpose: 'ai-gateway' };

function useGetApiKey(key = apiKey) {
  client.scenario.get(`/v1/api-keys/${key.id}`, (_req, res) => {
    res.json({ apiKey: key });
  });
}

function useUpdateApiKeyQuota() {
  let body: unknown;
  client.scenario.patch('/v1/api-keys/:id/quota', (req, res) => {
    body = req.body;
    res.json({ apiKey, quota: { ...apiKey, archived: true } });
  });
  return () => body;
}

const teamMember = {
  uid: 'usr_member',
  email: 'teammate@example.com',
  username: 'teammate',
  role: 'MEMBER',
};

function useTeamMembers(teamId: string, members = [teamMember]) {
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    res.json({ members, pagination: { count: members.length, next: null } });
  });
}

describe('ai-gateway budgets remove', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'remove', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:remove' },
      ]);
    });
  });

  it('removes the team budget with --yes', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('team budget');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ scopeType: 'team' });
  });

  it('removes a project budget, resolving the project name to an id', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    const getQuery = useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'rm',
      'project',
      defaultProject.name!,
      '--yes'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toMatchObject({
      scopeType: 'project',
      projectId: defaultProject.id,
    });
  });

  it('requires --yes in non-interactive mode', async () => {
    const team = useTeam();
    useUser();
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.nonInteractive = true;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('--yes');
    expect(await exitCodePromise).toBe(1);
  });

  it('requires --yes when stdin is not a TTY', async () => {
    const team = useTeam();
    useUser();
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.stdin.isTTY = false;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('re-run with --yes');
    expect(await exitCodePromise).toBe(1);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'remove',
      'team',
      '--yes',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"removed": true');
    expect(await exitCodePromise).toBe(0);
  });

  it('requires a scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'remove', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Expected a scope');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an unknown scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'remove', 'org', '--yes');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown scope');
    expect(await exitCodePromise).toBe(1);
  });

  it('names the project default the budget falls back to', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    useListDefaults([
      {
        scopeType: 'project',
        limitAmount: 200,
        refreshPeriod: 'monthly',
        active: true,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'remove',
      'project',
      defaultProject.name!
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('falls back to the project default');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('Falls back to');
    expect(await exitCodePromise).toBe(0);
  });

  it('says the team will have no spend cap when no default exists', async () => {
    const team = useTeam();
    useUser();
    useListDefaults([]);
    useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'remove', 'team');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('The team will have no spend cap');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput('Canceled');
    expect(await exitCodePromise).toBe(0);
  });

  it('removes an api-key budget by archiving its quota', async () => {
    const team = useTeam();
    useUser();
    useGetApiKey();
    const getBody = useUpdateApiKeyQuota();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'rm',
      'api-key',
      'key_123',
      '--yes'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getBody()).toMatchObject({ archived: true });
  });

  it('removes a user budget, resolving the identifier to a user id', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    const getQuery = useRemoveBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'rm',
      'user',
      teamMember.email,
      '--yes'
    );

    const exitCode = await aiGateway(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).toMatchObject({
      scopeType: 'user',
      userId: teamMember.uid,
    });
  });
});
