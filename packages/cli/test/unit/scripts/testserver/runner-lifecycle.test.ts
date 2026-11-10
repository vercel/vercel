import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runInSandbox } from '../../../../scripts/testserver/main.mjs';
import {
  runVitestInRunner,
  snapshotCacheKey,
} from '../../../../scripts/testserver/runner.mjs';
import { LOCAL_HINT } from '../../../../scripts/testserver/runner-config.mjs';

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { response: { status } });

const abortError = () =>
  Object.assign(new Error('The operation was aborted'), {
    name: 'AbortError',
  });

/** Settles with `gate`, or rejects on abort or when the sandbox stops. */
function hold(
  gate: Promise<void>,
  sandbox: FakeSandbox,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  const aborted = new Promise<void>((_, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), {
      once: true,
    });
  });
  return Promise.race([gate, aborted, sandbox.stoppedSignal]);
}

interface CommandParams {
  cmd: string;
  args?: string[];
  detached?: boolean;
}

/** A detached command: `logs()` yields `lines`, then waits for `gate`. */
class FakeCommand {
  killed: string[] = [];
  private gate = deferred();

  constructor(
    private sandbox: FakeSandbox,
    private lines: string[],
    public exitCode: number,
    held: boolean
  ) {
    if (!held) this.gate.resolve();
  }

  async *logs({ signal }: { signal?: AbortSignal } = {}) {
    for (const data of this.lines) yield { stream: 'stdout' as const, data };
    await hold(this.gate.promise, this.sandbox, signal);
  }

  async wait({ signal }: { signal?: AbortSignal } = {}) {
    await hold(this.gate.promise, this.sandbox, signal);
    return { exitCode: this.exitCode };
  }

  async output() {
    return '';
  }

  async stdout() {
    return this.lines.join('');
  }

  async kill(signal = 'SIGTERM') {
    this.killed.push(signal);
    this.exitCode = 143;
    this.gate.resolve();
  }
}

class FakeSandbox {
  stopped = false;
  deleted = false;
  snapshotted = false;
  commands: FakeCommand[] = [];
  calls: CommandParams[] = [];
  timeout: number;
  private stoppedDeferred = deferred();
  stoppedSignal = this.stoppedDeferred.promise;

  constructor(
    private sdk: FakeSdk,
    public name: string,
    public params: Record<string, unknown>
  ) {
    this.timeout = params.timeout as number;
    this.stoppedSignal.catch(() => {});
  }

  private check() {
    if (this.stopped) throw new Error(`${this.name} is stopped`);
  }

  async writeFiles() {
    this.check();
  }

  async runCommand(params: CommandParams) {
    this.check();
    const name = params.cmd.split('/').pop() ?? params.cmd;
    const command = this.sdk.command(this, name, params);
    this.commands.push(command);
    this.calls.push(params);
    this.sdk.started(name).resolve();
    return command;
  }

  async snapshot() {
    this.check();
    this.sdk.started('snapshot').resolve();
    await this.sdk.options.snapshotGate;
    // Stopping a sandbox mid-snapshot loses the snapshot.
    if (this.stopped) throw new Error(`${this.name} stopped mid-snapshot`);
    this.snapshotted = true;
    this.markStopped();
    const snapshotId = `snap_${++this.sdk.snapshotCount}`;
    this.sdk.snapshots.add(snapshotId);
    return {
      snapshotId,
      status: 'created',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      sizeBytes: 1024,
    };
  }

  async stop() {
    this.markStopped();
  }

  async delete() {
    this.deleted = true;
  }

  async downloadFile(_remote: { path: string }, local: { path: string }) {
    this.check();
    if (this.sdk.options.downloadFails) throw new Error('download broke');
    const { resultsTarball } = this.sdk.options;
    if (!resultsTarball) return null;
    copyFileSync(resultsTarball, local.path);
    return local.path;
  }

  private markStopped() {
    this.stopped = true;
    this.stoppedDeferred.reject(new Error(`${this.name} was stopped`));
  }
}

interface FakeOptions {
  /** Exit code of the fake mode's streamed snapshot step. */
  installExit?: number;
  holdInstall?: boolean;
  vitestExit?: number;
  holdVitest?: boolean;
  resultsExit?: number;
  downloadFails?: boolean;
  /** A local .tgz that downloadFile() hands back as the runner's results. */
  resultsTarball?: string;
  /** Awaited inside Sandbox.create for runners (created from a snapshot). */
  runnerCreateGate?: Promise<void>;
  /** Awaited inside a build sandbox's snapshot(). */
  snapshotGate?: Promise<void>;
}

class FakeSdk {
  sandboxes: FakeSandbox[] = [];
  createParams: Record<string, unknown>[] = [];
  snapshots = new Set<string>();
  snapshotCount = 0;
  private waiters = new Map<string, Deferred>();

  constructor(public options: FakeOptions = {}) {}

  started(name: string): Deferred {
    let waiter = this.waiters.get(name);
    if (!waiter) {
      waiter = deferred();
      this.waiters.set(name, waiter);
    }
    return waiter;
  }

  command(sandbox: FakeSandbox, name: string, params: CommandParams) {
    const { options } = this;
    if (name === 'bash') {
      return new FakeCommand(
        sandbox,
        ['installing\n'],
        options.installExit ?? 0,
        options.holdInstall ?? false
      );
    }
    if (name === 'vitest') {
      return new FakeCommand(
        sandbox,
        ['✓ /vercel/sandbox/packages/cli/test/a.test.ts\n'],
        options.vitestExit ?? 0,
        options.holdVitest ?? false
      );
    }
    if (name === 'mktemp') {
      return new FakeCommand(sandbox, ['/tmp/testserver.abcd1234\n'], 0, false);
    }
    const exit = name === 'sh' ? (options.resultsExit ?? 1) : 0;
    return new FakeCommand(sandbox, [], exit, false);
  }

  Sandbox = {
    create: async (params: Record<string, unknown>) => {
      this.createParams.push(params);
      const source = params.source as { snapshotId: string } | undefined;
      if (source) {
        await this.options.runnerCreateGate;
        if (!this.snapshots.has(source.snapshotId)) {
          throw apiError(404, `Snapshot ${source.snapshotId} not found`);
        }
      }
      const sandbox = new FakeSandbox(
        this,
        `sbx_${this.sandboxes.length + 1}`,
        params
      );
      this.sandboxes.push(sandbox);
      return sandbox;
    },
  };

  Snapshot = {
    get: async ({ snapshotId }: { snapshotId: string }) => {
      if (!this.snapshots.has(snapshotId)) throw apiError(404, 'not found');
      return { status: 'created' };
    },
  };

  /** Build sandboxes and runners, in creation order. */
  roles() {
    return this.sandboxes.map(s => (s.params.tags as { role: string }).role);
  }
}

type Phases = { phases: string[]; signal: AbortSignal };

/**
 * A BuildMode that records what the runner asks of it. Its snapshot recipe
 * streams one bash step; `apply` writes one file, or waits for `applyGate`.
 * It is `ready` at once unless given another `ready`.
 */
const CREDS = { token: 'tok', teamId: 'team_1', projectId: 'prj_1' };
/** Where the runner caches the fake mode's snapshot for CREDS. */
const FAKE_CACHE_KEY = snapshotCacheKey('f'.repeat(64), CREDS);

function fakeMode(
  options: { applyGate?: Promise<void>; ready?: Promise<void> } = {}
) {
  const applied = deferred();
  return {
    applied,
    summary: 'against a fake build',
    startedNote: ' (fake base)',
    vcpus: (sandboxCount: number) => 6 + sandboxCount,
    ready: options.ready ?? Promise.resolve(),
    snapshot: {
      key: 'f'.repeat(64),
      vcpus: 4,
      missMessage: 'No fake snapshot yet; building one',
      builtFor: 'the fake recipe',
      entry: { fake: 'yes' },
      begin() {
        return async (
          _sandbox: FakeSandbox,
          step: (label: string, script: string) => Promise<void>
        ) => {
          await step('fake install', 'echo installing');
        };
      },
    },
    async apply(sandbox: FakeSandbox, ctx: Phases) {
      applied.resolve();
      if (options.applyGate) {
        await hold(options.applyGate, sandbox, ctx.signal);
      }
      await sandbox.writeFiles();
      ctx.phases.push('apply 0.0s');
    },
  };
}

describe('runVitestInRunner()', () => {
  let root: string;
  let cachePath: string;
  let logs: string[];
  let stdout: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'testserver-runner-'));
    cachePath = join(root, '.cache', 'runner-snapshots.json');
    logs = [];
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function run(
    sdk: FakeSdk,
    signal?: AbortSignal,
    mode: ReturnType<typeof fakeMode> = fakeMode()
  ) {
    return runVitestInRunner({
      vitestArgs: ['run', `${root}/packages/cli/test/testserver/a.test.ts`],
      bases: ['https://sb-1.vercel.run'],
      creds: CREDS,
      isAgent: false,
      timeoutMs: 60 * 60_000,
      repoRoot: root,
      log: (line: string) => logs.push(line),
      mode,
      signal,
      sdk,
      snapshotCachePath: cachePath,
    });
  }

  function expectAllStopped(sdk: FakeSdk) {
    expect(sdk.sandboxes.length).toBeGreaterThan(0);
    for (const sandbox of sdk.sandboxes) {
      expect(sandbox.stopped, sandbox.name).toBe(true);
      expect(sandbox.deleted, sandbox.name).toBe(true);
    }
  }

  test('builds a snapshot on a miss, runs Vitest and stops everything', async () => {
    const sdk = new FakeSdk({ vitestExit: 3 });
    const result = await run(sdk);

    expect(result).toEqual({
      outcome: 'completed',
      exitCode: 3,
      phases: [
        expect.stringMatching(/^snapshot built \d+\.\ds$/),
        expect.stringMatching(/^start \d+\.\ds$/),
        'apply 0.0s',
        expect.stringMatching(/^tests \d+\.\ds$/),
        expect.stringMatching(/^results \d+\.\ds$/),
      ],
    });
    expect(sdk.roles()).toEqual(['snapshot-build', 'runner']);
    const [build, runner] = sdk.sandboxes;
    expect(build.snapshotted).toBe(true);
    expect(runner.params.source).toEqual({
      type: 'snapshot',
      snapshotId: 'snap_1',
    });
    expectAllStopped(sdk);
    for (const params of sdk.createParams) {
      expect(params).not.toHaveProperty('signal');
    }
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(cache).toEqual({
      [FAKE_CACHE_KEY]: {
        snapshotId: 'snap_1',
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
        fake: 'yes',
      },
    });
    expect(logs).toContain(
      '[runner snapshot] No fake snapshot yet; building one'
    );
    expect(logs).toContain('[runner snapshot] installing');
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^✓ Built runner snapshot snap_1 for the fake recipe in \d+\.\ds/
      )
    );
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^\[runner\] Running Vitest remotely in a runner sandbox \(iad1, node22, 7 vCPUs, 60-minute timeout\), against a fake build; /
      )
    );
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^✓ \[runner\] Started sbx_2 from snapshot snap_1 \(fake base\) in /
      )
    );
    expect(build.params.resources).toEqual({ vcpus: 4 });
    // The mode sizes the runner for the run's one sandbox.
    expect(runner.params.resources).toEqual({ vcpus: 7 });
    // Paths in the arguments and the output point at the right checkout.
    expect(runner.calls.find(c => c.cmd.endsWith('/vitest'))?.args).toEqual([
      'run',
      '/vercel/sandbox/packages/cli/test/testserver/a.test.ts',
    ]);
    expect(stdout.join('')).toContain(`✓ ${root}/packages/cli/test/a.test.ts`);
    expect(logs).toContainEqual(
      expect.stringContaining('end of runner output: Vitest exited 3')
    );
  });

  test('reuses a cached snapshot', async () => {
    const sdk = new FakeSdk();
    await run(sdk);
    const second = await run(sdk);

    expect(second).toMatchObject({
      outcome: 'completed',
      phases: [
        expect.stringMatching(/^snapshot hit/),
        ...Array(4).fill(expect.any(String)),
      ],
    });
    expect(sdk.roles()).toEqual(['snapshot-build', 'runner', 'runner']);
    expectAllStopped(sdk);
  });

  test('rebuilds a snapshot that no longer exists, once', async () => {
    const sdk = new FakeSdk();
    await run(sdk);
    sdk.snapshots.clear();
    const result = await run(sdk);

    expect(result.outcome).toBe('completed');
    // The failed runner create made no sandbox.
    expect(sdk.roles()).toEqual([
      'snapshot-build',
      'runner',
      'snapshot-build',
      'runner',
    ]);
    const runnerCreates = sdk.createParams.filter(p => p.source);
    expect(runnerCreates.map(p => p.source)).toEqual([
      { type: 'snapshot', snapshotId: 'snap_1' },
      { type: 'snapshot', snapshotId: 'snap_1' },
      { type: 'snapshot', snapshotId: 'snap_2' },
    ]);
    expect(logs).toContainEqual(
      '✗ [runner] Snapshot snap_1 no longer exists; rebuilding it'
    );
    expectAllStopped(sdk);
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(Object.values(cache)).toEqual([
      expect.objectContaining({ snapshotId: 'snap_2' }),
    ]);
  });

  test('stops the build sandbox when aborted during the snapshot build', async () => {
    const sdk = new FakeSdk({ holdInstall: true });
    const controller = new AbortController();
    const result = run(sdk, controller.signal);
    await sdk.started('bash').promise;
    controller.abort();

    expect(await result).toEqual({ outcome: 'aborted' });
    expect(sdk.roles()).toEqual(['snapshot-build']);
    expectAllStopped(sdk);
  });

  test('stops a runner whose create resolves after the abort', async () => {
    const gate = deferred();
    const sdk = new FakeSdk({ runnerCreateGate: gate.promise });
    const controller = new AbortController();
    const result = run(sdk, controller.signal);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.waitFor(() => {
      expect(sdk.createParams.some(p => p.source)).toBe(true);
    });
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    // Closing waits for the create in flight.
    expect(settled).toBe(false);
    gate.resolve();

    expect(await result).toEqual({ outcome: 'aborted' });
    expect(sdk.roles()).toEqual(['snapshot-build', 'runner']);
    expectAllStopped(sdk);
  });

  test('kills Vitest and stops the runner when aborted during the run', async () => {
    const sdk = new FakeSdk({ holdVitest: true });
    const controller = new AbortController();
    const result = run(sdk, controller.signal);
    await sdk.started('vitest').promise;
    controller.abort();

    expect(await result).toEqual({ outcome: 'aborted' });
    const runner = sdk.sandboxes[1];
    expect(runner.commands.at(-1)?.killed).toEqual(['SIGTERM']);
    expectAllStopped(sdk);
  });

  test('stops the runner when aborted while the mode applies its payload', async () => {
    const sdk = new FakeSdk();
    const mode = fakeMode({ applyGate: new Promise(() => {}) });
    const controller = new AbortController();
    const result = run(sdk, controller.signal, mode);
    await mode.applied.promise;
    controller.abort();

    expect(await result).toEqual({ outcome: 'aborted' });
    expect(sdk.roles()).toEqual(['snapshot-build', 'runner']);
    expect(sdk.sandboxes[1].calls.some(c => c.cmd.endsWith('/vitest'))).toBe(
      false
    );
    expectAllStopped(sdk);
  });

  test('lets a snapshot in flight finish when the run is aborted', async () => {
    const gate = deferred();
    const sdk = new FakeSdk({ snapshotGate: gate.promise });
    const controller = new AbortController();
    const result = run(sdk, controller.signal);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await sdk.started('snapshot').promise;
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    // Closing waits for snapshot() rather than stopping the sandbox under it.
    expect(settled).toBe(false);
    expect(sdk.sandboxes[0].stopped).toBe(false);
    gate.resolve();

    expect(await result).toEqual({ outcome: 'aborted' });
    expect(sdk.roles()).toEqual(['snapshot-build']);
    expect(sdk.sandboxes[0].snapshotted).toBe(true);
    expectAllStopped(sdk);
    // The next run can use it.
    expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toHaveProperty(
      FAKE_CACHE_KEY
    );
  });

  test('a signalled wrapper waits for a snapshot in flight past the old 30s stop deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const gate = deferred();
      const sdk = new FakeSdk({ snapshotGate: gate.promise });
      const signals = new EventEmitter();
      const result = runInSandbox({
        command: ['vitest', 'run'],
        bases: ['https://sb-1.vercel.run'],
        config: { timeoutMs: 60 * 60_000 },
        log: (line: string) => logs.push(line),
        credentials: async () => CREDS,
        agent: async () => false,
        buildMode: () => fakeMode(),
        // runInSandbox passes every runner argument but these two.
        runVitest: args =>
          runVitestInRunner({
            ...args,
            sdk,
            snapshotCachePath: cachePath,
          } as Parameters<typeof runVitestInRunner>[0]),
        signals,
      });
      let settled = false;
      void result.then(() => {
        settled = true;
      });
      await sdk.started('snapshot').promise;
      signals.emit('SIGINT');
      await vi.advanceTimersByTimeAsync(90_000);

      expect(settled).toBe(false);
      expect(logs).toContainEqual(
        expect.stringMatching(
          /^\[runner snapshot\] Letting the snapshot in flight finish/
        )
      );
      gate.resolve();

      expect(await result).toEqual({
        exitCode: 130,
        phases: [],
        signalled: true,
      });
      expect(logs).not.toContainEqual(
        expect.stringContaining('did not stop within')
      );
      expect(sdk.sandboxes[0].snapshotted).toBe(true);
      expectAllStopped(sdk);
      expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toHaveProperty(
        FAKE_CACHE_KEY
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('a failed upload stops a runner start in flight', async () => {
    const sdk = new FakeSdk();
    // A cached snapshot, so the run goes straight to the runner create.
    await run(sdk);
    const createGate = deferred();
    sdk.options.runnerCreateGate = createGate.promise;
    const ready = deferred();
    const mode = fakeMode({ ready: ready.promise });
    const result = run(sdk, undefined, mode);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.waitFor(() => {
      expect(sdk.createParams.filter(p => p.source)).toHaveLength(2);
    });
    ready.reject(new Error('tar broke'));
    await new Promise(resolve => setTimeout(resolve, 20));
    // Closing waits for the create in flight.
    expect(settled).toBe(false);
    createGate.resolve();

    expect(await result).toEqual({
      outcome: 'failed',
      error: expect.objectContaining({ message: 'tar broke' }),
      phases: [],
    });
    expect(sdk.roles()).toEqual(['snapshot-build', 'runner', 'runner']);
    // The runner created after closing began is stopped at once, unused.
    const runner = sdk.sandboxes[2];
    expect(runner.calls).toEqual([]);
    expect(logs).not.toContainEqual(
      expect.stringContaining(`Started ${runner.name}`)
    );
    expectAllStopped(sdk);
  });

  test('fails and stops the build sandbox when a snapshot step fails', async () => {
    const sdk = new FakeSdk({ installExit: 1 });
    const result = await run(sdk);

    expect(result).toEqual({
      outcome: 'failed',
      error: expect.objectContaining({
        message: expect.stringMatching(
          /fake install failed in the snapshot sandbox \(exit 1\)/
        ),
        hint: LOCAL_HINT,
      }),
      phases: [],
    });
    expect(sdk.roles()).toEqual(['snapshot-build']);
    expectAllStopped(sdk);
  });

  test("keeps Vitest's exit code when the results download fails", async () => {
    const sdk = new FakeSdk({ resultsExit: 0, downloadFails: true });
    const result = await run(sdk);

    expect(result).toMatchObject({ outcome: 'completed', exitCode: 0 });
    expect(result.phases?.at(-1)).toBe('results failed');
    expect(logs).toContainEqual(
      '✗ [runner] Could not download failure artifacts: download broke'
    );
    expectAllStopped(sdk);
  });

  test('downloads failure artifacts and merges them into .results', async () => {
    // What the runner packs: `tar -czf ... .results` in the testserver dir.
    const remote = mkdtempSync(join(tmpdir(), 'runner-results-'));
    try {
      const failed = join(remote, '.results', 'whoami.test.ts', 'tid-1');
      mkdirSync(failed, { recursive: true });
      writeFileSync(join(failed, 'cli.json'), '[]\n');
      const tarball = join(remote, 'results.tgz');
      // Relative archive name: GNU tar on Windows reads `C:\...` as a host.
      execFileSync('tar', ['-czf', 'results.tgz', '.results'], {
        cwd: remote,
      });

      // An artifact from an earlier local run stays.
      const localResults = join(root, 'packages/cli/test/testserver/.results');
      mkdirSync(join(localResults, 'earlier'), { recursive: true });
      writeFileSync(join(localResults, 'earlier', 'keep.json'), '{}\n');

      const sdk = new FakeSdk({
        vitestExit: 1,
        resultsExit: 0,
        resultsTarball: tarball,
      });
      const result = await run(sdk);

      expect(result).toMatchObject({ outcome: 'completed', exitCode: 1 });
      // Surfaces the swallowed download/extract error when this fails.
      expect(logs.filter(line => line.startsWith('✗'))).toEqual([]);
      expect(result.phases?.at(-1)).toMatch(/^results \d+\.\ds$/);
      expect(
        readFileSync(
          join(localResults, 'whoami.test.ts', 'tid-1', 'cli.json'),
          'utf8'
        )
      ).toBe('[]\n');
      expect(
        readFileSync(join(localResults, 'earlier', 'keep.json'), 'utf8')
      ).toBe('{}\n');
      expect(logs).toContainEqual(
        `[runner] Downloaded failure artifacts to ${localResults}`
      );
      expectAllStopped(sdk);
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });

  test('returns aborted without creating anything when already aborted', async () => {
    const sdk = new FakeSdk();
    const controller = new AbortController();
    controller.abort();

    expect(await run(sdk, controller.signal)).toEqual({ outcome: 'aborted' });
    expect(sdk.sandboxes).toEqual([]);
  });
});
