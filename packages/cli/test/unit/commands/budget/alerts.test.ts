import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import budget from '../../../../src/commands/budget';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import {
  decodeBudgetAlertsCursor,
  encodeBudgetAlertsCursor,
} from '../../../../src/util/budget/alerts-cursor';
import { INVALID_NEXT_MESSAGE } from '../../../../src/util/get-pagination-opts';

const teamAlert = {
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
    triggerWebhook: true,
    pauseUsage: false,
  },
};

const overBudgetAlert = {
  ...teamAlert,
  id: 'balert_2',
  triggeredAt: Date.UTC(2026, 9, 18, 9, 30),
  spent: '612',
  threshold: {
    percent: 120,
    amount: '600',
    sendNotifications: true,
    triggerWebhook: false,
    pauseUsage: false,
  },
};

function useAlerts(
  page: { data: unknown[]; nextCursor?: string } = {
    data: [overBudgetAlert, teamAlert],
  }
) {
  const queries: Record<string, string>[] = [];
  client.scenario.get('/v1/budgets/alerts', (req, res) => {
    queries.push(req.query as Record<string, string>);
    res.json(page);
  });
  return queries;
}

function setup() {
  const team = useTeam();
  useUser();
  client.config.currentTeam = team.id;
  return team;
}

describe('budget alerts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns exit code 0 for --help', async () => {
    client.setArgv('budget', 'alerts', '--help');
    const exitCode = await budget(client);
    expect(exitCode).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'budgets:alerts' },
    ]);
    const help = client.stderr.getFullOutput();
    expect(help).toContain('--since');
    expect(help).toContain('--next');
  });

  it('prints date, budget, threshold, spend, amount, and configured actions', async () => {
    const team = setup();
    const queries = useAlerts();
    client.setArgv('budget', 'alerts');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `2 budget alerts on team ${team.slug}`
    );
    expect(await exitCodePromise).toBe(0);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ scope: 'team' });
    expect(queries[0]).not.toHaveProperty('cursor');

    const out = client.stdout.getFullOutput();
    expect(out).toContain('actions configured');
    expect(out).toContain('budget amount');
    expect(out).toContain('2026-10-14 18:05 UTC');
    expect(out).toContain('75%');
    expect(out).toContain('$375.42');
    expect(out).toContain('$500');
    expect(out).toContain('notify, webhook');
    expect(out).toContain('120%');
    expect(out).not.toContain('overage');
    expect(out).toContain('$612.00');
    expect(client.stderr.getFullOutput()).not.toContain('next page');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:alerts', value: 'alerts' },
    ]);
  });

  it('emits the API alerts unchanged with --json', async () => {
    const team = setup();
    useAlerts({ data: [teamAlert] });
    client.setArgv('budget', 'alerts', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"alerts"');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      teamId: team.id,
      teamSlug: team.slug,
      alerts: [teamAlert],
      pagination: { next: null },
    });
  });

  it('accepts --format json', async () => {
    setup();
    useAlerts({ data: [teamAlert] });
    client.setArgv('budget', 'alerts', '--format', 'json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"balert_1"');
    expect(await exitCodePromise).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:alerts', value: 'alerts' },
      { key: 'option:format', value: 'json' },
    ]);
  });

  it('rejects --project until budgets supports project scope', async () => {
    setup();
    const queries = useAlerts();
    client.setArgv('budget', 'alerts', '--project', 'my-app');

    const exitCode = await budget(client);

    expect(exitCode).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('prints the next-page command with --next=<cursor> and the other flags kept', async () => {
    const team = setup();
    useAlerts({ data: [overBudgetAlert, teamAlert], nextCursor: 'cur_2' });
    client.setArgv('budget', 'alerts', '--limit', '2');

    const exitCodePromise = budget(client);

    const next = encodeBudgetAlertsCursor({ cursor: 'cur_2', teamId: team.id });
    await expect(client.stderr).toOutput(
      `Next page:\n    vercel budget alerts --limit 2 --next=${next}`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('puts the window the first page resolved in the cursor, not the next-page command', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 21, 12));
    const team = setup();
    useAlerts({ data: [teamAlert], nextCursor: 'cur_2' });
    client.setArgv('budget', 'alerts', '--since', '30 days', '--limit', '1');

    const exitCodePromise = budget(client);

    const next = encodeBudgetAlertsCursor({
      cursor: 'cur_2',
      teamId: team.id,
      since: Date.UTC(2026, 8, 21, 12),
    });
    await expect(client.stderr).toOutput(
      `Next page:\n    vercel budget alerts --limit 1 --next=${next}`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('queries the cursor window on later pages, even if --since is passed again', async () => {
    const team = setup();
    const queries = useAlerts({ data: [teamAlert], nextCursor: 'cur_3' });
    const since = Date.UTC(2026, 8, 21, 12);
    const next = encodeBudgetAlertsCursor({
      cursor: 'cur_2',
      teamId: team.id,
      since,
    });
    client.setArgv(
      'budget',
      'alerts',
      '--since',
      '1d',
      '--next',
      next,
      '--json'
    );

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"next"');
    expect(await exitCodePromise).toBe(0);
    expect(queries[0]).toMatchObject({ cursor: 'cur_2', since: String(since) });
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(decodeBudgetAlertsCursor(out.pagination.next)).toEqual({
      valid: true,
      value: { cursor: 'cur_3', teamId: team.id, since, until: undefined },
    });
  });

  it('keeps global flags in the next-page command', async () => {
    const team = setup();
    useAlerts({ data: [teamAlert], nextCursor: 'cur_2' });
    client.setArgv(
      '--api',
      'https://api.example.test',
      '--cwd',
      '/tmp/app',
      'budget',
      'alerts'
    );

    const exitCodePromise = budget(client);

    const next = encodeBudgetAlertsCursor({ cursor: 'cur_2', teamId: team.id });
    await expect(client.stderr).toOutput(
      `Next page:\n    vercel --api https://api.example.test --cwd /tmp/app budget alerts --next=${next}`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('rejects a cursor from another team as a usage error', async () => {
    setup();
    const queries = useAlerts();
    const next = encodeBudgetAlertsCursor({
      cursor: 'cur_2',
      teamId: 'team_other',
    });
    client.setArgv('budget', 'alerts', '--next', next);

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('from another team');
    expect(await exitCodePromise).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('rejects a --next value the CLI did not print as a usage error', async () => {
    setup();
    const queries = useAlerts();
    client.setArgv('budget', 'alerts', '--next', 'bogus');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(INVALID_NEXT_MESSAGE);
    expect(await exitCodePromise).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('sends the API cursor from --next and reports the next cursor in --json', async () => {
    const team = setup();
    const queries = useAlerts({ data: [teamAlert], nextCursor: 'cur_3' });
    const next = encodeBudgetAlertsCursor({ cursor: 'cur_2', teamId: team.id });
    client.setArgv('budget', 'alerts', '--next', next, '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput(
      `"next": "${encodeBudgetAlertsCursor({ cursor: 'cur_3', teamId: team.id })}"`
    );
    expect(await exitCodePromise).toBe(0);
    expect(queries[0]).toMatchObject({ cursor: 'cur_2' });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:alerts', value: 'alerts' },
      { key: 'option:next', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('sends --since and --until as epoch milliseconds', async () => {
    setup();
    const queries = useAlerts({ data: [] });
    client.setArgv(
      'budget',
      'alerts',
      '--since',
      '2026-10-01T00:00:00Z',
      '--until',
      '2026-10-15T00:00:00Z'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('No budget alerts found');
    expect(await exitCodePromise).toBe(0);
    expect(queries[0]).toMatchObject({
      since: String(Date.UTC(2026, 9, 1)),
      until: String(Date.UTC(2026, 9, 15)),
    });
  });

  it('rejects --since after --until', async () => {
    setup();
    const queries = useAlerts();
    client.setArgv(
      'budget',
      'alerts',
      '--since',
      '2026-10-15T00:00:00Z',
      '--until',
      '2026-10-01T00:00:00Z'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('must be earlier than');
    expect(await exitCodePromise).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('clamps --limit above 100 with a warning', async () => {
    setup();
    const queries = useAlerts({ data: [teamAlert] });
    client.setArgv('budget', 'alerts', '--limit', '500');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      '--limit 500 is above the maximum of 100. Using 100.'
    );
    expect(await exitCodePromise).toBe(0);
    expect(queries[0]).toMatchObject({ limit: '100' });
  });

  it('reports a clamped --limit in the --json warnings', async () => {
    setup();
    useAlerts({ data: [teamAlert] });
    client.setArgv('budget', 'alerts', '--limit', '500', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"warnings"');
    expect(await exitCodePromise).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput()).warnings).toEqual([
      {
        reason: 'limit_clamped',
        message: '--limit 500 is above the maximum of 100. Using 100.',
      },
    ]);
  });

  it('reports a bad --limit as a JSON usage error with --json', async () => {
    setup();
    const queries = useAlerts();
    client.setArgv('budget', 'alerts', '--limit', '0', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('INVALID_LIMIT');
    expect(await exitCodePromise).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('rejects a malformed --since as a usage error', async () => {
    setup();
    const queries = useAlerts();
    client.setArgv('budget', 'alerts', '--since', 'yesterday-ish');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Invalid time format');
    expect(await exitCodePromise).toBe(2);
    expect(queries).toHaveLength(0);
  });

  it('says when there are no alerts', async () => {
    const team = setup();
    useAlerts({ data: [] });
    client.setArgv('budget', 'alerts');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `No budget alerts found on team ${team.slug}.`
    );
    expect(await exitCodePromise).toBe(0);
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('says there are no more alerts on an empty later page', async () => {
    const team = setup();
    useAlerts({ data: [] });
    client.setArgv(
      'budget',
      'alerts',
      '--next',
      encodeBudgetAlertsCursor({ cursor: 'cursor_1', teamId: team.id })
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(
      `No more budget alerts on team ${team.slug}.`
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('emits an empty alerts array with --json', async () => {
    setup();
    useAlerts({ data: [] });
    client.setArgv('budget', 'alerts', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"alerts": []');
    expect(await exitCodePromise).toBe(0);
  });

  it('treats a cursor the API rejects as a usage error', async () => {
    const team = setup();
    client.scenario.get('/v1/budgets/alerts', (_req, res) => {
      res.status(400).json({
        error: { code: 'invalid_cursor', message: 'Invalid cursor.' },
      });
    });
    client.setArgv(
      'budget',
      'alerts',
      '--next',
      encodeBudgetAlertsCursor({ cursor: 'cur_gone', teamId: team.id })
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput(INVALID_NEXT_MESSAGE);
    expect(await exitCodePromise).toBe(2);
  });

  it('prints the API error when the list fails', async () => {
    setup();
    client.scenario.get('/v1/budgets/alerts', (_req, res) => {
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Not allowed' } });
    });
    client.setArgv('budget', 'alerts');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Not allowed');
    expect(await exitCodePromise).toBe(1);
  });

  it('reports an API error as a JSON error with --json', async () => {
    setup();
    client.scenario.get('/v1/budgets/alerts', (_req, res) => {
      res
        .status(403)
        .json({ error: { code: 'forbidden', message: 'Not allowed' } });
    });
    client.setArgv('budget', 'alerts', '--json');

    const exitCodePromise = budget(client);

    await expect(client.stdout).toOutput('"code": "forbidden"');
    expect(await exitCodePromise).toBe(1);
  });

  it('errors when no team is selected', async () => {
    useUser();
    client.config.currentTeam = undefined;
    client.setArgv('budget', 'alerts');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('--scope');
    expect(await exitCodePromise).toBe(2);
  });

  it.each(['list', 'ls'])('accepts %s as the default action', async action => {
    setup();
    const queries = useAlerts({ data: [] });
    client.setArgv(
      'budget',
      'alerts',
      action,
      '--since',
      '2026-10-01T00:00:00Z'
    );

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('No budget alerts found');
    expect(await exitCodePromise).toBe(0);
    expect(queries[0]).toMatchObject({ since: String(Date.UTC(2026, 9, 1)) });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:alerts', value: 'alerts' },
      { key: 'subcommand:list', value: action },
      { key: 'option:since', value: '[REDACTED]' },
    ]);
  });

  it('rejects positional arguments after list', async () => {
    setup();
    client.setArgv('budget', 'alerts', 'list', 'my-app');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "my-app"');
    expect(await exitCodePromise).toBe(2);
  });

  it('rejects positional arguments', async () => {
    setup();
    client.setArgv('budget', 'alerts', 'my-app');

    const exitCodePromise = budget(client);

    await expect(client.stderr).toOutput('Unexpected argument "my-app"');
    expect(await exitCodePromise).toBe(2);
  });
});
