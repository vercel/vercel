import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ChildProcess } from 'child_process';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import {
  FASTAPI_CANDIDATE_ENTRYPOINTS,
  detectFastapiEntrypoint,
} from './entrypoint';
import { getLatestPythonVersion } from './version';
import { detectAsgiServer, isInVirtualEnv, useVirtualEnv } from './utils';

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

function createDevStaticShim(
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

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint: rawEntrypoint, workPath, meta = {}, config } = opts;

  // Only start a dev server for FastAPI for now
  if (config?.framework !== 'fastapi') {
    return null;
  }

  // Silence all Node warnings while the dev server is running. Restore on shutdown.
  const restoreWarningSilencer = silenceNodeWarnings();
  try {
    const detected = await detectFastapiEntrypoint(workPath, rawEntrypoint);
    if (!detected) {
      throw new Error(
        `No FastAPI entrypoint found. Searched for: ${FASTAPI_CANDIDATE_ENTRYPOINTS.join(', ')}`
      );
    }
    const entry = detected;

    // Convert to module path, e.g. "src/app.py" -> "src.app"
    const modulePath = entry.replace(/\.py$/i, '').replace(/[\\/]/g, '.');

    const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
    // Encourage colorized output from Python CLIs even when stdio is piped
    if (!env.TERM) env.TERM = 'xterm-256color';
    if (!env.FORCE_COLOR) env.FORCE_COLOR = '1';
    if (!env.PY_COLORS) env.PY_COLORS = '1';
    if (!env.CLICOLOR_FORCE) env.CLICOLOR_FORCE = '1';

    // Track child process and listeners for cleanup on shutdown
    let childProcess: ChildProcess | null = null;
    let stdoutLogListener: ((buf: Buffer) => void) | null = null;
    let stderrLogListener: ((buf: Buffer) => void) | null = null;

    const childReady = new Promise<{ port: number; pid: number }>(
      (resolve, reject) => {
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
          }
        }

        // Create a tiny ASGI shim that serves static files first (when present)
        // and falls back to the user's app. Always applied for consistent behavior.
        const devShimModule = createDevStaticShim(workPath, modulePath);

        // Add .vercel/python to PYTHONPATH so the shim can be imported
        if (devShimModule) {
          const vercelPythonDir = join(workPath, '.vercel', 'python');
          const existingPythonPath = env.PYTHONPATH || '';
          env.PYTHONPATH = existingPythonPath
            ? `${vercelPythonDir}:${existingPythonPath}`
            : vercelPythonDir;
        }

        detectAsgiServer(workPath, pythonCmd)
          .then(async serverKind => {
            if (resolved) return; // in case preflight was rejected
            const host = '127.0.0.1';
            const argv =
              serverKind === 'uvicorn'
                ? [
                    '-m',
                    'uvicorn',
                    `${devShimModule || modulePath}:app`,
                    '--host',
                    host,
                    '--port',
                    '0',
                    '--use-colors',
                  ]
                : [
                    '-m',
                    'hypercorn',
                    `${devShimModule || modulePath}:app`,
                    '-b',
                    `${host}:0`,
                  ];
            debug(
              `Starting dev server (${serverKind}): ${pythonCmd} ${argv.join(' ')}`
            );
            const child = spawn(pythonCmd, argv, {
              cwd: workPath,
              env,
              stdio: ['inherit', 'pipe', 'pipe'],
            });
            childProcess = child;

            // Forward only useful logs: HTTP access lines and important errors
            const forwardLine = (line: string, isErr: boolean) => {
              const clean = stripAnsi(line);
              const hasMethod =
                /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\b/.test(
                  clean
                );
              const hasHttp = /\bHTTP\/(1\.[01]|2)\b/.test(clean);
              const hasStatus = /\b\d{3}\b/.test(clean);
              const isAccess = hasMethod && hasHttp && hasStatus;
              const isImportant = /(ERROR|CRITICAL|Traceback)/i.test(clean);
              if (isAccess || isImportant) {
                (isErr ? process.stderr : process.stdout).write(
                  line.endsWith('\n') ? line : line + '\n'
                );
              }
            };
            stdoutLogListener = (buf: Buffer) => {
              const s = buf.toString();
              for (const line of s.split(/\r?\n/)) {
                if (line) forwardLine(line, false);
              }
            };
            stderrLogListener = (buf: Buffer) => {
              const s = buf.toString();
              for (const line of s.split(/\r?\n/)) {
                if (line) forwardLine(line, true);
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
                  resolve({ port, pid: child.pid });
                }
              }
            };

            child.stdout?.on('data', onDetect);
            child.stderr?.on('data', onDetect);

            child.once('error', err => {
              if (!resolved) reject(err);
            });
            child.once('exit', (code, signal) => {
              if (!resolved)
                reject(
                  new Error(
                    `${serverKind} server exited before binding (code=${code}, signal=${signal})`
                  )
                );
            });
          })
          .catch(reject);
      }
    );

    const { port, pid } = await childReady;

    const shutdown = async () => {
      // Restore default Node warning behavior first
      restoreWarningSilencer();
      // Remove log forwarding listeners to prevent leaks
      try {
        if (childProcess) {
          if (stdoutLogListener) {
            childProcess.stdout?.removeListener('data', stdoutLogListener);
          }
          if (stderrLogListener) {
            childProcess.stderr?.removeListener('data', stderrLogListener);
          }
        }
      } catch (err: any) {
        debug(`Error removing listeners: ${err}`);
      } finally {
        stdoutLogListener = null;
        stderrLogListener = null;
      }
      try {
        process.kill(pid, 'SIGTERM');
      } catch (err: any) {
        debug(`Error killing child: ${err}`);
      }
      // Fallback in case the process does not terminate promptly
      await new Promise(r => setTimeout(r, 1500));
      if (process.platform === 'win32') {
        try {
          await new Promise<void>(resolve => {
            const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
            killer.once('exit', () => resolve());
            killer.once('error', () => resolve());
          });
        } catch (err: any) {
          debug(`Error killing child: ${err}`);
        }
      } else {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (err: any) {
          debug(`Error killing child: ${err}`);
        }
      }
    };

    return { port, pid, shutdown };
  } catch (err) {
    // Startup failed before we returned a shutdown function; restore filter now
    restoreWarningSilencer();
    throw err;
  }
};
