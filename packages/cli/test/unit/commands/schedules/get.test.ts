import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { isWindows } from '../../../helpers/is-windows';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createSchedule,
  useSchedule,
  useScheduleError,
  useScheduleNotFound,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const scheduleServiceErrors = [
  {
    status: 503,
    code: 'service_unavailable',
    apiMessage: 'Schedule executions are temporarily unavailable.',
    cliMessage:
      'Schedule execution history is temporarily unavailable. Try again later.',
    reason: 'service_unavailable',
    retryable: true,
  },
  {
    status: 400,
    code: 'service_error',
    apiMessage:
      'Could not load schedule executions. Try again or choose a shorter time range.',
    cliMessage:
      'Failed to load schedule execution history. Choose a shorter time range and try again.',
    reason: 'service_error',
    retryable: false,
  },
  {
    status: 500,
    code: 'service_error',
    apiMessage:
      'Could not load schedule executions. Try again or choose a shorter time range.',
    cliMessage: 'Failed to load schedule execution history. Try again later.',
    reason: 'service_error',
    retryable: true,
  },
] as const;

describe('schedules get', () => {
  const errorGlyph = isWindows ? 'x' : '✗';

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

  it('requires exactly one schedule name', async () => {
    client.setArgv('schedules', 'get');
    await expect(schedules(client)).resolves.toBe(2);
    await expect(client.stderr).toOutput(
      `${errorGlyph} A schedule name is required`
    );
    expect(client.stderr.getFullOutput()).not.toContain('Usage:');

    client.setArgv('schedules', 'get', 'one', 'two');
    await expect(schedules(client)).resolves.toBe(2);
    await expect(client.stderr).toOutput('Expected one schedule name');
  });

  it('rejects invalid names and namespaces before requesting a schedule', async () => {
    client.setArgv('schedules', 'get', '../daily');
    await expect(schedules(client)).resolves.toBe(2);
    await expect(client.stderr).toOutput(
      'Schedule name must start with a letter or number and can contain only letters, numbers, periods, underscores, and hyphens.'
    );

    client.setArgv(
      'schedules',
      'get',
      'daily-cleanup',
      '--namespace',
      'jobs?all=true'
    );
    await expect(schedules(client)).resolves.toBe(2);
    await expect(client.stderr).toOutput(
      'Namespace must start with a letter or number and can contain only letters, numbers, periods, underscores, and hyphens.'
    );

    client.setArgv('schedules', 'get', '.daily');
    await expect(schedules(client)).resolves.toBe(2);
    await expect(client.stderr).toOutput(
      'Schedule name must start with a letter or number'
    );
  });

  it('gets and renders a schedule from the default namespace', async () => {
    let query: Record<string, unknown> | undefined;
    const schedule = useSchedule('daily-cleanup', {}, requestQuery => {
      query = requestQuery;
    });

    client.setArgv('schedules', 'get', 'daily-cleanup');
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      namespace: 'default',
      projectId: 'schedules-test-project',
      teamId: 'team_dummy',
    });
    const output = client.stderr.getFullOutput();
    expect(output).toContain(schedule.name);
    expect(output).toContain(schedule.scheduleId);
    expect(output).not.toContain('Track');
    expect(output).not.toContain('Production');
    expect(output).toContain('0 2 * * *');
    expect(output).toContain('scheduled-cleanup');
  });

  it('uses an explicit namespace', async () => {
    let namespace: unknown;
    useSchedule(
      'daily-cleanup',
      { namespace: 'jobs' },
      query => (namespace = query.namespace)
    );

    client.setArgv('schedules', 'get', 'daily-cleanup', '--namespace', 'jobs');
    await expect(schedules(client)).resolves.toBe(0);
    expect(namespace).toBe('jobs');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'get' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:namespace', value: '[REDACTED]' },
    ]);
  });

  it('runs as inspect without a deprecation warning', async () => {
    const schedule = useSchedule('daily-cleanup');

    client.setArgv('schedules', 'inspect', 'daily-cleanup');
    await expect(schedules(client)).resolves.toBe(0);

    const output = client.stderr.getFullOutput();
    expect(output).toContain(schedule.scheduleId);
    expect(output).not.toContain('is deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'argument:name', value: '[REDACTED]' },
    ]);
  });

  it('warns when invoked as the deprecated get name', async () => {
    useSchedule('daily-cleanup');

    client.setArgv('schedules', 'get', 'daily-cleanup');
    await expect(schedules(client)).resolves.toBe(0);

    expect(client.stderr.getFullOutput()).toContain(
      '`vercel schedules get` is deprecated. Use `vercel schedules inspect`.'
    );
  });

  it('renders one-time function schedules', async () => {
    useSchedule('send-reminder', {
      expression: { type: 'single', at: '2026-09-17T10:00:00' },
      target: { type: 'function', function: 'api/send-reminder.ts' },
      jitter: undefined,
      state: 'active',
      source: 'static',
    });

    client.setArgv('schedules', 'get', 'send-reminder');
    await expect(schedules(client)).resolves.toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('2026-09-17T10:00:00');
    expect(output).toContain('api/send-reminder.ts');
    expect(output).toContain('(Function)');
    expect(output).toContain('Active');
    expect(output).not.toContain('Jitter');
  });

  it('renders path targets', async () => {
    useSchedule('legacy-cleanup', {
      target: { type: 'path', path: '/api/cron' },
      source: 'static',
    });

    client.setArgv('schedules', 'get', 'legacy-cleanup');
    await expect(schedules(client)).resolves.toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('/api/cron');
    expect(output).toContain('(Path)');
    expect(output).toContain('Static');
  });

  it('writes the raw schedule to stdout as JSON', async () => {
    const schedule = useSchedule();
    client.setArgv('schedules', 'get', 'daily-cleanup', '--format', 'json');

    await expect(schedules(client)).resolves.toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual(schedule);
    expect(json).not.toHaveProperty('trackId');
  });

  it('writes a stable success payload in non-interactive mode', async () => {
    useSchedule();
    client.nonInteractive = true;
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: 'Schedule default/daily-cleanup found.',
      schedule: createSchedule(),
    });
    expect(
      JSON.parse(client.stdout.getFullOutput()).schedule
    ).not.toHaveProperty('trackId');
  });

  it('reports a missing schedule', async () => {
    useScheduleNotFound('missing');
    client.setArgv('schedules', 'get', 'missing');

    await expect(schedules(client)).resolves.toBe(1);
    await expect(client.stderr).toOutput(
      'Schedule not found: default/missing.'
    );
  });

  it('reports when Schedules is not enabled for the team', async () => {
    useScheduleError(
      'daily-cleanup',
      403,
      'not_enabled',
      'Not Enabled for this team.'
    );
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(1);
    await expect(client.stderr).toOutput(
      'Vercel Schedules is not enabled for this team.'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Contact Vercel Support to request access.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('Schedule not found');
    expect(client.stderr.getFullOutput()).not.toContain(
      "Can't access Schedules"
    );
  });

  it('reports when the linked project is unavailable to the team', async () => {
    useScheduleError('daily-cleanup', 404, 'not_found', 'Project not found');
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(1);
    await expect(client.stderr).toOutput(
      "The linked project isn't available to this team. Run `vercel link` to update the project link."
    );
  });

  it.each([
    {
      status: 400,
      code: 'bad_request',
      apiMessage: 'The project scope is invalid',
      cliMessage:
        'The Schedules API rejected the request. The project scope is invalid.',
    },
    {
      status: 401,
      code: 'missing_team_param',
      apiMessage: 'You must supply a teamId query parameter',
      cliMessage:
        'Schedules requires a team project. Run `vercel link` to link a project owned by a team.',
    },
    {
      status: 401,
      code: 'unauthorized',
      apiMessage: 'Unauthorized',
      cliMessage:
        'Schedules API authentication failed. Run `vercel login` and try again.',
    },
    {
      status: 402,
      code: 'payment_required',
      apiMessage: 'A plan upgrade is required',
      cliMessage:
        "Schedules isn't available for this team. A plan upgrade is required. Ask a team owner to review the requirement.",
    },
    {
      status: 403,
      code: 'forbidden',
      apiMessage: 'Forbidden',
      cliMessage:
        "Can't access Schedules with the current credentials and team. Check the token and selected team. If both are correct, ask a team owner for access.",
    },
    {
      status: 429,
      code: 'rate_limited',
      apiMessage: 'Too many requests',
      cliMessage:
        'The Schedules API request limit was reached. Wait and try again.',
    },
    {
      status: 500,
      code: 'internal_error',
      apiMessage: 'Internal server error',
      cliMessage:
        'The Schedules API is temporarily unavailable. Try again later.',
    },
  ])('renders a useful $status API error', async ({
    status,
    code,
    apiMessage,
    cliMessage,
  }) => {
    useScheduleError('daily-cleanup', status, code, apiMessage);
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(1);
    await expect(client.stderr).toOutput(cliMessage);
  });

  it('writes a stable feature-gate error in non-interactive mode', async () => {
    useScheduleError(
      'daily-cleanup',
      403,
      'not_enabled',
      'Not Enabled for this team.'
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'schedules_not_enabled',
      message: 'Vercel Schedules is not enabled for this team.',
      retryable: false,
      userActionRequired: true,
    });
    expect(client.stderr.getFullOutput()).not.toContain('Schedules');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each(
    scheduleServiceErrors
  )('renders the $code API error for humans', async error => {
    useScheduleError(
      'daily-cleanup',
      error.status,
      error.code,
      error.apiMessage
    );
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(error.cliMessage);
    expect(client.stderr.getFullOutput()).not.toContain(error.apiMessage);
  });

  it.each(
    scheduleServiceErrors
  )('writes the $code API error for agents', async error => {
    useScheduleError(
      'daily-cleanup',
      error.status,
      error.code,
      error.apiMessage
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'get', 'daily-cleanup');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: error.reason,
      message: error.cliMessage,
      retryable: error.retryable,
    });
    expect(client.stderr.getFullOutput()).not.toContain(error.cliMessage);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
