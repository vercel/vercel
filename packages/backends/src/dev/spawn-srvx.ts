import { fork, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloneEnv, type StartDevServerSuccess } from '@vercel/build-utils';
import getPort from 'get-port';
import _treeKill from 'tree-kill';

const require_ = createRequire(import.meta.url);
const srvxCliPath = require_.resolve('srvx/cli');
const srvxBinPath = resolve(dirname(srvxCliPath), '../bin/srvx.mjs');
const tsxPath = pathToFileURL(require_.resolve('tsx')).href;

const STARTUP_TIMEOUT = 5 * 60_000;
const SHUTDOWN_TIMEOUT = 5_000;

function treeKill(pid: number, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolve, reject) => {
    _treeKill(pid, signal, error => {
      if (error) reject(error);
      else resolve();
    });
  });
}

interface SpawnSrvxOptions {
  workPath: string;
  entrypoint: string;
  env?: NodeJS.ProcessEnv;
  publicDir: string;
  signal?: AbortSignal;
  onStdout?: (data: Buffer) => void;
  onStderr?: (data: Buffer) => void;
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilReady(
  child: ChildProcess,
  port: number,
  entrypoint: string,
  signal?: AbortSignal
): Promise<void> {
  let failure: Error | undefined;
  const onError = (error: Error) => {
    failure = error;
  };
  const onExit = (code: number | null, exitSignal: NodeJS.Signals | null) => {
    const reason = exitSignal ? `signal ${exitSignal}` : `exit code ${code}`;
    failure = new Error(`Server \`${entrypoint}\` exited with ${reason}`);
  };

  child.once('error', onError);
  child.once('exit', onExit);
  try {
    const deadline = Date.now() + STARTUP_TIMEOUT;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new Error(`Server \`${entrypoint}\` cancelled`);
      }
      if (failure) throw failure;
      if (await canConnect(port)) {
        if (failure) throw failure;
        return;
      }
      await sleep(50);
    }
    throw new Error(
      `Server \`${entrypoint}\` did not listen on port ${port} within ${STARTUP_TIMEOUT}ms`
    );
  } finally {
    child.off('error', onError);
    child.off('exit', onExit);
  }
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

  if (child.pid) {
    await treeKill(child.pid, 'SIGTERM').catch(() => {
      child.kill('SIGTERM');
    });
  }
  if (await waitForExit(child, SHUTDOWN_TIMEOUT)) return;

  if (child.pid) {
    await treeKill(child.pid, 'SIGKILL').catch(() => {
      child.kill('SIGKILL');
    });
  }
  await waitForExit(child, 1_000);
}

export async function spawnSrvx(
  opts: SpawnSrvxOptions
): Promise<StartDevServerSuccess> {
  const port = await getPort({ host: '127.0.0.1' });
  const env = cloneEnv(process.env, opts.env, {
    HOST: '127.0.0.1',
    PORT: String(port),
  });
  if (!env.NODE_ENV) env.NODE_ENV = 'development';

  // Fork the executable with IPC so srvx serves in this process. Running it as
  // a regular command would add a watcher supervisor and obscure the PID that
  // Backends owns. The Vercel CLI already handles source-file invalidation.
  const child = fork(
    srvxBinPath,
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
    await waitUntilReady(child, port, opts.entrypoint, opts.signal);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  return {
    pid: child.pid,
    port,
    shutdown: () => stopChild(child),
  };
}
