import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import { access, lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyInternalBuildRequest,
  InternalBuildWorkerReport,
  preloadInternalBuild,
  waitForInternalBuildRequest,
} from '../../src/internal-build-worker';

const chmodGate = vi.hoisted(() => ({
  current: undefined as Promise<void> | undefined,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    chmod: async (...args: Parameters<typeof actual.chmod>) => {
      await chmodGate.current;
      return actual.chmod(...args);
    },
  };
});

let root: string;
let socketPath: string;

beforeEach(async () => {
  root = await realpath(
    await mkdtemp(join(tmpdir(), 'vercel-internal-build-worker-'))
  );
  socketPath = join(root, 'worker.sock');
});

afterEach(async () => {
  chmodGate.current = undefined;
  await rm(root, { force: true, recursive: true });
});

async function connect(): Promise<Socket> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await access(socketPath);
      return createConnection(socketPath);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  throw new Error('Worker socket was not created');
}

function waitForClose(socket: Socket): Promise<void> {
  if (socket.destroyed) return Promise.resolve();
  return new Promise(resolve => socket.once('close', () => resolve()));
}

// Timings are split off so assertions can match the protocol fields exactly.
function collectMessages(
  socket: Socket,
  timings: Array<Record<string, unknown>> = []
) {
  const messages: Array<Record<string, unknown>> = [];
  let received = '';
  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    received += chunk;
    let newline = received.indexOf('\n');
    while (newline !== -1) {
      const { timings: messageTimings, ...message } = JSON.parse(
        received.slice(0, newline)
      ) as Record<string, unknown>;
      messages.push(message);
      timings.push(messageTimings as Record<string, unknown>);
      received = received.slice(newline + 1);
      newline = received.indexOf('\n');
    }
  });
  return messages;
}

function buildRequest() {
  return {
    type: 'build' as const,
    id: 'build-1',
    cwd: root,
    argv: ['build', '--output', join(root, '.vercel/output')],
    env: { PATH: process.env.PATH ?? '' },
  };
}

describe.skipIf(process.platform === 'win32')('internal build worker', () => {
  it('preloads before readiness and completes one build handoff', async () => {
    let markBuildReady!: () => void;
    const buildReady = new Promise<void>(resolve => {
      markBuildReady = resolve;
    });
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => buildReady
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    markBuildReady();
    await new Promise<void>((resolve, reject) => {
      socket.on('error', reject);
      socket.on('data', () => {
        if (messages.some(message => message.type === 'ready')) resolve();
      });
    });
    socket.write(`${JSON.stringify(buildRequest())}\n`);

    const handoff = await handoffPromise;
    expect(handoff.request).toEqual(buildRequest());
    await expect(access(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages).toEqual([
      {
        type: 'ready',
        protocol: 1,
        runtime: `node${process.versions.node.split('.')[0]}`,
      },
      { type: 'complete', exitCode: 0 },
    ]);
  });

  it('listens before starting the preload', async () => {
    let socketModeAtPreload: number | undefined;
    let markBuildReady!: () => void;
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      async () => {
        socketModeAtPreload = (await lstat(socketPath)).mode & 0o077;
        await new Promise<void>(resolve => {
          markBuildReady = resolve;
        });
      }
    );

    await expect.poll(() => socketModeAtPreload).toBe(0);
    const socket = createConnection(socketPath);
    const messages = collectMessages(socket);
    await once(socket, 'connect');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(messages).toEqual([]);

    markBuildReady();
    await expect
      .poll(() => messages.some(message => message.type === 'ready'))
      .toBe(true);
    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({ type: 'complete', exitCode: 0 });
  });

  it('answers a connection accepted while the socket is still being secured', async () => {
    let openGate!: () => void;
    chmodGate.current = new Promise<void>(resolve => {
      openGate = resolve;
    });
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      async () => {}
    );

    const socket = await connect();
    const messages = collectMessages(socket);
    await expect
      .poll(() => messages.some(message => message.type === 'ready'))
      .toBe(true);
    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    openGate();
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({ type: 'complete', exitCode: 0 });
  });

  it('reports ready before the vlt Builder preload finishes', async () => {
    let vltPreloadStarted = false;
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () =>
        preloadInternalBuild(
          async () => ({
            preloadVltBuilderImports: () => {
              vltPreloadStarted = true;
              return new Promise<void>(() => {});
            },
          }),
          async () => {}
        )
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    await expect
      .poll(() => messages.some(message => message.type === 'ready'))
      .toBe(true);
    expect(vltPreloadStarted).toBe(true);
    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
  });

  it('ignores a failed vlt Builder preload', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await preloadInternalBuild(
        async () => ({
          preloadVltBuilderImports: () =>
            Promise.reject(new Error('graph unavailable')),
        }),
        async () => {}
      );
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('waits for the build command and internal build modules', async () => {
    let loadInternalBuild!: () => void;
    let settled = false;
    const preload = preloadInternalBuild(
      async () => ({ preloadVltBuilderImports: async () => {} }),
      () =>
        new Promise<void>(resolve => {
          loadInternalBuild = resolve;
        })
    ).then(() => {
      settled = true;
    });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    loadInternalBuild();
    await preload;
    expect(settled).toBe(true);
  });

  it('reports worker timings with ready, the late vlt preload, and the terminal message', async () => {
    let finishVltPreload!: () => void;
    const report = new InternalBuildWorkerReport({ entryAt: 1 });
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () =>
        preloadInternalBuild(
          async () => ({
            preloadVltBuilderImports: () =>
              new Promise<void>(resolve => {
                finishVltPreload = resolve;
              }),
          }),
          async () => {},
          report
        ),
      { report }
    );
    const socket = await connect();
    const timings: Array<Record<string, unknown>> = [];
    const messages = collectMessages(socket, timings);

    await expect
      .poll(() => messages.some(message => message.type === 'ready'))
      .toBe(true);
    expect(timings[0]).toEqual(
      expect.objectContaining({
        timeOrigin: expect.any(Number),
        entryAt: 1,
        listenAt: expect.any(Number),
        buildModuleLoadedAt: expect.any(Number),
        readyAt: expect.any(Number),
        connectionAt: expect.any(Number),
        readySentAt: expect.any(Number),
        vltPreloadStartedAt: expect.any(Number),
        vltPreloadState: 'inFlight',
        node: process.versions.node,
      })
    );
    expect(timings[0]).not.toHaveProperty('vltPreloadDoneAt');
    expect(timings[0].listenAt as number).toBeLessThanOrEqual(
      timings[0].readyAt as number
    );

    finishVltPreload();
    await expect
      .poll(() => messages.some(message => message.type === 'preload'))
      .toBe(true);
    expect(timings[1]).toEqual(
      expect.objectContaining({
        vltPreloadDoneAt: expect.any(Number),
        vltPreloadState: 'done',
      })
    );

    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.map(message => message.type)).toEqual([
      'ready',
      'preload',
      'complete',
    ]);
    expect(timings[2]).toEqual(
      expect.objectContaining({
        handoffReceivedAt: expect.any(Number),
        terminalAt: expect.any(Number),
        vltPreloadState: 'done',
      })
    );
  });

  it('reports a vlt preload that settled before ready only once', async () => {
    const report = new InternalBuildWorkerReport();
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      async () => {
        await preloadInternalBuild(
          async () => ({ preloadVltBuilderImports: async () => {} }),
          async () => {},
          report
        );
        await new Promise(resolve => setTimeout(resolve, 10));
      },
      { report }
    );
    const socket = await connect();
    const timings: Array<Record<string, unknown>> = [];
    const messages = collectMessages(socket, timings);
    await expect
      .poll(() => messages.some(message => message.type === 'ready'))
      .toBe(true);
    expect(timings[0]).toEqual(
      expect.objectContaining({
        vltPreloadDoneAt: expect.any(Number),
        vltPreloadState: 'done',
      })
    );

    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.map(message => message.type)).toEqual([
      'ready',
      'complete',
    ]);
  });

  it('reports a failed vlt preload in the worker timings', async () => {
    const report = new InternalBuildWorkerReport();
    await preloadInternalBuild(
      async () => ({
        preloadVltBuilderImports: () =>
          Promise.reject(new Error('graph unavailable')),
      }),
      async () => {},
      report
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(report.snapshot()).toEqual(
      expect.objectContaining({
        vltPreloadState: 'failed',
        vltPreloadError: 'graph unavailable',
      })
    );
    expect(report.snapshot()).not.toHaveProperty('vltPreloadDoneAt');
  });

  it('reports a preload that throws synchronously', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => {
        throw new Error('Build preload threw');
      }
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    await expect(handoffPromise).rejects.toThrow('Build preload threw');
    await waitForClose(socket);
    expect(messages).toEqual([
      { type: 'error', message: 'Build preload threw' },
    ]);
  });

  it('accepts a complete request followed by a half-close during preload', async () => {
    let markBuildReady!: () => void;
    const buildReady = new Promise<void>(resolve => {
      markBuildReady = resolve;
    });
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => buildReady
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    socket.end(`${JSON.stringify(buildRequest())}\n`);
    await once(socket, 'finish');
    await new Promise(resolve => setImmediate(resolve));
    markBuildReady();

    const handoff = await handoffPromise;
    expect(handoff.request).toEqual(buildRequest());
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({ type: 'complete', exitCode: 0 });
  });

  it('reports a terminal build error after accepting the request', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve()
    );
    const socket = await connect();
    const messages = collectMessages(socket);
    socket.write(`${JSON.stringify(buildRequest())}\n`);

    const handoff = await handoffPromise;
    await handoff.error(new Error('Failed to apply build request'));
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Failed to apply build request',
    });
  });

  it('creates a private socket', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve()
    );
    // Accepting a connection closes the listener and unlinks its socket.
    await expect
      .poll(async () => (await lstat(socketPath)).mode & 0o777)
      .toBe(0o600);
    const socket = await connect();
    const messages = collectMessages(socket);

    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({ type: 'complete', exitCode: 0 });
  });

  it('settles even when socket cleanup fails', async () => {
    const cleanupError = Object.assign(new Error('Socket cleanup failed'), {
      code: 'EPERM',
    });
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve(),
      { removeSocket: async () => Promise.reject(cleanupError) }
    );
    const socket = await connect();
    const messages = collectMessages(socket);
    socket.write(`${JSON.stringify(buildRequest())}\n`);

    await expect(handoffPromise).rejects.toBe(cleanupError);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Socket cleanup failed',
    });
  });

  it('times out after readiness when no request arrives', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve(),
      { requestTimeoutMs: 10 }
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    await expect(handoffPromise).rejects.toThrow(
      'Timed out waiting for build request'
    );
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Timed out waiting for build request',
    });
  });

  it('reports a build preload failure to the client', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.reject(new Error('Build preload failed'))
    );
    const socket = await connect();
    const messages = collectMessages(socket);

    await expect(handoffPromise).rejects.toThrow('Build preload failed');
    await waitForClose(socket);
    expect(messages).toEqual([
      { type: 'error', message: 'Build preload failed' },
    ]);
    await expect(access(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects oversized requests', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve()
    );
    const socket = await connect();
    const messages = collectMessages(socket);
    socket.on('error', () => {});
    socket.write(`${'x'.repeat(1024 * 1024 + 1)}\n`);

    await expect(handoffPromise).rejects.toThrow('Request is too large');
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Request is too large',
    });
  });

  it('rejects malformed requests and removes the socket', async () => {
    const handoffPromise = waitForInternalBuildRequest(
      ['--internal-build-worker', '--socket', socketPath],
      () => Promise.resolve()
    );
    const socket = await connect();
    const messages = collectMessages(socket);
    socket.write('{not-json\n');

    await expect(handoffPromise).rejects.toThrow('Invalid build request');
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Invalid build request',
    });
    await expect(access(socketPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes the ready file after preload without a client connection', async () => {
    const readyFile = join(root, 'ready', 'native_worker_ready');
    let markBuildReady!: () => void;
    const buildReady = new Promise<void>(resolve => {
      markBuildReady = resolve;
    });
    const handoffPromise = waitForInternalBuildRequest(
      [
        '--internal-build-worker',
        '--socket',
        socketPath,
        '--ready-file',
        readyFile,
      ],
      () => buildReady
    );

    await expect.poll(() => access(socketPath).then(() => true)).toBe(true);
    await expect(access(readyFile)).rejects.toMatchObject({ code: 'ENOENT' });

    markBuildReady();
    await expect.poll(() => access(readyFile).then(() => true)).toBe(true);

    const socket = await connect();
    const messages = collectMessages(socket);
    socket.write(`${JSON.stringify(buildRequest())}\n`);
    const handoff = await handoffPromise;
    await handoff.complete(0);
    await waitForClose(socket);
    expect(messages.at(-1)).toEqual({ type: 'complete', exitCode: 0 });
  });

  it('does not write the ready file when preload fails', async () => {
    const readyFile = join(root, 'native_worker_ready');
    const handoffPromise = waitForInternalBuildRequest(
      [
        '--internal-build-worker',
        '--socket',
        socketPath,
        '--ready-file',
        readyFile,
      ],
      () => Promise.reject(new Error('Build preload failed'))
    );
    const socket = await connect();
    collectMessages(socket);

    await expect(handoffPromise).rejects.toThrow('Build preload failed');
    await waitForClose(socket);
    await expect(access(readyFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    [['--internal-build-worker', '--socket']],
    [['--internal-build-worker', '--socket', 'x', '--ready', '/tmp/ready']],
    [['--internal-build-worker', '--socket', 'x', '--ready-file']],
  ])('rejects invalid worker arguments %j', async argv => {
    await expect(
      waitForInternalBuildRequest(argv, () => Promise.resolve())
    ).rejects.toThrow(
      'Expected --internal-build-worker --socket <path> [--ready-file <path>]'
    );
  });

  it('rejects a relative ready file path', async () => {
    await expect(
      waitForInternalBuildRequest(
        [
          '--internal-build-worker',
          '--socket',
          socketPath,
          '--ready-file',
          'ready',
        ],
        () => Promise.resolve()
      )
    ).rejects.toThrow('The worker ready file path must be absolute');
  });

  it('installs the handoff as a normal CLI invocation', () => {
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const originalEnv = { ...process.env };

    try {
      applyInternalBuildRequest({
        ...buildRequest(),
        env: { INTERNAL_BUILD_TEST: 'enabled' },
      });

      expect(process.argv).toEqual([
        process.execPath,
        originalArgv[1],
        ...buildRequest().argv,
      ]);
      expect(process.cwd()).toBe(root);
      expect(process.env).toEqual({
        INTERNAL_BUILD_TEST: 'enabled',
        VERCEL_VC_NATIVE: '1',
      });
    } finally {
      process.argv = originalArgv;
      process.chdir(originalCwd);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  });
});
