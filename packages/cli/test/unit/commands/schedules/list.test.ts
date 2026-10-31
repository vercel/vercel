import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createSchedule,
  useSchedules,
  useSchedulesError,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('schedules list', () => {
  beforeEach(() => {
    process.env.VERCEL_SCHEDULE_BASE_URL = client.apiUrl;
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'schedules-test-project',
      name: 'schedules-test',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/schedules');
  });

  afterEach(() => {
    delete process.env.VERCEL_SCHEDULE_BASE_URL;
    vi.restoreAllMocks();
  });

  it('lists schedules from the default namespace', async () => {
    let query: Record<string, unknown> | undefined;
    useSchedules(
      [
        createSchedule(),
        createSchedule({
          scheduleId: 'sch_reminder',
          name: 'send-reminder',
          state: 'inactive',
          expression: { type: 'single', at: '2026-09-17T10:00:00' },
          target: { type: 'function', function: 'api/send-reminder.ts' },
        }),
      ],
      null,
      requestQuery => (query = requestQuery)
    );

    client.setArgv('schedules', 'list');
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      namespace: 'default',
      limit: '20',
      projectId: 'schedules-test-project',
      teamId: 'team_dummy',
    });
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Schedules in namespace default');
    expect(output).toContain('Name');
    expect(output).toContain('daily-cleanup');
    expect(output).toContain('send-reminder');
    expect(output).toContain('Inactive');
    expect(output).toContain('2026-09-17T10:00:00');
    expect(output).toContain('Function: api/send-reminder.ts');
    expect(output).not.toContain('Track');
    expect(output).not.toContain('Production');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('renders path targets', async () => {
    useSchedules([
      createSchedule({
        name: 'legacy-cleanup',
        target: { type: 'path', path: '/api/cron?task=cleanup' },
        source: 'static',
      }),
    ]);

    client.setArgv('schedules', 'list');
    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Path: /api/cron?task=cleanup'
    );
  });

  it('uses an explicit namespace, limit, and cursor', async () => {
    let query: Record<string, unknown> | undefined;
    useSchedules(
      [createSchedule({ namespace: 'jobs' })],
      null,
      requestQuery => (query = requestQuery)
    );

    client.setArgv(
      'schedules',
      'list',
      '--namespace',
      'jobs',
      '--limit',
      '5',
      '--next',
      'cursor_123'
    );
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      namespace: 'jobs',
      limit: '5',
      cursor: 'cursor_123',
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'list' },
      { key: 'option:namespace', value: '[REDACTED]' },
      { key: 'option:limit', value: '5' },
      { key: 'option:next', value: '[REDACTED]' },
    ]);
  });

  it('prints a safe next-page command', async () => {
    useSchedules([createSchedule({ namespace: 'jobs' })], "cursor'$(unsafe)");
    client.setArgv('schedules', 'list', '--namespace', 'jobs', '--limit', '5');

    await expect(schedules(client)).resolves.toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      'Next page:\n    vercel schedules list --namespace jobs --limit 5 --next'
    );
    expect(output).not.toContain('More schedules are available.');
    expect(output).toContain("'cursor'\\''$(unsafe)'");
  });

  it('keeps the Track selector in the next-page command', async () => {
    useSchedules([createSchedule()], 'cursor_2');
    client.setArgv('schedules', 'list', '--git-branch', 'feature/x');

    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'vercel schedules list --git-branch feature/x --next cursor_2'
    );
  });

  it('prints a neutral empty state', async () => {
    useSchedules([]);
    client.setArgv('schedules', 'list');

    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No schedules found in namespace default.'
    );
  });

  it('writes the sanitized response to stdout as JSON', async () => {
    const response = useSchedules([createSchedule()], 'cursor_123');
    client.setArgv('schedules', 'list', '--format', 'json');

    await expect(schedules(client)).resolves.toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    // `pagination.next` is added beside the existing `cursor`.
    expect(json).toEqual({ ...response, pagination: { next: 'cursor_123' } });
    expect(json.data[0]).not.toHaveProperty('trackId');
    expect(client.stderr.getFullOutput()).not.toContain('Fetching schedules');
  });

  it('writes an empty JSON response with exit code 0', async () => {
    useSchedules([]);
    client.setArgv('schedules', 'list', '--json');

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      data: [],
      cursor: null,
      pagination: { next: null },
    });
    expect(client.stdout.getFullOutput()).not.toContain('\u001b[');
  });

  it('writes a bounded success payload in non-interactive mode', async () => {
    useSchedules([createSchedule()], 'cursor_123');
    client.nonInteractive = true;
    client.setArgv('schedules', 'list');

    await expect(schedules(client)).resolves.toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toMatchObject({
      status: 'ok',
      message: 'Found 1 schedule in namespace default.',
      data: [createSchedule()],
      cursor: 'cursor_123',
    });
    expect(json.data[0]).not.toHaveProperty('trackId');
    expect(client.stderr.getFullOutput()).not.toContain('Fetching schedules');
  });

  it.each([
    [['--git-branch', 'feature'], { branch: 'feature' }],
    [['--environment', 'staging'], { env: 'staging' }],
    [['-e', 'production'], { env: 'production' }],
  ])('selects the Track with %j', async (flags, selector) => {
    let query: Record<string, unknown> | undefined;
    useSchedules([createSchedule()], null, requestQuery => {
      query = requestQuery;
    });

    client.setArgv('schedules', 'list', ...flags);
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      ...selector,
      projectId: 'schedules-test-project',
    });
    expect(query).not.toHaveProperty('branch' in selector ? 'env' : 'branch');
  });

  it('sends no Track selector by default', async () => {
    let query: Record<string, unknown> | undefined;
    useSchedules([createSchedule()], null, requestQuery => {
      query = requestQuery;
    });

    client.setArgv('schedules', 'list');
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).not.toHaveProperty('env');
    expect(query).not.toHaveProperty('branch');
  });

  it('rejects conflicting Track selectors before requesting schedules', async () => {
    client.setArgv(
      'schedules',
      'list',
      '--environment',
      'staging',
      '--git-branch',
      'feature'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Use either --environment or --git-branch, not both.'
    );

    client.setArgv('schedules', 'list', '--local', '--git-branch', 'feature');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot combine --local with --git-branch.'
    );
  });

  it('rejects arguments and invalid options before requesting schedules', async () => {
    client.setArgv('schedules', 'list', 'unexpected');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Expected no arguments.');

    client.setArgv('schedules', 'list', '--namespace', '../jobs');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Namespace must start with a letter or number and can contain only letters, numbers, periods, underscores, and hyphens.'
    );

    client.setArgv('schedules', 'list', '--limit', '101');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--limit` must be an integer between 1 and 100.'
    );
  });

  it('reports when Schedules is not enabled for the team', async () => {
    useSchedulesError(403, 'not_enabled', 'Not Enabled for this team.');
    client.setArgv('schedules', 'list');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Vercel Schedules is not enabled for this team.'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Contact Vercel Support to request access.'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      "Can't access Schedules"
    );
  });

  it('reports VSS service errors without exposing raw responses', async () => {
    useSchedulesError(500, 'internal_error', 'Internal server error');
    client.setArgv('schedules', 'list');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'The Schedules API is temporarily unavailable. Try again later.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('internal_error');
  });
  it('warns once for the hidden -N, though the router parses first', async () => {
    useSchedules([createSchedule()]);
    client.setArgv('schedules', 'list', '-N', 'cursor_123');

    await expect(schedules(client)).resolves.toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr.split('-N is deprecated').length - 1).toBe(1);
  });
});
