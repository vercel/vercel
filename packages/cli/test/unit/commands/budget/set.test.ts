import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import budget from '../../../../src/commands/budget';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useWebhook } from '../../../mocks/webhooks';
import { buildThresholds } from '../../../../src/util/budget/api';

function useSetBudget({
  existing = [],
  response = {},
}: {
  existing?: unknown[];
  response?: unknown;
} = {}) {
  let body: unknown;
  let query: unknown;
  let rows = [...existing] as Record<string, unknown>[];
  client.scenario.get('/v1/budgets', (req, res) => {
    query = req.query;
    res.json({ data: rows });
  });
  client.scenario.post('/v1/budgets', (req, res) => {
    body = req.body;
    query = req.query;
    const posted = req.body as {
      amount: number;
      thresholds: unknown;
      webhookUrl?: string;
      scope?: string;
    };
    const prior = rows[0] ?? {};
    rows = [
      {
        ...prior,
        id: (prior.id as string | undefined) ?? 'budget_1',
        ownerId: (prior.ownerId as string | undefined) ?? 'team_dummy',
        planId: (prior.planId as string | undefined) ?? 'plan_pro',
        amount: String(posted.amount ?? 500),
        status: 'active',
        createdAt:
          (prior.createdAt as string | undefined) ?? '2026-09-01T00:00:00.000Z',
        thresholds: posted.thresholds,
        scope: posted.scope ?? 'team',
        ...(posted.webhookUrl
          ? { webhookId: (prior.webhookId as string | undefined) ?? 'hook_1' }
          : { webhookId: undefined }),
      },
    ];
    res.json(typeof response === 'object' && response !== null ? response : {});
  });
  return () => ({ body, query });
}

const existingBudget = {
  id: 'budget_1',
  ownerId: 'team_dummy',
  planId: 'plan_pro',
  amount: '500',
  status: 'active' as const,
  createdAt: '2026-09-01T00:00:00.000Z',
  scope: 'team' as const,
  thresholds: buildThresholds({ pause: true }),
};

describe('budget set', () => {
  it('errors when no team is selected', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.setArgv('budget', 'set', '--amount', '500');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--scope');
    expect(await exitCodePromise).toBe(2);
  });

  it('posts the budget request shape', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '500');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const { body, query } = captured();
    expect(query).not.toHaveProperty('apiVersion');
    expect(body).toMatchObject({
      amount: 500,
      scope: 'team',
    });
    expect(body).not.toHaveProperty('type');
    const thresholds = (body as { thresholds: { pauseUsage: boolean }[] })
      .thresholds;
    expect(thresholds).toHaveLength(3);
    expect(thresholds[0].pauseUsage).toBe(false);
    expect(thresholds[2].pauseUsage).toBe(false);
    expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
  });

  it('accepts update as an alias of set', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'update', '--no-pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const body = captured().body as { thresholds: { pauseUsage: boolean }[] };
    expect(body.thresholds.every(t => t.pauseUsage === false)).toBe(true);
    expect(client.stderr.getFullOutput()).toContain(
      '`vercel budgets update` is deprecated. Use `vercel budgets set`.'
    );
  });

  it('sends pauseUsage on the 100% threshold when --pause is passed', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '500', '--pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const body = captured().body as {
      amount: number;
      thresholds: { pauseUsage: boolean }[];
    };
    expect(body.amount).toBe(500);
    expect(body.thresholds).toHaveLength(3);
    expect(body.thresholds[2].pauseUsage).toBe(true);
    expect(body.thresholds[0].pauseUsage).toBe(false);
    expect(body).not.toHaveProperty('type');
  });

  it('forwards the webhook URL', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '100',
      '--webhook',
      'https://example.com/hook'
    );

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      webhookUrl: 'https://example.com/hook',
    });
  });

  it('prints the webhook secret when one is returned', async () => {
    const team = useTeam();
    useUser();
    useWebhook('hook_1', { url: 'https://example.com/hook' });
    useSetBudget({ response: { webhookSecret: 'whsec_abc123' } });
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '100',
      '--webhook',
      'https://example.com/hook'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('whsec_abc123');
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toContain('https://example.com/hook');
  });

  it('enables pause on the existing budget without --amount', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({
      existing: [
        {
          ...existingBudget,
          thresholds: buildThresholds({}),
        },
      ],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const body = captured().body as {
      amount: number;
      thresholds: { pauseUsage: boolean }[];
    };
    expect(body.amount).toBe(500);
    expect(body.thresholds[2].pauseUsage).toBe(true);
    expect(client.stderr.getFullOutput()).toContain(
      `Pause all projects on team ${team.slug} at 100% ($500)`
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Production deployments become unavailable'
    );
  });

  it('does not pause at a custom 75% threshold', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
    ];
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('no 100% threshold');
    expect(await exitCodePromise).toBe(1);
    expect(captured().body).toBeUndefined();
  });

  it('applies --pause to the 100% row without turning notifications back on', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
        pauseUsage: false,
      },
    ];
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 500,
      thresholds: [
        { ...custom[0], pauseUsage: false },
        { ...custom[1], pauseUsage: false },
        { ...custom[2], pauseUsage: true },
      ],
    });
  });

  it('sets a webhook on the existing budget without --amount', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--webhook', 'https://example.com/hook');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 500,
      webhookUrl: 'https://example.com/hook',
    });
    const body = captured().body as { thresholds: { pauseUsage: boolean }[] };
    expect(body.thresholds[2].pauseUsage).toBe(true);
  });

  it('re-sends the existing webhook URL when updating pause', async () => {
    const team = useTeam();
    useUser();
    useWebhook('hook_1', { url: 'https://example.com/existing' });
    const captured = useSetBudget({
      existing: [
        {
          ...existingBudget,
          webhookId: 'hook_1',
          thresholds: buildThresholds({}),
        },
      ],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 500,
      webhookUrl: 'https://example.com/existing',
    });
  });

  it('keeps pause when only the amount changes', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const body = captured().body as {
      amount: number;
      thresholds: { pauseUsage: boolean }[];
    };
    expect(body.amount).toBe(800);
    expect(body.thresholds[2].pauseUsage).toBe(true);
  });

  it('does not rebuild custom thresholds when only --amount is passed', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
    ];
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 800,
      thresholds: custom,
    });
  });

  it('rejects an amount-only update that would keep pause below 100%', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('pauses at 75%');
    expect(await exitCodePromise).toBe(1);
    expect(captured().body).toBeUndefined();
    expect(client.stderr.getFullOutput()).toContain('--no-pause');
  });

  it('rejects a webhook-only update that would keep pause below 100%', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--webhook', 'https://example.com/hook');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('pauses at 75%');
    expect(await exitCodePromise).toBe(1);
    expect(captured().body).toBeUndefined();
  });

  it('clears a stored pause below 100% with --no-pause', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--no-pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 500,
      thresholds: [
        { ...custom[0], pauseUsage: false },
        { ...custom[1], pauseUsage: false },
      ],
    });
  });

  it('moves a stored pause from 75% to 100% with --pause', async () => {
    const team = useTeam();
    useUser();
    const custom = [
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
      {
        percent: 100,
        sendNotifications: false,
        triggerWebhook: false,
        pauseUsage: false,
      },
    ];
    const captured = useSetBudget({
      existing: [{ ...existingBudget, thresholds: custom }],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(captured().body).toMatchObject({
      amount: 500,
      thresholds: [
        { ...custom[0], pauseUsage: false },
        { ...custom[1], pauseUsage: false },
        { ...custom[2], pauseUsage: true },
      ],
    });
  });

  it('turns pause off with --no-pause without --amount', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--no-pause');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    const body = captured().body as { thresholds: { pauseUsage: boolean }[] };
    expect(body.thresholds.every(t => t.pauseUsage === false)).toBe(true);
    expect(client.stdout.getFullOutput()).toMatch(
      /scope\s+amount\s+status\s+pause\s+webhook/
    );
    expect(client.stdout.getFullOutput()).toContain('no');
    expect(client.stdout.getFullOutput()).toContain('team');
  });

  it('clears the webhook with --no-webhook', async () => {
    const team = useTeam();
    useUser();
    const captured = useSetBudget({
      existing: [
        {
          ...existingBudget,
          webhookId: 'hook_1',
        },
      ],
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--no-webhook');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('—');
    expect(await exitCodePromise).toBe(0);
    const body = captured().body as {
      webhookUrl?: string;
      thresholds: { triggerWebhook: boolean }[];
    };
    expect(body).not.toHaveProperty('webhookUrl');
    expect(body.thresholds.every(t => t.triggerWebhook === false)).toBe(true);
  });

  it('errors when --webhook and --no-webhook are both passed', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--webhook',
      'https://example.com/hook',
      '--no-webhook'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--webhook and --no-webhook');
    expect(await exitCodePromise).toBe(2);
  });

  it('errors when --pause and --no-pause are both passed', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause', '--no-pause');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--pause and --no-pause');
    expect(await exitCodePromise).toBe(2);
  });

  it('errors when no flags are passed', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--amount');
    expect(await exitCodePromise).toBe(2);
  });

  it('errors when updating without an existing budget', async () => {
    const team = useTeam();
    useUser();
    useSetBudget();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--pause');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('No budget to update');
    expect(await exitCodePromise).toBe(1);
  });

  it('errors when --amount is below 1', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '0');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('at least $1');
    expect(await exitCodePromise).toBe(2);
  });

  it('errors when --amount is not a whole number', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '10.5');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('whole number');
    expect(await exitCodePromise).toBe(2);
  });

  it('rejects positional arguments instead of setting the team budget', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      'project',
      'my-app',
      '--amount',
      '200',
      '--pause'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "project"');
    expect(await exitCodePromise).toBe(2);
  });

  it('emits id and scope after re-GET with --json', async () => {
    const team = useTeam();
    useUser();
    useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"id": "budget_1"');
    expect(await exitCodePromise).toBe(0);
    const out = client.stdout.getFullOutput();
    expect(out).toContain('"scope": "team"');
    expect(out).toContain('"amount": 800');
    expect(out).toContain('"amountUnit": "usd"');
    expect(out).toContain('"saved": true');
    expect(out).toContain('"reloaded": true');
    expect(out).toContain('"thresholds"');
    expect(out).not.toContain('webhookSecret');
  });

  it('does not fetch spend', async () => {
    const team = useTeam();
    useUser();
    useSetBudget({ existing: [existingBudget] });
    let spendRequests = 0;
    client.scenario.get('/teams/:teamId/spend', (_req, res) => {
      spendRequests++;
      res.json({ data: { currentSpend: 12_500, avgSpend: null } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('$800');
    expect(await exitCodePromise).toBe(0);
    expect(spendRequests).toBe(0);
  });

  it('accepts --format json', async () => {
    const team = useTeam();
    useUser();
    useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800', '--format', 'json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"amount": 800');
    expect(await exitCodePromise).toBe(0);
  });

  it('returns exit code 0 for --help', async () => {
    client.setArgv('budget', 'set', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('50/75/100%');
    expect(help.replace(/\s+/g, ' ')).toContain('keep pause and webhook');
    expect(help).toContain('Change the budget amount');
    expect(help).not.toContain('custom thresholds');
  });

  it('prints the webhook secret and exits 0 when re-GET returns nothing', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({ data: [] });
    });
    client.scenario.post('/v1/budgets', (_req, res) => {
      res.json({ webhookSecret: 'whsec_test' });
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '500',
      '--webhook',
      'https://example.com/hook'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('whsec_test');
    expect(await exitCodePromise).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('could not be reloaded');
    expect(client.stderr.getFullOutput()).toContain(`--scope ${team.slug}`);
  });

  it('emits webhookSecret in --json and exits 0 when re-GET returns nothing', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({ data: [] });
    });
    client.scenario.post('/v1/budgets', (_req, res) => {
      res.json({ webhookSecret: 'whsec_test' });
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '500',
      '--webhook',
      'https://example.com/hook',
      '--json'
    );

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"webhookSecret": "whsec_test"');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      ok: true,
      saved: true,
      reloaded: false,
      webhookSecret: 'whsec_test',
      amount: 500,
      amountUnit: 'usd',
      teamSlug: team.slug,
    });
  });

  it('prints the webhook secret and exits 0 when re-GET fails', async () => {
    const team = useTeam();
    useUser();
    let gets = 0;
    client.scenario.get('/v1/budgets', (_req, res) => {
      gets += 1;
      if (gets === 1) {
        res.json({ data: [] });
        return;
      }
      res.status(500).json({ error: { message: 'reload failed' } });
    });
    client.scenario.post('/v1/budgets', (_req, res) => {
      res.json({ webhookSecret: 'whsec_test' });
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '500',
      '--webhook',
      'https://example.com/hook'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('whsec_test');
    expect(await exitCodePromise).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('could not be reloaded');
    expect(client.stderr.getFullOutput()).toContain(`--scope ${team.slug}`);
    expect(client.stderr.getFullOutput()).not.toContain('reload failed');
  });

  it('rejects an empty --webhook and requires --no-webhook to clear', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--webhook', '');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--no-webhook');
    expect(await exitCodePromise).toBe(2);
  });

  it('includes webhookSecret in --json when the POST created a webhook', async () => {
    const team = useTeam();
    useUser();
    useWebhook('hook_1', { url: 'https://example.com/hook' });
    useSetBudget({ response: { webhookSecret: 'whsec_abc123' } });
    client.config.currentTeam = team.id;
    client.setArgv(
      'budget',
      'set',
      '--amount',
      '100',
      '--webhook',
      'https://example.com/hook',
      '--json'
    );

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"webhookSecret": "whsec_abc123"');
    expect(await exitCodePromise).toBe(0);
  });

  it('prints the API error when POST fails', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({ data: [] });
    });
    client.scenario.post('/v1/budgets', (_req, res) => {
      res.status(400).json({ error: { message: 'pause not supported' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '500', '--pause');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('pause not supported');
    expect(await exitCodePromise).toBe(1);
    expect(client.stderr.getFullOutput()).not.toContain('before retrying');
  });

  it('tells the user to inspect the resolved team before retrying a 5xx save', async () => {
    const team = useTeam();
    useUser();
    client.scenario.get('/v1/budgets', (_req, res) => {
      res.json({ data: [] });
    });
    client.scenario.post('/v1/budgets', (_req, res) => {
      res.status(500).json({ error: { message: 'save failed' } });
    });
    client.config.currentTeam = team.id;
    client.setArgv(
      '--cwd',
      '/tmp',
      '--scope',
      'other-team',
      'budget',
      'set',
      '--amount',
      '500'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('save failed');
    expect(await exitCodePromise).toBe(1);
    const err = client.stderr.getFullOutput();
    expect(err).toContain('before retrying');
    expect(err).toContain('--cwd /tmp');
    expect(err).toContain(`--scope ${team.slug}`);
    expect(err).not.toContain('--scope other-team');
  });

  it('errors on an invalid --format', async () => {
    const team = useTeam();
    useUser();
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '500', '--format', 'table');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Invalid output format');
    expect(await exitCodePromise).toBe(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:set', value: 'set' },
    ]);
  });

  it('records a normalized --format json in telemetry', async () => {
    const team = useTeam();
    useUser();
    useSetBudget({ existing: [existingBudget] });
    client.config.currentTeam = team.id;
    client.setArgv('budget', 'set', '--amount', '800', '--format', 'JSON');

    const exitCode = await budget(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:set', value: 'set' },
      { key: 'option:amount', value: '[REDACTED]' },
      { key: 'option:format', value: 'json' },
    ]);
  });
});
