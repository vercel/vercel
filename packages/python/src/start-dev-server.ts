import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, delimiter, dirname, basename } from 'path';
import type { ChildProcess } from 'child_process';
import type { PythonFramework, StartDevServer } from '@vercel/build-utils';
import { debug, NowBuildError } from '@vercel/build-utils';
import { buildCronRouteTable, getServiceCrons } from './crons';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import { detectPythonEntrypoint, type PythonEntrypoint } from './entrypoint';
import { runFrameworkHook } from './index';
import { getDefaultPythonVersion } from './version';
import {
  isInVirtualEnv,
  useVirtualEnv,
  ensureVenv,
  getVenvPythonBin,
  getVenvBinDir,
} from './utils';
import { findUvBinary, getProtectedUvEnv } from './uv';
import {
  discoverPackage,
  detectInstallSource,
  type ManifestType,
} from './install';
import { stringifyManifest } from '@vercel/python-analysis';
import {
  VERCEL_RUNTIME_VERSION,
  VERCEL_WORKERS_VERSION,
} from './package-versions';

const DEV_SERVER_STARTUP_TIMEOUT = 5 * 60_000; // 5 minutes

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

function hasWorkerServicesEnabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.VERCEL_HAS_WORKER_SERVICES || '';
  return ['1', 'true'].includes(value.trim().toLowerCase());
}

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
  const pythonPackage = await discoverPackage({
    entrypointDir: workPath,
    rootDir: workPath,
  });

  const installInfo = detectInstallSource(pythonPackage, workPath);

  const { manifestType } = installInfo;
  let { manifestPath } = installInfo;
  const manifest = pythonPackage.manifest;

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

interface InstallVercelRuntimeOptions {
  workPath: string;
  uvPath: string | null;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
}

const PENDING_RUNTIME_INSTALLS = new Map<string, Promise<void>>();
const PENDING_WORKERS_INSTALLS = new Map<string, Promise<void>>();

async function installVercelRuntime({
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: InstallVercelRuntimeOptions): Promise<void> {
  const targetDir = join(workPath, '.vercel', 'python');

  let pending = PENDING_RUNTIME_INSTALLS.get(targetDir);
  if (!pending) {
    pending = doInstallVercelRuntime({
      targetDir,
      workPath,
      uvPath,
      pythonBin,
      env,
      onStdout,
      onStderr,
    });
    PENDING_RUNTIME_INSTALLS.set(targetDir, pending);
    pending.finally(() => PENDING_RUNTIME_INSTALLS.delete(targetDir));
  }
  await pending;
}

async function doInstallVercelRuntime({
  targetDir,
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: InstallVercelRuntimeOptions & { targetDir: string }): Promise<void> {
  mkdirSync(targetDir, { recursive: true });

  // Check if we're running from a dev build
  // so that we can use the local version instead
  // of installing from pypi
  const localRuntimeDir = join(
    __dirname,
    '..',
    '..',
    '..',
    'python',
    'vercel-runtime'
  );
  const isLocalDev = existsSync(join(localRuntimeDir, 'pyproject.toml'));

  const runtimeDep =
    env.VERCEL_RUNTIME_PYTHON ||
    (isLocalDev
      ? localRuntimeDir
      : `vercel-runtime==${VERCEL_RUNTIME_VERSION}`);

  // Skip install if the exact pypi version is already present,
  // local dev builds and explicitly specified version
  // always reinstall to pick up possible source changes
  if (!isLocalDev && !env.VERCEL_RUNTIME_PYTHON) {
    const distInfo = join(
      targetDir,
      `vercel_runtime-${VERCEL_RUNTIME_VERSION}.dist-info`
    );
    if (existsSync(distInfo)) {
      debug(
        `vercel-runtime ${VERCEL_RUNTIME_VERSION} already installed, skipping`
      );
      return;
    }
  }

  debug(
    `Installing vercel-runtime into ${targetDir} (type: ${isLocalDev ? 'local' : 'pypi'}, source: ${runtimeDep})`
  );

  const pip = uvPath
    ? { cmd: uvPath, prefix: ['pip', 'install'] }
    : { cmd: pythonBin, prefix: ['-m', 'pip', 'install'] };

  const spawnArgs = [...pip.prefix, '--target', targetDir, runtimeDep];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pip.cmd, spawnArgs, {
      cwd: workPath,
      env: getProtectedUvEnv(env),
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      if (onStdout) {
        onStdout(data);
      } else {
        debug(data.toString());
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (onStderr) {
        onStderr(data);
      } else {
        debug(data.toString());
      }
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Installing vercel-runtime failed with code ${code}, signal ${signal}`
          )
        );
      }
    });
  });
}

async function installVercelWorkers({
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: InstallVercelRuntimeOptions): Promise<void> {
  const targetDir = join(workPath, '.vercel', 'python');

  let pending = PENDING_WORKERS_INSTALLS.get(targetDir);
  if (!pending) {
    pending = doInstallVercelWorkers({
      targetDir,
      workPath,
      uvPath,
      pythonBin,
      env,
      onStdout,
      onStderr,
    });
    PENDING_WORKERS_INSTALLS.set(targetDir, pending);
    pending.finally(() => PENDING_WORKERS_INSTALLS.delete(targetDir));
  }
  await pending;
}

async function doInstallVercelWorkers({
  targetDir,
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
}: InstallVercelRuntimeOptions & { targetDir: string }): Promise<void> {
  mkdirSync(targetDir, { recursive: true });

  const localWorkersDir = join(
    __dirname,
    '..',
    '..',
    '..',
    'python',
    'vercel-workers'
  );
  const isLocalDev = existsSync(join(localWorkersDir, 'pyproject.toml'));

  const workersDep =
    env.VERCEL_WORKERS_PYTHON ||
    (isLocalDev
      ? localWorkersDir
      : `vercel-workers==${VERCEL_WORKERS_VERSION}`);

  if (!isLocalDev && !env.VERCEL_WORKERS_PYTHON) {
    const distInfo = join(
      targetDir,
      `vercel_workers-${VERCEL_WORKERS_VERSION}.dist-info`
    );
    if (existsSync(distInfo)) {
      debug(
        `vercel-workers ${VERCEL_WORKERS_VERSION} already installed, skipping`
      );
      return;
    }
  }

  debug(
    `Installing vercel-workers into ${targetDir} (type: ${isLocalDev ? 'local' : 'pypi'}, source: ${workersDep})`
  );

  const pip = uvPath
    ? { cmd: uvPath, prefix: ['pip', 'install'] }
    : { cmd: pythonBin, prefix: ['-m', 'pip', 'install'] };

  const spawnArgs = [...pip.prefix, '--target', targetDir, workersDep];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pip.cmd, spawnArgs, {
      cwd: workPath,
      env: getProtectedUvEnv(env),
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data: Buffer) => {
      if (onStdout) {
        onStdout(data);
      } else {
        debug(data.toString());
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (onStderr) {
        onStderr(data);
      } else {
        debug(data.toString());
      }
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Installing vercel-workers failed with code ${code}, signal ${signal}`
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

interface DevShimResult {
  module: string;
  extraPythonPath?: string;
  shimDir?: string;
}

function createDevShim(
  workPath: string,
  entry: string,
  modulePath: string,
  serviceName: string | undefined,
  framework: string,
  variableName: string
): DevShimResult | null {
  try {
    // When a service name is provided, place the shim in a per-service
    // subdirectory so multiple services in the same workspace don't
    // overwrite each other's shim.
    const vercelPythonDir = serviceName
      ? join(workPath, '.vercel', 'python', 'services', serviceName)
      : join(workPath, '.vercel', 'python');
    mkdirSync(vercelPythonDir, { recursive: true });

    // If workPath is a Python package (has __init__.py), the user
    // module may use relative imports. We need to treat the module name so that
    // __package__ is set correctly (e.g. "main" -> "backend.main").
    let qualifiedModule = modulePath;
    let extraPythonPath: string | undefined;
    if (existsSync(join(workPath, '__init__.py'))) {
      const pkgName = basename(workPath);
      qualifiedModule = `${pkgName}.${modulePath}`;
      extraPythonPath = dirname(workPath);
    }

    const entryAbs = join(workPath, entry);

    const shimPath = join(vercelPythonDir, `${DEV_SHIM_MODULE}.py`);
    const templatePath = join(
      __dirname,
      '..',
      'templates',
      `${DEV_SHIM_MODULE}.py`
    );
    const template = readFileSync(templatePath, 'utf8');
    const shimSource = template
      .replace(/__VC_DEV_MODULE_NAME__/g, qualifiedModule)
      .replace(/__VC_DEV_ENTRY_ABS__/g, entryAbs)
      .replace(/__VC_DEV_FRAMEWORK__/g, framework)
      .replace(/__VC_DEV_VARIABLE_NAME__/g, variableName);
    writeFileSync(shimPath, shimSource, 'utf8');
    debug(`Prepared Python dev shim at ${shimPath}`);
    return {
      module: DEV_SHIM_MODULE,
      extraPythonPath,
      shimDir: vercelPythonDir,
    };
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
  await ensureVenv({
    pythonVersion: { pythonPath: systemPython },
    venvPath,
    uvPath,
    quiet: true,
  });
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
    service,
    onStdout,
    onStderr,
  } = opts;

  const framework = config?.framework;

  // Check for an existing persistent server.
  // Include serviceName so that services sharing a workspace get separate servers.
  const serviceName =
    service?.name ??
    (typeof meta.serviceName === 'string' ? meta.serviceName : undefined);
  const serverKey = serviceName
    ? `${workPath}::${framework}::${serviceName}`
    : `${workPath}::${framework}`;
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
  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
  const entrypoint = rawEntrypoint === '<detect>' ? undefined : rawEntrypoint;

  // For schedule-triggered job and worker services, use the raw entrypoint directly, because
  // they don't export app/application so standard detection would skip them.
  let resolved: PythonEntrypoint | undefined;
  const handlerFunction =
    typeof config?.handlerFunction === 'string'
      ? config.handlerFunction
      : undefined;

  const detected = await detectPythonEntrypoint(
    framework as PythonFramework,
    workPath,
    entrypoint
      ? {
          filePath: entrypoint,
          // Schedule-triggered services create their own "app" wrapper dynamically.
          // Other services use handlerFunction as the entrypoint variable name.
          varName:
            service?.type === 'cron' ||
            (service?.type === 'job' && service.trigger === 'schedule')
              ? undefined
              : handlerFunction,
        }
      : undefined,
    service
  );
  if (detected?.entrypoint) {
    resolved = detected.entrypoint;
  } else {
    const hookResult = await runFrameworkHook(framework, {
      pythonEnv: env,
      projectDir: join(workPath, detected?.baseDir ?? ''),
      workPath,
      entrypoint,
      detected: detected ?? undefined,
    });
    resolved = hookResult?.entrypoint;
  }
  if (!resolved) {
    if (detected?.error) {
      throw detected.error;
    }
    throw new NowBuildError({
      code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
      message:
        'No Python entrypoint could be detected. Please specify an entrypoint file.',
    });
  }
  const { entrypoint: entry, variableName } = resolved;

  // Convert to module path, e.g. "src/app.py" -> "src.app"
  const modulePath = entry.replace(/\.py$/i, '').replace(/[\\/]/g, '.');

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

    // vercel-runtime is a separate dependency that we need to install into .vercel/python/
    // so the dev shim can import it without messing with project's manifest (and possibly uv)
    await installVercelRuntime({
      workPath,
      uvPath,
      pythonBin: spawnCommand,
      env,
    });

    if (hasWorkerServicesEnabled(env)) {
      await installVercelWorkers({
        workPath,
        uvPath,
        pythonBin: spawnCommand,
        env,
        onStdout,
        onStderr,
      });
    }

    // Detect crons before spawning so we can set __VC_CRON_ROUTES.
    // For "<dynamic>" schedules, the entrypoint "module:object" must have
    // a get_crons() method returning (module:function, schedule) pairs.
    const crons = await getServiceCrons({
      service,
      entrypoint,
      rawEntrypoint,
      handlerFunction,
      pythonBin: spawnCommand,
      env,
      workPath,
    });

    if (crons?.length) {
      env.__VC_CRON_ROUTES = JSON.stringify(buildCronRouteTable(crons));
    }

    const port = typeof meta.port === 'number' ? meta.port : await getPort();
    env.PORT = `${port}`;

    if (entry) {
      env.__VC_HANDLER_ENTRYPOINT_ABS = join(workPath, entry);
    }

    // Spawn the actual server process
    const devShim = createDevShim(
      workPath,
      entry,
      modulePath,
      serviceName,
      framework,
      variableName ?? ''
    );

    // Add shim directory to PYTHONPATH so the shim can be imported,
    // and .vercel/python so vercel_runtime (installed there) is importable.
    if (devShim) {
      const shimDir = devShim.shimDir || join(workPath, '.vercel', 'python');
      const runtimeDir = join(workPath, '.vercel', 'python');
      const pathParts =
        shimDir !== runtimeDir ? [shimDir, runtimeDir] : [shimDir];

      if (devShim.extraPythonPath) {
        pathParts.push(devShim.extraPythonPath);
      }

      const existingPythonPath = env.PYTHONPATH || '';
      if (existingPythonPath) {
        pathParts.push(existingPythonPath);
      }

      env.PYTHONPATH = pathParts.join(delimiter);
    }

    const moduleToRun = devShim?.module || modulePath;
    const pythonArgs = ['-u', '-m', moduleToRun];
    const argv = [...spawnArgsPrefix, ...pythonArgs];
    debug(
      `Starting Python dev server (${framework}): ${spawnCommand} ${argv.join(' ')} [PORT=${port}]`
    );

    // Pass terminal dimensions so libraries like Rich can format output
    // correctly despite the process being detached from the controlling terminal.
    if (process.stdout.columns) {
      env.COLUMNS = `${process.stdout.columns}`;
    }

    const child = spawn(spawnCommand, argv, {
      cwd: workPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
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
    return { port, pid, shutdown, crons };
  } catch (err) {
    rejectChildReady(err);
    throw err;
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
