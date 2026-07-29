import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { FileBlob, Lambda, type BuildOptions } from '@vercel/build-utils';

// Mock the worker fork so SubprocessBuildRunner can be driven without a real child.
const fork = vi.fn();
vi.mock('node:child_process', () => ({
  fork: (...args: unknown[]) => fork(...args),
}));

import {
  BuildRunner,
  InprocessBuildRunner,
  type BuildRunnerContext,
} from '../../../../src/util/build/build-runner';
import { SubprocessBuildRunner } from '../../../../src/util/build/builder-process';

/** A stand-in for a forked worker: an EventEmitter with the ChildProcess surface we touch. */
class FakeChild extends EventEmitter {
  connected = true;
  exitCode: number | null = null;
  signalCode: string | null = null;
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  kill = vi.fn(() => {
    this.exitCode = 0;
    return true;
  });
  // Captures messages sent to the worker so tests can react (send back buildResult, etc.).
  send = vi.fn();
}

function makeContext(
  overrides: Partial<BuildRunnerContext> = {}
): BuildRunnerContext {
  return {
    requirePath: '/path/to/builder',
    buildOptions: { entrypoint: 'index.js' } as unknown as BuildOptions,
    cwd: '/work',
    expectsPreDeploy: false,
    builderSpan: {
      child: () => ({ trace: async (fn: () => unknown) => fn() }),
      reportChildEvents: vi.fn(),
    } as any,
    ...overrides,
  };
}

// A minimal in-process builder stub whose build() returns a tagged result.
function makeBuilder(result: unknown = { output: {} }) {
  return {
    version: 3,
    build: vi.fn().mockResolvedValue(result),
    diagnostics: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('build-runner', () => {
  describe('InprocessBuildRunner', () => {
    afterEach(() => vi.clearAllMocks());

    it('runs the builder in-process and returns its raw result', async () => {
      const builder = makeBuilder({ output: { a: 1 } });
      const ctx = makeContext();
      const runner = new InprocessBuildRunner(ctx, builder);

      const result = await runner.build();

      expect(builder.build).toHaveBeenCalledWith(ctx.buildOptions);
      expect(result).toEqual({ output: { a: 1 } });
      expect(runner).toBeInstanceOf(BuildRunner);
    });

    it('teardown is a no-op that never throws', () => {
      const runner = new InprocessBuildRunner(makeContext(), makeBuilder());
      expect(() => runner.teardown()).not.toThrow();
    });

    it('diagnostics() delegates to the builder', async () => {
      const builder = makeBuilder();
      builder.diagnostics.mockResolvedValue({ 'x.json': {} });
      const runner = new InprocessBuildRunner(makeContext(), builder);

      expect(await runner.diagnostics()).toEqual({ 'x.json': {} });
    });
  });

  describe('SubprocessBuildRunner', () => {
    let child: FakeChild;

    beforeEach(() => {
      child = new FakeChild();
      fork.mockReturnValue(child);
    });
    afterEach(() => vi.clearAllMocks());

    /** Drive the ready handshake then reply to the build message with `msg`. */
    function driveBuild(msg: Record<string, unknown>) {
      // `ready` handshake (once listener registered synchronously in build()).
      queueMicrotask(() => child.emit('message', { type: 'ready' }));
      // Reply to the `build` send once it lands.
      child.send.mockImplementation((sent: { type: string }) => {
        if (sent.type === 'build') {
          queueMicrotask(() =>
            child.emit('message', { type: 'buildResult', ...msg })
          );
        }
      });
    }

    it('tears down the worker after a build with no pre-deploy', async () => {
      driveBuild({ result: { output: {} } });
      const runner = new SubprocessBuildRunner(makeContext());

      const result = await runner.build();

      expect(result).toEqual({ output: {} });
      expect(child.disconnect).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('removes the handshake listeners so a later error cannot leak or re-settle', async () => {
      driveBuild({ result: { output: {} } });
      const runner = new SubprocessBuildRunner(makeContext());

      const result = await runner.build();

      // All handshake listeners are cleaned up once ready resolves.
      expect(child.listenerCount('error')).toBe(0);
      expect(child.listenerCount('close')).toBe(0);
      // A stray error emitted afterward is a no-op (would throw if unhandled with no listener,
      // so attach a throwaway) and does not disturb the already-resolved build.
      child.on('error', () => {});
      expect(() => child.emit('error', new Error('late'))).not.toThrow();
      expect(result).toEqual({ output: {} });
    });

    it('fails fast if the worker exits before sending ready', async () => {
      // Worker crashes on load: emits `close`, never `ready`.
      queueMicrotask(() => child.emit('close', 1, null));
      const runner = new SubprocessBuildRunner(makeContext());

      await expect(runner.build()).rejects.toThrow(
        'Builder exited with 1 before sending ready event'
      );
      // No handshake listeners left dangling.
      expect(child.listenerCount('message')).toBe(0);
      expect(child.listenerCount('error')).toBe(0);
      expect(child.listenerCount('close')).toBe(0);
    });

    it('exposes diagnostics returned by the worker', async () => {
      driveBuild({ result: { output: {} }, diagnostics: {} });
      const runner = new SubprocessBuildRunner(makeContext());

      await runner.build();

      expect(await runner.diagnostics()).toEqual({});
    });

    it('forks the worker with advanced serialization', async () => {
      driveBuild({ result: { output: {} } });
      const runner = new SubprocessBuildRunner(makeContext());

      await runner.build();

      expect(fork).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({ serialization: 'advanced' })
      );
    });

    it('merges the meta the worker mutated back into the shared meta object', async () => {
      // Builders share state through `meta` (e.g. runNpmInstall's dedup set). The worker mutated
      // its structured-clone copy; the runner must fold those changes back into the parent's
      // shared `meta` so later builds see them.
      const sharedMeta = {
        runNpmInstallSet: new Set<string>(['/root/package.json']),
      };
      driveBuild({
        result: { output: {} },
        meta: {
          runNpmInstallSet: new Set(['/app/package.json']),
          compiledToCommonJS: true,
        },
      });
      const runner = new SubprocessBuildRunner(
        makeContext({
          buildOptions: {
            entrypoint: 'index.js',
            meta: sharedMeta,
          } as unknown as BuildOptions,
        })
      );

      await runner.build();

      // Shallow merge: the worker's returned meta values land on the shared object.
      expect(sharedMeta).toMatchObject({
        runNpmInstallSet: new Set(['/app/package.json']),
        compiledToCommonJS: true,
      });
    });

    it('re-prototypes outputs and preserves a Lambda shared across Prerenders', async () => {
      // Structured-clone IPC keeps `lambda` as ONE instance shared by both Prerenders and the
      // top-level key; the runner must restore prototypes without cloning, so writeBuildResult's
      // identity-keyed symlink dedup still sees a single function. The fork mock does not
      // round-trip, so the shared graph we pass in mirrors what advanced serialization delivers.
      const lambda = { type: 'Lambda', files: {}, handler: 'index.js' };
      const output = {
        fn: lambda,
        '/a': { type: 'Prerender', lambda, fallback: null },
        '/b': { type: 'Prerender', lambda, fallback: null },
      };
      driveBuild({ result: { output } });
      const runner = new SubprocessBuildRunner(makeContext());

      const built = (await runner.build()) as unknown as {
        output: typeof output;
      };

      // Still one shared instance across every reference.
      expect(built.output['/a'].lambda).toBe(built.output.fn);
      expect(built.output['/b'].lambda).toBe(built.output.fn);
      // And it was re-prototyped into a real Lambda.
      expect(built.output.fn).toBeInstanceOf(Lambda);
    });

    it('handles a build result with a circular reference', async () => {
      // Simulates `@vercel/next`'s circular `childProcesses` — advanced serialization sends it
      // fine (no more `delete result.childProcesses`), and the seen-guarded rehydration walk
      // does not infinitely recurse.
      const result: any = { output: {} };
      result.childProcesses = [{ parent: result }];
      driveBuild({ result });
      const runner = new SubprocessBuildRunner(makeContext());

      await expect(runner.build()).resolves.toBeDefined();
    });

    it('keeps the worker alive and registers pre-deploy when the build has one', async () => {
      driveBuild({ result: { output: {} }, hasPreDeploy: true });
      const registerPreDeploy = vi.fn();
      const runner = new SubprocessBuildRunner(
        makeContext({
          expectsPreDeploy: true,
          buildOptions: {
            entrypoint: 'index.js',
            registerPreDeploy,
          } as unknown as BuildOptions,
        })
      );

      await runner.build();

      // Worker is NOT torn down at build time — it must survive for the deferred callback.
      expect(child.disconnect).not.toHaveBeenCalled();
      expect(child.kill).not.toHaveBeenCalled();
      expect(registerPreDeploy).toHaveBeenCalledTimes(1);
    });

    it('releases the worker once the registered pre-deploy callback finishes', async () => {
      driveBuild({ result: { output: {} }, hasPreDeploy: true });
      let registered: (() => Promise<void>) | undefined;
      const runner = new SubprocessBuildRunner(
        makeContext({
          expectsPreDeploy: true,
          buildOptions: {
            entrypoint: 'index.js',
            registerPreDeploy: (cb: () => Promise<void>) => {
              registered = cb;
            },
          } as unknown as BuildOptions,
        })
      );

      await runner.build();
      expect(child.disconnect).not.toHaveBeenCalled(); // alive, awaiting pre-deploy

      // Reply to the runPreDeploy message when the callback fires.
      child.send.mockImplementation((sent: { type: string }) => {
        if (sent.type === 'runPreDeploy') {
          queueMicrotask(() =>
            child.emit('message', { type: 'preDeployResult' })
          );
        }
      });
      await registered!();

      // The callback tears down eagerly, mirroring the no-pre-deploy path.
      expect(child.disconnect).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledTimes(1);

      // A later unconditional teardown by the caller is a no-op.
      runner.teardown();
      expect(child.disconnect).toHaveBeenCalledTimes(1);
    });

    it('teardown() releases a kept-alive worker even if pre-deploy never ran (leak fix)', async () => {
      driveBuild({ result: { output: {} }, hasPreDeploy: true });
      const runner = new SubprocessBuildRunner(
        makeContext({
          expectsPreDeploy: true,
          buildOptions: {
            entrypoint: 'index.js',
            registerPreDeploy: vi.fn(), // registered, but the callback is never invoked
          } as unknown as BuildOptions,
        })
      );

      await runner.build();
      expect(child.disconnect).not.toHaveBeenCalled(); // still alive after build

      runner.teardown(); // caller's unconditional teardown (e.g. because a later build threw)

      expect(child.disconnect).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('tears down the worker when the build fails', async () => {
      queueMicrotask(() => child.emit('message', { type: 'ready' }));
      child.send.mockImplementation((sent: { type: string }) => {
        if (sent.type === 'build') {
          queueMicrotask(() =>
            child.emit('message', {
              type: 'buildResult',
              error: { message: 'boom' },
            })
          );
        }
      });
      const runner = new SubprocessBuildRunner(makeContext());

      await expect(runner.build()).rejects.toThrow('boom');
      expect(child.disconnect).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('exposes diagnostics the worker sent alongside a build error', async () => {
      // A failed build is when diagnostics matter most. The worker collects them before
      // reporting the error, so the runner must capture them even though build() rejects —
      // the command reads them from a `finally` that runs on both outcomes.
      queueMicrotask(() => child.emit('message', { type: 'ready' }));
      child.send.mockImplementation((sent: { type: string }) => {
        if (sent.type === 'build') {
          queueMicrotask(() =>
            child.emit('message', {
              type: 'buildResult',
              error: { message: 'boom' },
              diagnostics: {
                'package-manifest.json': { type: 'FileBlob', data: '{}' },
              },
            })
          );
        }
      });
      const runner = new SubprocessBuildRunner(makeContext());

      await expect(runner.build()).rejects.toThrow('boom');

      const diagnostics = await runner.diagnostics();
      expect(Object.keys(diagnostics ?? {})).toEqual(['package-manifest.json']);
      expect(diagnostics?.['package-manifest.json']).toBeInstanceOf(FileBlob);
    });

    it('leaves diagnostics undefined when a failed build reported none', async () => {
      queueMicrotask(() => child.emit('message', { type: 'ready' }));
      child.send.mockImplementation((sent: { type: string }) => {
        if (sent.type === 'build') {
          queueMicrotask(() =>
            child.emit('message', {
              type: 'buildResult',
              error: { message: 'boom' },
            })
          );
        }
      });
      const runner = new SubprocessBuildRunner(makeContext());

      await expect(runner.build()).rejects.toThrow('boom');
      expect(await runner.diagnostics()).toBeUndefined();
    });

    it('teardown() is a no-op before build() and does not throw', () => {
      const runner = new SubprocessBuildRunner(makeContext());
      expect(() => runner.teardown()).not.toThrow();
    });

    it('teardown() does not re-kill a worker that already exited', async () => {
      driveBuild({ result: { output: {} } });
      const runner = new SubprocessBuildRunner(makeContext());
      await runner.build(); // tears down once (disconnect + kill)

      child.kill.mockClear();
      runner.teardown(); // second call: already disconnected and exited

      expect(child.kill).not.toHaveBeenCalled();
    });
  });
});
