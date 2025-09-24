import { spawn } from 'child_process';
import type { StartDevServer } from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import {
  FASTAPI_CANDIDATE_ENTRYPOINTS,
  detectFastapiEntrypoint,
} from './entrypoint';
import { getLatestPythonVersion } from './version';
import { detectAsgiServer, isInVirtualEnv, useVirtualEnv } from './utils';

// Regex to strip ANSI escape sequences for matching while preserving colored output
// Use RegExp constructor to avoid linter complaining about control chars in regex literals
const ANSI_PATTERN =
  '[\\u001B\\u009B][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><]';
const ANSI_ESCAPE_RE = new RegExp(ANSI_PATTERN, 'g');
const stripAnsi = (s: string) => s.replace(ANSI_ESCAPE_RE, '');

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint: rawEntrypoint, workPath, meta = {}, config } = opts;

  // Only start a dev server for FastAPI for now
  if (config?.framework !== 'fastapi') {
    return null;
  }

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

      detectAsgiServer(workPath, pythonCmd)
        .then(serverKind => {
          if (resolved) return; // in case preflight was rejected
          const argv =
            serverKind === 'uvicorn'
              ? [
                  '-m',
                  'uvicorn',
                  `${modulePath}:app`,
                  '--reload',
                  '--host',
                  '127.0.0.1',
                  '--port',
                  '0',
                  '--use-colors',
                ]
              : [
                  '-m',
                  'hypercorn',
                  `${modulePath}:app`,
                  '--reload',
                  '-b',
                  '127.0.0.1:0',
                ];
          debug(
            `Starting dev server (${serverKind}): ${pythonCmd} ${argv.join(' ')}`
          );
          const child = spawn(pythonCmd, argv, {
            cwd: workPath,
            env,
            stdio: ['inherit', 'pipe', 'pipe'],
          });

          // Forward only useful logs: HTTP access lines and important errors
          const forwardLine = (line: string, isErr: boolean) => {
            const clean = stripAnsi(line);
            const hasMethod =
              /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\b/.test(clean);
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
          child.stdout?.on('data', (buf: Buffer) => {
            const s = buf.toString();
            for (const line of s.split(/\r?\n/)) {
              if (line) forwardLine(line, false);
            }
          });
          child.stderr?.on('data', (buf: Buffer) => {
            const s = buf.toString();
            for (const line of s.split(/\r?\n/)) {
              if (line) forwardLine(line, true);
            }
          });

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
              const port = Number(portMatch[1]);
              if (!resolved) {
                resolved = true;
                child.stdout?.off('data', onDetect);
                child.stderr?.off('data', onDetect);
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
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
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
      } catch {
        // ignore
      }
    } else {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // ignore
      }
    }
  };

  return { port, pid, shutdown };
};
