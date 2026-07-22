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

function useListBudgets(budgets: unknown[] = [teamBudget, projectBudget]) {
  let query: unknown;
  client.scenario.get('/ai-gateway/budgets/list', (req, res) => {
    query = req.query;
    res.json({ budgets });
  });
  return () => query;
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
