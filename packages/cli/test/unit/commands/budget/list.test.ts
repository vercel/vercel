import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import budget from '../../../../src/commands/budget';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { buildThresholds } from '../../../../src/util/budget/api';
import { useWebhook } from '../../../mocks/webhooks';

const activeBudget = {
  id: 'budget_1',
  ownerId: 'team_dummy',
  planId: 'plan_pro',
  amount: '500',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  scope: 'team',
  thresholds: buildThresholds({ pause: true }),
};

function countSpendRequests() {
  let requests = 0;
  client.scenario.get('/teams/:teamId/spend', (_req, res) => {
    requests++;
    res.json({ data: { currentSpend: 12_500, avgSpend: null } });
  });
  return () => requests;
}

function useListBudgets(budgets: unknown[] = [activeBudget]) {
  let query: unknown;
  client.scenario.get('/v1/budgets', (req, res) => {
    query = req.query;
    res.json({ data: budgets });
  });
  return () => query;
}

describe('budget list', () => {
  it('returns exit code 0 for --help', async () => {
    client.setArgv('budget', 'list', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'budgets:list' },
    ]);
  });

  it('accepts ls as an alias of list', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'ls');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
  });

  it('errors when no team is selected', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--scope');
    expect(await exitCodePromise).toBe(2);
  });

  it('requests every scope and not the v2 API shape', async () => {
    const team = useTeam();
    useUser();
    const getQuery = useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(getQuery()).not.toHaveProperty('apiVersion');
    expect(getQuery()).not.toHaveProperty('scope');
  });

  it('lists project and product budgets with their ids', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([
      activeBudget,
      {
        ...activeBudget,
        id: 'budget_project',
        amount: '50',
        scope: 'project',
        scopeId: 'prj_1',
      },
      {
        ...activeBudget,
        id: 'budget_product',
        amount: '25',
        scope: 'product',
        scopeId: 'prod_1',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$500');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toMatch(/team\s+\$500\s+active/);
    expect(out).toMatch(/project prj_1\s+\$50\s+active/);
    expect(out).toMatch(/product prod_1\s+\$25\s+active/);
  });

  it('emits scopeId with --json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([
      activeBudget,
      {
        ...activeBudget,
        id: 'budget_project',
        scope: 'project',
        scopeId: 'prj_1',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
    const { budgets } = JSON.parse(client.stdout.getFullOutput());
    expect(budgets).toMatchObject([
      { id: 'budget_1', scope: 'team', scopeId: null },
      { id: 'budget_project', scope: 'project', scopeId: 'prj_1' },
    ]);
  });

  it('runs list when no subcommand is given', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    const spendRequests = countSpendRequests();
    client.config.currentTeam = team.id;
    client.setArgv('budget');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$500');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(
      /scope\s+amount\s+status\s+pause\s+webhook/
    );
    expect(spendRequests()).toBe(0);
  });

  it('emits the list payload with --json and no subcommand', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('budget', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
      'spend'
    );
  });

  it('prints scope, amount, pause, and webhook', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$500');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('scope');
    expect(out).toContain('team');
    expect(out).toContain('yes');
    expect(out).toContain('—');
  });

  it('shows the webhook URL when one is configured', async () => {
    const team = useTeam();
    useUser();
    useWebhook('hook_1', { url: 'https://example.com/hook' });
    useListBudgets([
      {
        ...activeBudget,
        webhookId: 'hook_1',
        thresholds: buildThresholds({
          pause: true,
          webhookUrl: 'https://example.com/hook',
        }),
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('https://example.com/hook');
    expect(await exitCodePromise).toBe(0);
  });

  it('warns when the webhook is configured but its URL cannot be loaded', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([
      {
        ...activeBudget,
        webhookId: 'hook_missing',
      },
    ]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('could not be loaded');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('configured (unavailable)');
  });

  it('lists budgets without fetching spend', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    const spendRequests = countSpendRequests();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$500');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toMatch(/scope\s+amount\s+status\s+pause\s+webhook/);
    expect(out).toMatch(/team\s+\$500\s+active/);
    expect(spendRequests()).toBe(0);
  });

  it('omits spend with --json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    const spendRequests = countSpendRequests();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"budgets"');
    expect(await exitCodePromise).toBe(0);
    expect(
      JSON.parse(client.stdout.getFullOutput()).budgets[0]
    ).not.toHaveProperty('spend');
    expect(spendRequests()).toBe(0);
  });

  it('emits amount, pause, and webhookUrl with --json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"amount": 500');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('"id": "budget_1"');
    expect(out).toContain('"scope": "team"');
    expect(out).toContain('"pause": true');
    expect(out).toContain('"webhookUrl": null');
    expect(out).toContain(`"teamSlug": "${team.slug}"`);
    expect(out).toContain('"thresholds"');
    expect(out).toContain('"amountUnit": "usd"');
  });

  it('tells the user how to create one when none exist', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `vercel --scope ${team.slug} budgets set --amount <dollars>`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('rejects positional arguments', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', 'project', 'my-app');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "project"');
    expect(await exitCodePromise).toBe(2);
  });

  it('prints the API error when list fails', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.status(400).json({ error: { message: 'list failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('list failed');
    expect(await exitCodePromise).toBe(1);
  });

  it('emits an empty budgets array with --json', async () => {
    const team = useTeam();
    useUser();
    useListBudgets([]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"budgets": []');
    expect(await exitCodePromise).toBe(0);
  });

  it('errors on an unknown flag', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'list', '--not-a-flag');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('unknown or unexpected option');
    expect(await exitCodePromise).toBe(2);
  });
});
