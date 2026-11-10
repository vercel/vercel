import assert from 'assert';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  ScheduleBroker,
  type ScheduleBrokerOptions,
  type ScheduleDispatch,
  type CreateScheduleInput,
  type StaticScheduleInput,
} from '../src';
import { scheduleExecutionId } from '../src/ids';

const START = Date.parse('2026-01-01T00:00:00Z');
const MINUTE = 60_000;
const input = {
  name: 'job',
  expression: { type: 'cron', cron: '* * * * *' },
  target: { type: 'queue', topic: 'jobs' },
} satisfies CreateScheduleInput;
const id = { name: 'job' };
const brokers: ScheduleBroker[] = [];

function setup(options: Partial<ScheduleBrokerOptions> = {}) {
  const dispatch =
    vi.fn<(invocation: ScheduleDispatch) => void | Promise<void>>();
  const onError = vi.fn();
  const broker = new ScheduleBroker({
    ownerId: 'team_local',
    projectId: 'prj_local',
    trackId: 'production',
    dispatch,
    onError,
    ...options,
  });
  brokers.push(broker);
  return { broker, dispatch, onError };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(async () => {
  await Promise.all(brokers.splice(0).map(broker => broker.close()));
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('management contract', () => {
  it('allocates unique ULID schedule IDs only when inserting resources', () => {
    const { broker } = setup();
    const dynamic = broker.create(input);
    const [staticSchedule] = broker.reconcileStatic([
      { ...input, name: 'static' },
    ]);
    for (const schedule of [dynamic, staticSchedule]) {
      expect(schedule.scheduleId).toMatch(/^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      expect(schedule.createdAt).toBe(START);
    }
    expect(dynamic.scheduleId).not.toBe(staticSchedule.scheduleId);
    vi.setSystemTime(START + 1);
    expect(broker.update(id, { payload: { updated: true } }).scheduleId).toBe(
      dynamic.scheduleId
    );
    expect(broker.disable(id).scheduleId).toBe(dynamic.scheduleId);
    expect(broker.enable(id).scheduleId).toBe(dynamic.scheduleId);
    expect(broker.reconcileStatic([{ ...input, name: 'static' }])).toEqual([
      staticSchedule,
    ]);
    broker.delete(id);
    expect(broker.create(input).scheduleId).not.toBe(dynamic.scheduleId);
  });

  describe.each(['name', 'namespace'] as const)('%s identifiers', field => {
    it.each([
      'job_1',
      '0.daily',
      'a-batch',
      `a${'_'.repeat(255)}`,
    ])('accepts production identifier %#', value => {
      const { broker } = setup();
      const identifier = {
        name: 'job',
        namespace: 'default',
        [field]: value,
      };
      const record = broker.create({ ...input, ...identifier });
      expect(record).toMatchObject(identifier);
      expect(broker.get(identifier)).toEqual(record);
      expect(broker.list({ namespace: identifier.namespace })).toEqual({
        data: [record],
        cursor: null,
      });
    });

    it.each([
      'bad/value',
      `a${'_'.repeat(256)}`,
      '',
      '_job',
      '.daily',
      '-batch',
    ])('rejects invalid identifier %# without registering a schedule', value => {
      const { broker } = setup();
      expect(() => broker.create({ ...input, [field]: value })).toThrow(
        /starting with a letter or number/
      );
      expect(broker.list().data).toEqual([]);
    });
  });

  it('excludes authored static payloads and function bodies from the public types', () => {
    expectTypeOf<StaticScheduleInput>().not.toHaveProperty('payload');
    expectTypeOf<
      Extract<ScheduleDispatch['delivery'], { type: 'function' }>
    >().not.toHaveProperty('body');
  });

  it('isolates projects/namespaces, returns resources, and preserves ownership', () => {
    const { broker } = setup();
    const other = setup({ projectId: 'prj_other' }).broker;
    const resource = broker.create({
      ...input,
      payload: { secret: 'not on resource' },
    });
    expect(resource).toMatchObject({
      ...input,
      namespace: 'default',
      timezone: 'UTC',
      state: 'active',
      source: 'dynamic',
      ownerId: 'team_local',
      projectId: 'prj_local',
      createdAt: START,
      updatedAt: START,
    });
    expect(resource).not.toHaveProperty('payload');
    expect(resource).not.toHaveProperty('trackId');
    expect(() => other.get(id)).toThrow(/not found/);
    expect(other.create(input).scheduleId).not.toBe(resource.scheduleId);
    broker.create({ ...input, namespace: 'another' });
    expect(broker.list().data).toHaveLength(1);
    expect(broker.list({ namespace: 'another' }).data).toHaveLength(1);
    expect(() => broker.create(input)).toThrow(/already exists/);
    resource.target = { type: 'queue', topic: 'mutated' };
    expect(broker.get(id).target).toEqual(input.target);
    expect(broker.delete(id)).toEqual({ scheduleId: resource.scheduleId });
    expect(() => broker.delete(id)).toThrow(/not found/);
  });

  it('uses namespace-scoped, keyset pagination with input validation', () => {
    const { broker } = setup();
    for (const name of ['c', 'a', 'b']) broker.create({ ...input, name });
    const first = broker.list({ limit: 2 });
    expect(first.data.map(schedule => schedule.name)).toEqual(['a', 'b']);
    broker.delete({ name: 'b' });
    expect(
      broker.list({ cursor: first.cursor! }).data.map(schedule => schedule.name)
    ).toEqual(['c']);
    expect(broker.list({ cursor: first.cursor! }).cursor).toBeNull();
    expect(() =>
      broker.list({ namespace: 'other', cursor: first.cursor! })
    ).toThrow(/cursor/);
    expect(() => broker.list({ cursor: 'bad' })).toThrow(/cursor/);
    expect(() => broker.list({ limit: 101 })).toThrow(/Limit/);
    expect(() => broker.list({ limit: 0 })).toThrow(/Limit/);
  });

  it('validates before mutating and does not retain caller-owned objects', async () => {
    const { broker, dispatch } = setup();
    const params = { ...input, payload: { count: 1 } };
    broker.create(params);
    params.payload.count = 2;
    expect(() => broker.update(id, { timezone: 'Mars/Olympus' })).toThrow();
    expect(() => broker.update(id, { jitter: 0 })).toThrow();
    expect(() => broker.create({ ...input, name: 'bad/name' })).toThrow();
    expect(() =>
      broker.create({ ...input, name: 'bad', payload: 1n })
    ).toThrow();
    expect(broker.get(id).timezone).toBe('UTC');
    await broker.invoke(id);
    expect(dispatch.mock.calls[0][0].delivery).toMatchObject({
      message: { payload: { count: 1 } },
    });
    broker.update(id, { payload: false });
    await broker.invoke(id);
    expect(dispatch.mock.calls[1][0].delivery).toMatchObject({
      message: { payload: false },
    });
    broker.update(id, { payload: null, jitter: 1 });
    broker.update(id, { jitter: null });
    await broker.invoke(id);
    expect(dispatch.mock.calls[2][0].delivery).not.toHaveProperty(
      'message.payload'
    );
    expect(broker.get(id).jitter).toBeUndefined();
  });

  it('stores single-fire times at minute precision and rejects seconds', () => {
    const { broker } = setup();
    for (const at of ['2026-01-02T09:00', '2026-01-02T09:00:00']) {
      expect(
        broker.create({
          ...input,
          name: `at-${at.length}`,
          expression: { type: 'single', at },
        }).expression
      ).toEqual({ type: 'single', at: '2026-01-02T09:00:00' });
    }
    for (const at of [
      '2026-01-02T09:00:30',
      '2026-01-02T09:00Z',
      '2026-01-02',
    ]) {
      expect(() =>
        broker.create({
          ...input,
          name: 'invalid',
          expression: { type: 'single', at },
        })
      ).toThrowError(expect.objectContaining({ code: 'invalid_request' }));
    }
  });

  it('rejects changing between cron and single-fire expressions', () => {
    const { broker } = setup();
    broker.create(input);
    expect(() =>
      broker.update(id, {
        expression: { type: 'single', at: '2026-01-02T09:00' },
      })
    ).toThrowError(
      expect.objectContaining({ code: 'schedule_type_change_not_allowed' })
    );
    expect(broker.get(id).expression).toEqual(input.expression);
  });

  it('reports invalid crons and excessive jitter with the hosted error codes', () => {
    const { broker } = setup();
    expect(() =>
      broker.create({ ...input, expression: { type: 'cron', cron: 'bad' } })
    ).toThrowError(
      expect.objectContaining({ code: 'invalid_cron_expression' })
    );
    expect(() =>
      broker.create({
        ...input,
        expression: { type: 'cron', cron: '*/5 * * * *' },
        jitter: 6,
      })
    ).toThrowError(expect.objectContaining({ code: 'jitter_exceeds_cadence' }));
  });

  describe('enable until', () => {
    it('disables the schedule again when until passes', async () => {
      const { broker, dispatch } = setup();
      broker.create(input);
      broker.disable(id);
      vi.setSystemTime(START + 1);
      expect(broker.enable(id, { until: START + 2 * MINUTE + 1 })).toEqual(
        expect.objectContaining({
          state: 'active',
          activeUntil: START + 2 * MINUTE + 1,
          updatedAt: START + 1,
        })
      );
      broker.start();
      await vi.advanceTimersByTimeAsync(3 * MINUTE);
      expect(dispatch).toHaveBeenCalledTimes(2);
      const schedule = broker.get(id);
      expect(schedule.state).toBe('inactive');
      expect(schedule).not.toHaveProperty('activeUntil');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('reads an expired activation as inactive before the broker starts', () => {
      const { broker } = setup();
      broker.create(input);
      broker.disable(id);
      broker.enable(id, { until: START + MINUTE });
      vi.setSystemTime(START + MINUTE);
      expect(broker.list().data[0].state).toBe('inactive');
      expect(broker.get(id)).not.toHaveProperty('activeUntil');
    });

    it('replaces or clears an existing until, but not on an indefinitely active schedule', () => {
      const { broker } = setup();
      broker.create(input);
      expect(() => broker.enable(id, { until: START + MINUTE })).toThrowError(
        expect.objectContaining({ code: 'schedule_already_active' })
      );
      broker.disable(id);
      broker.enable(id, { until: START + MINUTE });
      expect(broker.enable(id, { until: START + 2 * MINUTE }).activeUntil).toBe(
        START + 2 * MINUTE
      );
      expect(broker.enable(id)).not.toHaveProperty('activeUntil');
      broker.disable(id);
      broker.enable(id, { until: START + MINUTE });
      expect(broker.disable(id)).not.toHaveProperty('activeUntil');
    });

    it('rejects an until that is not in the future', () => {
      const { broker } = setup();
      broker.create(input);
      broker.disable(id);
      expect(() => broker.enable(id, { until: START })).toThrowError(
        expect.objectContaining({ code: 'active_until_in_past' })
      );
      expect(broker.get(id).state).toBe('inactive');
    });
  });

  it('reconciles static snapshots atomically without overwriting dynamic schedules', async () => {
    const { broker, dispatch } = setup();
    const [original] = broker.reconcileStatic([
      { ...input, target: { type: 'function', function: 'api/job' } },
    ]);
    broker.disable(id);
    vi.setSystemTime(START + 1);
    const [updated] = broker.reconcileStatic([
      {
        ...input,
        target: { type: 'function', function: 'api/new' },
      },
    ]);
    expect(updated).toMatchObject({
      scheduleId: original.scheduleId,
      state: 'inactive',
      source: 'static',
      createdAt: START,
      updatedAt: START + 1,
    });
    await broker.invoke(id);
    expect(dispatch.mock.calls[0][0].delivery).toMatchObject({
      type: 'function',
      function: 'api/new',
    });
    const dynamic = broker.create({ ...input, name: 'dynamic' });
    expect(() =>
      broker.reconcileStatic([{ ...input, name: 'dynamic' }])
    ).toThrow(/conflicts/);
    expect(broker.get(id).scheduleId).toBe(original.scheduleId);
    expect(() =>
      broker.reconcileStatic([
        { ...input, name: 'new' },
        { ...input, name: 'invalid', jitter: 99 },
      ])
    ).toThrow();
    expect(broker.list().data).toHaveLength(2);
    broker.reconcileStatic([]);
    expect(broker.list().data).toEqual([dynamic]);
  });

  it('dispatches path targets over HTTP paths with Cron Job and CloudEvent headers', async () => {
    const { broker, dispatch } = setup();
    const [schedule] = broker.reconcileStatic([
      {
        name: 'legacy',
        expression: { type: 'cron', cron: '* * * * *' },
        target: { type: 'path', path: '/api/cron' },
      },
    ]);
    await broker.invoke({ name: 'legacy' });
    const { occurrenceId, scheduledAt } = dispatch.mock.calls[0][0];
    expect(dispatch.mock.calls[0][0].delivery).toEqual({
      type: 'path',
      path: '/api/cron',
      requestMethod: 'POST',
      headers: {
        'user-agent': 'vercel-cron/1.0',
        'x-vercel-cron-schedule': '* * * * *',
        'ce-specversion': '1.0',
        'ce-type': 'com.vercel.schedule.v1beta',
        'ce-source': '/schedule/default/legacy',
        'ce-id': occurrenceId,
        'ce-vssscheduleid': schedule.scheduleId,
        'ce-vssscheduledat': scheduledAt,
        'ce-vssschedulename': 'legacy',
        'ce-vssnamespace': 'default',
        'ce-vssschedulesource': 'static',
        'ce-vssexpression': '* * * * *',
      },
    });
  });

  it('dispatches path targets with their requestMethod', async () => {
    const { broker, dispatch } = setup();
    broker.reconcileStatic([
      {
        name: 'get',
        expression: { type: 'cron', cron: '* * * * *' },
        target: { type: 'path', path: '/api/cron', requestMethod: 'GET' },
      },
    ]);
    await broker.invoke({ name: 'get' });
    expect(dispatch.mock.calls[0][0].delivery).toMatchObject({
      type: 'path',
      path: '/api/cron',
      requestMethod: 'GET',
    });
  });

  it('rejects an invalid path target requestMethod', () => {
    const { broker } = setup();
    expect(() =>
      broker.reconcileStatic([
        {
          name: 'put',
          expression: { type: 'cron', cron: '* * * * *' },
          target: {
            type: 'path',
            path: '/api/cron',
            requestMethod: 'PUT' as 'GET',
          },
        },
      ])
    ).toThrow('Path target requestMethod must be GET or POST');
  });

  describe.each([
    { type: 'queue', topic: 'jobs' },
    { type: 'function', function: 'api/job' },
    { type: 'path', path: '/api/cron' },
  ] as const)('static $type input validation', target => {
    it.each([
      undefined,
      null,
      false,
      0,
      '',
      { hello: 'world' },
    ])('rejects authored payload %j without changing the snapshot', async payload => {
      const { broker, dispatch } = setup();
      broker.reconcileStatic([input]);
      const original = broker.get(id);
      const invalidDefinition = { ...input, target, payload };
      expect(() =>
        broker.reconcileStatic([{ ...input, name: 'new' }, invalidDefinition])
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid_request',
          message: 'Static schedule definitions cannot include a payload',
        })
      );
      expect(broker.list().data).toEqual([original]);
      await broker.invoke(id);
      expect(dispatch.mock.calls[0][0].delivery).not.toHaveProperty(
        'message.payload'
      );
    });
  });

  it('rejects updating or deleting static schedules, but enables and disables them', () => {
    const { broker } = setup();
    const [original] = broker.reconcileStatic([input]);
    for (const mutate of [
      () => broker.update(id, { payload: { stored: true } }),
      () => broker.delete(id),
    ]) {
      expect(mutate).toThrowError(
        expect.objectContaining({
          code: 'static_schedule',
          message:
            'Static schedules cannot be updated or deleted. Enable or disable them instead.',
        })
      );
    }
    expect(broker.get(id)).toEqual(original);
    expect(broker.disable(id).state).toBe('inactive');
    expect(broker.enable(id).state).toBe('active');
  });

  it('unchanged reconciliation preserves a pending jittered occurrence', async () => {
    const { broker, dispatch } = setup({ random: () => 0.5 });
    broker.reconcileStatic([{ ...input, jitter: 1 }]);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    broker.reconcileStatic([{ ...input, jitter: 1 }]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].scheduledAt).toBe(
      '2026-01-01T00:01:00.000Z'
    );
  });

  it('prevalidates without replacing resources or disturbing pending timers', async () => {
    const { broker, dispatch } = setup({ random: () => 0.5 });
    broker.reconcileStatic([{ ...input, jitter: 1 }]);
    broker.create({ ...input, name: 'dynamic' });
    broker.disable({ name: 'dynamic' });
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    const before = broker.list();
    const timers = vi.getTimerCount();
    broker.validateStatic([]);
    broker.validateStatic([{ ...input, timezone: 'America/New_York' }]);
    for (const inputs of [
      [input, input],
      [{ ...input, name: 'dynamic' }],
      [{ ...input, timezone: 'invalid/timezone' }],
      [{ ...input, expression: { type: 'cron' as const, cron: 'bad' } }],
    ]) {
      expect(() => broker.validateStatic(inputs)).toThrow();
    }
    expect(broker.list()).toEqual(before);
    expect(vi.getTimerCount()).toBe(timers);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].delivery).not.toHaveProperty(
      'message.payload'
    );
    broker.validateStatic([{ ...input, name: 'new' }]);
    broker.create({ ...input, name: 'new' });
    expect(() => broker.reconcileStatic([{ ...input, name: 'new' }])).toThrow(
      /conflicts/
    );
    expect(broker.get(id)).toEqual(before.data.find(s => s.name === 'job'));
  });
});

describe('execution and lifecycle', () => {
  it('does not start timers on import, construction, or registration', async () => {
    vi.resetModules();
    await import('../src');
    const { broker, dispatch } = setup();
    broker.create(input);
    expect(vi.getTimerCount()).toBe(0);
    broker.start();
    broker.start();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('uses bounded timers for dates beyond Node’s timeout limit, without accelerating', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const { broker, dispatch } = setup();
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-03-01T00:00:00' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      timer.mock.calls.every(
        ([, delay]) => typeof delay === 'number' && delay <= MINUTE
      )
    ).toBe(true);
    vi.setSystemTime(Date.parse('2026-02-28T23:59:00Z'));
    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    timer.mockRestore();
  });

  it('observes a forward clock jump/sleep, coalesces missed cron fires, and preserves nominal identity', async () => {
    const { broker, dispatch } = setup();
    const resource = broker.create(input);
    broker.start();
    vi.setSystemTime(START + 10 * MINUTE);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      occurrenceId: scheduleExecutionId(resource.scheduleId, START + MINUTE),
      scheduledAt: '2026-01-01T00:01:00.000Z',
    });
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0].scheduledAt).toBe(
      '2026-01-01T00:12:00.000Z'
    );
  });

  it('does not fire early or replay occurrences after a backward clock jump', async () => {
    const { broker, dispatch } = setup();
    broker.create(input);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    vi.setSystemTime(START - 2 * MINUTE);
    broker.disable(id);
    broker.enable(id);
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0].scheduledAt).toBe(
      '2026-01-01T00:02:00.000Z'
    );
  });

  it('samples nonnegative second-granularity jitter once per occurrence', async () => {
    const random = vi.fn(() => 0.5);
    const { broker, dispatch } = setup({ random });
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:01:00' },
      jitter: 15,
    });
    broker.start();
    // Up to the window's last 10 seconds: floor(0.5 * (15 * 60 - 10 + 1)).
    await vi.advanceTimersByTimeAsync(MINUTE + 444_999);
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(dispatch.mock.calls[0][0].scheduledAt).toBe(
      '2026-01-01T00:01:00.000Z'
    );
    expect(random).toHaveBeenCalledTimes(1);
  });

  it.each([
    'delete',
    'disable',
    'update',
    'close',
  ] as const)('cancels pending jitter on %s', async operation => {
    const { broker, dispatch } = setup({ random: () => 0.99 });
    broker.create({ ...input, jitter: 1 });
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    if (operation === 'close') await broker.close();
    else if (operation === 'update')
      broker.update(id, { expression: { type: 'cron', cron: '0 0 * * *' } });
    else broker[operation](id);
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('checks cancellation between timer expiry and the dispatch microtask', async () => {
    const { broker, dispatch } = setup();
    broker.create(input);
    broker.start();
    vi.advanceTimersByTime(MINUTE);
    broker.delete(id);
    broker.create(input);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('skips cron occurrences that expired while the host was asleep', async () => {
    const { broker, dispatch } = setup();
    broker.create(input);
    broker.create({
      ...input,
      name: 'monthly',
      expression: { type: 'cron', cron: '0 0 1 * *' },
    });
    broker.start();
    // One minute of jitter plus a ten-minute grace period.
    vi.setSystemTime(START + 12 * MINUTE);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).not.toHaveBeenCalled();
    // Calendar-pinned crons never expire.
    vi.setSystemTime(START + 32 * 24 * 60 * MINUTE);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch.mock.calls.map(([call]) => call.schedule.name)).toEqual([
      'monthly',
    ]);
  });

  it('permits overlaps without drifting cron cadence or delaying later occurrences', async () => {
    let finish!: () => void;
    const { broker, dispatch } = setup();
    dispatch.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    broker.create(input);
    broker.start();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0].occurrenceId).not.toBe(
      dispatch.mock.calls[1][0].occurrenceId
    );
    finish();
  });

  it('rejects changing a single-fire schedule once its time has passed', async () => {
    const { broker, dispatch } = setup();
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:01' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
    for (const mutate of [
      () => broker.disable(id),
      () => broker.update(id, { payload: { changed: true } }),
      () =>
        broker.update(id, {
          expression: { type: 'single', at: '2026-01-01T00:03' },
        }),
      () => broker.delete(id),
    ]) {
      expect(mutate).toThrowError(
        expect.objectContaining({ code: 'schedule_single_at_passed' })
      );
    }
    // Enabling an active schedule is a no-op, and manual invocation still works.
    expect(broker.enable(id).state).toBe('active');
    await broker.invoke(id);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(broker.get(id).expression).toEqual({
      type: 'single',
      at: '2026-01-01T00:01:00',
    });
  });

  it('deletes an inactive single-fire schedule after its time has passed', () => {
    const { broker } = setup();
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:01' },
    });
    broker.disable(id);
    vi.setSystemTime(START + 2 * MINUTE);
    expect(() => broker.enable(id)).toThrowError(
      expect.objectContaining({ code: 'schedule_single_at_passed' })
    );
    broker.delete(id);
    expect(broker.list().data).toEqual([]);
  });

  describe.each([
    undefined,
    1,
  ])('one-shot cancellation with jitter %s', jitter => {
    it.each([
      'reconcile',
    ] as const)('does not rearm an occurrence on same-millisecond %s', async operation => {
      const { broker, dispatch } = setup({ random: () => 0.5 });
      const definition = {
        ...input,
        expression: { type: 'single', at: '2026-01-01T00:01:00' } as const,
        jitter,
      };
      broker.reconcileStatic([definition]);
      broker.start();

      // Materialize the occurrence without running its dispatch microtask.
      // With jitter, it is still waiting for its delivery deadline instead.
      vi.advanceTimersByTime(MINUTE);
      expect(operation).toBe('reconcile');
      broker.reconcileStatic([
        { ...definition, target: { type: 'queue', topic: 'changed' } },
      ]);

      await vi.advanceTimersByTimeAsync(MINUTE);
      expect(dispatch).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('still fires a newly registered one-shot whose time equals now', async () => {
    const { broker, dispatch } = setup();
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:00:00' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].scheduledAt).toBe(
      '2026-01-01T00:00:00.000Z'
    );
  });

  it('rejects past one-shots beyond the grace period and fires ones within it', async () => {
    const { broker, dispatch } = setup();
    vi.setSystemTime(START + 15_000);
    expect(() =>
      broker.create({
        ...input,
        name: 'past',
        expression: { type: 'single', at: '2026-01-01T00:00' },
      })
    ).toThrowError(expect.objectContaining({ code: 'single_at_in_past' }));
    vi.setSystemTime(START + 14_999);
    broker.create({
      ...input,
      name: 'grace',
      expression: { type: 'single', at: '2026-01-01T00:00' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].scheduledAt).toBe(
      '2026-01-01T00:00:00.000Z'
    );
  });

  it('does not replay disabled one-shots, but catches an armed one-shot after sleep', async () => {
    const { broker, dispatch } = setup();
    broker.create({
      ...input,
      name: 'disabled',
      expression: { type: 'single', at: '2026-01-01T00:01:00' },
    });
    broker.disable({ name: 'disabled' });
    broker.create({
      ...input,
      name: 'armed',
      expression: { type: 'single', at: '2026-01-01T00:01:00' },
    });
    broker.start();
    vi.setSystemTime(START + 10 * MINUTE);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(() => broker.enable({ name: 'disabled' })).toThrow();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].schedule.name).toBe('armed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('manual fire bypasses inactive state and jitter without consuming a one-shot', async () => {
    const { broker, dispatch } = setup();
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:01:00' },
      jitter: 1,
    });
    broker.disable(id);
    await broker.invoke(id);
    await broker.invoke(id);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      invokeSource: 'manual',
      scheduledAt: '2026-01-01T00:00:00.000Z',
    });
    expect(dispatch.mock.calls[0][0].occurrenceId).toBe(
      dispatch.mock.calls[1][0].occurrenceId
    );
    broker.update(id, { jitter: null });
    broker.enable(id);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it('reports automatic failures once, propagates manual errors, and owns no retries', async () => {
    const { broker, dispatch, onError } = setup();
    const error = new Error('delivery failed');
    dispatch.mockRejectedValue(error);
    broker.create({
      ...input,
      expression: { type: 'single', at: '2026-01-01T00:01:00' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, dispatch.mock.calls[0][0]);
    await expect(broker.invoke(id)).rejects.toThrow('delivery failed');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('isolates throwing error observers without unhandled rejections or disrupting later occurrences', async () => {
    const { broker, dispatch, onError } = setup();
    const error = new Error('delivery failed');
    dispatch.mockRejectedValueOnce(error);
    onError.mockImplementation(() => {
      throw new Error('observer failed');
    });
    broker.create(input);
    broker.start();
    // Vitest fails the run if either scheduled dispatch leaks a rejection.
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      error,
      dispatch.mock.calls[0][0]
    );
    await broker.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'disable',
    'delete',
    'close',
  ] as const)('aborts in-flight work on %s', async operation => {
    const { broker, dispatch } = setup();
    dispatch.mockImplementation(
      invocation =>
        new Promise<void>(resolve => {
          invocation.signal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        })
    );
    broker.create(input);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    if (operation === 'close') await broker.close();
    else broker[operation](id);
    expect(dispatch.mock.calls[0][0].signal.aborted).toBe(true);
    await broker.close();
    expect(() => broker.start()).toThrow(/closed/);
    await expect(broker.invoke(id)).rejects.toThrow(/closed/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains dispatch promises on close; a new instance has an empty registry', async () => {
    let finish!: () => void;
    const { broker, dispatch } = setup();
    dispatch.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    broker.create(input);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    const closed = vi.fn();
    const closing = broker.close().then(closed);
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();
    finish();
    await closing;
    expect(closed).toHaveBeenCalledTimes(1);
    expect(setup().broker.list().data).toEqual([]);
  });
});

describe('dispatch contract', () => {
  it('sends the current Queue envelope with nominal time and stable occurrence ID after jitter', async () => {
    const { broker, dispatch } = setup({ random: () => 0.5 });
    const schedule = broker.create({
      ...input,
      jitter: 1,
      payload: { hello: 'world' },
    });
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE + 30_000);
    expect(dispatch.mock.calls[0][0].delivery).toEqual({
      type: 'queue',
      topic: 'jobs',
      message: {
        scheduleId: schedule.scheduleId,
        executionId: scheduleExecutionId(schedule.scheduleId, START + MINUTE),
        name: 'job',
        namespace: 'default',
        scheduledAt: '2026-01-01T00:01:00.000Z',
        expression: '* * * * *',
        source: 'dynamic',
        payload: { hello: 'world' },
      },
    });
    expect(dispatch.mock.calls[0][0].occurrenceId).toBe(
      scheduleExecutionId(schedule.scheduleId, START + MINUTE)
    );
    expect(dispatch.mock.calls[0][0].occurrenceId).not.toBe(
      scheduleExecutionId(schedule.scheduleId, Date.now())
    );
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0].occurrenceId).toBe(
      scheduleExecutionId(schedule.scheduleId, START + 2 * MINUTE)
    );
    expect(dispatch.mock.calls[1][0].occurrenceId).not.toBe(
      dispatch.mock.calls[0][0].occurrenceId
    );
  });

  it('sends bodyless function CloudEvents', async () => {
    const { broker, dispatch } = setup({ random: () => 0.5 });
    const [schedule] = broker.reconcileStatic([
      {
        ...input,
        namespace: 'tasks',
        jitter: 1,
        target: { type: 'function', function: 'api/job' },
      },
    ]);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE + 30_000);
    expect(dispatch.mock.calls[0][0].delivery).toEqual({
      type: 'function',
      function: 'api/job',
      headers: {
        'ce-specversion': '1.0',
        'ce-type': 'com.vercel.schedule.v1beta',
        'ce-source': '/schedule/tasks/job',
        'ce-id': scheduleExecutionId(schedule.scheduleId, START + MINUTE),
        'ce-vssscheduleid': schedule.scheduleId,
        'ce-vssscheduledat': '2026-01-01T00:01:00.000Z',
        'ce-vssschedulename': 'job',
        'ce-vssnamespace': 'tasks',
        'ce-vssschedulesource': 'static',
        'ce-vssexpression': '* * * * *',
      },
    });
    broker.reconcileStatic([
      {
        ...input,
        namespace: 'tasks',
        target: { type: 'function', function: 'api/job' },
      },
    ]);
    await broker.invoke({ ...id, namespace: 'tasks' });
    expect(dispatch.mock.calls[1][0].delivery).not.toHaveProperty('body');
    expect(dispatch.mock.calls[1][0].delivery).not.toHaveProperty(
      'headers.content-type'
    );
  });

  it.each([
    { type: 'queue', topic: 'jobs' },
    { type: 'function', function: 'api/job' },
  ] as const)('dispatches same-millisecond manual $type calls with the same execution ID', async target => {
    const { broker, dispatch } = setup();
    const [schedule] = broker.reconcileStatic([{ ...input, target }]);
    await Promise.all([broker.invoke(id), broker.invoke(id)]);
    expect(dispatch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(START + 1);
    await broker.invoke(id);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls[0][0].occurrenceId).toBe(
      dispatch.mock.calls[1][0].occurrenceId
    );
    expect(dispatch.mock.calls[2][0].occurrenceId).not.toBe(
      dispatch.mock.calls[0][0].occurrenceId
    );
    for (const [index, [invocation]] of dispatch.mock.calls.entries()) {
      const at = index < 2 ? START : START + 1;
      expect(invocation.occurrenceId).toBe(
        scheduleExecutionId(schedule.scheduleId, at)
      );
      expect(invocation.occurrenceId).toMatch(
        /^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/
      );
      expect(invocation.invokeSource).toBe('manual');
      const { delivery, occurrenceId } = invocation;
      if (delivery.type === 'queue') {
        expect(delivery.message.executionId).toBe(occurrenceId);
        expect(delivery.message.scheduledAt).toBe(new Date(at).toISOString());
        expect(delivery.message).not.toHaveProperty('firedAt');
      } else if (delivery.type === 'function') {
        expect(delivery.headers['ce-id']).toBe(occurrenceId);
        expect(delivery.headers['ce-vssscheduledat']).toBe(
          new Date(at).toISOString()
        );
        expect(delivery.headers).not.toHaveProperty('ce-time');
        expect(delivery.headers).not.toHaveProperty(
          'ce-vssscheduleexecutionid'
        );
      } else {
        expect(delivery.type).toBe('path');
      }
    }
  });

  it.each([
    { type: 'queue', topic: 'jobs' },
    { type: 'function', function: 'api/job' },
  ] as const)('shares scheduled and manual $type IDs at the same timestamp, including a manual retry', async target => {
    const { broker, dispatch, onError } = setup();
    const [schedule] = broker.reconcileStatic([{ ...input, target }]);
    broker.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    dispatch.mockRejectedValueOnce(new Error('delivery failed'));
    await expect(broker.invoke(id)).rejects.toThrow('delivery failed');
    await broker.invoke(id);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.map(([call]) => call.invokeSource)).toEqual([
      'scheduled',
      'manual',
      'manual',
    ]);
    for (const [invocation] of dispatch.mock.calls) {
      expect(invocation.occurrenceId).toBe(
        scheduleExecutionId(schedule.scheduleId, START + MINUTE)
      );
      if (invocation.delivery.type === 'queue') {
        expect(invocation.delivery.message.executionId).toBe(
          invocation.occurrenceId
        );
      } else {
        assert(invocation.delivery.type === 'function');
        expect(invocation.delivery.headers['ce-id']).toBe(
          invocation.occurrenceId
        );
      }
    }
  });
});
