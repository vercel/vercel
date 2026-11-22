import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import getPort from 'get-port';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  spawnCommand,
  type DevManifest,
  type GetDevManifest,
  type ScheduleDefinition,
} from '@vercel/build-utils';
import type { ScheduleBroker } from '@vercel-internals/local-schedules';
import DevServer from '../../../../src/util/dev/server';
import { QueueBroker } from '../../../../src/util/dev/queue-broker';
import { checkForPort } from '../../../../src/util/dev/port-utils';
import { treeKill } from '../../../../src/util/tree-kill';
import { directFetch } from '../../../../src/util/fetch';
import {
  importBuilders,
  type BuilderWithPkg,
} from '../../../../src/builders/import-builders';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    print: vi.fn(),
    ready: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));
vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  spawnCommand: vi.fn(),
}));
vi.mock('get-port', () => ({ default: vi.fn() }));
vi.mock('../../../../src/util/tree-kill', () => ({ treeKill: vi.fn() }));
vi.mock('../../../../src/util/dev/port-utils', () => ({
  checkForPort: vi.fn(),
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

const schedule: ScheduleDefinition = {
  schedule: '* * * * *',
  function: 'api/task',
};
const manifest: DevManifest = {
  functions: [
    {
      outputPath: 'api/task',
      invocation: { type: 'http', pathname: '/accepted/task' },
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
    },
    {
      outputPath: 'api/worker',
      invocation: { type: 'http', pathname: '/accepted/worker' },
      experimentalTriggers: [
        { type: 'queue/v2beta', consumer: 'accepted-worker', topic: 'jobs' },
      ],
    },
  ],
  matchedFunctionPatterns: [],
};

describe('DevServer Development Command rollback', () => {
  let cwd: string;
  let server: DevServer;
  let queue: QueueBroker;
  let schedules: ScheduleBroker;
  const hook = vi.fn<GetDevManifest>();
  const children: (EventEmitter & {
    pid?: number;
    alive: boolean;
    stdout: PassThrough;
    stderr: PassThrough;
  })[] = [];

  async function configure(command = 'accepted-command', version = 'accepted') {
    await writeFile(
      join(cwd, 'vercel.json'),
      JSON.stringify({
        framework: 'nextjs',
        devCommand: command,
        env: { VERSION: version },
        schedules: { [version]: schedule },
      })
    );
  }

  function changed() {
    return server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, 'vercel.json') },
    ]);
  }

  beforeEach(async () => {
    children.length = 0;
    let port = 4000;
    vi.mocked(getPort)
      .mockReset()
      .mockImplementation(async () => ++port);
    vi.mocked(checkForPort).mockReset().mockResolvedValue('127.0.0.1');
    vi.mocked(spawnCommand)
      .mockReset()
      .mockImplementation(() => {
        const child = Object.assign(new EventEmitter(), {
          pid: 10000 + children.length,
          alive: true,
          stdout: new PassThrough(),
          stderr: new PassThrough(),
        });
        children.push(child);
        return child as unknown as ChildProcess;
      });
    vi.mocked(treeKill)
      .mockReset()
      .mockImplementation(async pid => {
        const child = children.find(child => child.pid === pid)!;
        child.alive = false;
        child.emit('exit', null, 'SIGTERM');
        // close may arrive after the replacement child is already ready.
      });
    hook.mockReset().mockResolvedValue(manifest);
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
    cwd = await mkdtemp(join(tmpdir(), 'vc-dev-command-rollback-'));
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ dependencies: { next: '15.3.0' } })
    );
    await mkdir(join(cwd, 'app/api/task'), { recursive: true });
    await writeFile(
      join(cwd, 'app/api/task/route.ts'),
      'export function POST() {}'
    );
    await configure();
    server = new DevServer(cwd, {});
    queue = new QueueBroker([], () => null);
    Object.assign(server, {
      _address: new URL('http://localhost:3000'),
      sidecars: [],
      queueBroker: queue,
      exit: vi.fn(() => {
        throw new Error('Unexpected dev exit');
      }),
    });
    schedules = (server as any).scheduleBroker;
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    await server.getVercelConfig();
    await server.runDevCommand();
    (server as any).initialDevCommandStarted = true;
    vi.mocked(directFetch).mockClear();
  });

  afterEach(async () => {
    await server.stop();
    for (const child of children) {
      child.stderr.unpipe(process.stderr);
      child.stdout.destroy();
      child.stderr.destroy();
    }
    await rm(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each([
    'schedule conflict',
    'queue conflict',
    'readiness failure',
    'spawn failure',
    'spawn error without pid',
    'kill failure',
    'superseded',
    'environment-only restart',
  ])('restores the accepted runtime after %s without dispatching to the candidate', async failure => {
    const settings = (server as any).projectSettings;
    const env = server.envConfigs;
    const runtimeEnv = (server as any).devCommandEnv;
    const fn = server.getDevFunction('api/task');
    const record = schedules.get({ name: 'accepted' });
    const invoke = server.resolveDevFunction('api/task')!;
    const register = vi.spyOn(queue, 'setFunctionSubscriptions');
    const reconcile = vi.spyOn(schedules, 'reconcileStatic');
    hook.mockResolvedValue({
      ...manifest,
      functions: manifest.functions.map(fn => ({
        ...fn,
        invocation: { type: 'http', pathname: `/candidate/${fn.outputPath}` },
        ...(fn.outputPath === 'api/worker'
          ? {
              experimentalTriggers: [
                {
                  type: 'queue/v2beta',
                  consumer: 'candidate-worker',
                  topic: 'jobs',
                },
              ],
            }
          : {}),
      })),
    });
    await configure(
      failure === 'environment-only restart' || failure === 'kill failure'
        ? 'accepted-command'
        : 'candidate-command',
      'candidate'
    );
    let release!: () => void;
    vi.mocked(checkForPort).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          release = () => {
            if (failure === 'readiness failure')
              reject(new Error('port timeout'));
            else if (failure === 'spawn error without pid') {
              children[1].pid = undefined;
              children[1].alive = false;
              children[1].emit('error', new Error('spawn failed'));
            } else resolve('127.0.0.1');
          };
        })
    );
    if (failure === 'spawn failure' || failure === 'kill failure') {
      if (failure === 'spawn failure') {
        vi.mocked(spawnCommand).mockImplementationOnce(() => {
          throw new Error('spawn failed');
        });
      } else {
        vi.mocked(treeKill).mockRejectedValueOnce(new Error('kill failed'));
      }
      vi.mocked(checkForPort).mockReset().mockResolvedValue('127.0.0.1');
    }
    const refresh = changed();
    const rejected = expect(refresh).rejects.toThrow(
      /conflicts|configured more than once|port timeout|spawn failed|kill failed|JSON/
    );
    let next: Promise<void> | undefined;
    let nextRejected: Promise<unknown> | undefined;
    if (failure !== 'spawn failure' && failure !== 'kill failure') {
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      expect(children.map(child => child.alive)).toEqual([false, true]);
      expect((server as any).devProcess).toBe(children[1]);
      expect((server as any).devCommandEnv.VERSION).toBe('candidate');
      expect((server as any).devProcessOrigin).toBeUndefined();
      expect(server.resolveDevFunction('api/task')).toBeNull();
      expect(
        await invoke({ method: 'POST', headers: {}, body: Buffer.from('{}') })
      ).toBeNull();
      expect(directFetch).not.toHaveBeenCalled();
      if (
        failure === 'schedule conflict' ||
        failure === 'environment-only restart'
      ) {
        schedules.create({
          name: 'candidate',
          expression: { type: 'cron', cron: '0 * * * *' },
          target: { type: 'queue', topic: 'external' },
        });
      }
      if (failure === 'queue conflict') {
        queue.updateServiceSubscriptions('external', [
          { consumer: 'candidate-worker', topic: 'jobs' },
        ]);
      }
      if (failure === 'superseded') {
        await writeFile(join(cwd, 'vercel.json'), '{');
        next = changed();
        nextRejected = expect(next).rejects.toThrow();
        await vi.waitFor(() =>
          expect((server as any).configGeneration).toBe(2)
        );
      }
      release();
    }
    await Promise.all([rejected, nextRejected]);

    const restored = children.at(-1)!;
    expect(restored).not.toBe(children[0]);
    expect(children.filter(child => child.alive)).toEqual([restored]);
    expect((server as any).devProcess).toBe(restored);
    expect((server as any).currentDevCommand).toBe('accepted-command');
    expect((server as any).devCommandEnv).toEqual(runtimeEnv);
    const [command, options] = vi.mocked(spawnCommand).mock.calls.at(-1)!;
    expect(command).toBe('accepted-command');
    expect(options?.env).toMatchObject({ VERSION: 'accepted' });
    const origin = `http://127.0.0.1:${options!.env!.PORT}`;
    expect((server as any).devProcessOrigin).toBe(origin);
    expect((server as any).projectSettings).toBe(settings);
    expect(server.envConfigs).toBe(env);
    expect(server.getDevFunction('api/task')).toBe(fn);
    expect(schedules.get({ name: 'accepted' })).toEqual(record);
    expect(register).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(server.exit).not.toHaveBeenCalled();

    for (const child of children.slice(0, -1)) child.emit('close', 0, null);
    expect((server as any).devProcessOrigin).toBe(origin);
    await schedules.invoke({ name: 'accepted' });
    queue.enqueue('jobs', Buffer.from('{}'), 'application/json');
    expect(vi.mocked(directFetch).mock.calls.map(([url]) => url)).toEqual([
      `${origin}/accepted/task`,
      `${origin}/accepted/worker`,
    ]);

    hook.mockResolvedValue(manifest);
    await configure();
    const spawns = vi.mocked(spawnCommand).mock.calls.length;
    await changed();
    expect(spawnCommand).toHaveBeenCalledTimes(spawns);
    expect((server as any).devProcess).toBe(restored);
  });

  it.each([
    'spawn',
    'readiness',
  ])('retries the accepted command after an overlapping edit and failed rollback %s', async failure => {
    const runtimeEnv = (server as any).devCommandEnv;
    const record = schedules.get({ name: 'accepted' });
    let release!: () => void;
    vi.mocked(checkForPort).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve('127.0.0.1');
        })
    );
    await configure('candidate-command', 'candidate');
    const candidate = changed();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await configure();
    const accepted = changed();
    await vi.waitFor(() => {
      expect((server as any).configGeneration).toBe(2);
      expect((server as any).functionReconciliations).toBe(2);
    });
    if (failure === 'spawn') {
      vi.mocked(spawnCommand).mockImplementationOnce(() => {
        throw new Error('rollback spawn failed');
      });
    } else {
      vi.mocked(checkForPort).mockRejectedValueOnce(
        new Error('rollback readiness failed')
      );
    }
    release();
    await Promise.all([candidate, accepted]);

    expect(
      vi.mocked(spawnCommand).mock.calls.map(([command]) => command)
    ).toEqual([
      'accepted-command',
      'candidate-command',
      'accepted-command',
      'accepted-command',
    ]);
    const restored = children.at(-1)!;
    expect(children.filter(child => child.alive)).toEqual([restored]);
    expect((server as any).devProcess).toBe(restored);
    expect((server as any).currentDevCommand).toBe('accepted-command');
    expect((server as any).devCommandEnv).toEqual(runtimeEnv);
    expect(vi.mocked(spawnCommand).mock.calls.at(-1)![1]?.env).toMatchObject(
      runtimeEnv
    );
    expect((server as any).devProcessOrigin).toBe('http://127.0.0.1:4004');
    expect((server as any).functionReconciliations).toBe(0);
    expect(schedules.get({ name: 'accepted' })).toEqual(record);
    expect(directFetch).not.toHaveBeenCalled();
    await schedules.invoke({ name: 'accepted' });
    queue.enqueue('jobs', Buffer.from('{}'), 'application/json');
    expect(vi.mocked(directFetch).mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:4004/accepted/task',
      'http://127.0.0.1:4004/accepted/worker',
    ]);
    await server.getVercelConfig();
    expect(spawnCommand).toHaveBeenCalledTimes(4);
  });

  it.each([
    'candidate port allocation',
    'candidate readiness',
    'restoration port allocation',
    'restoration readiness',
  ])('does not leave a runtime behind when stopped during %s', async phase => {
    const settings = (server as any).projectSettings;
    const env = server.envConfigs;
    const fn = server.getDevFunction('api/task');
    const register = vi.spyOn(queue, 'setFunctionSubscriptions');
    const reconcile = vi.spyOn(schedules, 'reconcileStatic');
    const stopQueue = vi.spyOn(queue, 'stop');
    let release!: () => void;
    let rejectCandidate!: (error: Error) => void;
    if (phase.startsWith('restoration')) {
      vi.mocked(checkForPort).mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectCandidate = reject;
          })
      );
    }
    await configure('candidate-command', 'candidate');
    let refresh: Promise<unknown> | undefined;
    if (phase.startsWith('restoration')) {
      refresh = changed().catch(error => error);
      await vi.waitFor(() => expect(rejectCandidate).toBeTypeOf('function'));
    }
    if (phase.endsWith('port allocation')) {
      vi.mocked(getPort).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = () => resolve(4999);
          })
      );
    } else {
      vi.mocked(checkForPort).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = () => resolve('127.0.0.1');
          })
      );
    }
    if (refresh) rejectCandidate(new Error('candidate readiness failed'));
    else refresh = changed().catch(error => error);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const spawns = vi.mocked(spawnCommand).mock.calls.length;
    let stopped = false;
    const stopping = server.stop().then(() => {
      stopped = true;
    });
    await vi.waitFor(() => expect(stopQueue).toHaveBeenCalled());
    const stoppedBeforeRelease = stopped;
    release();
    await Promise.all([stopping, refresh]);

    if (phase.endsWith('port allocation'))
      expect(stoppedBeforeRelease).toBe(false);
    expect(spawnCommand).toHaveBeenCalledTimes(spawns);
    expect(children.some(child => child.alive)).toBe(false);
    expect((server as any).devProcess).toBeUndefined();
    expect((server as any).devProcessOrigin).toBeUndefined();
    expect((server as any).devCommandEnv).toBeUndefined();
    expect((server as any).currentDevCommand).toBeUndefined();
    expect((server as any).devCommandStarts.size).toBe(0);
    expect((server as any).functionReconciliations).toBe(0);
    expect((server as any).projectSettings).toBe(settings);
    expect(server.envConfigs).toBe(env);
    expect(server.getDevFunction('api/task')).toBe(fn);
    expect(server.resolveDevFunction('api/task')).toBeNull();
    expect(register).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(server.updateBuildMatches).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
    await server.runDevCommand(true);
    expect(spawnCommand).toHaveBeenCalledTimes(spawns);
  });

  describe.each([
    'port allocation',
    'readiness',
  ])('initial startup pending %s', phase => {
    beforeEach(() => {
      if (process.platform === 'win32') {
        // Keep real filesystem events without hitting libuv's fs-event.c
        // assertion when watching temporary directories on Windows.
        vi.stubEnv('CHOKIDAR_USEPOLLING', 'true');
      }
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      'source',
      'command',
      'environment',
    ])('finishes startup and applies a watcher %s edit without killing the pending child', async edit => {
      await server.stop();
      server = new DevServer(cwd, {
        queuePort: 0,
        runtimeCachePort: 0,
        schedulesPort: 0,
      });
      Object.assign(server, { sidecars: [], watchAggregationTimeout: 10 });
      vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
      const changes = vi.spyOn(server, 'handleFilesystemEvents');
      const redirects = vi.spyOn(server as any, 'refreshBulkRedirects');
      const stop = vi.spyOn(server, 'stop');
      vi.mocked(spawnCommand).mockClear();
      vi.mocked(treeKill).mockClear();

      let release!: () => void;
      if (phase === 'port allocation') {
        vi.mocked(getPort).mockImplementationOnce(
          () =>
            new Promise(resolve => {
              release = () => resolve(4999);
            })
        );
      } else {
        vi.mocked(checkForPort).mockImplementationOnce(
          () =>
            new Promise(resolve => {
              release = () => resolve('127.0.0.1');
            })
        );
      }
      let started = false;
      const startup = server.start(0, '127.0.0.1');
      const result = startup.then(
        () => {
          started = true;
        },
        error => error
      );
      try {
        await vi.waitFor(() => {
          expect(release).toBeTypeOf('function');
          // _start installs this listener after the real watcher is ready.
          expect((server as any).server.listenerCount('upgrade')).toBe(1);
        });
        if (edit === 'source') {
          await writeFile(
            join(cwd, 'app/api/task/route.ts'),
            'export function POST() { return new Response("edited"); }'
          );
        } else {
          await configure(
            edit === 'command' ? 'candidate-command' : 'accepted-command',
            edit === 'environment' ? 'candidate' : 'accepted'
          );
        }
        await vi.waitFor(() => expect(redirects).toHaveBeenCalledTimes(2));
        expect(changes).toHaveBeenCalledOnce();
        expect(treeKill).not.toHaveBeenCalled();
        expect(stop).not.toHaveBeenCalled();
        expect(started).toBe(false);
        expect((server as any).devProcessOrigin).toBeUndefined();
        release();
        await expect(result).resolves.toBeUndefined();
        await changes.mock.results[0].value;

        const command =
          edit === 'command' ? 'candidate-command' : 'accepted-command';
        const version = edit === 'environment' ? 'candidate' : 'accepted';
        expect(spawnCommand).toHaveBeenCalledTimes(edit === 'source' ? 1 : 2);
        expect(treeKill).toHaveBeenCalledTimes(edit === 'source' ? 0 : 1);
        expect(children.filter(child => child.alive)).toEqual([
          children.at(-1),
        ]);
        expect((server as any).stopping).toBe(false);
        expect((server as any).functionReconciliations).toBe(0);
        expect((server as any).devCommandStarts.size).toBe(0);
        expect((server as any).currentDevCommand).toBe(command);
        expect(server.devCommand).toBe(command);
        expect((server as any).devCommandEnv.VERSION).toBe(version);
        expect(server.envConfigs.allEnv.VERSION).toBe(version);
        const [spawnedCommand, options] = vi
          .mocked(spawnCommand)
          .mock.calls.at(-1)!;
        expect(spawnedCommand).toBe(command);
        expect(options?.env).toMatchObject({ VERSION: version });
        const origin = `http://127.0.0.1:${options!.env!.PORT}`;
        expect((server as any).devProcessOrigin).toBe(origin);
        await (server as any).scheduleBroker.invoke({ name: version });
        expect(directFetch).toHaveBeenCalledWith(
          `${origin}/accepted/task`,
          expect.anything()
        );
        expect(stop).not.toHaveBeenCalled();
      } finally {
        release?.();
        await result;
      }
    });
  });

  it('publishes a successful restart only after revalidation and commits without another restart', async () => {
    const validate = schedules.validateStatic.bind(schedules);
    vi.spyOn(schedules, 'validateStatic').mockImplementation(inputs => {
      if (children.length === 2) {
        expect((server as any).devProcessOrigin).toBeUndefined();
        expect(server.resolveDevFunction('api/task')).toBeNull();
      }
      validate(inputs);
    });
    await configure('candidate-command', 'candidate');
    await changed();
    expect(children.map(child => child.alive)).toEqual([false, true]);
    expect((server as any).currentDevCommand).toBe('candidate-command');
    expect(server.envConfigs.allEnv.VERSION).toBe('candidate');
    expect((server as any).devCommandEnv.VERSION).toBe('candidate');
    expect((server as any).devProcessOrigin).toBe('http://127.0.0.1:4002');
    await schedules.invoke({ name: 'candidate' });
    expect(directFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4002/accepted/task',
      expect.anything()
    );
    await server.getVercelConfig();
    expect(spawnCommand).toHaveBeenCalledTimes(2);
  });
});
