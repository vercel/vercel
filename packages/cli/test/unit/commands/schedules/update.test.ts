import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createSchedule,
  useScheduleMutationError,
  useUpdateSchedule,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('schedules update', () => {
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

  it('forwards SDK update inputs by name and namespace', async () => {
    let request;
    useUpdateSchedule('daily-cleanup', createSchedule(), value => {
      request = value;
    });
    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--namespace',
      'jobs',
      '--cron',
      '0 3 * * *',
      '--timezone',
      'America/New_York',
      '--jitter',
      'none',
      '--topic',
      'daily-jobs',
      '--payload',
      'null'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(request).toMatchObject({
      query: {
        namespace: 'jobs',
        projectId: 'schedules-test-project',
        teamId: 'team_dummy',
      },
      body: {
        expression: { type: 'cron', cron: '0 3 * * *' },
        timezone: 'America/New_York',
        jitter: null,
        target: { type: 'queue', topic: 'daily-jobs' },
        payload: null,
      },
    });
    expect(client.stderr.getFullOutput()).toContain(
      'Updated schedule jobs/daily-cleanup.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:namespace', value: '[REDACTED]' },
      { key: 'option:cron', value: '[REDACTED]' },
      { key: 'option:timezone', value: 'America/New_York' },
      { key: 'option:jitter', value: 'none' },
      { key: 'option:topic', value: '[REDACTED]' },
      { key: 'option:payload', value: '[REDACTED]' },
    ]);
  });

  it('returns the sanitized updated schedule as JSON', async () => {
    const response = createSchedule({
      expression: { type: 'single', at: '2026-10-01T09:00:00' },
    });
    useUpdateSchedule('daily-cleanup', response);
    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--at',
      '2026-10-01T09:00:00',
      '--json'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(response);
    expect(client.stdout.getFullOutput()).not.toContain('trackId');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:at', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('requires a name and at least one update', async () => {
    client.setArgv('schedules', 'update');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A schedule name is required'
    );

    client.setArgv('schedules', 'update', 'daily-cleanup');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'At least one update option is required.'
    );
  });

  it('validates expressions, jitter, and payload', async () => {
    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--cron',
      '* * * * *',
      '--at',
      '2026-10-01T09:00:00Z'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Use either `--cron` or `--at`, not both.'
    );

    client.setArgv('schedules', 'update', 'daily-cleanup', '--jitter', '0');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--jitter` must be an integer between 1 and 15.'
    );

    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--payload',
      '{bad}'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--payload` must be valid JSON.'
    );

    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--timezone',
      'Invalid/Zone'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--timezone` must be a valid IANA timezone.'
    );

    client.setArgv(
      'schedules',
      'update',
      'daily-cleanup',
      '--topic',
      'jobs/cleanup'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--topic` must be 1–256 characters and contain only letters, numbers, underscores, and hyphens.'
    );
  });

  it('maps a missing schedule to the shared not-found error', async () => {
    useScheduleMutationError(
      'update',
      'missing',
      404,
      'not_found',
      'Schedule not found'
    );
    client.setArgv('schedules', 'update', 'missing', '--timezone', 'UTC');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Schedule not found: default/missing.'
    );
  });

  it('explains that static schedules cannot be updated', async () => {
    useScheduleMutationError(
      'update',
      'daily-cleanup',
      409,
      'static_schedule',
      'Static schedules cannot be updated or deleted. Enable or disable them instead.'
    );
    client.setArgv('schedules', 'update', 'daily-cleanup', '--timezone', 'UTC');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Static schedule default/daily-cleanup can't be updated or deleted. Enable or disable it instead."
    );
  });

  it('writes a stable static-schedule error for agents', async () => {
    useScheduleMutationError(
      'update',
      'daily-cleanup',
      409,
      'static_schedule',
      'Static schedules cannot be updated or deleted. Enable or disable them instead.'
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'update', 'daily-cleanup', '--timezone', 'UTC');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'static_schedule',
      message:
        "Static schedule default/daily-cleanup can't be updated or deleted. Enable or disable it instead.",
      retryable: false,
      next: [
        {
          command: 'vercel schedules enable daily-cleanup --namespace default',
          when: 'Enable the static schedule',
        },
        {
          command: 'vercel schedules disable daily-cleanup --namespace default',
          when: 'Disable the static schedule',
        },
      ],
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
