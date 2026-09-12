import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useProject, defaultProject } from '../../../mocks/project';

const userBudget = {
  quotaEntityId: 'usr_member',
  scopeType: 'user',
  scopeId: 'usr_member',
  limitAmount: 100,
  currentSpend: 12.34,
  currentByokSpend: 0,
  includeByokInQuota: false,
  refreshPeriod: 'monthly',
  active: true,
  archived: false,
  createdAt: 1,
  updatedAt: 2,
};

function useListBudgets(budgets: unknown[]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
    query = req.query;
    res.json({ budgets });
  });
  return () => query;
}

function useTeamMembers(teamId: string) {
  client.scenario.get(`/v2/teams/${teamId}/members`, (_req, res) => {
    res.json({
      members: [
        { uid: 'member', email: 'teammate@example.com', username: 'teammate' },
      ],
    });
  });
}

describe('ai-gateway budgets inspect', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'budgets', 'inspect', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:budgets', value: 'budgets' },
        { key: 'flag:help', value: 'ai-gateway budgets:inspect' },
      ]);
    });
  });

  it('shows a user budget resolved from an email', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    const getQuery = useListBudgets([userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'inspect',
      'user',
      'teammate@example.com'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('teammate');
    await expect(client.stderr).toOutput('$100');
    await expect(client.stderr).toOutput('$12.34');
    expect(await exitCodePromise).toBe(0);
    expect(getQuery()).toMatchObject({ scopeType: 'user' });
  });

  it('shows a default-inherited budget with its source', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([{ ...userBudget, source: 'default' }]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'inspect', 'user', 'teammate');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('user default');
    expect(await exitCodePromise).toBe(0);
  });

  it('shows a project budget by name', async () => {
    const team = useTeam();
    useUser();
    useProject({ ...defaultProject });
    useListBudgets([
      {
        ...userBudget,
        quotaEntityId: defaultProject.id,
        scopeType: 'project',
        scopeId: defaultProject.id,
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'inspect',
      'project',
      defaultProject.name!
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput(defaultProject.name!);
    expect(await exitCodePromise).toBe(0);
  });

  it('outputs the raw budget with --format json', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([userBudget]);
    client.config.currentTeam = team.id;
    client.setArgv(
      'ai-gateway',
      'budgets',
      'inspect',
      'user',
      'teammate',
      '--format',
      'json'
    );

    const exitCodePromise = aiGateway(client);

    await expect(client.stdout).toOutput('"quotaEntityId": "usr_member"');
    expect(await exitCodePromise).toBe(0);
  });

  it('errors when no budget exists for the scope', async () => {
    const team = useTeam();
    useUser();
    useTeamMembers(team.id);
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('ai-gateway', 'budgets', 'inspect', 'user', 'teammate');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('No budget found for teammate');
    expect(await exitCodePromise).toBe(1);
  });

  it('rejects an unknown scope', async () => {
    client.setArgv('ai-gateway', 'budgets', 'inspect', 'org');

    const exitCodePromise = aiGateway(client);

    await expect(client.stderr).toOutput('Unknown scope');
    expect(await exitCodePromise).toBe(1);
  });
});
