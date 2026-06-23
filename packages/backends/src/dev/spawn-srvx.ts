import { fork, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneEnv } from '@vercel/build-utils';
import getPort from 'get-port';

const require_ = createRequire(import.meta.url);
const srvxCliPath = require_.resolve('srvx/cli');
const tsxPath = pathToFileURL(require_.resolve('tsx')).href;

const STARTUP_TIMEOUT = 5 * 60_000;
const SHUTDOWN_TIMEOUT = 5_000;

export interface SpawnSrvxOptions {
  workPath: string;
  entrypoint: string;
  env?: NodeJS.ProcessEnv;
  publicDir: string;
  onStdout?: (data: Buffer) => void;
  onStderr?: (data: Buffer) => void;
}

export interface SpawnedSrvx {
  child: ChildProcess;
  pid: number;
  port: number;
  shutdown: () => Promise<void>;
}

function forwardOutput(
  callback: ((data: Buffer) => void) | undefined,
  stream: NodeJS.WriteStream
): (data: Buffer) => void {
  return data => {
    if (callback) {
      callback(data);
    } else {
      stream.write(data.toString());
    }
  };
}

function canConnect(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(100, () => finish(false));
  });
}

function waitUntilReady(
  child: ChildProcess,
  port: number,
  entrypoint: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + STARTUP_TIMEOUT;
    let retryTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const cleanup = () => {
      if (retryTimer) clearTimeout(retryTimer);
      child.off('error', onError);
      child.off('exit', onExit);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onError = (error: Error) => fail(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      fail(new Error(`Server \`${entrypoint}\` exited with ${reason}`));
    };

    const probe = async () => {
      if (settled) return;
      if (await canConnect(port)) {
        succeed();
      } else if (Date.now() >= deadline) {
        fail(
          new Error(
            `Server \`${entrypoint}\` did not listen on port ${port} within ${STARTUP_TIMEOUT}ms`
          )
        );
      } else {
        retryTimer = setTimeout(probe, 50);
      }
    };

    child.once('error', onError);
    child.once('exit', onExit);
    void probe();
  });
}

function waitForExit(child: ChildProcess, timeout: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeout);
    child.once('exit', onExit);
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill('SIGTERM');
  if (await waitForExit(child, SHUTDOWN_TIMEOUT)) return;

  child.kill('SIGKILL');
  await waitForExit(child, 1_000);
}

export async function spawnSrvx(opts: SpawnSrvxOptions): Promise<SpawnedSrvx> {
  const port = await getPort({ host: '127.0.0.1' });
  const env = cloneEnv(process.env, opts.env, {
    HOST: '127.0.0.1',
    PORT: String(port),
  });
  if (!env.NODE_ENV) env.NODE_ENV = 'development';

  // Fork the CLI module directly so it enters srvx's IPC-aware serve path.
  // Invoking the binary would add a watcher supervisor and obscure the PID
  // that Backends owns. The Vercel CLI already watches source files and asks
  // the builder to replace this process when they change.
  const child = fork(
    srvxCliPath,
    [
      `--port=${port}`,
      '--host=127.0.0.1',
      `--static=${resolve(opts.workPath, opts.publicDir)}`,
      opts.entrypoint,
    ],
    {
      cwd: opts.workPath,
      env,
      execArgv: ['--import', tsxPath],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );

  child.stdout?.on('data', forwardOutput(opts.onStdout, process.stdout));
  child.stderr?.on('data', forwardOutput(opts.onStderr, process.stderr));

  if (!child.pid) {
    throw new Error('srvx child failed to spawn');
  }

  try {
    await waitUntilReady(child, port, opts.entrypoint);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  return {
    child,
    pid: child.pid,
    port,
    shutdown: () => stopChild(child),
  };
}
