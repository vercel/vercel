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

function useBudgets(budgets: unknown[] = [activeBudget]) {
  client.scenario.get('/v1/budgets', (_req, res) => {
    res.json({ data: budgets });
  });
}

// The spend endpoint reports cents: 12_500 cents === $125.00.
function useSpend(currentSpend: number | null = 12_500) {
  client.scenario.get('/teams/:teamId/spend', (_req, res) => {
    res.json({
      data: { currentSpend, avgSpend: 10_000, prevMonthSpend: 9_000 },
    });
  });
}

const recentAlert = {
  id: 'balert_1',
  budgetId: 'budget_1',
  scope: 'team',
  triggeredAt: Date.UTC(2026, 9, 14, 18, 5),
  period: { start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 10, 1) },
  budgetAmount: '500',
  spent: '375.42',
  threshold: {
    percent: 75,
    amount: '375',
    sendNotifications: true,
    triggerWebhook: false,
    pauseUsage: false,
  },
};

function useAlerts(data: unknown[] = [recentAlert]) {
  const queries: Record<string, string>[] = [];
  client.scenario.get('/v1/budgets/alerts', (req, res) => {
    queries.push(req.query as Record<string, string>);
    res.json({ data });
  });
  return queries;
}

describe('budget', () => {
  it('errors when no team is selected', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--scope');
    expect(await exitCodePromise).toBe(2);
  });

  it('returns exit code 0 for --help without fetching', async () => {
    client.setArgv('budget', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'budgets' },
    ]);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('inspect');
    expect(help).toContain('budgets');
    expect(help).not.toContain('overview');
  });

  it('rejects an unknown subcommand', async () => {
    client.setArgv('budget', 'foo');
    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('valid subcommand');
    expect(await exitCodePromise).toBe(2);
  });

  it('converts cents to dollars', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$125.00');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(
      /team\s+\$500\s+\$125\.00\s+25%\s+active/
    );
  });

  it('reports 25% of a $500 budget for $125 of spend', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"percentUsed": 25');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('"currentSpend": 125');
    expect(out).toContain('"unit": "usd"');
    expect(out).toContain('"scope": "team"');
    expect(out).toContain('"id": "budget_1"');
    expect(out).toContain('"amountUnit": "usd"');
    expect(out).toContain('"thresholds"');
    expect(out).toContain(`"teamSlug": "${team.slug}"`);
  });

  it('notes that projects pause when the budget has that set', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('yes');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('pause');
    expect(out).toContain('scope');
    expect(out).toContain('team');
  });

  it('includes pause and webhookUrl in --json', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"pause": true');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('"webhookUrl": null');
    expect(out).toContain('"budget"');
    expect(out).toContain('"spend"');
  });

  it('shows the webhook URL on inspect', async () => {
    const team = useTeam();
    useUser();
    useWebhook('hook_1', { url: 'https://example.com/hook' });
    useBudgets([
      {
        ...activeBudget,
        webhookId: 'hook_1',
        thresholds: buildThresholds({
          pause: true,
          webhookUrl: 'https://example.com/hook',
        }),
      },
    ]);
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('https://example.com/hook');
    expect(await exitCodePromise).toBe(0);
  });

  it('still reports spend when no budget is set', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `No budget set on team ${team.slug}. Current spend is $125.00.`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('renders a dash when currentSpend is null', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend(null);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$500');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(
      /team\s+\$500\s+—\s+—\s+active/
    );
  });

  it('emits budget: null when none is set', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"budget": null');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('"currentSpend": 125');
  });

  it('rejects positional arguments', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', 'project');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "project"');
    expect(await exitCodePromise).toBe(2);
  });

  it('returns exit code 0 for inspect --help', async () => {
    client.setArgv('budget', 'inspect', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);
  });

  it('accepts overview as an alias of inspect', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'overview');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$125.00');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(
      /team\s+\$500\s+\$125\.00\s+25%\s+active/
    );
  });

  it('still shows the budget when spend cannot be loaded', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useAlerts();
    client.scenario.get('/teams/:teamId/spend', (_req, res) => {
      res.status(500).json({ error: { message: 'spend failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('team');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(
      /team\s+\$500\s+—\s+—\s+active/
    );
  });

  it('prints — for an alert with no triggeredAt', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    useAlerts([{ ...recentAlert, triggeredAt: undefined }]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Recent alerts');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toMatch(/\n\s+—\s+team/);
  });

  it('warns when the webhook is configured but its URL cannot be loaded', async () => {
    const team = useTeam();
    useUser();
    useBudgets([
      {
        ...activeBudget,
        webhookId: 'hook_missing',
      },
    ]);
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('could not be loaded');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('configured (unavailable)');
  });

  it('prints the latest three alerts for the budget', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    const queries = useAlerts();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Recent alerts');
    expect(await exitCodePromise).toBe(0);
    expect(queries).toEqual([
      expect.objectContaining({
        scope: 'team',
        budgetId: 'budget_1',
        limit: '3',
      }),
    ]);
    const err = client.stderr.getFullOutput();
    expect(err).not.toContain('Current spend');
    expect(err).not.toContain('See every alert');
    const out = client.stdout.getFullOutput();
    expect(out).toContain('2026-10-14 18:05 UTC');
    expect(out).toContain('75%');
    expect(out).toContain('$375.42');
  });

  it('includes recentAlerts in --json', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    useAlerts();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"recentAlerts"');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).recentAlerts).toEqual([
      recentAlert,
    ]);
  });

  it('says when the budget has no alerts yet', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    useAlerts([]);
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('No alerts on this budget yet.');
    expect(await exitCodePromise).toBe(0);
  });

  it('still succeeds with recentAlerts: null when alerts cannot be loaded', async () => {
    const team = useTeam();
    useUser();
    useBudgets();
    useSpend();
    client.scenario.get('/v1/budgets/alerts', (_req, res) => {
      res.status(400).json({ error: { message: 'alerts failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"recentAlerts": null');
    expect(await exitCodePromise).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('alerts failed');
  });

  it('points to budgets set on the resolved team, not the argv --scope', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    useSpend();
    client.config.currentTeam = team.id;
    client.setArgv('--scope', 'stale-team', 'budget', 'inspect');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `Create one with \`vercel --scope ${team.slug} budgets set --amount <dollars>\``
    );
    expect(await exitCodePromise).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('stale-team');
  });

  it('does not fetch alerts when no budget is set', async () => {
    const team = useTeam();
    useUser();
    useBudgets([]);
    useSpend();
    const queries = useAlerts();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'inspect', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"recentAlerts": null');
    expect(await exitCodePromise).toBe(0);
    expect(queries).toHaveLength(0);
  });
});
