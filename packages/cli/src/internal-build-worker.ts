import { readdirSync } from 'node:fs';
import { chmod, lstat, mkdir, unlink, writeFile } from 'node:fs/promises';
import * as nodeModule from 'node:module';
import { createServer, type Server, type Socket } from 'node:net';
import { dirname, isAbsolute } from 'node:path';

const MAX_REQUEST_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

type WorkerMark =
  | 'entryAt'
  | 'listenAt'
  | 'buildModuleLoadedAt'
  | 'readyAt'
  | 'connectionAt'
  | 'readySentAt'
  | 'handoffReceivedAt'
  | 'vltPreloadStartedAt'
  | 'vltPreloadDoneAt'
  | 'terminalAt';

export type InternalBuildWorkerTimings = Partial<Record<WorkerMark, number>> & {
  timeOrigin: number;
  node: string;
  vltPreloadState: 'notStarted' | 'inFlight' | 'done' | 'failed';
  vltPreloadError?: string;
  compileCacheDir?: string;
  compileCacheEntriesAtStart?: number;
  compileCacheEntriesAtEnd?: number;
};

function getCompileCacheDir(): string | undefined {
  return (
    nodeModule as { getCompileCacheDir?: () => string | undefined }
  ).getCompileCacheDir?.();
}

function countCompileCacheEntries(dir: string | undefined) {
  if (!dir) return undefined;
  try {
    return readdirSync(dir).length;
  } catch {
    return undefined;
  }
}

/**
 * Self-reported timings, in milliseconds since process start
 * (`performance.timeOrigin`), sent with every worker message so the build
 * container can attribute the time before and after handoff.
 */
export class InternalBuildWorkerReport {
  private readonly timings: InternalBuildWorkerTimings;
  private readonly settledListeners: (() => void)[] = [];

  constructor({ entryAt }: { entryAt?: number } = {}) {
    const compileCacheDir = getCompileCacheDir();
    this.timings = {
      timeOrigin: Math.round(performance.timeOrigin),
      node: process.versions.node,
      vltPreloadState: 'notStarted',
      compileCacheDir,
      compileCacheEntriesAtStart: countCompileCacheEntries(compileCacheDir),
    };
    if (entryAt !== undefined) this.timings.entryAt = Math.round(entryAt);
  }

  mark(name: WorkerMark): void {
    this.timings[name] ??= Math.round(performance.now());
  }

  vltPreloadStarted(): void {
    this.mark('vltPreloadStartedAt');
    this.timings.vltPreloadState = 'inFlight';
  }

  vltPreloadSettled(error?: unknown): void {
    if (error === undefined) {
      this.mark('vltPreloadDoneAt');
      this.timings.vltPreloadState = 'done';
    } else {
      this.timings.vltPreloadState = 'failed';
      this.timings.vltPreloadError =
        error instanceof Error ? error.message : String(error);
    }
    for (const listener of this.settledListeners.splice(0)) listener();
  }

  onVltPreloadSettled(listener: () => void): void {
    if (
      this.timings.vltPreloadState === 'done' ||
      this.timings.vltPreloadState === 'failed'
    ) {
      listener();
    } else {
      this.settledListeners.push(listener);
    }
  }

  // Node writes compile cache entries only when flushed, so the entries
  // added by the flush are the modules this process compiled without a hit.
  flushCompileCache(): void {
    try {
      (nodeModule as { flushCompileCache?: () => void }).flushCompileCache?.();
    } catch {}
    this.timings.compileCacheEntriesAtEnd = countCompileCacheEntries(
      this.timings.compileCacheDir
    );
  }

  snapshot(): InternalBuildWorkerTimings {
    return { ...this.timings };
  }
}

export interface InternalBuildRequest {
  type: 'build';
  id: string;
  cwd: string;
  argv: string[];
  env: Record<string, string>;
}

// zod is loaded with the first request so that it does not delay the listen.
async function parseBuildRequest(
  payload: string
): Promise<InternalBuildRequest> {
  const { z } = await import('zod');
  const buildRequestSchema = z.object({
    type: z.literal('build'),
    id: z.string().min(1).max(128),
    cwd: z.string().min(1).refine(isAbsolute, {
      message: 'cwd must be absolute',
    }),
    argv: z
      .array(z.string().max(4096))
      .min(1)
      .max(64)
      .refine(argv => argv[0] === 'build', {
        message: 'argv must begin with "build"',
      }),
    env: z.record(z.string(), z.string()),
  });
  return buildRequestSchema.parse(JSON.parse(payload));
}

export interface InternalBuildHandoff {
  complete(exitCode: number): Promise<void>;
  error(error: unknown): Promise<void>;
  request: InternalBuildRequest;
}

interface InternalBuildWorkerOptions {
  removeSocket?: (socketPath: string) => Promise<void>;
  report?: InternalBuildWorkerReport;
  requestTimeoutMs?: number;
}

function writeMessage(socket: Socket, message: object): void {
  socket.write(`${JSON.stringify(message)}\n`);
}

async function removeSocket(socketPath: string): Promise<void> {
  try {
    await unlink(socketPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function assertUnusedSocketPath(socketPath: string): Promise<void> {
  if (!isAbsolute(socketPath)) {
    throw new Error('The worker socket path must be absolute');
  }

  try {
    await lstat(socketPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  throw new Error(`The worker socket path already exists: ${socketPath}`);
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (
        error &&
        (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
      ) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function bind(server: Server, socketPath: string): Promise<void> {
  const originalUmask = process.umask(0o077);
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(socketPath);
    });
  } finally {
    process.umask(originalUmask);
  }
}

function parseWorkerArgs(argv: string[]): {
  socketPath: string;
  readyFile?: string;
} {
  const usage =
    'Expected --internal-build-worker --socket <path> [--ready-file <path>]';
  if (
    (argv.length !== 3 && argv.length !== 5) ||
    argv[0] !== '--internal-build-worker' ||
    argv[1] !== '--socket' ||
    (argv.length === 5 && argv[3] !== '--ready-file')
  ) {
    throw new Error(usage);
  }

  const readyFile = argv[4];
  if (readyFile !== undefined && !isAbsolute(readyFile)) {
    throw new Error('The worker ready file path must be absolute');
  }

  return { socketPath: argv[2], readyFile };
}

// Callers use the ready file to observe preload completion without connecting,
// since a connection starts the build request timeout.
async function writeReadyFile(readyFile: string): Promise<void> {
  try {
    await mkdir(dirname(readyFile), { recursive: true });
    await writeFile(readyFile, '');
  } catch {
    // Readiness is advisory; the socket handoff still works without it.
  }
}

// Readiness does not wait for the vlt preload: a build that needs vlt awaits
// the same in-flight load, and loads on demand if the preload failed.
export async function preloadInternalBuild(
  loadBuildCommand: () => Promise<{
    preloadVltBuilderImports(): Promise<void>;
  }>,
  loadInternalBuild: () => Promise<unknown>,
  report?: InternalBuildWorkerReport
): Promise<void> {
  const [{ preloadVltBuilderImports }] = await Promise.all([
    loadBuildCommand(),
    loadInternalBuild(),
  ]);
  report?.mark('buildModuleLoadedAt');
  report?.vltPreloadStarted();
  void preloadVltBuilderImports().then(
    () => report?.vltPreloadSettled(),
    (error: unknown) =>
      report?.vltPreloadSettled(error ?? new Error('vlt preload failed'))
  );
}

export function applyInternalBuildRequest(request: InternalBuildRequest): void {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(request.env, key)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, request.env, { VERCEL_VC_NATIVE: '1' });

  process.chdir(request.cwd);
  process.argv = [process.execPath, process.argv[1], ...request.argv];
}

// The build container retries connecting until the socket exists, so the
// preload starts only after listening; its module evaluation would otherwise
// delay the listen. A connection made during preload waits for `ready`.
// Handlers are attached before listening: a connection emitted without a
// listener would be held open and never answered.
export async function waitForInternalBuildRequest(
  argv: string[],
  preloadBuildCommand: () => Promise<unknown>,
  {
    removeSocket: removeSocketFile = removeSocket,
    report = new InternalBuildWorkerReport(),
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
  }: InternalBuildWorkerOptions = {}
): Promise<InternalBuildHandoff> {
  const { socketPath, readyFile } = parseWorkerArgs(argv);
  await assertUnusedSocketPath(socketPath);

  const server = createServer({ allowHalfOpen: true });

  let startPreload!: () => void;
  const buildCommandReady = new Promise<unknown>((resolve, reject) => {
    startPreload = () => {
      try {
        resolve(preloadBuildCommand());
      } catch (error: unknown) {
        reject(error);
      }
    };
  });
  void buildCommandReady.then(
    () => report.mark('readyAt'),
    () => {}
  );

  return new Promise<InternalBuildHandoff>((resolve, reject) => {
    let listening = false;
    let accepted = false;
    let settled = false;
    let terminalSent = false;

    const sendTerminal = async (socket: Socket, message: object) => {
      if (terminalSent) return;
      terminalSent = true;
      socket.setTimeout(0);
      if (socket.destroyed) return;
      report.mark('terminalAt');
      report.flushCompileCache();
      const terminal = { ...message, timings: report.snapshot() };

      await new Promise<void>(done => {
        const finish = () => {
          socket.off('error', finish);
          done();
        };
        socket.once('error', finish);
        socket.end(`${JSON.stringify(terminal)}\n`, finish);
      });
      socket.destroy();
    };

    const fail = async (socket: Socket, error: Error) => {
      if (settled) return;
      settled = true;
      const cleanup = Promise.allSettled([
        closeServer(server),
        removeSocketFile(socketPath),
      ]);
      try {
        await sendTerminal(socket, {
          type: 'error',
          message: error.message,
        });
      } finally {
        await cleanup;
        reject(error);
      }
    };

    server.on('error', error => {
      // listen() reports its own failures.
      if (!listening) return;
      settled = true;
      void Promise.allSettled([
        closeServer(server),
        removeSocketFile(socketPath),
      ]).then(() => reject(error));
    });

    server.on('connection', socket => {
      if (accepted) {
        socket.destroy();
        return;
      }
      accepted = true;
      report.mark('connectionAt');
      void closeServer(server).catch(error => {
        void fail(socket, error);
      });

      socket.setEncoding('utf8');

      let received = '';
      let parsing = false;

      void buildCommandReady.then(
        () => {
          if (!settled && !socket.destroyed) {
            socket.setTimeout(requestTimeoutMs, () => {
              void fail(
                socket,
                new Error('Timed out waiting for build request')
              );
            });
            report.mark('readySentAt');
            const timings = report.snapshot();
            writeMessage(socket, {
              type: 'ready',
              protocol: 1,
              runtime: `node${process.versions.node.split('.')[0]}`,
              timings,
            });
            if (timings.vltPreloadState !== 'inFlight') return;
            // A preload that settles after ready is reported separately so
            // callers can tell when every preloaded module is compiled.
            report.onVltPreloadSettled(() => {
              if (!terminalSent && !socket.destroyed) {
                writeMessage(socket, {
                  type: 'preload',
                  timings: report.snapshot(),
                });
              }
            });
          }
        },
        error => {
          void fail(
            socket,
            error instanceof Error
              ? error
              : new Error('Failed to preload build command')
          );
        }
      );

      socket.on('data', chunk => {
        if (settled || parsing) return;

        received += chunk;
        if (Buffer.byteLength(received) > MAX_REQUEST_BYTES) {
          void fail(socket, new Error('Request is too large'));
          return;
        }

        const newline = received.indexOf('\n');
        if (newline === -1) return;

        report.mark('handoffReceivedAt');
        parsing = true;
        const payload = received.slice(0, newline);
        const trailing = received.slice(newline + 1).trim();

        void buildCommandReady
          .then(
            async () => {
              if (trailing) {
                throw new Error('Only one build request is allowed');
              }

              let request: InternalBuildRequest;
              try {
                request = await parseBuildRequest(payload);
              } catch {
                throw new Error('Invalid build request');
              }

              await removeSocketFile(socketPath);
              settled = true;
              socket.setTimeout(0);
              resolve({
                request,
                complete: exitCode =>
                  sendTerminal(socket, { type: 'complete', exitCode }),
                error: error =>
                  sendTerminal(socket, {
                    type: 'error',
                    message:
                      error instanceof Error ? error.message : 'Build failed',
                  }),
              });
            },
            error => {
              void fail(
                socket,
                error instanceof Error
                  ? error
                  : new Error('Failed to preload build command')
              );
            }
          )
          .catch(error => {
            void fail(
              socket,
              error instanceof Error
                ? error
                : new Error('Invalid build request')
            );
          });
      });

      socket.on('end', () => {
        if (!settled && !parsing) {
          void fail(socket, new Error('Build request connection ended'));
        }
      });
      socket.on('error', error => {
        void fail(socket, error);
      });
    });

    const abort = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (!server.listening) {
        reject(error);
        return;
      }
      void Promise.allSettled([
        closeServer(server),
        removeSocketFile(socketPath),
      ]).then(() => reject(error));
    };

    bind(server, socketPath).then(() => {
      listening = true;
      report.mark('listenAt');
      startPreload();
      if (readyFile) {
        void buildCommandReady.then(
          () => writeReadyFile(readyFile),
          () => {}
        );
      }
      // The umask already made the socket owner-only; once a connection has
      // been accepted the socket file may be gone, so chmod can only fail.
      chmod(socketPath, 0o600).catch(error => {
        if (!accepted) abort(error);
      });
    }, abort);
  });
}
