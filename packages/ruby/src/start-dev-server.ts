import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import which from 'which';
import type { StartDevServer } from '@vercel/build-utils';
import { debug, NowBuildError } from '@vercel/build-utils';

// Silence all Node.js warnings during the dev server lifecycle to avoid noise
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

// Persistent dev servers keyed by workPath + entrypoint so background tasks continue
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

  // Do not exit on signals, so other interruption handlers
  // can perform their cleanup routine.
  process.on('SIGINT', () => {
    killAll();
  });
  process.on('SIGTERM', () => {
    killAll();
  });
  process.on('exit', () => {
    killAll();
  });
}

function createDevRubyShim(
  workPath: string,
  entrypoint: string
): string | null {
  try {
    const vercelRubyDir = join(workPath, '.vercel', 'ruby');
    mkdirSync(vercelRubyDir, { recursive: true });
    const shimPath = join(vercelRubyDir, `vc_init_dev.rb`);
    const utilsPath = join(vercelRubyDir, 'vc__utils__ruby.rb');
    const templatePath = join(__dirname, '..', 'vc_init_dev.rb');
    const utilsTemplatePath = join(__dirname, '..', 'vc_utils.rb');
    const template = readFileSync(templatePath, 'utf8');
    const utilsTemplate = readFileSync(utilsTemplatePath, 'utf8');
    const shimSource = template.replace(/__VC_DEV_ENTRYPOINT__/g, entrypoint);
    writeFileSync(shimPath, shimSource, 'utf8');
    writeFileSync(utilsPath, utilsTemplate, 'utf8');
    debug(`Prepared Ruby dev shim at ${shimPath}`);
    return shimPath;
  } catch (err: any) {
    debug(`Failed to prepare Ruby dev shim: ${err?.message || err}`);
    return null;
  }
}

function detectGemfile(workPath: string, entrypoint: string): string | null {
  const entryDir = dirname(entrypoint);
  const localGemfile = join(workPath, entryDir, 'Gemfile');
  if (existsSync(localGemfile)) return localGemfile;
  const rootGemfile = join(workPath, 'Gemfile');
  if (existsSync(rootGemfile)) return rootGemfile;
  return null;
}

async function run(
  cmd: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    onStdout?: (data: Buffer) => void;
    onStderr?: (data: Buffer) => void;
  }
) {
  return await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>(resolve => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', data => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (opts.onStdout) {
        opts.onStdout(chunk);
      } else {
        process.stdout.write(chunk.toString());
      }
    });
    child.stderr?.on('data', data => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (opts.onStderr) {
        opts.onStderr(chunk);
      } else {
        process.stderr.write(chunk.toString());
      }
    });
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}

export const startDevServer: StartDevServer = async opts => {
  const { entrypoint: rawEntrypoint, workPath, meta = {} } = opts;

  // Ruby dev server only supports Rack (.ru) entrypoints for now
  if (!rawEntrypoint.endsWith('.ru')) {
    // If user configured a non-.ru entrypoint, do not start a dev server
    // so another builder or static can handle it.
    return null;
  }

  if (!restoreWarnings) restoreWarnings = silenceNodeWarnings();
  installGlobalCleanupHandlers();

  const entrypoint = rawEntrypoint;
  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;

  const serverKey = `${workPath}::${entrypoint}::ruby`;
  const existing = PERSISTENT_SERVERS.get(serverKey);
  if (existing) {
    return {
      port: existing.port,
      pid: existing.pid,
      shutdown: async () => {},
    };
  }

  const pending = PENDING_STARTS.get(serverKey);
  if (pending) {
    const { port, pid } = await pending;
    return { port, pid, shutdown: async () => {} };
  }

  let childProcess: ChildProcess | null = null;
  let stdoutLogListener: ((buf: Buffer) => void) | null = null;
  let stderrLogListener: ((buf: Buffer) => void) | null = null;

  let resolveChildReady!: (value: { port: number; pid: number }) => void;
  let rejectChildReady!: (reason: any) => void;
  const childReady = new Promise<{ port: number; pid: number }>(
    (resolve, reject) => {
      resolveChildReady = resolve;
      rejectChildReady = reject;
    }
  );
  PENDING_STARTS.set(serverKey, childReady);

  try {
    await new Promise<void>((resolve, reject) => {
      let resolved = false;

      const shimPath = createDevRubyShim(workPath, entrypoint);
      if (!shimPath) {
        rejectChildReady(
          new NowBuildError({
            code: 'RUBY_DEV_SHIM_ERROR',
            message: 'Failed to create Ruby dev shim.',
          })
        );
        return reject(new Error('Failed to create Ruby dev shim'));
      }

      // Prefer running via Bundler when Gemfile exists
      const gemfile = detectGemfile(workPath, entrypoint);
      const bundlePath = which.sync('bundle', { nothrow: true }) as
        | string
        | null;
      const bundlerPath =
        bundlePath ||
        (which.sync('bundler', { nothrow: true }) as string | null);
      const projectDir = gemfile ? dirname(gemfile) : workPath;
      if (gemfile) {
        env.BUNDLE_GEMFILE = gemfile;
      }

      const checkDeps = async () => {
        if (gemfile && bundlerPath) {
          debug(`Running "bundle check" for ${gemfile}`);
          const check = await run(
            bundlerPath,
            ['check', '--gemfile', gemfile],
            {
              cwd: projectDir,
              env,
              onStdout: opts.onStdout,
              onStderr: opts.onStderr,
            }
          );
          if (check.code !== 0) {
            return false;
          }
        }
        return true;
      };

      checkDeps()
        .then(ok => {
          if (!ok) {
            const err = new NowBuildError({
              code: 'RUBY_GEMS_MISSING',
              message:
                'Required gems are not installed. Run "vercel build" and try again.',
            });
            rejectChildReady(err as any);
            return reject(err as any);
          }

          let cmd = 'ruby';
          let args: string[] = [shimPath];
          if (gemfile && bundlerPath) {
            cmd = bundlerPath;
            args = ['exec', 'ruby', shimPath];
          }

          debug(`Starting Ruby dev server: ${cmd} ${args.join(' ')}`);
          const child = spawn(cmd, args, {
            cwd: workPath,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          childProcess = child;

          stdoutLogListener = (buf: Buffer) => {
            if (opts.onStdout) {
              opts.onStdout(buf);
            } else {
              process.stdout.write(buf.toString());
            }
          };
          stderrLogListener = (buf: Buffer) => {
            if (opts.onStderr) {
              opts.onStderr(buf);
            } else {
              process.stderr.write(buf.toString());
            }
          };
          child.stdout?.on('data', stdoutLogListener);
          child.stderr?.on('data', stderrLogListener);

          const readinessRegexes = [
            /Serving on https?:\/\/(?:\[[^\]]+\]|[^:\s]+):(\d+)/i,
            /WEBrick.*?listening on.*?:(\d+)/i,
          ];

          const onDetect = (chunk: Buffer) => {
            const text = chunk.toString();
            let portMatch: RegExpMatchArray | null = null;
            for (const rx of readinessRegexes) {
              const m = text.match(rx);
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
                `Ruby dev server exited before binding (code=${code}, signal=${signal})`
              );
              rejectChildReady(err);
              reject(err);
            }
          });
        })
        .catch(err => {
          if (!resolved) {
            rejectChildReady(err);
            reject(err);
          }
        });
    });

    const { port, pid } = await childReady;

    PERSISTENT_SERVERS.set(serverKey, {
      port,
      pid,
      child: childProcess!,
      stdoutLogListener,
      stderrLogListener,
    });

    const shutdown = async () => {};
    return { port, pid, shutdown };
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
