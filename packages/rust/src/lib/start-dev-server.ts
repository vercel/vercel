import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import getPort from 'get-port';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import { installRustToolchain } from './rust-toolchain';
import { buildExecutableForDev } from './dev-build';
import { createDevServerEnv } from './dev-server';

// How long to wait for a graceful `SIGTERM` shutdown before forcing `SIGKILL`.
// Set to 35s since the vercel runtime crate allows up to 30s for waitUntil to complete.
const SHUTDOWN_TIMEOUT = 35_000;

// Matches the Rust runtime's "address already in use" error.
const ADDR_IN_USE_RE = /address (already )?in use|AddrInUse|EADDRINUSE/i;

const MAX_STDERR_CAPTURE = 8_192;

// Tracks spawned dev servers so they can be force-killed if `vercel dev` exits
// without calling `shutdown`.
const RUNNING_DEV_SERVERS = new Set<ChildProcess>();
let cleanupHandlersInstalled = false;

function installGlobalCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  // Graceful shutdown on signals; don't call `process.exit()` so `vercel dev`'s
  // own handlers still run.
  const onSignal = () => {
    for (const child of RUNNING_DEV_SERVERS) {
      try {
        child.kill('SIGTERM');
      } catch (err) {
        debug(`Error sending SIGTERM to Rust dev server on signal: ${err}`);
      }
    }
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('SIGHUP', onSignal);

  // `exit` can't await async work, so synchronously SIGKILL any survivors.
  process.on('exit', () => {
    for (const child of RUNNING_DEV_SERVERS) {
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGKILL');
        } catch {
          // Process already gone.
        }
      }
    }
    RUNNING_DEV_SERVERS.clear();
  });
}

// Register a child for cleanup and untrack it once it exits.
function trackDevServer(child: ChildProcess): void {
  installGlobalCleanupHandlers();
  RUNNING_DEV_SERVERS.add(child);
  const untrack = () => {
    RUNNING_DEV_SERVERS.delete(child);
  };
  child.once('exit', untrack);
  child.once('close', untrack);
}

// Actionable failures (e.g. port collisions) surfaced to the user instead of
// silently falling back to lambda invocation.
class RustDevServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RustDevServerError';
  }
}

// Terminate and resolve only once the process exits (releasing its port),
// escalating to SIGKILL after SHUTDOWN_TIMEOUT.
function terminate(child: ChildProcess): Promise<void> {
  return new Promise<void>(resolve => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };

    child.once('exit', done);
    child.once('close', done);

    try {
      child.kill('SIGTERM');
    } catch (err) {
      debug(`Error sending SIGTERM to Rust dev server: ${err}`);
      done();
      return;
    }

    timer = setTimeout(() => {
      debug(
        `Rust dev server did not exit within ${SHUTDOWN_TIMEOUT}ms, sending SIGKILL`
      );
      try {
        child.kill('SIGKILL');
      } catch (err) {
        debug(`Error sending SIGKILL to Rust dev server: ${err}`);
      }
    }, SHUTDOWN_TIMEOUT);
    timer.unref?.();
  });
}

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint, workPath, meta = {}, onStdout, onStderr } = opts;

  try {
    await installRustToolchain();
    const executablePath = await buildExecutableForDev(workPath, entrypoint);

    // Honor an explicitly requested port, else allocate a free one to avoid the
    // runtime's fixed default port colliding across dev server restarts.
    const requestedPort =
      typeof meta.port === 'number'
        ? meta.port
        : meta.env?.VERCEL_DEV_PORT
          ? Number(meta.env.VERCEL_DEV_PORT)
          : undefined;
    const port =
      typeof requestedPort === 'number' && Number.isInteger(requestedPort)
        ? requestedPort
        : await getPort();

    debug(`Starting Rust dev server: ${executablePath} (port=${port})`);
    const devEnv = createDevServerEnv(process.env, meta, port);

    const child = spawn(executablePath, [], {
      cwd: workPath,
      env: devEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error('Failed to start Rust dev server process');
    }

    trackDevServer(child);

    debug(`Rust dev server process started with PID: ${child.pid}`);

    // The runtime prints `Dev server listening: <port>` once bound.
    let buffer = '';
    let portEmitted = false;
    // Bounded stderr tail for diagnostics if the process exits before readiness.
    let stderrTail = '';

    child.stdout?.on('data', data => {
      const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      buffer += chunk.toString();
      if (!portEmitted) {
        // Use the port the runtime actually bound to (an older runtime may
        // ignore VERCEL_DEV_PORT). Wait for the full line before signaling.
        const match = buffer.match(/Dev server listening:\s*(\d+)/);
        if (match) {
          portEmitted = true;
          const reportedPort = parseInt(match[1], 10);
          debug(`Rust dev server reported ready on port ${reportedPort}`);
          child.emit('message', { port: reportedPort }, null);
          buffer = '';
        }
      }
      if (onStdout) {
        onStdout(chunk);
      } else {
        process.stdout.write(chunk.toString());
      }
    });

    child.stderr?.on('data', data => {
      const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      stderrTail = (stderrTail + chunk.toString()).slice(-MAX_STDERR_CAPTURE);
      if (onStderr) {
        onStderr(chunk);
      } else {
        process.stderr.write(chunk.toString());
      }
    });

    child.on('error', err => {
      debug(`Rust dev server error: ${err}`);
    });

    child.on('exit', (code, signal) => {
      debug(`Rust dev server exited with code ${code}, signal ${signal}`);
    });

    const onMessage = once(child, 'message');
    const onExit = once(child, 'close');

    const result = await Promise.race([
      onMessage.then((args: any[]) => {
        const [messageData] = args;
        return { state: 'message' as const, value: messageData };
      }),
      onExit.then((args: any[]) => {
        const [code, signal] = args;
        return { state: 'exit' as const, value: [code, signal] as const };
      }),
    ]);

    if (result.state === 'message') {
      // Prefer the port reported by the runtime over the requested one.
      const readyPort =
        typeof result.value?.port === 'number' ? result.value.port : port;
      debug(`Rust dev server ready on port ${readyPort} (pid ${child.pid})`);

      if (!child.pid) {
        throw new Error('Child process has no PID');
      }

      return {
        port: readyPort,
        pid: child.pid,
        // Wait for exit so the port is released before `vercel dev` continues.
        shutdown: () => terminate(child),
      };
    }

    // The process exited before it became ready.
    const [exitCode, signal] = result.value;
    const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
    const stderr = stderrTail.trim();

    if (ADDR_IN_USE_RE.test(stderr)) {
      throw new RustDevServerError(
        `Rust dev server failed to bind port ${port} ("address already in use"). ` +
          `A previous dev server instance may not have shut down yet. ` +
          `Please retry, or ensure no other process is using that port.`
      );
    }

    // Unknown early exit: fall back to build-and-invoke mode.
    debug(
      `Rust dev server exited before becoming ready (${reason}). ` +
        `Falling back to build-and-invoke mode.` +
        (stderr ? ` stderr:\n${stderr}` : '')
    );
    return null;
  } catch (error) {
    debug(`Failed to start Rust dev server: ${error}`);
    if (error instanceof RustDevServerError) {
      // Re-throw actionable errors instead of falling back silently.
      throw error;
    }
    return null;
  }
};
