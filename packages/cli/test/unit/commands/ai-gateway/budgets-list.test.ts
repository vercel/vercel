import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

const teamBudget = {
  quotaEntityId: 'team_abc',
  scopeType: 'team',
  scopeId: 'team_abc',
  limitAmount: 500,
  currentSpend: 120.5,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

const projectBudget = {
  ...teamBudget,
  quotaEntityId: 'prj_123',
  scopeType: 'project',
  scopeId: 'prj_123',
  limitAmount: 200,
};

const userBudget = {
  ...teamBudget,
  quotaEntityId: 'api_key_id_usr_member',
  scopeType: 'user',
  scopeId: 'usr_member',
  limitAmount: 100,
};

const apiKeyBudget = {
  ...teamBudget,
  quotaEntityId: 'api_key_id_key_123',
  scopeType: 'api-key',
  scopeId: 'key_123',
  limitAmount: 50,
};

function useListBudgets(budgets: unknown[] = [teamBudget, projectBudget]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
    query = req.query;
    res.json({ budgets });
  });
  return () => query;
}

function useApiKeys(apiKeys: unknown[]) {
  client.scenario.get('/v1/api-keys', (_req, res) => {
    res.json({ apiKeys, pagination: { count: apiKeys.length, next: null } });
  });
}

function useTeamMembers(
  teamId: string,
  members: unknown[] = [
    { uid: 'usr_member', email: 'teammate@example.com', username: 'teammate' },
  ]
) {
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    res.json({ members, pagination: { count: members.length, next: null } });
  });
}

describe('ai-gateway budgets list', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'list', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:list' },
      ]);
    });
  });

  it('resolves a project scope id to its name', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    useListBudgets([{ ...projectBudget, scopeId: defaultProject.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(defaultProject.name!);
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a user scope id to a member handle', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('teammate');
    expect(await exitCodePromise).toBe(0);
  });

  it('uses the api-provided name for an api-key scope row', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...apiKeyBudget, name: 'production-key' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('production-key');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves an api-key scope id from the key roster when unnamed', async () => {
    const team = useTeam();
    useUser();
    useApiKeys([{ id: 'key_123', name: 'roster-key' }]);
    useListBudgets([apiKeyBudget]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('roster-key');
    expect(await exitCodePromise).toBe(0);
  });

  it('resolves a team scope id to its slug', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([{ ...teamBudget, scopeId: team.id }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput(team.slug);
    expect(await exitCodePromise).toBe(0);
  });

  it('falls back to the scope id when a name cannot be resolved', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v9/projects/prj_gone', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Project not found' } });
    });
    useListBudgets([{ ...projectBudget, scopeId: 'prj_gone' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('prj_gone');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when there are no budgets', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'ls');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No budgets found');
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs JSON with --format json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'list', '--format', 'json');

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
  });
});
