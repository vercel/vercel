import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import create from '../../../../src/commands/schedules/create';
import get from '../../../../src/commands/schedules/get';
import list from '../../../../src/commands/schedules/list';
import update from '../../../../src/commands/schedules/update';
import deleteSchedule from '../../../../src/commands/schedules/delete';
import action from '../../../../src/commands/schedules/action';
import listExecutions from '../../../../src/commands/schedules/executions/list';
import { handleSchedulesApiError } from '../../../../src/commands/schedules/errors';
import { requireProjectContext } from '../../../../src/util/projects/require-project-context';
import type { SchedulesClient } from '../../../../src/util/schedules/client';
import { createLocalSchedulesClient } from '../../../../src/util/schedules/local-client';
import { client } from '../../../mocks/client';
import { createSchedule } from '../../../mocks/schedules';

vi.mock('../../../../src/util/schedules/local-client', () => ({
  createLocalSchedulesClient: vi.fn(),
}));
vi.mock('../../../../src/util/projects/require-project-context', () => ({
  requireProjectContext: vi.fn(),
}));

const schedule = createSchedule();
const local = {
  localOrigin: 'http://127.0.0.1:5784',
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  invoke: vi.fn(),
  delete: vi.fn(),
};

const operations = [
  {
    name: 'create',
    args: ['daily-cleanup', '--cron', '0 2 * * *', '--topic', 'jobs'],
    run: create,
    method: 'create',
    result: schedule,
  },
  {
    name: 'inspect',
    args: ['daily-cleanup'],
    run: get,
    method: 'get',
    result: schedule,
  },
  {
    name: 'get',
    args: ['daily-cleanup'],
    run: get,
    method: 'get',
    result: schedule,
  },
  {
    name: 'list',
    args: [],
    run: list,
    method: 'list',
    result: { data: [schedule], cursor: null, pagination: { next: null } },
  },
  {
    name: 'ls',
    args: [],
    run: list,
    method: 'list',
    result: { data: [schedule], cursor: null, pagination: { next: null } },
  },
  {
    name: 'update',
    args: ['daily-cleanup', '--topic', 'jobs'],
    run: update,
    method: 'update',
    result: schedule,
  },
  {
    name: 'enable',
    args: ['daily-cleanup'],
    run: (c, a) => action(c, a, 'enable'),
    method: 'enable',
    result: schedule,
  },
  {
    name: 'disable',
    args: ['daily-cleanup'],
    run: (c, a) => action(c, a, 'disable'),
    method: 'disable',
    result: schedule,
  },
  {
    name: 'invoke',
    args: ['daily-cleanup'],
    run: (c, a) => action(c, a, 'invoke'),
    method: 'invoke',
    result: { invoked: true, name: 'daily-cleanup', namespace: 'default' },
  },
  {
    name: 'delete',
    args: ['daily-cleanup', '--yes'],
    run: deleteSchedule,
    method: 'delete',
    result: {
      deleted: true,
      name: 'daily-cleanup',
      namespace: 'default',
      scheduleId: 'sch_test',
    },
  },
  {
    name: 'rm',
    args: ['daily-cleanup', '--yes'],
    run: deleteSchedule,
    method: 'delete',
    result: {
      deleted: true,
      name: 'daily-cleanup',
      namespace: 'default',
      scheduleId: 'sch_test',
    },
  },
] satisfies Array<{
  name: string;
  args: string[];
  run: (c: typeof client, a: string[]) => Promise<number>;
  method: Exclude<keyof typeof local, 'localOrigin'>;
  result: unknown;
}>;

describe('local schedules command wiring', () => {
  beforeEach(() => {
    vi.mocked(createLocalSchedulesClient)
      .mockReset()
      .mockResolvedValue(local as unknown as SchedulesClient);
    vi.mocked(requireProjectContext).mockReset().mockResolvedValue(73);
    for (const method of [
      'create',
      'get',
      'update',
      'enable',
      'disable',
    ] as const) {
      local[method].mockReset().mockResolvedValue(schedule);
    }
    local.list
      .mockReset()
      .mockResolvedValue({ data: [schedule], cursor: null });
    local.delete.mockReset().mockResolvedValue({ scheduleId: 'sch_test' });
    local.invoke.mockReset().mockResolvedValue(undefined);
    vi.spyOn(client, 'fetch');
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe.each(operations)('$name', operation => {
    it.each([
      '--local',
      '-L',
    ])('uses %s at the direct leaf without cloud lookup', async flag => {
      client.setArgv(
        'schedules',
        operation.name,
        flag,
        ...operation.args,
        '--json'
      );
      await expect(
        operation.run(client, [flag, ...operation.args, '--json'])
      ).resolves.toBe(0);
      expect(local[operation.method]).toHaveBeenCalledOnce();
      expect(createLocalSchedulesClient).toHaveBeenCalledExactlyOnceWith(
        client
      );
      expect(requireProjectContext).not.toHaveBeenCalled();
      expect(client.fetch).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual(
        operation.result
      );
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toHaveLength(1);
      expect(client.stderr.getFullOutput()).toContain(
        `Using local Schedules at ${local.localOrigin}`
      );
      expect(client.telemetryEventStore.readonlyEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'flag:local', value: 'TRUE' }),
        ])
      );
    });

    it.each(
      ['--local', '-L'].flatMap(flag =>
        [0, 1, 2, 3].map(position => ({ flag, position }))
      )
    )('preserves $flag in position $position', async ({ flag, position }) => {
      const argv = ['schedules', operation.name, ...operation.args, '--json'];
      argv.splice(position === 3 ? argv.length : position, 0, flag);
      client.setArgv(...argv);
      await expect(schedules(client)).resolves.toBe(0);
      expect(local[operation.method]).toHaveBeenCalledOnce();
      expect(requireProjectContext).not.toHaveBeenCalled();
      expect(client.fetch).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual(
        operation.result
      );
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
    });

    it.each([
      '--scope',
      '--team',
      '--token',
      '-S',
      '-T',
      '-t',
    ])('rejects explicit %s at the direct leaf', async flag => {
      const args = ['--local', flag, 'explicit', ...operation.args];
      client.setArgv('schedules', operation.name, ...args);
      await expect(operation.run(client, args)).resolves.toBe(2);
      expect(client.stderr.getFullOutput()).toContain('Cannot combine --local');
      expect(createLocalSchedulesClient).not.toHaveBeenCalled();
      expect(requireProjectContext).not.toHaveBeenCalled();
    });
  });

  it.each([
    '--scope',
    '--team',
    '--token',
  ])('rejects %s before the group', async flag => {
    client.setArgv(flag, 'explicit', 'schedules', 'ls', '-L');
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      `Cannot combine --local with ${flag}`
    );
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('ignores ambient cloud configuration', async () => {
    vi.stubEnv('VERCEL_TOKEN', 'ambient-token');
    vi.stubEnv('VERCEL_ORG_ID', 'ambient-org');
    vi.stubEnv('VERCEL_PROJECT_ID', 'ambient-project');
    client.config.currentTeam = 'ambient-team';
    client.setArgv('schedules', 'list', '--local', '--json');
    await expect(schedules(client)).resolves.toBe(0);
    expect(requireProjectContext).not.toHaveBeenCalled();
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it('checks explicit global flags even when direct leaf args omit them', async () => {
    client.setArgv('--team', 'explicit', 'schedules', 'list', '--local');
    await expect(list(client, ['--local'])).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Cannot combine --local with --team'
    );
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
  });

  it.each([
    ['schedules', 'list', '--', '--local'],
    ['schedules', '--', 'list', '--local'],
    ['--', 'schedules', 'list', '--local'],
    ['schedules', '--local', 'list', '--', '--unknown'],
  ])('preserves terminator semantics: %j', async (...argv) => {
    client.setArgv(...argv);
    await expect(schedules(client)).resolves.toBe(2);
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('retains local selection before the terminator', async () => {
    client.setArgv(
      '-L',
      'schedules',
      'inspect',
      '--json',
      '--',
      'daily-cleanup'
    );
    await expect(schedules(client)).resolves.toBe(0);
    expect(local.get).toHaveBeenCalledWith({
      name: 'daily-cleanup',
      namespace: 'default',
    });
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('does not treat an option value as local selection', async () => {
    client.setArgv('schedules', 'list', '--next=--local');
    await expect(schedules(client)).resolves.toBe(73);
    expect(requireProjectContext).toHaveBeenCalledOnce();
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
  });

  it.each([
    ['schedules', '--local', 'list', '--unknown'],
    ['schedules', '--unknown', 'list', '--local'],
    ['--unknown', 'schedules', 'list', '--local'],
    ['schedules', 'list', '--namespace', '--local'],
  ])('rejects invalid options without falling back: %j', async (...argv) => {
    client.setArgv(...argv);
    await expect(schedules(client)).resolves.toBe(2);
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it.each([
    ['schedules', 'list', '--locla'],
    ['schedules', '--locla', 'list'],
    ['--locla', 'schedules', 'list'],
  ])('suggests the local flag for a typo: %j', async (...argv) => {
    client.setArgv(...argv);
    await expect(schedules(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain('--local');
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('preserves canonical --local in pagination', async () => {
    local.list.mockResolvedValue({ data: [schedule], cursor: 'next-page' });
    client.setArgv(
      'schedules',
      '-L',
      'ls',
      '--namespace',
      'jobs',
      '--limit',
      '1'
    );
    await expect(schedules(client)).resolves.toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'schedules list --namespace jobs --limit 1 --next next-page --local'
    );
  });

  it.each([
    'inspect',
    'get',
  ])('preserves canonical inspect and --local in %s argument guidance JSON', async command => {
    client.nonInteractive = true;
    client.setArgv('schedules', '-L', command);
    await expect(schedules(client)).resolves.toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'invalid_arguments',
      next: [{ command: 'vercel schedules inspect <name> --local' }],
    });
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('preserves local context in unknown-flag agent guidance', async () => {
    client.nonInteractive = true;
    client.setArgv('schedules', '-L', 'ls', '--unknown');
    await expect(schedules(client)).resolves.toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'invalid_arguments',
      next: [{ command: 'vercel schedules --local' }],
    });
  });

  it.each([
    false,
    true,
  ])('reports discovery failure without cloud fallback (agent=%s)', async agent => {
    client.nonInteractive = agent;
    vi.mocked(createLocalSchedulesClient).mockRejectedValue(
      new Error('No local Schedules session found. Start vercel dev.')
    );
    client.setArgv('schedules', 'list', '-L');
    await expect(schedules(client)).resolves.toBe(1);
    const text = agent
      ? JSON.parse(client.stdout.getFullOutput()).message
      : client.stderr.getFullOutput();
    expect(text).toContain('No local Schedules session found');
    expect(text).not.toMatch(/login|link|team|plan/);
    if (agent)
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        reason: 'api_error',
        retryable: false,
      });
    expect(requireProjectContext).not.toHaveBeenCalled();
    expect(local.list).not.toHaveBeenCalled();
  });

  describe.each([
    '--local',
    '-L',
  ])('execution history telemetry with %s', flag => {
    it.each(
      [
        ['schedules', 'executions'],
        ['schedules', 'executions', 'list'],
        ['schedules', 'executions', 'ls'],
        ['schedules', 'executions', 'list', 'daily-cleanup'],
        ['schedules', 'executions', 'ls', 'daily-cleanup'],
      ].flatMap(args =>
        Array.from({ length: args.length + 1 }, (_, position) => {
          const argv = [...args];
          argv.splice(position, 0, flag);
          return { argv };
        })
      )
    )('records local once and rejects before discovery: $argv', async ({
      argv,
    }) => {
      client.setArgv(...argv);
      await expect(schedules(client)).resolves.toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Execution history is not supported for local Schedules'
      );
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
      expect(createLocalSchedulesClient).not.toHaveBeenCalled();
      expect(requireProjectContext).not.toHaveBeenCalled();
      expect(client.fetch).not.toHaveBeenCalled();
    });

    it.each(
      ['list', 'ls'].flatMap(command =>
        [0, 1].map(position => ({ command, position }))
      )
    )('records local once at the direct $command leaf in position $position', async ({
      command,
      position,
    }) => {
      client.nonInteractive = true;
      const args = ['daily-cleanup'];
      args.splice(position, 0, flag);
      client.setArgv('schedules', 'executions', command, ...args);
      await expect(listExecutions(client, args)).resolves.toBe(1);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        reason: 'api_error',
        message: expect.stringContaining('not supported'),
      });
      expect(
        client.telemetryEventStore.readonlyEvents.filter(
          event => event.key === 'flag:local'
        )
      ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
      expect(createLocalSchedulesClient).not.toHaveBeenCalled();
      expect(requireProjectContext).not.toHaveBeenCalled();
      expect(client.fetch).not.toHaveBeenCalled();
    });
  });

  it('rejects local executions at the direct entrypoint with JSON', async () => {
    client.nonInteractive = true;
    client.setArgv('schedules', 'executions', 'list', '--local');
    await expect(listExecutions(client, ['--local'])).resolves.toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'api_error',
      message: expect.stringContaining('not supported'),
    });
    expect(
      client.telemetryEventStore.readonlyEvents.filter(
        event => event.key === 'flag:local'
      )
    ).toEqual([expect.objectContaining({ value: 'TRUE' })]);
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('marks deletion confirmation and success as local', async () => {
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('schedules', 'rm', 'daily-cleanup', '-L');
    await expect(schedules(client)).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'Delete local schedule default/daily-cleanup? This cannot be undone.',
      false
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Deleted local schedule default/daily-cleanup.'
    );
  });

  it('retains canonical local mode when requesting delete confirmation', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'rm', '-L', '--', 'daily-cleanup');
    await expect(schedules(client)).rejects.toThrow('exit');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'confirmation_required',
      next: [
        {
          command:
            'vercel schedules delete daily-cleanup --namespace default --yes --local',
        },
      ],
    });
    expect(createLocalSchedulesClient).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error('unauthorized'), {
      status: 401,
      code: 'unauthorized',
    }),
    Object.assign(new Error('forbidden'), { status: 403, code: 'not_enabled' }),
    Object.assign(new Error('Project not found'), {
      status: 404,
      serverMessage: 'Project not found',
      code: 'not_found',
    }),
    new Error('Local session mismatch'),
    new Error('ECONNREFUSED'),
  ])('uses local guidance for %s', async error => {
    client.nonInteractive = true;
    local.get.mockRejectedValue(error);
    client.setArgv('schedules', 'inspect', 'daily-cleanup', '--local');
    await expect(schedules(client)).resolves.toBe(1);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({ reason: 'api_error', retryable: false });
    expect(result.message).toContain('vercel dev');
    expect(result.message).not.toMatch(/login|vercel link|team owner|plan/);
    expect(requireProjectContext).not.toHaveBeenCalled();
  });

  it('keeps genuine missing schedule errors as not_found', () => {
    client.nonInteractive = true;
    const error = Object.assign(new Error('Schedule not found'), {
      status: 404,
      code: 'not_found',
      serverMessage: 'Schedule not found',
    });
    expect(
      handleSchedulesApiError(client, error, {
        action: 'get',
        name: 'missing',
        namespace: 'default',
        local: true,
      })
    ).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'not_found',
      message: 'Schedule not found: default/missing.',
    });
  });

  it('reports ambiguous invocations without retrying', async () => {
    client.nonInteractive = true;
    local.invoke.mockRejectedValue(new Error('connection reset'));
    client.setArgv('schedules', 'invoke', 'daily-cleanup', '--local');
    await expect(schedules(client)).resolves.toBe(1);
    expect(local.invoke).toHaveBeenCalledOnce();
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      reason: 'api_error',
      retryable: false,
      message: expect.stringContaining('may have been accepted'),
    });
    expect(requireProjectContext).not.toHaveBeenCalled();
  });
});
