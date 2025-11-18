import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import { installRustToolchain } from './lib/rust-toolchain';
import { buildExecutableForDev } from './lib/dev-build';
import { createDevServerEnv } from './lib/dev-server';

// Regex to strip ANSI escape sequences for matching while preserving colored output
const ANSI_PATTERN =
  '[\\u001B\\u009B][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]';
const ANSI_ESCAPE_RE = new RegExp(ANSI_PATTERN, 'g');
const stripAnsi = (s: string) => s.replace(ANSI_ESCAPE_RE, '');

// Persistent dev servers keyed by workPath + entrypoint so background tasks
// can continue after HTTP response. Reused across requests in `vercel dev`.
const PERSISTENT_SERVERS = new Map<
  string,
  {
    port: number;
    pid: number;
    child: ChildProcess;
    stdoutLogListener: ((buf: Buffer) => void) | null;
    stderrLogListener: ((buf: Buffer) => void) | null;
  }
>();

// Track pending start operations to avoid races spawning multiple servers
const PENDING_STARTS = new Map<
  string,
  Promise<{ port: number; pid: number }>
>();

let cleanupHandlersInstalled = false;

function installGlobalCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const killAll = () => {
    for (const [key, info] of PERSISTENT_SERVERS.entries()) {
      try {
        process.kill(info.pid, 'SIGTERM');
      } catch (err: any) {
        debug(`Error sending SIGTERM to ${info.pid}: ${err}`);
      }
      try {
        process.kill(info.pid, 'SIGKILL');
      } catch (err: any) {
        debug(`Error sending SIGKILL to ${info.pid}: ${err}`);
      }
      PERSISTENT_SERVERS.delete(key);
    }
  };

  process.on('SIGINT', () => {
    killAll();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    killAll();
    process.exit(143);
  });
  process.on('exit', () => {
    killAll();
  });
}

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint, workPath, meta = {} } = opts;

  debug(`Starting dev server for Rust executable runtime: ${entrypoint}`);

  installGlobalCleanupHandlers();

  // Check for an existing persistent server
  const serverKey = `${workPath}::${entrypoint}`;
  const existing = PERSISTENT_SERVERS.get(serverKey);
  if (existing) {
    return {
      port: existing.port,
      pid: existing.pid,
      shutdown: async () => {
        // no-op so CLI does not kill persistent server per request
      },
    };
  }

  // Check for a pending start operation before spawning a new server
  {
    const pending = PENDING_STARTS.get(serverKey);
    if (pending) {
      const { port, pid } = await pending;
      return {
        port,
        pid,
        shutdown: async () => {},
      };
    }
  }

  // Track child process and listeners
  let childProcess: ChildProcess | null = null;
  let stdoutLogListener: ((buf: Buffer) => void) | null = null;
  let stderrLogListener: ((buf: Buffer) => void) | null = null;

  // Create placeholder promise and immediately claim the slot to prevent races
  let resolveChildReady: (value: { port: number; pid: number }) => void;
  let rejectChildReady: (reason: any) => void;
  const childReady = new Promise<{ port: number; pid: number }>(
    (resolve, reject) => {
      resolveChildReady = resolve;
      rejectChildReady = reject;
    }
  );

  // Mark start as pending immediately to dedupe concurrent requests
  PENDING_STARTS.set(serverKey, childReady);

  try {
    // Install Rust toolchain if needed
    await installRustToolchain();

    // Build the executable for development
    const executablePath = await buildExecutableForDev(workPath, entrypoint);

    debug(`Starting Rust executable dev server: ${executablePath}`);

    // Create development environment
    const devEnv = createDevServerEnv(process.env, meta);

    // Start the executable as a dev server
    const child = spawn(executablePath, [], {
      cwd: workPath,
      env: devEnv,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error('Failed to start dev server process');
    }

    childProcess = child;
    debug(`Dev server process started with PID: ${child.pid}`);

    // Set up log listeners to forward output
    stdoutLogListener = (buf: Buffer) => {
      const s = buf.toString();
      for (const line of s.split(/\r?\n/)) {
        if (line) {
          process.stdout.write(line.endsWith('\n') ? line : line + '\n');
        }
      }
    };
    stderrLogListener = (buf: Buffer) => {
      const s = buf.toString();
      for (const line of s.split(/\r?\n/)) {
        if (line) {
          process.stderr.write(line.endsWith('\n') ? line : line + '\n');
        }
      }
    };
    child.stdout?.on('data', stdoutLogListener);
    child.stderr?.on('data', stderrLogListener);

    // Common patterns for detecting server readiness in Rust web servers
    const readinessRegexes = [
      // Actix-web
      /Started http server: (?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/i,
      /Listening for HTTP on (?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/i,
      // Axum
      /listening on (?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/i,
      // Warp
      /Server running at (?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/i,
      // Rocket
      /Rocket has launched from (?:0\.0\.0\.0|127\.0\.0\.1):(\d+)/i,
      // Generic patterns
      /(?:Started|Listening|Running|Serving) (?:on|at) (?:https?:\/\/)?(?:0\.0\.0\.0|127\.0\.0\.1|localhost):(\d+)/i,
      /Server (?:started|listening|running) on (?:port )?(\d+)/i,
      /(?:HTTP server|Server) (?:running|listening) on (?:port )?(\d+)/i,
    ];

    let resolved = false;
    const onDetect = (chunk: Buffer) => {
      const text = chunk.toString();
      const clean = stripAnsi(text);
      let portMatch: RegExpMatchArray | null = null;
      for (const rx of readinessRegexes) {
        const m = clean.match(rx);
        if (m) {
          portMatch = m;
          break;
        }
      }
      if (portMatch && child.pid && !resolved) {
        resolved = true;
        child.stdout?.removeListener('data', onDetect);
        child.stderr?.removeListener('data', onDetect);
        const port = Number(portMatch[1]);
        debug(`Dev server detected on port ${port}`);
        resolveChildReady({ port, pid: child.pid });
      }
    };

    child.stdout?.on('data', onDetect);
    child.stderr?.on('data', onDetect);

    child.once('error', err => {
      if (!resolved) {
        rejectChildReady(err);
      }
    });
    child.once('exit', (code, signal) => {
      if (!resolved) {
        const err = new Error(
          `Rust dev server exited before binding (code=${code}, signal=${signal})`
        );
        rejectChildReady(err);
      }
    });

    const { port, pid } = await childReady;

    // Persist for reuse across requests
    PERSISTENT_SERVERS.set(serverKey, {
      port,
      pid,
      child: childProcess!,
      stdoutLogListener,
      stderrLogListener,
    });

    debug(`Dev server listening on port ${port}`);

    // No-op shutdown so CLI won't kill the server after each request
    const shutdown = async () => {};
    return { port, pid, shutdown };
  } catch (error) {
    debug(`Failed to start dev server: ${error}`);
    // Return null to indicate dev server couldn't be started
    // This will cause vercel dev to fall back to build-and-invoke mode
    return null;
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
