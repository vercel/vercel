import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildLocally } from '../../../../scripts/testserver/build-locally.mjs';
import { RunnerError } from '../../../../scripts/testserver/files.mjs';
import { runInSandbox } from '../../../../scripts/testserver/main.mjs';
import { LOCAL_HINT } from '../../../../scripts/testserver/runner-config.mjs';
import { BUILD_FAILED, fakeLauncher } from './fixture';

const scriptPath = resolve(
  __dirname,
  '../../../../scripts/testserver/main.mjs'
);

describe('running the script', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-main-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // With no command, main() prints usage and exits 1. Exit 0 with no output
  // means main() never ran.
  const runWithoutCommand = (path: string) =>
    spawnSync(process.execPath, [path], { encoding: 'utf8' });

  test('runs main() when invoked by its real path', () => {
    const result = runWithoutCommand(scriptPath);
    expect(result.stderr).toContain('Usage:');
    expect(result.status).toBe(1);
  });

  test('runs main() when invoked through a symlink', () => {
    const link = join(dir, 'main.mjs');
    symlinkSync(scriptPath, link);
    const result = runWithoutCommand(link);
    expect(result.stderr).toContain('Usage:');
    expect(result.status).toBe(1);
  });
});

describe('runInSandbox()', () => {
  type RunnerResult =
    | { outcome: 'completed'; exitCode: number; phases: string[] }
    | { outcome: 'failed'; error: unknown; phases: string[] }
    | { outcome: 'aborted' };
  type RunnerArgs = {
    signal: AbortSignal;
    vitestArgs: string[];
    mode?: unknown;
  };
  const fakeMode = { summary: 'fake' };

  const creds = { token: 'tok', teamId: 'team_1', projectId: 'prj_1' };
  let signals: EventEmitter;
  let logs: string[];

  beforeEach(() => {
    signals = new EventEmitter();
    logs = [];
  });

  function start(
    runVitest: (args: RunnerArgs) => Promise<RunnerResult>,
    opts: {
      credentials?: () => Promise<unknown>;
      buildHere?: (ctx: { signal: AbortSignal }) => Promise<number>;
      buildMode?: () => unknown;
      stopTimeoutMs?: number;
    } = {}
  ) {
    return runInSandbox({
      command: ['vitest', 'run', 'test/testserver/a.test.ts'],
      bases: ['https://sb-1.vercel.run'],
      config: { timeoutMs: 60 * 60_000 },
      log: (line: string) => logs.push(line),
      credentials: opts.credentials ?? (async () => creds),
      agent: async () => false,
      buildHere: opts.buildHere,
      buildMode: opts.buildMode ?? (() => fakeMode),
      runVitest,
      signals,
      stopTimeoutMs: opts.stopTimeoutMs ?? 5_000,
    });
  }

  /** A runner that only finishes when its signal aborts, or `finish()`. */
  function heldRunner() {
    let started: () => void = () => {};
    const running = new Promise<void>(resolve => {
      started = resolve;
    });
    let finish: (result: RunnerResult) => void = () => {};
    const runVitest = vi.fn(
      (_args: RunnerArgs) =>
        new Promise<RunnerResult>(resolve => {
          finish = resolve;
          started();
        })
    );
    return { runVitest, running, finish: (r: RunnerResult) => finish(r) };
  }

  test("passes Vitest's exit code and phases through", async () => {
    const runVitest = vi.fn(async (_args: RunnerArgs) => ({
      outcome: 'completed' as const,
      exitCode: 3,
      phases: ['tests 1.0s'],
    }));

    expect(await start(runVitest)).toEqual({
      exitCode: 3,
      phases: ['tests 1.0s'],
      signalled: false,
    });
    expect(runVitest.mock.calls[0][0].vitestArgs).toEqual([
      'run',
      'test/testserver/a.test.ts',
    ]);
    expect(signals.eventNames()).toEqual([]);
  });

  test('builds the mode and hands it to the runner', async () => {
    const buildMode = vi.fn(async () => fakeMode);
    const runVitest = vi.fn(async (_args: RunnerArgs) => ({
      outcome: 'completed' as const,
      exitCode: 0,
      phases: [],
    }));

    await start(runVitest, { buildMode });
    expect(buildMode).toHaveBeenCalledWith();
    expect(runVitest.mock.calls[0][0].mode).toBe(fakeMode);
  });

  test('prints a RunnerError from building the mode as is, with its hint', async () => {
    const runVitest = vi.fn();
    const result = await start(runVitest, {
      buildMode: () => {
        throw new RunnerError('no main', { hint: 'fetch it' });
      },
    });

    expect(result).toMatchObject({
      exitCode: 1,
      phases: [],
      signalled: false,
    });
    expect(runVitest).not.toHaveBeenCalled();
    expect(logs).toEqual(['✗ no main', 'fetch it']);
  });

  test('prints a RunnerError without a hint alone', async () => {
    const result = await start(async () => ({
      outcome: 'failed',
      error: new RunnerError('Building the CLI on this machine failed'),
      phases: ['laptop build 1.0s'],
    }));

    expect(result).toEqual({
      exitCode: 1,
      phases: ['laptop build 1.0s'],
      signalled: false,
    });
    expect(logs).toEqual(['✗ Building the CLI on this machine failed']);
  });

  test('builds the mode alongside the credentials, failing without waiting for them', async () => {
    const runVitest = vi.fn();
    const result = await start(runVitest, {
      credentials: () => new Promise(() => {}),
      buildMode: async () => {
        throw new Error('no merge-base');
      },
    });

    expect(result).toEqual({ exitCode: 1, phases: [], signalled: false });
    expect(runVitest).not.toHaveBeenCalled();
    expect(logs).toContain('✗ Runner sandbox failed: no merge-base');
  });

  test('fails with the local hint when there are no credentials', async () => {
    const runVitest = vi.fn();
    const result = await start(runVitest, {
      credentials: async () => {
        throw new RunnerError('no token', { hint: LOCAL_HINT });
      },
    });

    expect(result).toEqual({ exitCode: 1, phases: [], signalled: false });
    expect(runVitest).not.toHaveBeenCalled();
    expect(logs).toEqual(['✗ no token', LOCAL_HINT]);
  });

  test('builds the CLI here before the mode, and reports its time', async () => {
    const order: string[] = [];
    const runVitest = vi.fn(async (_args: RunnerArgs) => {
      order.push('runner');
      return {
        outcome: 'completed' as const,
        exitCode: 0,
        phases: ['tests 1.0s'],
      };
    });
    const result = await start(runVitest, {
      buildHere: async () => {
        order.push('build');
        return 1234;
      },
      buildMode: () => {
        order.push('mode');
        return fakeMode;
      },
    });

    expect(result).toEqual({
      exitCode: 0,
      phases: ['laptop build 1.2s', 'tests 1.0s'],
      signalled: false,
    });
    expect(order).toEqual(['build', 'mode', 'runner']);
    expect(
      await start(
        async () => ({
          outcome: 'failed',
          error: new Error('upload broke'),
          phases: ['start 1.0s'],
        }),
        { buildHere: async () => 99 }
      )
    ).toEqual({
      exitCode: 1,
      phases: ['laptop build 0.1s', 'start 1.0s'],
      signalled: false,
    });
  });

  test('fails without building the mode or starting the runner when the build fails', async () => {
    const buildMode = vi.fn(() => fakeMode);
    const runVitest = vi.fn();
    const result = await start(runVitest, {
      buildHere: async () => {
        throw new Error('build broke');
      },
      buildMode,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      phases: [],
      signalled: false,
    });
    expect(buildMode).not.toHaveBeenCalled();
    expect(runVitest).not.toHaveBeenCalled();
    expect(logs).toContain('✗ Runner sandbox failed: build broke');
  });

  describe('with the laptop build mode', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // The laptop build runs before the mode is built or the runner starts.
    const runVitest = vi.fn();
    const startBuilding = (launcher: ReturnType<typeof fakeLauncher>) =>
      runInSandbox({
        command: ['vitest', 'run'],
        bases: ['https://sb-1.vercel.run'],
        config: { timeoutMs: 60 * 60_000 },
        log: (line: string) => logs.push(line),
        credentials: async () => creds,
        agent: async () => false,
        buildHere: ({ signal }: { signal: AbortSignal }) =>
          buildLocally('/repo', { signal, run: launcher.run }),
        buildMode: () => fakeMode,
        runVitest,
        signals,
        stopTimeoutMs: 5_000,
      });

    test.each([
      ['SIGINT', 130],
      ['SIGTERM', 143],
      ['SIGHUP', 129],
    ])('%s during the build stops it and exits %i', async (name, code) => {
      const launcher = fakeLauncher();
      const result = startBuilding(launcher);
      await launcher.started;
      signals.emit(name);

      expect(await result).toEqual({
        exitCode: code,
        phases: [],
        signalled: true,
      });
      expect(launcher.kill).toHaveBeenCalledWith('SIGTERM');
      expect(runVitest).not.toHaveBeenCalled();
      expect(logs.join('\n')).not.toContain('did not stop');
    });

    test('a failed build exits 1 through the runner failure path', async () => {
      const exit = vi.spyOn(process, 'exit');
      const result = await startBuilding(fakeLauncher(BUILD_FAILED));

      expect(result).toMatchObject({
        exitCode: 1,
        phases: [],
        signalled: false,
      });
      expect(exit).not.toHaveBeenCalled();
      expect(runVitest).not.toHaveBeenCalled();
      // A RunnerError, printed as written; a local run would fail the same
      // way, so there is no hint.
      expect(logs).toEqual([
        `✗ Building the CLI on this machine failed, so not running the tests: ${BUILD_FAILED.message}`,
      ]);
    });
  });

  test('an SDK failure exits 1 as a runner sandbox failure, with the local hint', async () => {
    const result = await start(async () => ({
      outcome: 'failed',
      error: Object.assign(new Error('Forbidden'), {
        response: { status: 403 },
      }),
      phases: ['start 1.0s'],
    }));

    expect(result).toEqual({
      exitCode: 1,
      phases: ['start 1.0s'],
      signalled: false,
    });
    expect(logs).toEqual([
      expect.stringMatching(
        /^✗ Runner sandbox failed: Vercel Sandbox API error \(HTTP 403\): Forbidden\. The runner credentials were rejected/
      ),
      LOCAL_HINT,
    ]);
  });

  test('a signal before the runner starts exits without starting it', async () => {
    const runVitest = vi.fn();
    const result = start(runVitest, {
      credentials: () => new Promise(() => {}),
    });
    signals.emit('SIGINT');

    expect(await result).toEqual({
      exitCode: 130,
      phases: [],
      signalled: true,
    });
    expect(runVitest).not.toHaveBeenCalled();
  });

  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ])('%s during the run stops the runner and exits %i', async (name, code) => {
    const runner = heldRunner();
    const result = start(runner.runVitest);
    await runner.running;
    const { signal } = runner.runVitest.mock.calls[0][0];
    signal.addEventListener('abort', () =>
      runner.finish({ outcome: 'aborted' })
    );
    signals.emit(name);

    expect(await result).toEqual({
      exitCode: code,
      phases: [],
      signalled: true,
    });
    expect(signal.aborted).toBe(true);
    expect(signals.eventNames()).toEqual([]);
  });

  test('a second signal waits for the runner to stop', async () => {
    const runner = heldRunner();
    const result = start(runner.runVitest);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await runner.running;
    signals.emit('SIGINT');
    signals.emit('SIGINT');
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(settled).toBe(false);
    expect(logs).toContain('[runner] SIGINT: still stopping the runner...');
    runner.finish({ outcome: 'aborted' });
    expect(await result).toMatchObject({ exitCode: 130, signalled: true });
  });

  test('gives up when the runner does not stop in time', async () => {
    const runner = heldRunner();
    const result = start(runner.runVitest, { stopTimeoutMs: 10 });
    await runner.running;
    signals.emit('SIGTERM');

    expect(await result).toEqual({
      exitCode: 143,
      phases: [],
      signalled: true,
    });
    expect(logs).toContain(
      '✗ [runner] The runner did not stop within 0.0s; its 60-minute timeout stops it.'
    );
  });
});
