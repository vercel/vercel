import { spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, delimiter, dirname } from 'path';
import type { ChildProcess } from 'child_process';
import type { PythonFramework, StartDevServer } from '@vercel/build-utils';
import { debug, NowBuildError } from '@vercel/build-utils';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import {
  PYTHON_CANDIDATE_ENTRYPOINTS,
  detectPythonEntrypoint,
} from './entrypoint';
import { getDefaultPythonVersion } from './version';
import {
  isInVirtualEnv,
  useVirtualEnv,
  ensureVenv,
  getVenvPythonBin,
  getVenvBinDir,
} from './utils';
import { findUvBinary, getProtectedUvEnv } from './uv';
import { detectInstallSource, type ManifestType } from './install';
import { stringifyManifest } from '@vercel/python-analysis';

const DEV_SERVER_STARTUP_TIMEOUT = 10_000;

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

const DEV_SHIM_MODULE = 'vc_init_dev';

function createLogListener(
  callback: ((buf: Buffer) => void) | undefined,
  stream: NodeJS.WriteStream
): (buf: Buffer) => void {
  return (buf: Buffer) => {
    if (callback) {
      callback(buf);
    } else {
      const s = buf.toString();
      for (const line of s.split(/\r?\n/)) {
        if (line) {
          stream.write(line.endsWith('\n') ? line : line + '\n');
        }
      }
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkForPort(port: number, timeout: number): Promise<string> {
  const start = Date.now();
  let host: string | false = false;
  while (!(host = await getReachableHost(port))) {
    if (Date.now() - start > timeout) {
      break;
    }
    await sleep(100);
  }
  if (!host) {
    throw new Error(`Detecting port ${port} timed out after ${timeout}ms`);
  }
  return host;
}

async function getReachableHost(port: number): Promise<string | false> {
  const results = await Promise.all([
    isPortReachable(port, { host: '::1' }).then(r => r && `[::1]`),
    isPortReachable(port, { host: '127.0.0.1' }).then(r => r && '127.0.0.1'),
  ]);
  return results.find(Boolean) || false;
}

interface SyncDependenciesOptions {
  workPath: string;
  uvPath: string | null;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
}

async function syncDependencies({
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: SyncDependenciesOptions): Promise<void> {
  const installInfo = await detectInstallSource({
    workPath,
    entryDirectory: '.',
  });

  let { manifestType, manifestPath } = installInfo;
  const manifest = installInfo.pythonPackage?.manifest;

  if (!manifestType || !manifestPath) {
    debug('No Python project manifest found, skipping dependency sync');
    return;
  }

  // Store converted into manifest requirements, so we can run the sync
  if (manifest?.origin && manifestType === 'pyproject.toml') {
    const syncDir = join(workPath, '.vercel', 'python', 'sync');
    mkdirSync(syncDir, { recursive: true });
    const tempPyproject = join(syncDir, 'pyproject.toml');
    const content = stringifyManifest(manifest.data);
    writeFileSync(tempPyproject, content, 'utf8');
    manifestPath = tempPyproject;
    debug(
      `Wrote converted ${manifest.origin.kind} manifest to ${tempPyproject}`
    );
  }

  const writeOut = (msg: string) => {
    if (onStdout) {
      onStdout(Buffer.from(msg));
    } else {
      process.stdout.write(msg);
    }
  };

  const writeErr = (msg: string) => {
    if (onStderr) {
      onStderr(Buffer.from(msg));
    } else {
      process.stderr.write(msg);
    }
  };

  // Silence the output, but capture it for failures
  const captured: Array<['stdout' | 'stderr', Buffer]> = [];

  try {
    await runSync({
      manifestType,
      manifestPath,
      uvPath,
      pythonBin,
      env,
      onStdout: data => captured.push(['stdout', data]),
      onStderr: data => captured.push(['stderr', data]),
    });
  } catch (err) {
    for (const [channel, chunk] of captured) {
      (channel === 'stdout' ? writeOut : writeErr)(chunk.toString());
    }

    throw new NowBuildError({
      code: 'PYTHON_DEPENDENCY_SYNC_FAILED',
      message: `Failed to install Python dependencies from ${manifestType}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
}

interface RunSyncOptions {
  manifestType: ManifestType;
  manifestPath: string;
  uvPath: string | null;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
}

async function runSync({
  manifestType,
  manifestPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: RunSyncOptions): Promise<void> {
  const projectDir = dirname(manifestPath);

  const pip = uvPath
    ? { cmd: uvPath, prefix: ['pip', 'install'] }
    : { cmd: pythonBin, prefix: ['-m', 'pip', 'install'] };

  let spawnCmd: string;
  let spawnArgs: string[];

  switch (manifestType) {
    case 'uv.lock': {
      if (!uvPath) {
        throw new NowBuildError({
          code: 'PYTHON_DEPENDENCY_SYNC_FAILED',
          message: 'uv is required to install dependencies from uv.lock.',
          link: 'https://docs.astral.sh/uv/getting-started/installation/',
          action: 'Install uv',
        });
      }
      spawnCmd = uvPath;
      spawnArgs = ['sync'];
      break;
    }
    case 'pylock.toml': {
      spawnCmd = pip.cmd;
      spawnArgs = [...pip.prefix, '-r', manifestPath];
      break;
    }
    case 'pyproject.toml': {
      spawnCmd = pip.cmd;
      spawnArgs = [...pip.prefix, projectDir];
      break;
    }
    default:
      debug(`Unknown manifest type: ${manifestType}`);
      return;
  }

  await new Promise<void>((resolve, reject) => {
    debug(`Running "${spawnCmd} ${spawnArgs.join(' ')}" in ${projectDir}...`);
    const child = spawn(spawnCmd, spawnArgs, {
      cwd: projectDir,
      env: getProtectedUvEnv(env),
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      if (onStdout) {
        onStdout(data);
      } else {
        process.stdout.write(data.toString());
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (onStderr) {
        onStderr(data);
      } else {
        process.stderr.write(data.toString());
      }
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command "${spawnCmd} ${spawnArgs.join(' ')}" failed with code ${code}, signal ${signal}`
          )
        );
      }
    });
  });
}

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

function createDevShim(workPath: string, modulePath: string): string | null {
  try {
    const vercelPythonDir = join(workPath, '.vercel', 'python');
    mkdirSync(vercelPythonDir, { recursive: true });
    const shimPath = join(vercelPythonDir, `${DEV_SHIM_MODULE}.py`);
    const templatePath = join(__dirname, '..', `${DEV_SHIM_MODULE}.py`);
    const template = readFileSync(templatePath, 'utf8');
    const shimSource = template.replace(/__VC_DEV_MODULE_PATH__/g, modulePath);
    writeFileSync(shimPath, shimSource, 'utf8');
    debug(`Prepared Python dev shim at ${shimPath}`);
    return DEV_SHIM_MODULE;
  } catch (err: any) {
    debug(`Failed to prepare dev shim: ${err?.message || err}`);
    return null;
  }
}

interface PythonRunner {
  command: string;
  args: string[];
}

async function getMultiServicePythonRunner(
  workPath: string,
  env: NodeJS.ProcessEnv,
  systemPython: string,
  uvPath: string | null
): Promise<PythonRunner> {
  // Use an existing .venv/venv if present and allowed (single Python service in a project).
  const { pythonCmd, venvRoot } = useVirtualEnv(workPath, env, systemPython);
  if (venvRoot) {
    debug(`Using existing virtualenv at ${venvRoot} for multi-service dev`);
    return { command: pythonCmd, args: [] };
  }

  // Create a per-service .venv, so deps are managed separately.
  const venvPath = join(workPath, '.venv');
  await ensureVenv({ pythonPath: systemPython, venvPath, uvPath, quiet: true });
  debug(`Created virtualenv at ${venvPath} for multi-service dev`);

  const pythonBin = getVenvPythonBin(venvPath);
  const binDir = getVenvBinDir(venvPath);
  env.VIRTUAL_ENV = venvPath;
  env.PATH = `${binDir}${delimiter}${env.PATH || ''}`;

  return { command: pythonBin, args: [] };
}

export const startDevServer: StartDevServer = async opts => {
  const {
    entrypoint: rawEntrypoint,
    workPath,
    meta = {},
    config,
    onStdout,
    onStderr,
  } = opts;

  const framework = config?.framework;

  // No framework is defined, so most likely this is 'handler' class-based
  // serverless functions that should be served directly using vercel-runtime
  // instead of dev server.
  // Otherwise the framework would be a known one or just 'python'.
  if (!framework) {
    return null;
  }

  // Silence Node warnings and install cleanup handlers once
  if (!restoreWarnings) restoreWarnings = silenceNodeWarnings();
  installGlobalCleanupHandlers();
  const entry = await detectPythonEntrypoint(
    framework as PythonFramework,
    workPath,
    rawEntrypoint
  );
  if (!entry) {
    const searched = PYTHON_CANDIDATE_ENTRYPOINTS.join(', ');
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
  let resolveChildReady!: (value: { port: number; pid: number }) => void;
  let rejectChildReady!: (reason: any) => void;
  const childReady = new Promise<{ port: number; pid: number }>(
    (resolve, reject) => {
      resolveChildReady = resolve;
      rejectChildReady = reject;
    }
  );

  // Mark start as pending immediately to dedupe concurrent requests
  PENDING_STARTS.set(serverKey, childReady);

  try {
    const { pythonPath: systemPython } = getDefaultPythonVersion(meta);
    const uvPath = await findUvBinary(systemPython);
    const venv = isInVirtualEnv();
    const serviceCount = (meta.serviceCount as number | undefined) ?? 0;
    const pythonServiceCount =
      (meta.pythonServiceCount as number | undefined) ?? 1;

    if (venv && pythonServiceCount > 1) {
      const yellow = '\x1b[33m';
      const white = '\x1b[1m';
      const reset = '\x1b[0m';
      throw new NowBuildError({
        code: 'PYTHON_EXTERNAL_VENV_DETECTED',
        message:
          `Detected activated venv at ${yellow}${venv}${reset}, ` +
          `${white}vercel dev${reset} manages virtual environments automatically.\n` +
          `Run ${white}deactivate${reset} and try again.`,
      });
    }

    let spawnCommand = systemPython;
    let spawnArgsPrefix: string[] = [];

    if (serviceCount > 0) {
      const runner = await getMultiServicePythonRunner(
        workPath,
        env,
        systemPython,
        uvPath
      );
      spawnCommand = runner.command;
      spawnArgsPrefix = runner.args;
      debug(
        `Multi-service Python runner: ${spawnCommand} ${spawnArgsPrefix.join(' ')}`
      );
    } else if (venv) {
      debug(`Running in virtualenv at ${venv}`);
    } else {
      const { pythonCmd: venvPythonCmd, venvRoot } = useVirtualEnv(
        workPath,
        env,
        systemPython
      );
      spawnCommand = venvPythonCmd;
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
            `${yellow}Warning: no virtual environment detected in ${workPath}. Using system Python: ${systemPython}.${reset}\n` +
              `If you are using a virtual environment, activate it before running "vercel dev", or create one: ${venvCmd}\n`
          );
        } catch (_) {
          // ignore write errors
        }
      }
    }

    if (meta.syncDependencies) {
      const gray = '\x1b[90m';
      const reset = '\x1b[0m';
      const syncMessage = `${gray}Synchronizing dependencies...${reset}\n`;
      if (onStdout) {
        onStdout(Buffer.from(syncMessage));
      } else {
        console.log(syncMessage);
      }

      await syncDependencies({
        workPath,
        uvPath,
        pythonBin: spawnCommand,
        env,
        onStdout,
        onStderr,
      });
    }

    const port = typeof meta.port === 'number' ? meta.port : await getPort();
    env.PORT = `${port}`;

    // Spawn the actual server process
    const devShimModule = createDevShim(workPath, modulePath);

    // Add .vercel/python to PYTHONPATH so the shim can be imported
    if (devShimModule) {
      const vercelPythonDir = join(workPath, '.vercel', 'python');
      const existingPythonPath = env.PYTHONPATH || '';
      env.PYTHONPATH = existingPythonPath
        ? `${vercelPythonDir}:${existingPythonPath}`
        : vercelPythonDir;
    }

    const moduleToRun = devShimModule || modulePath;
    const pythonArgs = ['-u', '-m', moduleToRun];
    const argv = [...spawnArgsPrefix, ...pythonArgs];
    debug(
      `Starting Python dev server (${framework}): ${spawnCommand} ${argv.join(' ')} [PORT=${port}]`
    );
    const child = spawn(spawnCommand, argv, {
      cwd: workPath,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    childProcess = child;

    stdoutLogListener = createLogListener(onStdout, process.stdout);
    stderrLogListener = createLogListener(onStderr, process.stderr);
    child.stdout?.on('data', stdoutLogListener);
    child.stderr?.on('data', stderrLogListener);

    // Wait for the child to either exit early (error) or for the port to accept connections
    const childExited = new Promise<never>((_resolve, reject) => {
      child.once('error', err => {
        reject(err);
      });
      child.once('exit', (code, signal) => {
        reject(
          new Error(
            `Python dev server exited before binding (code=${code}, signal=${signal})`
          )
        );
      });
    });

    await Promise.race([
      checkForPort(port, DEV_SERVER_STARTUP_TIMEOUT),
      childExited,
    ]);

    const pid = child.pid!;
    resolveChildReady({ port, pid });

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
  } catch (err) {
    rejectChildReady(err);
    throw err;
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
