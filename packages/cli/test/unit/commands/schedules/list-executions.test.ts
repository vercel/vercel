import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  createScheduleExecution,
  createScheduleExecutionMetrics,
  useScheduleExecutions,
  useScheduleExecutionsError,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

describe('schedules executions list', () => {
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

  it('lists executions for a schedule', async () => {
    let query: Record<string, unknown> | undefined;
    useScheduleExecutions(
      'daily-cleanup',
      [
        createScheduleExecution(),
        createScheduleExecution({
          executionId: 'schx_manual',
          invokeSource: 'manual',
          status: 'failed',
          firedAt: null,
        }),
      ],
      null,
      requestQuery => (query = requestQuery)
    );

    client.setArgv('schedules', 'executions', 'list', 'daily-cleanup');
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      namespace: 'default',
      limit: '20',
      projectId: 'schedules-test-project',
      teamId: 'team_dummy',
    });
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Executions for schedule default/daily-cleanup');
    expect(output).toContain('Execution ID');
    expect(output).toContain('Status');
    expect(output).toContain('schx_test123');
    expect(output).toContain('schx_manual');
    expect(output).toContain('Succeeded');
    expect(output).toContain('Failed');
    expect(output).toContain('Manual');
    expect(output).toContain('Recorded');
    expect(output).toContain('10 invocations');
    expect(output).toContain('Error Rate');
    expect(output).toContain('20%');
    expect(output).toContain('Avg Duration');
    expect(output).toContain('125ms');
    expect(output).not.toContain('Scheduled At');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('uses explicit filters and pagination options', async () => {
    let query: Record<string, unknown> | undefined;
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      null,
      requestQuery => (query = requestQuery)
    );

    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--namespace',
      'jobs',
      '--limit',
      '5',
      '--sort',
      'asc',
      '--since',
      '2023-11-14T22:13:20.000Z',
      '--until',
      '2023-11-15T22:13:20.000Z',
      '--execution-id',
      'schx_abc',
      '--next',
      'cursor_123'
    );
    await expect(schedules(client)).resolves.toBe(0);

    expect(query).toMatchObject({
      namespace: 'jobs',
      limit: '5',
      sort: 'asc',
      from: '1700000000000',
      to: '1700086400000',
      executionId: 'schx_abc',
      cursor: 'cursor_123',
    });
  });

  it('prints a safe next-page command', async () => {
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      "cursor'$(unsafe)"
    );
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--namespace',
      'jobs',
      '--limit',
      '5',
      '--sort',
      'asc',
      '--since',
      '2023-11-14T22:13:20.000Z',
      '--until',
      '2023-11-15T22:13:20.000Z',
      '--execution-id',
      "schx'$(unsafe)"
    );

    await expect(schedules(client)).resolves.toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      'Next page:\n    vercel schedules executions list'
    );
    expect(output).not.toContain('More executions are available.');
    expect(output).toContain(
      'schedules executions list daily-cleanup --namespace jobs --limit 5 --sort asc --since 2023-11-14T22:13:20.000Z --until 2023-11-15T22:13:20.000Z --execution'
    );
    expect(output).toContain("'schx'\\''$(unsafe)'");
    expect(output).toContain("'cursor'\\''$(unsafe)'");
  });

  it('keeps the Track selector in the next-page command', async () => {
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      'cursor_2'
    );
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '-e',
      'staging'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'schedules executions list daily-cleanup --environment staging --next cursor_2'
    );
  });

  it('prints a neutral empty state', async () => {
    useScheduleExecutions('daily-cleanup', []);
    client.setArgv('schedules', 'executions', 'list', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No executions found for schedule default/daily-cleanup.'
    );
  });

  it('renders unavailable outcomes and empty metrics clearly', async () => {
    useScheduleExecutions(
      'daily-cleanup',
      [
        createScheduleExecution({
          status: 'unavailable',
          invokeSource: undefined,
          firedAt: null,
        }),
      ],
      null,
      undefined,
      createScheduleExecutionMetrics({
        recordedInvocations: 0,
        failedInvocations: 0,
        errorRate: null,
        averageDurationMs: null,
      })
    );
    client.setArgv('schedules', 'executions', 'list', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Unavailable');
    expect(output).toContain('0 invocations');
    expect(output).not.toContain('null');
  });

  it('accepts a relative --since and ends the window now', async () => {
    let query: Record<string, unknown> | undefined;
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      'cursor_123',
      requestQuery => (query = requestQuery)
    );

    const before = Date.now();
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '-s',
      '1h'
    );
    await expect(schedules(client)).resolves.toBe(0);
    const after = Date.now();

    const from = Number(query?.from);
    const to = Number(query?.to);
    expect(from).toBeGreaterThanOrEqual(before - 3_600_000);
    expect(from).toBeLessThanOrEqual(after - 3_600_000);
    expect(to).toBeGreaterThanOrEqual(before);
    expect(to).toBeLessThanOrEqual(after);

    // The next page repeats the resolved window, not the relative input.
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      `--since ${new Date(from).toISOString()} --until ${new Date(to).toISOString()}`
    );
    expect(output).not.toContain('--since 1h');
  });

  it('rejects --until without --since', async () => {
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--until',
      '2023-11-15T22:13:20.000Z'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--until` requires `--since`.'
    );
  });

  it('rejects a window longer than 30 days', async () => {
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--since',
      '31d'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'The time range must be at most 30 days.'
    );
  });

  it('accepts a relative --since of exactly 30 days', async () => {
    useScheduleExecutions('daily-cleanup', []);
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--since',
      '30d'
    );

    await expect(schedules(client)).resolves.toBe(0);
  });

  it('rejects an invalid --since', async () => {
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--since',
      'yesterday-ish'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--since`: Invalid time format "yesterday-ish"'
    );
  });

  it('rejects --since together with deprecated --from', async () => {
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--since',
      '1h',
      '--from',
      '1700000000000'
    );

    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Pass only one of `--since` or `--from`.'
    );
  });

  it('renders a metrics range that starts at the Unix epoch', async () => {
    useScheduleExecutions(
      'daily-cleanup',
      [],
      null,
      undefined,
      createScheduleExecutionMetrics({ from: 0, to: 86_400_000 })
    );
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--from',
      '0',
      '--to',
      '86400000'
    );

    await expect(schedules(client)).resolves.toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      '`--from` is deprecated, please use `--since` instead'
    );
    expect(stderr).toContain(
      '`--to` is deprecated, please use `--until` instead'
    );
    const range = stderr.split('\n').find(line => line.includes('Range'));
    expect(range).toBeDefined();
    expect(range).not.toMatch(/Range\s+-/);
    expect(range).toMatch(/(?:1969|1970)/);
  });

  it('writes the response to stdout as JSON', async () => {
    const response = useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      'cursor_123'
    );
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--format',
      'json'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      ...response,
      pagination: { next: 'cursor_123' },
    });
    expect(client.stderr.getFullOutput()).not.toContain('Fetching executions');
  });

  it('writes a bounded success payload in non-interactive mode', async () => {
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      'cursor_123'
    );
    client.nonInteractive = true;
    client.setArgv('schedules', 'executions', 'list', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'ok',
      message: 'Found 1 execution for schedule default/daily-cleanup.',
      data: [createScheduleExecution()],
      cursor: 'cursor_123',
      pagination: { next: 'cursor_123' },
      metrics: createScheduleExecutionMetrics(),
    });
  });

  it('rejects invalid arguments before requesting executions', async () => {
    client.setArgv('schedules', 'executions', 'list');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'A schedule name is required.'
    );

    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--sort',
      'sideways'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--sort` must be `asc` or `desc`.'
    );

    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--to',
      '1'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--to` requires `--since`.'
    );

    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--from',
      '1700000000000',
      '--to',
      '1700000000000'
    );
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--to` must be after `--from`.'
    );
  });

  it('reports VSS service errors without exposing raw responses', async () => {
    useScheduleExecutionsError(
      'daily-cleanup',
      503,
      'service_unavailable',
      'Schedule executions are temporarily unavailable.'
    );
    client.setArgv('schedules', 'executions', 'list', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Schedule execution history is temporarily unavailable. Try again later.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('service_unavailable');
  });
});

describe('schedules executions list --execution', () => {
  afterEach(() => {
    delete process.env.VERCEL_SCHEDULE_BASE_URL;
  });

  // Runs the command with a fresh client and a fixed window, recording the
  // executions request.
  async function run(...args: string[]) {
    client.reset();
    process.env.VERCEL_SCHEDULE_BASE_URL = client.apiUrl;
    useUser({ id: 'user_1', username: 'tester' });
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'schedules-test-project',
      name: 'schedules-test',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/schedules');
    let query: Record<string, unknown> | undefined;
    useScheduleExecutions(
      'daily-cleanup',
      [createScheduleExecution()],
      null,
      requestQuery => (query = requestQuery)
    );
    client.setArgv(
      'schedules',
      'executions',
      'list',
      'daily-cleanup',
      '--since',
      '2023-11-14T22:13:20.000Z',
      '--until',
      '2023-11-15T22:13:20.000Z',
      ...args
    );
    const exitCode = await schedules(client);
    return {
      exitCode,
      query,
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('still accepts --execution-id, with one warning that names --execution', async () => {
    const now = await run('--execution', 'schx_1');
    const before = await run('--execution-id', 'schx_1');

    expect(now.exitCode).toBe(0);
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.query).toEqual(now.query);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(
      '! --execution-id is deprecated. Use --execution.\n'
    );

    const nowJson = await run('--execution', 'schx_1', '--json');
    const beforeJson = await run('--execution-id', 'schx_1', '--json');
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      '--execution-id is deprecated. Use --execution.'
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it.each([
    ['--execution-id', '`--execution-id` cannot be empty.'],
    ['--execution', "--execution can't be empty."],
  ])('rejects an empty %s with exit 2, naming it', async (flag, message) => {
    const result = await run(flag, ' ');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.query).toBeUndefined();
  });

  it('rejects --execution with --execution-id before any request', async () => {
    const result = await run('--execution', 'a', '--execution-id', 'a');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "Can't use --execution with --execution-id."
    );
    expect(result.query).toBeUndefined();
  });
});
