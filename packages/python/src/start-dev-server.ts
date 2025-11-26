import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ChildProcess } from 'child_process';
import type { StartDevServer } from '@vercel/build-utils';
import { debug, NowBuildError } from '@vercel/build-utils';
import {
  FASTAPI_CANDIDATE_ENTRYPOINTS,
  FLASK_CANDIDATE_ENTRYPOINTS,
  detectPythonEntrypoint,
} from './entrypoint';
import { getLatestPythonVersion } from './version';
import { isInVirtualEnv, useVirtualEnv } from './utils';

// Silence all Node.js warnings during the dev server lifecycle to avoid noise and only show the python logs.
// Specifically, this is implemented to silence the [DEP0060] DeprecationWarning warning from the http-proxy library.
// Returns a restore function to undo the override.
function silenceNodeWarnings() {
  const original = process.emitWarning.bind(
    process
  ) as typeof process.emitWarning;
  let active = true;
  const wrapped: typeof process.emitWarning = ((
    warning: unknown,
    ...args: unknown[]
  ) => {
    if (!active) {
      return (original as typeof process.emitWarning)(
        warning as any,
        ...(args as any[])
      );
    }
    // Swallow all warnings while active
    return;
  }) as typeof process.emitWarning;

  process.emitWarning = wrapped;

  return () => {
    if (!active) return;
    active = false;
    if (process.emitWarning === wrapped) {
      process.emitWarning = original;
    }
  };
}

// Regex to strip ANSI escape sequences for matching while preserving colored output
// Use RegExp constructor to avoid linter complaining about control chars in regex literals
const ANSI_PATTERN =
  '[\\u001B\\u009B][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]';
const ANSI_ESCAPE_RE = new RegExp(ANSI_PATTERN, 'g');
const stripAnsi = (s: string) => s.replace(ANSI_ESCAPE_RE, '');

const ASGI_SHIM_MODULE = 'vc_init_dev_asgi';
const WSGI_SHIM_MODULE = 'vc_init_dev_wsgi';

// Persistent dev servers keyed by workPath + modulePath so background tasks
// can continue after HTTP response. Reused across requests in `vercel dev`.
// This is necessary for background tasks to continue after HTTP response.
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

let restoreWarnings: (() => void) | null = null;
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
    if (restoreWarnings) {
      try {
        restoreWarnings();
      } catch (err: any) {
        debug(`Error restoring warnings: ${err}`);
      }
      restoreWarnings = null;
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

function createDevAsgiShim(
  workPath: string,
  modulePath: string
): string | null {
  try {
    const vercelPythonDir = join(workPath, '.vercel', 'python');
    mkdirSync(vercelPythonDir, { recursive: true });
    const shimPath = join(vercelPythonDir, `${ASGI_SHIM_MODULE}.py`);
    const templatePath = join(__dirname, '..', `${ASGI_SHIM_MODULE}.py`);
    const template = readFileSync(templatePath, 'utf8');
    const shimSource = template.replace(/__VC_DEV_MODULE_PATH__/g, modulePath);
    writeFileSync(shimPath, shimSource, 'utf8');
    debug(`Prepared Python dev static shim at ${shimPath}`);
    return ASGI_SHIM_MODULE;
  } catch (err: any) {
    debug(`Failed to prepare dev static shim: ${err?.message || err}`);
    return null;
  }
}

function createDevWsgiShim(
  workPath: string,
  modulePath: string
): string | null {
  try {
    const vercelPythonDir = join(workPath, '.vercel', 'python');
    mkdirSync(vercelPythonDir, { recursive: true });
    const shimPath = join(vercelPythonDir, `${WSGI_SHIM_MODULE}.py`);
    const templatePath = join(__dirname, '..', `${WSGI_SHIM_MODULE}.py`);
    const template = readFileSync(templatePath, 'utf8');
    const shimSource = template.replace(/__VC_DEV_MODULE_PATH__/g, modulePath);
    writeFileSync(shimPath, shimSource, 'utf8');
    debug(`Prepared Python dev WSGI shim at ${shimPath}`);
    return WSGI_SHIM_MODULE;
  } catch (err: any) {
    debug(`Failed to prepare dev WSGI shim: ${err?.message || err}`);
    return null;
  }
}

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint: rawEntrypoint, workPath, meta = {}, config } = opts;

  // Only start a dev server for FastAPI or Flask for now
  const framework = config?.framework;
  if (framework !== 'fastapi' && framework !== 'flask') {
    return null;
  }

  // Silence Node warnings and install cleanup handlers once
  if (!restoreWarnings) restoreWarnings = silenceNodeWarnings();
  installGlobalCleanupHandlers();
  const entry = await detectPythonEntrypoint(
    framework,
    workPath,
    rawEntrypoint
  );
  if (!entry) {
    const searched =
      framework === 'fastapi'
        ? FASTAPI_CANDIDATE_ENTRYPOINTS.join(', ')
        : FLASK_CANDIDATE_ENTRYPOINTS.join(', ');
    throw new NowBuildError({
      code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
      message: `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searched}.`,
      link: `https://vercel.com/docs/frameworks/backend/${framework?.toLowerCase()}#exporting-the-${framework?.toLowerCase()}-application`,
      action: 'Learn More',
    });
  }

  // Convert to module path, e.g. "src/app.py" -> "src.app"
  const modulePath = entry.replace(/\.py$/i, '').replace(/[\\/]/g, '.');

  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;

  // Check for an existing persistent server
  const serverKey = `${workPath}::${entry}::${framework}`;
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
    // Now spawn the actual server process
    await new Promise<void>((resolve, reject) => {
      let resolved = false;
      const { pythonPath: systemPython } = getLatestPythonVersion(meta);
      let pythonCmd = systemPython;
      const venv = isInVirtualEnv();

      if (venv) {
        debug(`Running in virtualenv at ${venv}`);
      } else {
        const { pythonCmd: venvPythonCmd, venvRoot } = useVirtualEnv(
          workPath,
          env,
          systemPython
        );
        pythonCmd = venvPythonCmd;
        if (venvRoot) {
          debug(`Using virtualenv at ${venvRoot}`);
        } else {
          debug('No virtualenv found');
          try {
            const yellow = '\x1b[33m';
            const reset = '\x1b[0m';
            const venvCmd =
              process.platform === 'win32'
                ? 'python -m venv .venv && .venv\\Scripts\\activate'
                : 'python -m venv .venv && source .venv/bin/activate';
            process.stderr.write(
              `${yellow}Warning: no virtual environment detected in ${workPath}. Using system Python: ${pythonCmd}.${reset}\n` +
                `If you are using a virtual environment, activate it before running "vercel dev", or create one: ${venvCmd}\n`
            );
          } catch (_) {
            // ignore write errors
          }
        }
      }

      if (framework === 'fastapi') {
        // Create a tiny ASGI shim that serves static files first (when present)
        // and falls back to the user's app. Always applied for consistent behavior.
        const devShimModule = createDevAsgiShim(workPath, modulePath);

        // Add .vercel/python to PYTHONPATH so the shim can be imported
        if (devShimModule) {
          const vercelPythonDir = join(workPath, '.vercel', 'python');
          const existingPythonPath = env.PYTHONPATH || '';
          env.PYTHONPATH = existingPythonPath
            ? `${vercelPythonDir}:${existingPythonPath}`
            : vercelPythonDir;
        }

        // Run the ASGI shim module directly
        const moduleToRun = devShimModule || modulePath;
        const argv = ['-u', '-m', moduleToRun];
        debug(`Starting ASGI dev server: ${pythonCmd} ${argv.join(' ')}`);
        const child = spawn(pythonCmd, argv, {
          cwd: workPath,
          env,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
        childProcess = child;

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

        const readinessRegexes = [
          /Uvicorn running on https?:\/\/(?:\[[^\]]+\]|[^:]+):(\d+)/i,
          /Hypercorn running on https?:\/\/(?:\[[^\]]+\]|[^:]+):(\d+)/i,
          /(?:Running|Serving) on https?:\/\/(?:\[[^\]]+\]|[^:\s]+):(\d+)/i,
        ];

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
          if (portMatch && child.pid) {
            if (!resolved) {
              resolved = true;
              // Use removeListener for broad Node compatibility (and mocked emitters)
              child.stdout?.removeListener('data', onDetect);
              child.stderr?.removeListener('data', onDetect);
              const port = Number(portMatch[1]);
              resolveChildReady({ port, pid: child.pid });
              resolve();
            }
          }
        };

        child.stdout?.on('data', onDetect);
        child.stderr?.on('data', onDetect);

        child.once('error', err => {
          if (!resolved) {
            rejectChildReady(err);
            reject(err);
          }
        });
        child.once('exit', (code, signal) => {
          if (!resolved) {
            const err = new Error(
              `ASGI dev server exited before binding (code=${code}, signal=${signal})`
            );
            rejectChildReady(err);
            reject(err);
          }
        });
        // No promise chain; shim handles server selection and logging
      } else {
        // Flask (WSGI) dev server using Werkzeug
        const devShimModule = createDevWsgiShim(workPath, modulePath);
        // Add .vercel/python to PYTHONPATH so the shim can be imported
        if (devShimModule) {
          const vercelPythonDir = join(workPath, '.vercel', 'python');
          const existingPythonPath = env.PYTHONPATH || '';
          env.PYTHONPATH = existingPythonPath
            ? `${vercelPythonDir}:${existingPythonPath}`
            : vercelPythonDir;
        }

        const moduleToRun = devShimModule || modulePath;
        // Execute the shim as a module so its __main__ runner handles Werkzeug/wsgiref
        const argv = ['-u', '-m', moduleToRun];
        debug(`Starting Flask dev server: ${pythonCmd} ${argv.join(' ')}`);
        const child = spawn(pythonCmd, argv, {
          cwd: workPath,
          env,
          stdio: ['inherit', 'pipe', 'pipe'],
        });
        childProcess = child;

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

        const readinessRegexes = [
          /Werkzeug running on https?:\/\/(?:\[[^\]]+\]|[^:]+):(\d+)/i,
          /(?:Running|Serving) on https?:\/\/(?:\[[^\]]+\]|[^:\s]+):(\d+)/i,
        ];

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
          if (portMatch && child.pid) {
            if (!resolved) {
              resolved = true;
              child.stdout?.removeListener('data', onDetect);
              child.stderr?.removeListener('data', onDetect);
              const port = Number(portMatch[1]);
              resolveChildReady({ port, pid: child.pid });
              resolve();
            }
          }
        };

        child.stdout?.on('data', onDetect);
        child.stderr?.on('data', onDetect);

        child.once('error', err => {
          if (!resolved) {
            rejectChildReady(err);
            reject(err);
          }
        });
        child.once('exit', (code, signal) => {
          if (!resolved) {
            const err = new Error(
              `Flask dev server exited before binding (code=${code}, signal=${signal})`
            );
            rejectChildReady(err);
            reject(err);
          }
        });
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

    // No-op shutdown so CLI won't kill the server after each request
    const shutdown = async () => {};
    return { port, pid, shutdown };
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
