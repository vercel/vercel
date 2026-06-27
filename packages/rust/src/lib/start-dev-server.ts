import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import getPort from 'get-port';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import { installRustToolchain } from './rust-toolchain';
import { buildExecutableForDev } from './dev-build';
import { createDevServerEnv } from './dev-server';

// How long to wait for a graceful `SIGTERM` shutdown before forcing `SIGKILL`.
const SHUTDOWN_TIMEOUT = 5_000;

// Matches the "address already in use" error emitted by the Rust runtime
// (e.g. `Os { code: 48, kind: AddrInUse, message: "Address already in use" }`)
// as well as the libc `EADDRINUSE` form.
const ADDR_IN_USE_RE = /address (already )?in use|AddrInUse|EADDRINUSE/i;

const MAX_STDERR_CAPTURE = 8_192;

/**
 * Error thrown when the Rust dev server starts but cannot become ready in a way
 * the user should know about (e.g. port collision). Unlike a generic early
 * exit, this is surfaced to `vercel dev` instead of silently falling back to
 * lambda invocation.
 */
class RustDevServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RustDevServerError';
  }
}

/**
 * Gracefully terminate the dev server process and resolve only once it has
 * actually exited, so the bound port is released before `vercel dev` proceeds.
 * Falls back to `SIGKILL` if the process does not exit within
 * {@link SHUTDOWN_TIMEOUT}.
 */
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

    // Determine the port the dev server should bind. Honor an explicitly
    // requested port (e.g. from the multi-service dev orchestrator) and
    // otherwise allocate a unique free port. This mirrors the Node.js and
    // Python runtimes and prevents "address already in use" errors caused by
    // the `vercel_runtime` crate's fixed default port being reused across the
    // per-request dev server restarts that `vercel dev` performs.
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

    // Start the executable as a dev server using spawn
    const child = spawn(executablePath, [], {
      cwd: workPath,
      env: devEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error('Failed to start Rust dev server process');
    }

    debug(`Rust dev server process started with PID: ${child.pid}`);

    // Parse stdout to detect when the server is ready. The `vercel_runtime`
    // crate prints `Dev server listening: <port>` once it is bound.
    let buffer = '';
    let portEmitted = false;
    // Keep a bounded tail of stderr so we can produce a helpful error message
    // if the process exits before becoming ready.
    let stderrTail = '';

    child.stdout?.on('data', data => {
      const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      buffer += chunk.toString();
      if (!portEmitted) {
        // Use the port the runtime actually bound to (printed on stdout) rather
        // than the requested one. An older `vercel_runtime` may ignore
        // `VERCEL_DEV_PORT`, or fail to parse it and fall back to its default,
        // in which case the requested and actual ports differ and we must proxy
        // to the actual one. Wait until the full line (including the number) has
        // arrived before emitting readiness.
        const match = buffer.match(/Dev server listening:\s*(\d+)/);
        if (match) {
          portEmitted = true;
          const reportedPort = parseInt(match[1], 10);
          debug(`Rust dev server reported ready on port ${reportedPort}`);
          child.emit('message', { port: reportedPort }, null);
          buffer = ''; // Clear buffer only after successful extraction
        }
      }
      if (onStdout) {
        onStdout(chunk);
      } else {
        process.stdout.write(chunk);
      }
    });

    child.stderr?.on('data', data => {
      const chunk: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      stderrTail = (stderrTail + chunk.toString()).slice(-MAX_STDERR_CAPTURE);
      if (onStderr) {
        onStderr(chunk);
      } else {
        process.stderr.write(chunk);
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
        // Gracefully shut the server down and wait for the process to exit so
        // the port is released before `vercel dev` continues. Without awaiting
        // the exit, a subsequent request could spawn a new dev server before
        // this one releases its port, triggering "address already in use".
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

    // Unknown early exit. Returning `null` lets `vercel dev` fall back to
    // build-and-invoke mode, preserving compatibility with lambda-style Rust
    // runtimes that do not run an HTTP dev server.
    debug(
      `Rust dev server exited before becoming ready (${reason}). ` +
        `Falling back to build-and-invoke mode.` +
        (stderr ? ` stderr:\n${stderr}` : '')
    );
    return null;
  } catch (error) {
    debug(`Failed to start Rust dev server: ${error}`);
    if (error instanceof RustDevServerError) {
      // Surface actionable errors (e.g. port collisions) to the user instead
      // of silently falling back to lambda invocation, which produces a
      // confusing "Process exited before completing request" error.
      throw error;
    }
    // Return null to indicate the dev server couldn't be started so that
    // `vercel dev` falls back to build-and-invoke mode.
    return null;
  }
};
