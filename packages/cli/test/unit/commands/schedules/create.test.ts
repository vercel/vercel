import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import schedules from '../../../../src/commands/schedules';
import { isWindows } from '../../../helpers/is-windows';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createSchedule,
  useCreateSchedule,
  useScheduleMutationError,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const scheduleApiErrors = [
  {
    status: 409,
    code: 'schedule_already_exists',
    apiMessage:
      'Schedule already exists for projectId=prj_secret, trackId=production, namespace=default, name=daily-cleanup',
    cliMessage:
      'Schedule default/daily-cleanup already exists. Choose a different name or update the existing schedule.',
    reason: 'schedule_already_exists',
    retryable: false,
  },
  {
    status: 400,
    code: 'invalid_cron_expression',
    apiMessage: 'Invalid cron expression: expected 5 fields',
    cliMessage:
      'Invalid cron expression: expected 5 fields. Check `--cron` and try again.',
    reason: 'invalid_cron_expression',
    retryable: false,
  },
  {
    status: 400,
    code: 'invalid_jitter',
    apiMessage: 'Hobby plans require a jitter of 15 minutes or omit the field',
    cliMessage: 'Hobby plans require a jitter of 15 minutes or omit the field.',
    reason: 'invalid_jitter',
    retryable: false,
  },
  {
    status: 400,
    code: 'jitter_exceeds_cadence',
    apiMessage:
      'Schedule jitter (15 minutes) exceeds the cron cadence (10 minutes)',
    cliMessage:
      'Schedule jitter (15 minutes) exceeds the cron cadence (10 minutes). Increase the interval between runs.',
    reason: 'jitter_exceeds_cadence',
    retryable: false,
  },
  {
    status: 400,
    code: 'single_at_too_soon',
    apiMessage:
      'Single schedule time must be at least 15 seconds after the current time',
    cliMessage:
      'Single schedule time must be at least 15 seconds after the current time. Choose a later value for `--at`.',
    reason: 'single_at_too_soon',
    retryable: false,
  },
  {
    status: 400,
    code: 'payload_too_large',
    apiMessage:
      'Schedule payload exceeds maximum size of 65536 bytes (got 70000)',
    cliMessage:
      'Schedule payload exceeds maximum size of 65536 bytes (got 70000). Reduce the value passed to `--payload` and try again.',
    reason: 'payload_too_large',
    retryable: false,
  },
  {
    status: 500,
    code: 'payload_store_failed',
    apiMessage: 'Internal payload bucket failure',
    cliMessage: 'Failed to store the schedule payload. Try again later.',
    reason: 'payload_store_failed',
    retryable: true,
  },
  {
    // Any other 400 is still an API failure, so it exits 1 like the rest.
    status: 400,
    code: 'bad_request',
    apiMessage: 'Topic is not allowed',
    cliMessage: 'The Schedules API rejected the request. Topic is not allowed.',
    reason: 'invalid_arguments',
    retryable: false,
  },
] as const;

const errorGlyph = isWindows ? 'x' : '✗';

describe('schedules create', () => {
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

  it('creates a recurring schedule in the default namespace', async () => {
    let request;
    useCreateSchedule(createSchedule(), value => (request = value));
    client.setArgv(
      'schedules',
      'create',
      'daily-cleanup',
      '--cron',
      '0 2 * * *',
      '--topic',
      'scheduled-cleanup'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      query: { projectId: 'schedules-test-project', teamId: 'team_dummy' },
      body: {
        name: 'daily-cleanup',
        namespace: 'default',
        expression: { type: 'cron', cron: '0 2 * * *' },
        target: { type: 'queue', topic: 'scheduled-cleanup' },
      },
    });
    expect(client.stderr.getFullOutput()).toContain(
      'Created schedule default/daily-cleanup.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('production');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:create', value: 'create' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:cron', value: '[REDACTED]' },
      { key: 'option:topic', value: '[REDACTED]' },
    ]);
  });

  it('forwards all SDK create inputs and returns sanitized JSON', async () => {
    let request;
    const response = createSchedule({
      name: 'reminder',
      namespace: 'jobs',
      expression: { type: 'single', at: '2026-10-01T09:00:00' },
      timezone: 'America/New_York',
      jitter: 10,
      target: { type: 'queue', topic: 'reminders' },
    });
    useCreateSchedule(response, value => (request = value));
    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--namespace',
      'jobs',
      '--at',
      '2026-10-01T09:00',
      '--timezone',
      'America/New_York',
      '--jitter',
      '10',
      '--topic',
      'reminders',
      '--payload',
      '{"userId":123}',
      '--json'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      body: {
        name: 'reminder',
        namespace: 'jobs',
        expression: { type: 'single', at: '2026-10-01T09:00:00' },
        timezone: 'America/New_York',
        jitter: 10,
        target: { type: 'queue', topic: 'reminders' },
        payload: { userId: 123 },
      },
    });
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(response);
    expect(client.stdout.getFullOutput()).not.toContain('trackId');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:create', value: 'create' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:namespace', value: '[REDACTED]' },
      { key: 'option:at', value: '[REDACTED]' },
      { key: 'option:timezone', value: 'America/New_York' },
      { key: 'option:jitter', value: '10' },
      { key: 'option:topic', value: '[REDACTED]' },
      { key: 'option:payload', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('keeps :00 seconds on --at when requesting', async () => {
    let request;
    useCreateSchedule(
      createSchedule({
        expression: { type: 'single', at: '2026-10-01T09:00:00' },
      }),
      value => (request = value)
    );
    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--at',
      '2026-10-01T09:00:00',
      '--topic',
      'reminders'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      body: {
        expression: { type: 'single', at: '2026-10-01T09:00:00' },
      },
    });
  });

  it('validates required and mutually exclusive inputs before requesting', async () => {
    client.setArgv('schedules', 'create');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A schedule name is required'
    );

    client.setArgv('schedules', 'create', 'cleanup', '--topic', 'jobs');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A schedule expression is required.'
    );

    client.setArgv('schedules', 'create', 'cleanup', '--cron', '* * * * *');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A target queue topic is required.'
    );

    client.setArgv(
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--at',
      '2026-10-01T09:00:00Z',
      '--topic',
      'jobs'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Use either `--cron` or `--at`, not both.'
    );
  });

  it('validates jitter and payload', async () => {
    client.setArgv(
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--topic',
      'jobs',
      '--jitter',
      '16'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--jitter` must be an integer between 1 and 15.'
    );

    client.setArgv(
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--topic',
      'jobs',
      '--payload',
      '{bad}'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--payload` must be valid JSON.'
    );
  });

  it.each([
    ['invalid characters', 'jobs/cleanup'],
    ['more than 256 characters', 'a'.repeat(257)],
  ])('rejects queue topics with %s before requesting', async (_, topic) => {
    client.setArgv(
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--topic',
      topic
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--topic` must be 1–256 characters and contain only letters, numbers, underscores, and hyphens.'
    );
  });

  it('writes queue topic validation errors for agents', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv(
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--topic',
      'jobs/cleanup'
    );

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message:
        '`--topic` must be 1–256 characters and contain only letters, numbers, underscores, and hyphens.',
    });
    expect(client.stderr.getFullOutput()).not.toContain('jobs/cleanup');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('requires a valid timezone-less local datetime for one-time schedules', async () => {
    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--at',
      '2026-10-01T09:00:00Z',
      '--topic',
      'reminders'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--at` must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:00 without a timezone suffix.'
    );

    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--at',
      '2026-02-30T09:00:00',
      '--topic',
      'reminders'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--at` must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:00 without a timezone suffix.'
    );

    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--at',
      '2026-10-01T09:00:15',
      '--topic',
      'reminders'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--at` must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:00 without a timezone suffix.'
    );
  });

  it('requires a valid IANA timezone', async () => {
    client.setArgv(
      'schedules',
      'create',
      'reminder',
      '--cron',
      '0 9 * * *',
      '--timezone',
      'Invalid/Zone',
      '--topic',
      'reminders'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--timezone` must be a valid IANA timezone.'
    );
  });

  it('returns a bounded success payload in non-interactive mode', async () => {
    useCreateSchedule();
    client.nonInteractive = true;
    client.setArgv(
      'schedules',
      'create',
      'daily-cleanup',
      '--cron',
      '0 2 * * *',
      '--topic',
      'scheduled-cleanup'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: 'Created schedule default/daily-cleanup.',
      schedule: createSchedule(),
    });
  });

  it('shows the schedules feature-gate error', async () => {
    useScheduleMutationError(
      'create',
      'daily-cleanup',
      403,
      'not_enabled',
      'Not Enabled for this team.'
    );
    client.setArgv(
      'schedules',
      'create',
      'daily-cleanup',
      '--cron',
      '0 2 * * *',
      '--topic',
      'scheduled-cleanup'
    );

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Vercel Schedules is not enabled for this team.'
    );
  });

  it.each(scheduleApiErrors)('renders the $code API error for humans', async ({
    status,
    code,
    apiMessage,
    cliMessage,
  }) => {
    useScheduleMutationError(
      'create',
      'daily-cleanup',
      status,
      code,
      apiMessage
    );
    client.setArgv(
      'schedules',
      'create',
      'daily-cleanup',
      '--cron',
      '0 2 * * *',
      '--topic',
      'scheduled-cleanup'
    );

    await expect(schedules(client)).resolves.toBe(1);
    const errorOutput = stripAnsi(client.stderr.getFullOutput());
    expect(errorOutput).toContain(`${errorGlyph} ${cliMessage}`);
    expect(errorOutput).not.toContain('Error:');
    if (code === 'schedule_already_exists') {
      expect(errorOutput).not.toContain('prj_secret');
    }
  });

  it.each(scheduleApiErrors)('writes the $code API error for agents', async ({
    status,
    code,
    apiMessage,
    cliMessage,
    reason,
    retryable,
  }) => {
    useScheduleMutationError(
      'create',
      'daily-cleanup',
      status,
      code,
      apiMessage
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv(
      'schedules',
      'create',
      'daily-cleanup',
      '--cron',
      '0 2 * * *',
      '--topic',
      'scheduled-cleanup'
    );

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason,
      message: cliMessage,
      retryable,
    });
    expect(client.stderr.getFullOutput()).not.toContain(cliMessage);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
