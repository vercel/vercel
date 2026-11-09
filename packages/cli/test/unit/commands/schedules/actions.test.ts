import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createSchedule,
  useScheduleAction,
  useScheduleMutationError,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('schedules actions', () => {
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

  it.each([
    ['enable', 'active', 'Enabled'],
    ['disable', 'inactive', 'Disabled'],
  ] as const)('%ss a schedule and returns the sanitized resource', async (action, state, pastTense) => {
    let request;
    const response = createSchedule({ state });
    useScheduleAction(action, 'daily-cleanup', response, value => {
      request = value;
    });
    client.setArgv(
      'schedules',
      action,
      'daily-cleanup',
      '--namespace',
      'jobs',
      '--json'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      query: {
        namespace: 'jobs',
        projectId: 'schedules-test-project',
        teamId: 'team_dummy',
      },
    });
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(response);
    expect(client.stdout.getFullOutput()).not.toContain('trackId');
    expect(client.stderr.getFullOutput()).not.toContain(pastTense);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: `subcommand:${action}`, value: action },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:namespace', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('invokes a schedule and reports acceptance', async () => {
    let request;
    useScheduleAction('invoke', 'daily-cleanup', undefined, value => {
      request = value;
    });
    client.setArgv('schedules', 'invoke', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      query: {
        namespace: 'default',
        projectId: 'schedules-test-project',
        teamId: 'team_dummy',
      },
    });
    expect(client.stderr.getFullOutput()).toContain(
      'Invoked schedule default/daily-cleanup.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:invoke', value: 'invoke' },
      { key: 'argument:name', value: '[REDACTED]' },
    ]);
  });

  it('sends the selected Track with an action', async () => {
    let request;
    useScheduleAction('enable', 'daily-cleanup', createSchedule(), value => {
      request = value;
    });
    client.setArgv(
      'schedules',
      'enable',
      'daily-cleanup',
      '--git-branch',
      'feature'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      query: {
        branch: 'feature',
        namespace: 'default',
        projectId: 'schedules-test-project',
      },
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:enable', value: 'enable' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:git-branch', value: '[REDACTED]' },
    ]);
  });

  it('reports state changes in human output', async () => {
    useScheduleAction('enable', 'daily-cleanup');
    client.setArgv('schedules', 'enable', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Enabled schedule default/daily-cleanup.'
    );
  });

  it('writes structured invoke output in non-interactive mode', async () => {
    useScheduleAction('invoke', 'daily-cleanup');
    client.nonInteractive = true;
    client.setArgv('schedules', 'invoke', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      message: 'Invoked schedule default/daily-cleanup.',
    });
  });

  it('does not retry an invoke when the response is lost', async () => {
    let attempts = 0;
    client.scenario.post('/v1/schedules/daily-cleanup/invoke', (_req, res) => {
      attempts += 1;
      res.destroy();
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'invoke', 'daily-cleanup');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(attempts).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'api_error',
      message:
        'The schedule invocation may have been accepted, but the CLI did not receive confirmation. Check whether the schedule ran before invoking it again.',
      retryable: false,
      userActionRequired: true,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('validates schedule identifiers before acting', async () => {
    client.setArgv('schedules', 'enable');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A schedule name is required'
    );

    client.setArgv('schedules', 'disable', 'one', 'two');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Expected one schedule name.'
    );

    client.setArgv('schedules', 'invoke', '../cleanup');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Schedule name must start with a letter or number and can contain only letters, numbers, periods, underscores, and hyphens.'
    );
  });

  it('maps action errors through the shared handler', async () => {
    useScheduleMutationError(
      'invoke',
      'missing',
      404,
      'not_found',
      'Schedule not found'
    );
    client.setArgv('schedules', 'invoke', 'missing');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Schedule not found: default/missing.'
    );
  });

  it('explains that one-time schedules past their time cannot be modified', async () => {
    useScheduleMutationError(
      'enable',
      'one-time-reminder',
      409,
      'schedule_single_at_passed',
      'Single-fire schedule has passed its fire time and cannot be modified'
    );
    client.setArgv('schedules', 'enable', 'one-time-reminder');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Schedule default/one-time-reminder has passed its scheduled time and can't be modified. Delete it or create a new schedule."
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Single-fire schedule has passed its fire time and cannot be modified'
    );
  });

  it('writes passed one-time schedule errors for agents', async () => {
    useScheduleMutationError(
      'enable',
      'one-time-reminder',
      409,
      'schedule_single_at_passed',
      'Single-fire schedule has passed its fire time and cannot be modified'
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'enable', 'one-time-reminder');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'schedule_single_at_passed',
      message:
        "Schedule default/one-time-reminder has passed its scheduled time and can't be modified. Delete it or create a new schedule.",
      retryable: false,
    });
    expect(client.stderr.getFullOutput()).not.toContain(
      'Single-fire schedule has passed'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  describe('enable --until and --for', () => {
    const hour = 60 * 60 * 1000;

    it('enables a schedule for a duration', async () => {
      let request: { body: Record<string, unknown> } | undefined;
      const before = Date.now();
      useScheduleAction(
        'enable',
        'daily-cleanup',
        createSchedule({ state: 'active' }),
        value => {
          request = value;
        }
      );
      client.setArgv('schedules', 'enable', 'daily-cleanup', '--for', '2h');

      await expect(schedules(client)).resolves.toBe(0);
      const until = request?.body.until as number;
      expect(until).toBeGreaterThanOrEqual(before + 2 * hour);
      expect(until).toBeLessThanOrEqual(Date.now() + 2 * hour);
      expect(client.stderr.getFullOutput()).toContain(
        `Enabled schedule default/daily-cleanup until ${new Date(until).toISOString()}`
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:enable', value: 'enable' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:for', value: '[REDACTED]' },
      ]);
    });

    it.each([
      ['an ISO 8601 time', new Date(Date.now() + hour).toISOString()],
      ['Unix milliseconds', String(Date.now() + hour)],
      ['a leap day', '2096-02-29T00:00:00Z'],
    ])('enables a schedule until %s', async (_case, value) => {
      let request: { body: Record<string, unknown> } | undefined;
      useScheduleAction(
        'enable',
        'daily-cleanup',
        createSchedule({ state: 'active' }),
        captured => {
          request = captured;
        }
      );
      client.setArgv(
        'schedules',
        'enable',
        'daily-cleanup',
        '--until',
        value,
        '--json'
      );

      await expect(schedules(client)).resolves.toBe(0);
      expect(request?.body).toEqual({
        until: /^\d+$/.test(value) ? Number(value) : Date.parse(value),
      });
    });

    it('sends no body without --until or --for', async () => {
      let request: { body: Record<string, unknown> } | undefined;
      useScheduleAction(
        'enable',
        'daily-cleanup',
        createSchedule({ state: 'active' }),
        value => {
          request = value;
        }
      );
      client.setArgv('schedules', 'enable', 'daily-cleanup');

      await expect(schedules(client)).resolves.toBe(0);
      expect(request?.body ?? {}).toEqual({});
      expect(client.stderr.getFullOutput()).toContain(
        'Enabled schedule default/daily-cleanup.'
      );
    });

    it.each([
      [
        ['--until', '2099-01-01T00:00:00Z', '--for', '1h'],
        '`--until` and `--for` cannot be used together.',
      ],
      [
        ['--until', '1h'],
        '`--until` must be a time, not a duration. Use `--for 1h` instead.',
      ],
      [
        ['--until', 'tomorrow'],
        '`--until` must be an ISO 8601 time or Unix milliseconds.',
      ],
      [['--until', '2000-01-01T00:00:00Z'], '`--until` must be in the future.'],
      [
        ['--until', '2099-02-29T00:00:00Z'],
        '`--until` must be an ISO 8601 time or Unix milliseconds.',
      ],
      [
        ['--until', '2099-04-31'],
        '`--until` must be an ISO 8601 time or Unix milliseconds.',
      ],
      [['--for', '30'], '`--for` must be a duration such as 30m, 5h, or 10s.'],
      [['--for', '0s'], '`--for` must be a duration such as 30m, 5h, or 10s.'],
    ])('rejects %j before sending a request', async (flags, message) => {
      client.setArgv('schedules', 'enable', 'daily-cleanup', ...flags);

      await expect(schedules(client)).resolves.toBe(2);
      expect(client.stderr.getFullOutput()).toContain(message);
    });

    it('explains how to recover when the schedule is already enabled', async () => {
      useScheduleMutationError(
        'enable',
        'daily-cleanup',
        409,
        'schedule_already_active',
        'Schedule is already enabled'
      );
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      client.nonInteractive = true;
      client.setArgv('schedules', 'enable', 'daily-cleanup', '--for', '1h');

      await expect(schedules(client)).rejects.toThrow('process.exit called');
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result).toMatchObject({
        status: 'error',
        reason: 'schedule_already_active',
        message:
          'Schedule default/daily-cleanup is already enabled without an end time. Disable it first, then enable it with --until or --for.',
        retryable: false,
      });
      expect(result.next[0].command).toContain(
        'schedules disable daily-cleanup --namespace default'
      );
      expect(result.next[0].command).not.toContain('--for');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('keeps the Track selector in recovery commands', async () => {
      useScheduleMutationError(
        'enable',
        'daily-cleanup',
        409,
        'schedule_already_active',
        'Schedule is already enabled'
      );
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      client.nonInteractive = true;
      client.setArgv(
        'schedules',
        'enable',
        'daily-cleanup',
        '--environment',
        'staging',
        '--for',
        '1h'
      );

      await expect(schedules(client)).rejects.toThrow('process.exit called');
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.next[0].command).toContain(
        'schedules disable daily-cleanup --namespace default --environment staging'
      );
    });
  });
});
