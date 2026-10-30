import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useTeam } from '../../../mocks/team';
import { useWebhook } from '../../../mocks/webhooks';
import {
  TEAM_BUDGET,
  budgetAmountDollars,
  buildThresholds,
  findBudget,
  formatUsd,
  formatUsdWhole,
  getTeamSpend,
  listBudgetAlerts,
  listBudgets,
  pausePercentsOutside100,
  removeBudget,
  resolveBudgetWebhook,
  resolveBudgetWebhookUrl,
  resolvedBudgetScope,
  setBudget,
  thresholdsForSet,
  toBudgetState,
  type Budget,
  type BudgetThreshold,
} from '../../../../src/util/budget/api';

const teamRow: Budget = {
  id: 'budget_team',
  ownerId: 'team_dummy',
  planId: 'plan_pro',
  amount: '500',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  scope: 'team',
  thresholds: buildThresholds({ pause: true }),
};

const customThresholds: BudgetThreshold[] = [
  {
    percent: 50,
    sendNotifications: false,
    triggerWebhook: false,
    pauseUsage: false,
  },
  {
    percent: 75,
    sendNotifications: false,
    triggerWebhook: false,
    pauseUsage: true,
  },
];

describe('budget api helpers', () => {
  it('treats a non-numeric amount as $0', () => {
    expect(budgetAmountDollars({ amount: 'nope' })).toBe(0);
  });

  it('formats whole dollars and cents', () => {
    expect(formatUsdWhole(5000)).toBe('$5,000');
    expect(formatUsd(125.5)).toBe('$125.50');
  });

  it('defaults scope to the selector when the row omits it', () => {
    expect(resolvedBudgetScope({}, TEAM_BUDGET)).toBe('team');
    expect(
      resolvedBudgetScope({ scope: 'organization' }, { scope: 'team' })
    ).toBe('organization');
  });

  it('keeps custom thresholds when only the amount changes', () => {
    expect(
      thresholdsForSet({
        existing: customThresholds,
        pause: true,
        pauseSpecified: false,
        webhookSpecified: false,
      })
    ).toEqual(customThresholds);
  });

  it('applies dashboard defaults when creating', () => {
    expect(
      thresholdsForSet({
        pause: true,
        pauseSpecified: true,
        webhookUrl: 'https://example.com/hook',
        webhookSpecified: true,
      })
    ).toEqual(
      buildThresholds({
        pause: true,
        webhookUrl: 'https://example.com/hook',
      })
    );
  });

  it('does not enable pause below 100%', () => {
    expect(
      thresholdsForSet({
        existing: customThresholds,
        pause: true,
        pauseSpecified: true,
        webhookSpecified: false,
      })
    ).toEqual(
      customThresholds.map(threshold => ({
        ...threshold,
        pauseUsage: false,
      }))
    );
    expect(pausePercentsOutside100(customThresholds)).toEqual([75]);
    expect(pausePercentsOutside100(buildThresholds({ pause: true }))).toEqual(
      []
    );
  });

  it('moves pause onto the 100% row without resetting notifications', () => {
    const with100: BudgetThreshold[] = [
      ...customThresholds,
      {
        percent: 100,
        sendNotifications: false,
        triggerWebhook: false,
        pauseUsage: false,
      },
    ];
    expect(
      thresholdsForSet({
        existing: with100,
        pause: true,
        pauseSpecified: true,
        webhookSpecified: false,
      })
    ).toEqual([
      {
        percent: 50,
        sendNotifications: false,
        triggerWebhook: false,
        pauseUsage: false,
      },
      {
        percent: 75,
        sendNotifications: false,
        triggerWebhook: false,
        pauseUsage: false,
      },
      {
        percent: 100,
        sendNotifications: false,
        triggerWebhook: false,
        pauseUsage: true,
      },
    ]);
  });

  it('lists every scope by default and treats missing data as []', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/v1/budgets', (req, res) => {
      query = req.query;
      res.json({});
    });

    expect(await listBudgets(client)).toEqual([]);
    expect(query).not.toHaveProperty('scope');
  });

  it('sends the selector scope when one is given', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/v1/budgets', (req, res) => {
      query = req.query;
      res.json({ data: [] });
    });

    await listBudgets(client, TEAM_BUDGET);
    expect(query).toMatchObject({ scope: 'team' });
  });

  it('finds the team row and ignores an org-wide row in the same payload', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({
        data: [
          { ...teamRow, id: 'budget_org', scope: 'organization' },
          teamRow,
        ],
      });
    });

    const found = await findBudget(client, TEAM_BUDGET);
    expect(found?.id).toBe('budget_team');
  });

  it('returns undefined when no row matches the selector', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({
        data: [{ ...teamRow, scope: 'organization' }],
      });
    });

    expect(await findBudget(client, TEAM_BUDGET)).toBeUndefined();
  });

  it('falls back to the first same-scope row when none are active', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({
        data: [{ ...teamRow, status: 'disabled' }],
      });
    });

    const found = await findBudget(client, TEAM_BUDGET);
    expect(found?.status).toBe('disabled');
  });

  it('does not retry POST /v1/budgets', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let posts = 0;
    client.scenario.post('/v1/budgets', (_req, res) => {
      posts += 1;
      res.status(500).json({ error: { message: 'save failed' } });
    });

    await expect(
      setBudget(client, {
        amount: 500,
        scope: 'team',
        thresholds: buildThresholds({}),
      })
    ).rejects.toThrow(/save failed/);
    expect(posts).toBe(1);
  });

  it('posts organization scope without inventing project fields', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let body: unknown;
    client.scenario.post('/v1/budgets', (req, res) => {
      body = req.body;
      res.json({});
    });

    await setBudget(client, {
      amount: 1000,
      scope: 'organization',
      thresholds: buildThresholds({ pause: false }),
    });
    expect(body).toMatchObject({ amount: 1000, scope: 'organization' });
    expect(body).not.toHaveProperty('scopeId');
  });

  it('omits scope on team spend and falls back when data is missing', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/teams/:teamId/spend', (req, res) => {
      query = req.query;
      res.json({});
    });

    const spend = await getTeamSpend(client, team.id, TEAM_BUDGET);
    expect(spend).toEqual({ currentSpend: null, avgSpend: null });
    expect(query).not.toHaveProperty('scope');
  });

  it('sends scope on organization spend', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/teams/:teamId/spend', (req, res) => {
      query = req.query;
      res.json({ data: { currentSpend: 1, avgSpend: 1 } });
    });

    await getTeamSpend(client, team.id, { scope: 'organization' });
    expect(query).toMatchObject({ scope: 'organization' });
  });

  it('distinguishes missing webhooks from lookup failures', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    useWebhook('hook_ok', { url: 'https://example.com/ok' });
    expect(
      await resolveBudgetWebhookUrl(client, { webhookId: 'hook_ok' })
    ).toBe('https://example.com/ok');
    expect(await resolveBudgetWebhook(client, {})).toEqual({
      webhookId: null,
      webhookUrl: null,
      webhookStatus: 'absent',
    });
    expect(
      await resolveBudgetWebhook(client, { webhookId: 'hook_missing' })
    ).toEqual({
      webhookId: 'hook_missing',
      webhookUrl: null,
      webhookStatus: 'unavailable',
    });
  });

  it('builds state from the selector when the budget row has no scope', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    const state = await toBudgetState(
      client,
      { ...teamRow, scope: undefined },
      TEAM_BUDGET
    );
    expect(state).toMatchObject({
      id: 'budget_team',
      teamId: 'team_dummy',
      scope: 'team',
      amount: 500,
      amountUnit: 'usd',
      pause: true,
      webhookId: null,
      webhookUrl: null,
      webhookStatus: 'absent',
    });
  });

  it('deletes by id', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let deletedId: string | undefined;
    client.scenario.delete('/v1/budgets/:budgetId', (req, res) => {
      deletedId = req.params.budgetId;
      res.json({});
    });

    await removeBudget(client, 'budget_team');
    expect(deletedId).toBe('budget_team');
  });

  it('sends only the alert filters that are set', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/v1/budgets/alerts', (req, res) => {
      query = req.query;
      res.json({ data: [], nextCursor: 'cur_2' });
    });

    const page = await listBudgetAlerts(client, TEAM_BUDGET, {
      since: 1_000,
      limit: 5,
    });

    expect(page).toEqual({ data: [], nextCursor: 'cur_2' });
    expect(query).toEqual({
      teamId: team.id,
      scope: 'team',
      since: '1000',
      limit: '5',
    });
  });

  it('treats a missing alerts list as []', async () => {
    const team = useTeam();
    client.config.currentTeam = team.id;
    let query: unknown;
    client.scenario.get('/v1/budgets/alerts', (req, res) => {
      query = req.query;
      res.json({});
    });

    expect(await listBudgetAlerts(client)).toEqual({
      data: [],
      nextCursor: undefined,
    });
    expect(query).toEqual({ teamId: team.id, scope: 'team' });
  });
});
