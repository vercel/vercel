import type http from 'http';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DevManifest,
  type GetDevManifest,
  type Schedule as BOASchedule,
  type VercelJsonSchedule,
  toScheduleRecord,
} from '@vercel/build-utils';
import type {
  Schedule,
  ScheduleBroker,
} from '@vercel-internals/local-schedules';
import DevServer from '../../../../src/util/dev/server';
import type { VercelConfig } from '../../../../src/util/dev/types';
import { QueueBroker } from '../../../../src/util/dev/queue-broker';
import { directFetch } from '../../../../src/util/fetch';
import {
  importBuilders,
  type BuilderWithPkg,
} from '../../../../src/builders/import-builders';
import {
  DEV_RESOURCE_TOKEN,
  listenOnDevResourcePort,
} from '../../../../src/util/dev/resource-servers';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));
vi.mock('../../../../src/util/fetch', () => ({
  directFetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(0),
  }),
}));
vi.mock('../../../../src/builders/import-builders', () => ({
  importBuilders: vi.fn(),
}));

const START = Date.parse('2026-01-01T00:00:00Z');
const direct: BOASchedule = {
  name: 'direct',
  schedule: '* * * * *',
  function: 'api/direct',
};
const queued: BOASchedule = {
  name: 'queued',
  schedule: '* * * * *',
  topic: 'jobs',
};
const native: BOASchedule = {
  name: 'native',
  schedule: '0 * * * *',
  jitter: 2,
  timezone: 'America/New_York',
  topic: 'external-polling',
};
const manifest: DevManifest = {
  functions: [
    {
      outputPath: 'api/direct',
      invocation: { type: 'http', pathname: '/internal/direct' },
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
    },
    {
      outputPath: 'api/queued',
      invocation: { type: 'http', pathname: '/internal/queued' },
      experimentalTriggers: [
        { type: 'queue/v2beta', consumer: 'worker', topic: 'jobs' },
      ],
    },
  ],
  matchedFunctionPatterns: [],
  schedules: toScheduleRecord([native]),
};

describe('DevServer static schedule snapshots', () => {
  let cwd: string;
  let server: DevServer;
  let broker: ScheduleBroker;
  let queue: QueueBroker;
  let api: http.Server;
  let base: string;
  const hook = vi.fn<GetDevManifest>();
  const mockFetch = vi.mocked(directFetch);

  async function write(name: string, content: string) {
    await mkdir(dirname(join(cwd, name)), { recursive: true });
    await writeFile(join(cwd, name), content);
  }
  /** Writes `vercel.json` with these schedules, keyed by name. */
  async function configure(
    schedules: readonly VercelJsonSchedule[] = [direct, queued],
    rest: Partial<VercelConfig> = {}
  ) {
    await write(
      'vercel.json',
      JSON.stringify({
        framework: 'nextjs',
        schedules: toScheduleRecord(schedules),
        ...rest,
      })
    );
  }
  async function changed(name = 'vercel.json') {
    await server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, name) },
    ]);
  }
  async function call(path = '', method = 'GET', body?: unknown) {
    return fetch(`${base}/v1/schedules${path}`, {
      method,
      headers: {
        authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function createDynamic(name = 'dynamic') {
    const response = await call('', 'POST', {
      name,
      expression: { type: 'cron', cron: '0 0 * * *' },
      target: { type: 'queue', topic: 'external' },
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<Schedule>;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(START);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    cwd = await mkdtemp(join(tmpdir(), 'vc-static-schedules-'));
    await write(
      'package.json',
      JSON.stringify({ dependencies: { next: '15.3.0' } })
    );
    await write('app/api/direct/route.ts', 'export function POST() {}');
    await configure();
    hook.mockReset().mockImplementation(async () => structuredClone(manifest));
    vi.mocked(importBuilders)
      .mockReset()
      .mockImplementation(
        async specs =>
          new Map(
            [...specs].map(use => [
              use,
              {
                builder: { version: 3, build: vi.fn(), getDevManifest: hook },
              } as unknown as BuilderWithPkg,
            ])
          )
      );
    server = new DevServer(cwd, { projectSettings: { framework: 'nextjs' } });
    queue = new QueueBroker([], () => null);
    Object.assign(server, {
      _address: new URL('http://localhost:3000'),
      sidecars: [],
      queueBroker: queue,
      devProcessOrigin: 'http://localhost:4000',
      exit: vi.fn(() => {
        throw new Error('Unexpected dev exit');
      }),
    });
    broker = (server as any).scheduleBroker;
    api = (server as any).schedulesServer;
    base = (
      await listenOnDevResourcePort(api, {
        name: 'Schedules',
        flag: '--schedules-port',
        defaultPort: 4784,
        port: 0,
      })
    ).origin;
    (server as any).schedulesOrigin = base;
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    mockFetch.mockClear();
    vi.mocked(output.prettyError).mockClear();
  });

  afterEach(async () => {
    await broker.close();
    queue.stop();
    await new Promise<void>((resolve, reject) =>
      api.close(err => (err ? reject(err) : resolve()))
    );
    await rm(cwd, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('publishes authored and native BOA definitions for the next get/list/invoke request', async () => {
    await server.getVercelConfig();
    const records = (await (await call()).json()) as { data: Schedule[] };
    expect(records.data.map(s => s.name)).toEqual([
      'direct',
      'native',
      'queued',
    ]);
    expect(await (await call('/native')).json()).toMatchObject({
      name: 'native',
      source: 'static',
      namespace: 'default',
      state: 'active',
      expression: { type: 'cron', cron: '0 * * * *' },
      jitter: 2,
      timezone: 'America/New_York',
      target: { type: 'queue', topic: 'external-polling' },
    });
    expect((await call('/direct/invoke', 'POST')).status).toBe(204);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/internal/direct'
    );
    expect(mockFetch.mock.calls[0][1]?.body).toEqual(Buffer.alloc(0));
    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      'ce-type': 'com.vercel.schedule.v1beta',
      'ce-vssschedulesource': 'static',
      'ce-id': expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      'ce-vssscheduleid': broker.get({ name: 'direct' }).scheduleId,
      'ce-vssscheduledat': '2026-01-01T00:00:00.000Z',
    });
    const headers = mockFetch.mock.calls[0][1]?.headers;
    expect(headers).not.toHaveProperty('content-type');
    expect(headers).not.toHaveProperty('ce-time');
    expect(headers).not.toHaveProperty('ce-vssscheduleexecutionid');
    const enqueue = vi.spyOn(queue, 'enqueue');
    expect((await call('/native/invoke', 'POST')).status).toBe(204);
    const [topic, payload] = enqueue.mock.calls[0];
    expect(topic).toBe('external-polling');
    const message = JSON.parse(payload.toString());
    expect(message).toMatchObject({
      source: 'static',
      scheduleId: broker.get({ name: 'native' }).scheduleId,
      executionId: expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      scheduledAt: '2026-01-01T00:00:00.000Z',
    });
    expect(message).not.toHaveProperty('payload');
    expect(message).not.toHaveProperty('firedAt');
    expect(
      queue.receiveById(
        topic,
        enqueue.mock.results[0].value.messageId,
        'external'
      )
    ).not.toBeNull();
  });

  it('publishes authored and native definitions keyed by name', async () => {
    await write(
      'vercel.json',
      JSON.stringify({
        framework: 'nextjs',
        schedules: {
          'keyed-direct': { schedule: '* * * * *', function: 'api/direct' },
          'keyed-queued': { schedule: '* * * * *', topic: 'jobs' },
        },
      })
    );
    hook.mockResolvedValue({
      ...manifest,
      schedules: {
        'keyed-native': { schedule: '0 * * * *', topic: 'external-polling' },
      },
    });
    await changed();
    const records = (await (await call()).json()) as { data: Schedule[] };
    expect(records.data.map(s => s.name)).toEqual([
      'keyed-direct',
      'keyed-native',
      'keyed-queued',
    ]);
    expect(await (await call('/keyed-queued')).json()).toMatchObject({
      name: 'keyed-queued',
      source: 'static',
      target: { type: 'queue', topic: 'jobs' },
    });
  });

  it('publishes authored definitions with timezone and jitter', async () => {
    await configure([
      {
        name: 'direct',
        schedule: '*/5 * * * *',
        function: 'api/direct',
        timezone: 'America/New_York',
        jitter: 3,
      },
      { name: 'queued', schedule: '* * * * *', topic: 'jobs' },
    ]);
    await server.getVercelConfig();

    expect(await (await call('/direct')).json()).toMatchObject({
      name: 'direct',
      source: 'static',
      expression: { type: 'cron', cron: '*/5 * * * *' },
      jitter: 3,
      timezone: 'America/New_York',
      target: { type: 'function', function: 'api/direct' },
    });
    expect(await (await call('/queued')).json()).toMatchObject({
      name: 'queued',
      expression: { type: 'cron', cron: '* * * * *' },
      target: { type: 'queue', topic: 'jobs' },
    });
  });

  it.each([
    [undefined, 'POST'],
    ['GET', 'GET'],
    ['POST', 'POST'],
  ] as const)('invokes path schedules with requestMethod %s as %s', async (requestMethod, method) => {
    await configure([
      {
        name: 'cleanup',
        schedule: '* * * * *',
        path: '/api/cron',
        ...(requestMethod !== undefined && { requestMethod }),
      },
    ]);
    await server.getVercelConfig();

    expect(await (await call('/cleanup')).json()).toMatchObject({
      target: {
        type: 'path',
        path: '/api/cron',
        ...(requestMethod !== undefined && { requestMethod }),
      },
    });
    expect((await call('/cleanup/invoke', 'POST')).status).toBe(204);
    // Through vercel dev's routing, not straight to the framework dev server.
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3000/api/cron');
    expect(mockFetch.mock.calls[0][1]?.method).toBe(method);
  });

  it('automatically fires cron functions and topics through the shared dispatchers', async () => {
    await server.getVercelConfig();
    const enqueue = vi.spyOn(queue, 'enqueue');
    broker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4000/internal/direct',
      'http://localhost:4000/internal/queued',
    ]);
    const message = JSON.parse(enqueue.mock.calls[0][1].toString());
    expect(message).toMatchObject({
      name: 'queued',
      source: 'static',
      scheduleId: broker.get({ name: 'queued' }).scheduleId,
      executionId: expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      scheduledAt: '2026-01-01T00:01:00.000Z',
    });
    expect(message).not.toHaveProperty('payload');
    expect(message).not.toHaveProperty('firedAt');
    expect(mockFetch.mock.calls[0][1]?.body).toEqual(Buffer.alloc(0));
    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      'ce-id': expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      'ce-vssscheduleid': broker.get({ name: 'direct' }).scheduleId,
      'ce-vssscheduledat': '2026-01-01T00:01:00.000Z',
    });
    expect(mockFetch.mock.calls[0][1]?.headers).not.toHaveProperty('ce-time');
    expect(mockFetch.mock.calls[0][1]?.headers).not.toHaveProperty(
      'ce-vssscheduleexecutionid'
    );
    expect(mockFetch.mock.calls[1][1]?.headers).toMatchObject({
      'ce-vqsconsumergroup': 'worker',
    });
    broker.disable({ name: 'direct' });
    await changed('app/api/direct/route.ts');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      mockFetch.mock.calls.filter(
        ([url]) => url === 'http://localhost:4000/internal/direct'
      )
    ).toHaveLength(1);
  });

  it('rejects API updates and deletes of static schedules, like the hosted API', async () => {
    await server.getVercelConfig();
    for (const [path, method, body] of [
      ['/direct', 'PATCH', { payload: { key: true } }],
      ['/queued', 'PATCH', { payload: { key: true } }],
      ['/queued', 'DELETE', undefined],
    ] as const) {
      const response = await call(path, method, body);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'static_schedule' },
      });
    }
    const enqueue = vi.spyOn(queue, 'enqueue');
    await call('/direct/invoke', 'POST');
    expect(mockFetch.mock.calls[0][1]?.body).toEqual(Buffer.alloc(0));
    expect(mockFetch.mock.calls[0][1]?.headers).not.toHaveProperty(
      'content-type'
    );
    await call('/queued/invoke', 'POST');
    const message = JSON.parse(enqueue.mock.calls[0][1].toString());
    expect(message).not.toHaveProperty('payload');
  });

  it.each([
    direct,
    queued,
    native,
  ])('rejects configured payloads for $name without replacing the accepted snapshot', async definition => {
    await server.getVercelConfig();
    const before = broker.list();
    for (const payload of [null, false, 0, 'text', [], { nested: true }]) {
      const invalid = { ...definition, payload };
      if (definition === native) {
        hook.mockResolvedValue({
          ...manifest,
          schedules: toScheduleRecord([invalid]),
        });
      } else {
        await configure([invalid]);
      }
      await expect(changed()).rejects.toThrow(/payload/);
      expect(server.exit).not.toHaveBeenCalled();
      expect(broker.list()).toEqual(before);
    }
    hook.mockResolvedValue(manifest);
    await configure();
    await changed();
    expect(broker.list()).toEqual(before);
  });

  it('schedules native function metadata without a directory or URL convention', async () => {
    await configure([]);
    hook.mockResolvedValue({
      ...manifest,
      functions: [{ ...manifest.functions[0], outputPath: 'arbitrary/task' }],
      schedules: toScheduleRecord([{ ...direct, function: 'arbitrary/task' }]),
    });
    await server.getVercelConfig();
    expect(broker.get({ name: 'direct' }).source).toBe('static');
    expect((await call('/direct/invoke', 'POST')).status).toBe(204);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/internal/direct'
    );
  });

  it.each([
    ['without', {}],
    // Framework runtime builds are dropped when a dev command runs.
    ['with', { devCommand: 'node server.js' }],
  ])('plans a Python schedule entrypoint into the function vercel build produces %s a dev command', async (_, overrides) => {
    const outputPath = '_vercel/schedules/jobs/tick';
    const functions = { 'jobs/tick.py': { maxDuration: 180 } };
    await write('jobs/tick.py', 'print("tick")');
    await configure(
      [{ name: 'tick', schedule: '* * * * *', entrypoint: 'jobs/tick.py' }],
      { framework: null, functions, ...overrides }
    );
    hook.mockResolvedValue({ functions: [], matchedFunctionPatterns: [] });
    const config = await server.getVercelConfig();

    const scheduleFunction = {
      outputPath,
      entrypoints: [
        {
          entrypoint: 'jobs/tick.py',
          sourceFile: 'jobs/tick.py',
          scheduleNames: ['tick'],
        },
      ],
    };
    expect(config.builds).toContainEqual({
      src: 'jobs/tick.py',
      use: '@vercel/python',
      config: { zeroConfig: true, functions, scheduleFunction },
    });
    // The builder only builds the planned function; the CLI registers it.
    expect(hook).not.toHaveBeenCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({ use: '@vercel/python' }),
      })
    );
    expect(server.getDevFunction(outputPath)).toMatchObject({
      outputPath,
      sourceFile: 'jobs/tick.py',
      invocation: { type: 'entrypoint', entrypoint: 'jobs/tick.py' },
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
      scope: { target: 'builder', build: { config: { scheduleFunction } } },
    });
    expect(broker.get({ name: 'tick' })).toMatchObject({
      source: 'static',
      target: { type: 'function', function: outputPath },
    });
  });

  it.each([
    ['jobs/nightly.ts', 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME'],
    ['jobs.nightly:run', 'INVALID_SCHEDULE_ENTRYPOINT'],
    ['jobs/nightly.py', 'SCHEDULE_ENTRYPOINT_RUNTIME_MISMATCH'],
  ])('rejects authored entrypoint %s at startup with the build error %s', async (entrypoint, code) => {
    await write('jobs/nightly.py', 'print("nightly")');
    await configure([{ name: 'direct', schedule: '* * * * *', entrypoint }]);
    await expect(server.getVercelConfig()).rejects.toMatchObject({
      code,
      message: expect.stringContaining(`Schedule "direct"`),
    });
    expect(broker.list().data).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    'authored',
    'native BOA',
  ])('rejects an unresolved %s entrypoint without replacing the accepted snapshot', async source => {
    await server.getVercelConfig();
    const before = broker.list();
    const original = server.getDevFunction('api/direct');
    const entrypoint = 'app/api/direct/route.ts';
    const updated = structuredClone(manifest);
    if (source === 'native BOA') {
      updated.schedules = {
        native: {
          schedule: '0 * * * *',
          // @ts-expect-error Native BOA cannot contain authored entrypoints.
          entrypoint,
        },
      };
    } else {
      await configure([{ name: 'direct', schedule: '* * * * *', entrypoint }]);
    }
    hook.mockResolvedValue(updated);
    await expect(changed()).rejects.toMatchObject({
      code:
        source === 'native BOA'
          ? 'DEV_SCHEDULE_MANIFEST_ENTRYPOINT'
          : 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME',
      message: expect.stringMatching(
        source === 'native BOA'
          ? /getDevManifest.*function or topic/
          : /Schedule "direct" entrypoint "app\/api\/direct\/route\.ts"/
      ),
    });
    expect(broker.list()).toEqual(before);
    expect(server.getDevFunction('api/direct')).toBe(original);
    expect(server.exit).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    hook.mockResolvedValue(manifest);
    await configure();
    await changed();
    expect(broker.list()).toEqual(before);
  });

  it('compiles authored TypeScript, preserves the last valid snapshot on errors, and handles deletion and restore', async () => {
    // The compiler forks a real Node process and has its own timeout.
    await rm(join(cwd, 'vercel.json'));
    const source = `export default ${JSON.stringify({ framework: 'nextjs', schedules: toScheduleRecord([direct]) })};`;
    await write('vercel.ts', source);
    await server.getVercelConfig();
    const record = broker.get({ name: 'direct' });
    await write('vercel.ts', 'export default { schedules: {');
    await expect(changed('vercel.ts')).rejects.toThrow(/compile/);
    expect(broker.get({ name: 'direct' })).toEqual(record);
    expect(server.exit).not.toHaveBeenCalled();
    await rm(join(cwd, 'vercel.ts'));
    await changed('vercel.ts');
    expect(broker.list().data.map(s => s.name)).toEqual(['native']);
    await write('vercel.ts', source);
    await changed('vercel.ts');
    expect(broker.get({ name: 'direct' }).source).toBe('static');
    // Switching source formats must not select stale .vercel/vercel.json.
    await rm(join(cwd, 'vercel.ts'));
    await configure([queued]);
    await changed();
    expect(broker.list().data.map(s => s.name)).toEqual(['native', 'queued']);
    await rm(join(cwd, 'vercel.json'));
    await changed();
    expect(broker.list().data.map(s => s.name)).toEqual(['native']);
    const restarted = new DevServer(cwd, {
      projectSettings: { framework: 'nextjs' },
    });
    Object.assign(restarted, { _address: new URL('http://localhost:3000') });
    try {
      await restarted.getVercelConfig();
      expect(
        (restarted as any).scheduleBroker
          .list()
          .data.map((s: Schedule) => s.name)
      ).toEqual(['native']);
    } finally {
      await restarted.stop();
    }
  });

  it.each([
    true,
    false,
  ])('retains standalone function targets on source removal (another API function: %s)', async anotherFunction => {
    vi.mocked(importBuilders).mockImplementation(
      async specs =>
        new Map(
          [...specs].map(use => [
            use,
            {
              builder: { version: 3, build: vi.fn() },
            } as unknown as BuilderWithPkg,
          ])
        )
    );
    await write('package.json', '{}');
    await rm(join(cwd, 'app'), { recursive: true });
    await write('api/direct.ts', 'export default function handler() {}');
    if (anotherFunction)
      await write('api/status.ts', 'export default function handler() {}');
    await configure([direct], {
      framework: null,
      functions: {
        'api/direct.ts': {
          experimentalTriggers: [{ type: 'schedule/v1beta' }],
        },
      },
    });
    await server.getVercelConfig();
    const record = broker.get({ name: 'direct' });
    const fn = server.getDevFunction('api/direct');
    const settings = (server as any).projectSettings;
    const env = server.envConfigs;
    await rm(join(cwd, 'api/direct.ts'));
    await expect(
      server.handleFilesystemEvents([
        { type: 'unlink', path: join(cwd, 'api/direct.ts') },
      ])
    ).rejects.toMatchObject(
      anotherFunction
        ? { name: 'DEV_SCHEDULE_FUNCTION_MISSING' }
        : { code: 'missing_build_script' }
    );
    expect(server.exit).not.toHaveBeenCalled();
    expect(broker.get({ name: 'direct' })).toEqual(record);
    expect(server.getDevFunction('api/direct')).toBe(fn);
    expect((server as any).projectSettings).toBe(settings);
    expect(server.envConfigs).toBe(env);
    expect(await (await call('/direct')).json()).toEqual(record);
    expect(
      ((await (await call()).json()) as { data: Schedule[] }).data
    ).toEqual([record]);
    const dynamic = await createDynamic();
    expect((await call('/dynamic/invoke', 'POST')).status).toBe(204);
    await write('api/direct.ts', 'export default function handler() {}');
    await changed('api/direct.ts');
    expect(broker.get({ name: 'direct' })).toEqual(record);
    expect(broker.get({ name: 'dynamic' })).toEqual(dynamic);
  });

  it('still fails fast for startup detector errors before any config is accepted', async () => {
    await write('package.json', '{}');
    await rm(join(cwd, 'app'), { recursive: true });
    await configure([direct], {
      framework: null,
      functions: {
        'api/direct.ts': {
          experimentalTriggers: [{ type: 'schedule/v1beta' }],
        },
      },
    });
    const report = vi
      .spyOn(server as any, 'reportError')
      .mockImplementation(() => {});
    await expect(server.getVercelConfig()).rejects.toThrow(
      'Unexpected dev exit'
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'missing_build_script' })
    );
    expect(server.exit).toHaveBeenCalledOnce();
    expect(broker.list().data).toEqual([]);
  });

  it('fails invalid startup config instead of accepting an empty static snapshot', async () => {
    await configure([{ ...direct, extra: true } as unknown as BOASchedule]);
    await expect(server.getVercelConfig()).rejects.toThrow(
      'Unexpected dev exit'
    );
    expect(server.exit).toHaveBeenCalledWith(1);
    expect(broker.list().data).toEqual([]);
  });

  it('preserves disabled state and IDs across unchanged and changed source snapshots', async () => {
    await server.getVercelConfig();
    const original = broker.get({ name: 'queued' });
    await call('/queued/disable', 'POST');
    const validate = vi.spyOn(broker, 'validateStatic');
    const prepare = vi.spyOn(broker as any, 'prepareStatic');
    const reconcile = vi.spyOn(broker, 'reconcileStatic');
    await server.getVercelConfig();
    await write('provider.config.mjs', 'export default {}');
    await changed('provider.config.mjs');
    await configure([queued, direct], { env: { UNRELATED: 'changed' } });
    await changed();
    expect(validate).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(broker.get({ name: 'queued' })).toMatchObject({
      scheduleId: original.scheduleId,
      state: 'inactive',
    });
    const enqueue = vi.spyOn(queue, 'enqueue');
    await configure([{ ...direct, schedule: '0 * * * *' }, queued]);
    await changed();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(broker.get({ name: 'queued' })).toMatchObject({
      scheduleId: original.scheduleId,
      state: 'inactive',
    });
    await configure([
      direct,
      { ...queued, timezone: 'America/New_York', topic: 'updated' },
    ]);
    await changed();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(broker.get({ name: 'queued' })).toMatchObject({
      scheduleId: original.scheduleId,
      state: 'inactive',
      timezone: 'America/New_York',
      target: { type: 'queue', topic: 'updated' },
    });
    await call('/queued/invoke', 'POST');
    expect(enqueue.mock.calls.at(-1)![0]).toBe('updated');
  });

  it('does not disturb unchanged pending jitter timers when a different definition changes', async () => {
    const jittered = {
      ...direct,
      jitter: 1,
    };
    await configure([jittered]);
    await server.getVercelConfig();
    broker.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await configure([jittered, { ...queued, schedule: '0 * * * *' }]);
    await changed();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      'ce-vssscheduledat': '2026-01-01T00:01:00.000Z',
    });
    expect(mockFetch.mock.calls[0][1]?.headers).not.toHaveProperty('ce-time');
    expect(mockFetch.mock.calls[0][1]?.headers).not.toHaveProperty(
      'ce-vssscheduleexecutionid'
    );
  });

  it.each([
    'empty',
    'removed property',
    'deleted config',
  ])('removes only static schedules for %s and restores them', async removal => {
    await server.getVercelConfig();
    const dynamic = await createDynamic();
    hook.mockResolvedValue({ ...manifest, schedules: {} });
    if (removal === 'empty') await configure([]);
    else if (removal === 'removed property')
      await write('vercel.json', '{"framework":"nextjs"}');
    else await rm(join(cwd, 'vercel.json'));
    await changed();
    expect(broker.list().data).toEqual([dynamic]);
    await configure();
    hook.mockResolvedValue(manifest);
    await changed();
    expect(broker.list().data).toHaveLength(4);
    expect(broker.get({ name: 'dynamic' })).toEqual(dynamic);
  });

  it.each([
    'malformed JSON',
    'authored schema',
    'native schema',
    'bad cron',
    'bad timezone',
    'missing function',
    'wrong trigger',
    'mixed triggers',
    'duplicate sources',
    'dynamic collision',
    'combined limit',
  ])('rejects %s without replacing settings, registries, or live timers, then recovers', async failure => {
    await server.getVercelConfig();
    const dynamic = await createDynamic();
    broker.start();
    const before = broker.list();
    const settings = (server as any).projectSettings;
    const env = server.envConfigs;
    const fn = server.getDevFunction('api/direct');
    const subscriptions = vi.spyOn(queue, 'setFunctionSubscriptions');
    const restart = vi
      .spyOn(server, 'runDevCommand')
      .mockResolvedValue(undefined);
    (server as any).initialDevCommandStarted = true;
    let schedules: BOASchedule[] = [direct, queued];
    if (failure === 'bad cron')
      schedules = [{ ...direct, schedule: 'not cron' }];
    if (failure === 'bad timezone')
      schedules = [{ ...direct, timezone: 'Mars/Olympus' }];
    if (failure === 'missing function')
      schedules = [{ ...direct, function: '/internal/direct' }];
    if (failure === 'authored schema')
      schedules = [{ ...direct, extra: true } as unknown as BOASchedule];
    if (failure === 'native schema')
      hook.mockResolvedValue({
        ...manifest,
        schedules: toScheduleRecord([
          { ...native, schedule: '* * * * *', jitter: 0 },
        ]),
      });
    if (failure === 'wrong trigger' || failure === 'mixed triggers')
      hook.mockResolvedValue({
        ...manifest,
        functions: [
          {
            ...manifest.functions[0],
            experimentalTriggers:
              failure === 'wrong trigger'
                ? []
                : [{ type: 'schedule/v1beta' }, { type: 'schedule/v1beta' }],
          },
        ],
      });
    if (failure === 'duplicate sources') schedules = [direct, native];
    if (failure === 'dynamic collision')
      schedules = [direct, { ...queued, name: 'dynamic' }];
    if (failure === 'combined limit')
      schedules = Array.from({ length: 100 }, (_, i) => ({
        ...queued,
        name: `job-${i}`,
      }));
    await configure(schedules, {
      devCommand: 'different-command',
      env: { CHANGED: 'yes' },
    });
    if (failure === 'malformed JSON')
      await write('vercel.json', '{ "schedules": [');
    await expect(changed()).rejects.toThrow();
    expect(server.exit).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(subscriptions).not.toHaveBeenCalled();
    expect(broker.list()).toEqual(before);
    expect((server as any).projectSettings).toBe(settings);
    expect(server.envConfigs).toBe(env);
    expect(server.getDevFunction('api/direct')).toBe(fn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch.mock.calls.map(([url]) => url)).toContain(
      'http://localhost:4000/internal/direct'
    );
    expect(broker.get({ name: 'dynamic' })).toEqual(dynamic);
    hook.mockResolvedValue(manifest);
    await configure();
    await changed();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('reports malformed watcher reloads without stopping dev', async () => {
    await server.getVercelConfig();
    await write('vercel.json', '{');
    server.enqueueFsEvent('change', join(cwd, 'vercel.json'));
    await vi.waitFor(() => expect(output.prettyError).toHaveBeenCalledOnce());
    expect(server.exit).not.toHaveBeenCalled();
    expect(broker.list().data).toHaveLength(3);
    await configure();
    await changed();
  });

  it('revalidates an unchanged definition when the function mapping disappears', async () => {
    await server.getVercelConfig();
    const original = server.getDevFunction('api/direct');
    hook.mockResolvedValue({ ...manifest, functions: [] });
    await expect(changed()).rejects.toMatchObject({
      name: 'DEV_SCHEDULE_FUNCTION_MISSING',
    });
    expect(server.getDevFunction('api/direct')).toBe(original);
    expect(broker.list().data).toHaveLength(3);
  });

  it('diagnoses unsupported framework discovery instead of guessing an invocation URL', async () => {
    vi.mocked(importBuilders).mockImplementation(
      async specs =>
        new Map(
          [...specs].map(use => [
            use,
            {
              builder: { version: 3, build: vi.fn() },
            } as unknown as BuilderWithPkg,
          ])
        )
    );
    await expect(server.getVercelConfig()).rejects.toMatchObject({
      name: 'DEV_SCHEDULE_FUNCTION_MISSING',
      message: expect.stringContaining('api/direct'),
      fix: expect.stringContaining('getDevManifest'),
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(broker.list().data).toEqual([]);
  });

  it('keeps the accepted snapshot visible until asynchronous discovery completes', async () => {
    await server.getVercelConfig();
    let release!: (value: DevManifest) => void;
    hook.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    await configure([{ ...queued, name: 'new' }]);
    const refresh = changed();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(
      ((await (await call()).json()) as { data: Schedule[] }).data.map(
        s => s.name
      )
    ).toEqual(['direct', 'native', 'queued']);
    release({ ...manifest, schedules: {} });
    await refresh;
    expect(
      ((await (await call()).json()) as { data: Schedule[] }).data.map(
        s => s.name
      )
    ).toEqual(['new']);
  });

  it.each([
    false,
    true,
  ])('discards superseded asynchronous discovery (stale failure: %s)', async failure => {
    await server.getVercelConfig();
    let release!: (value: DevManifest) => void;
    let reject!: (error: Error) => void;
    hook.mockImplementationOnce(
      () =>
        new Promise((resolve, fail) => {
          release = resolve;
          reject = fail;
        })
    );
    await configure([{ ...queued, name: 'stale' }]);
    const first = changed();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await configure([{ ...queued, name: 'fresh' }]);
    const second = changed();
    await vi.waitFor(() => expect((server as any).configGeneration).toBe(2));
    if (failure) reject(new Error('superseded provider'));
    else release({ ...manifest, schedules: {} });
    await Promise.all([first, second]);
    expect(broker.list().data.map(s => s.name)).toEqual(['fresh', 'native']);
  });

  it.each([
    'schedule',
    'queue',
    'stale',
  ])('rechecks %s changes arriving during the async restart before publication', async during => {
    await server.getVercelConfig();
    const original = broker.get({ name: 'direct' });
    const settings = (server as any).projectSettings;
    const env = server.envConfigs;
    const fn = server.getDevFunction('api/direct');
    (server as any).initialDevCommandStarted = true;
    let release!: () => void;
    const restart = vi
      .spyOn(server, 'runDevCommand')
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          })
      )
      .mockResolvedValue(undefined);
    const register = vi.spyOn(queue, 'setFunctionSubscriptions');
    if (during === 'queue') {
      hook.mockResolvedValue({
        ...manifest,
        functions: [
          manifest.functions[0],
          {
            ...manifest.functions[1],
            experimentalTriggers: [
              { type: 'queue/v2beta', consumer: 'new-worker', topic: 'jobs' },
            ],
          },
        ],
      });
    }
    await configure([{ ...queued, name: 'new' }], {
      devCommand: 'changed-command',
    });
    const refresh = changed();
    const result =
      during === 'stale'
        ? undefined
        : expect(refresh).rejects.toThrow(
            /conflicts|configured more than once/
          );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((server as any).projectSettings).toBe(settings);
    if (during === 'schedule') await createDynamic('new');
    if (during === 'queue')
      queue.updateServiceSubscriptions('external', [
        { consumer: 'new-worker', topic: 'jobs' },
      ]);
    let next: Promise<void> | undefined;
    if (during === 'stale') {
      await configure([direct]);
      next = changed();
      await vi.waitFor(() => expect((server as any).configGeneration).toBe(2));
    }
    release();
    if (next) {
      await Promise.all([refresh, next]);
      expect(restart).toHaveBeenCalledTimes(2);
      expect(broker.list().data.map(s => s.name)).toEqual(['direct', 'native']);
      expect(register).toHaveBeenCalledOnce();
    } else {
      await result;
      expect(register).not.toHaveBeenCalled();
      expect((server as any).projectSettings).toBe(settings);
      expect(server.envConfigs).toBe(env);
      expect(server.getDevFunction('api/direct')).toBe(fn);
      expect(broker.get({ name: 'direct' })).toEqual(original);
    }
  });
});
