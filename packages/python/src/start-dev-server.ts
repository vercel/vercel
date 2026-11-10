import { spawn } from 'child_process';
import { createHash } from 'crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { join, delimiter, dirname, basename, posix } from 'path';
import { isDeepStrictEqual } from 'util';
import type { ChildProcess } from 'child_process';
import type {
  DevQueueSubscription,
  PythonFramework,
  StartDevServer,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import {
  debug,
  isQueueBackedService,
  isScheduleTriggeredService,
  isWorkflowTriggeredService,
  NowBuildError,
} from '@vercel/build-utils';
import { buildCronRouteTable, getServiceCrons } from './crons';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import {
  detectPythonEntrypoint,
  entrypointToModule,
  getVercelToolsEntrypoint,
  type DetectedPythonEntrypoint,
  type PythonEntrypoint,
} from './entrypoint';
import { runFrameworkHook } from './index';
import { getDefaultPythonVersion } from './version';
import {
  isInVirtualEnv,
  useVirtualEnv,
  ensureVenv,
  getVenvPythonBin,
  getVenvBinDir,
} from './utils';
import { findUvBinary, getProtectedUvEnv, checkUvBinaryVersion } from './uv';
import {
  discoverPackage,
  detectInstallSource,
  type ManifestType,
} from './install';
import {
  containsTopLevelCallable,
  stringifyManifest,
} from '@vercel/python-analysis';
import {
  VERCEL_RUNTIME_VERSION,
  VERCEL_WORKERS_VERSION,
} from './package-versions';
import {
  getQueueAdapterBootstrap,
  type QueueIntegration,
} from './conditional-vendoring';
import {
  apschedulerSubscriberIdentities,
  generatedPythonPathToModule,
  getApschedulerPreviewConfig,
  getPyprojectSubscribers,
  hasPyprojectSubscribers,
  introspectDevQueueSubscriptions,
} from './subscribers';
import { createScheduleHandlerModule } from './schedules';
import {
  isLegacyWorkersProject,
  isQueueWorkflowSdk,
  queryPythonWorkflowSdkVersion,
} from './sdk-detection';
import { getModuleEntrypointName } from './module-entrypoint';

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

interface DevPythonOptions {
  workPath: string;
  uvPath: string | null;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
}

async function dedupePendingOperation<T>(
  operations: Map<string, Promise<T>>,
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const existing = operations.get(key);
  if (existing) {
    return existing;
  }

  const pending = operation();
  operations.set(key, pending);

  try {
    return await pending;
  } finally {
    if (operations.get(key) === pending) {
      operations.delete(key);
    }
  }
}

// Multiple services in one workspace share a managed virtualenv and manifest.
// Keep their startup paths from mutating those shared resources concurrently.
const PENDING_MANAGED_VENV_CREATIONS = new Map<string, Promise<void>>();
const PENDING_DEPENDENCY_SYNCS = new Map<string, Promise<void>>();

interface SyncDependenciesOptions extends DevPythonOptions {
  onlyGroup?: string;
  activeVenv?: boolean;
}

async function syncDependencies({
  workPath,
  uvPath,
  pythonBin,
  env,
  onStdout,
  onStderr,
  onlyGroup,
  activeVenv,
}: SyncDependenciesOptions): Promise<void> {
  const pythonPackage = await discoverPackage({
    entrypointDir: workPath,
    rootDir: workPath,
  });

  if (
    onlyGroup &&
    !(onlyGroup in (pythonPackage.manifest?.data?.['dependency-groups'] ?? {}))
  ) {
    debug(`No "${onlyGroup}" dependency group found, skipping dependency sync`);
    return;
  }

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
      onlyGroup,
      activeVenv,
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
  onlyGroup?: string;
  activeVenv?: boolean;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
}

async function runSync({
  manifestType,
  manifestPath,
  uvPath,
  pythonBin,
  env,
  onlyGroup,
  activeVenv,
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
      if (activeVenv) {
        spawnArgs.push('--active');
      }
      if (onlyGroup) {
        spawnArgs.push('--only-group', onlyGroup, '--no-install-project');
      }
      break;
    }
    case 'pylock.toml': {
      spawnCmd = pip.cmd;
      spawnArgs = [...pip.prefix];
      if (onlyGroup) {
        spawnArgs.push('--group', onlyGroup);
      } else {
        spawnArgs.push('-r', manifestPath);
      }
      break;
    }
    case 'pyproject.toml': {
      spawnCmd = pip.cmd;
      spawnArgs = [...pip.prefix];
      if (onlyGroup) {
        spawnArgs.push('--group', onlyGroup);
      } else {
        spawnArgs.push(projectDir);
      }
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

// Services in one workspace share this install target. Besides deduplicating
// concurrent installs, remember successful installs for the dev session so a
// later service does not rewrite site-packages underneath running workers.
const PENDING_INSTALLS = new Map<string, Promise<void>>();
const COMPLETED_INSTALLS = new Set<string>();

interface InjectedPackageSpec {
  name: string;
  pinnedVersion?: string;
  requirement?: string;
  extraRequirements?: string[];
  envOverride: string | undefined;
}

function hasInstalledDistribution(targetDir: string, packageName: string) {
  const prefix = `${packageName.replace('-', '_')}-`;
  try {
    return readdirSync(targetDir).some(
      entry => entry.startsWith(prefix) && entry.endsWith('.dist-info')
    );
  } catch {
    return false;
  }
}

async function installInjectedDevPackage(
  pkg: InjectedPackageSpec,
  opts: DevPythonOptions
): Promise<void> {
  const targetDir = join(opts.workPath, '.vercel', 'python');
  const source = pkg.envOverride || pkg.pinnedVersion || pkg.requirement;
  const key = `${targetDir}:${pkg.name}:${source}`;

  if (
    COMPLETED_INSTALLS.has(key) &&
    hasInstalledDistribution(targetDir, pkg.name)
  ) {
    return;
  }
  COMPLETED_INSTALLS.delete(key);

  await dedupePendingOperation(PENDING_INSTALLS, key, async () => {
    await doInstallInjectedDevPackage(pkg, { ...opts, targetDir });
    COMPLETED_INSTALLS.add(key);
  });
}

async function doInstallInjectedDevPackage(
  pkg: InjectedPackageSpec,
  opts: DevPythonOptions & { targetDir: string }
): Promise<void> {
  const { targetDir, workPath, uvPath, pythonBin, env, onStdout, onStderr } =
    opts;
  mkdirSync(targetDir, { recursive: true });

  const localDir = join(__dirname, '..', '..', '..', 'python', pkg.name);
  const isLocalDev = existsSync(join(localDir, 'pyproject.toml'));

  const requirement = pkg.pinnedVersion
    ? `${pkg.name}==${pkg.pinnedVersion}`
    : (pkg.requirement ?? pkg.name);
  const dep = pkg.envOverride || (isLocalDev ? localDir : requirement);

  // Skip install if the exact pypi version is already present. Local dev
  // builds, unpinned requirements, and overrides always reinstall to pick
  // up possible source changes.
  if (!isLocalDev && !pkg.envOverride && pkg.pinnedVersion) {
    const distInfoName = pkg.name.replace('-', '_');
    const distInfo = join(
      targetDir,
      `${distInfoName}-${pkg.pinnedVersion}.dist-info`
    );
    if (existsSync(distInfo)) {
      debug(`${pkg.name} ${pkg.pinnedVersion} already installed, skipping`);
      return;
    }
  }

  debug(
    `Installing ${pkg.name} into ${targetDir} (type: ${isLocalDev ? 'local' : 'pypi'}, source: ${dep})`
  );

  const pip = uvPath
    ? { cmd: uvPath, prefix: ['pip', 'install'] }
    : { cmd: pythonBin, prefix: ['-m', 'pip', 'install'] };

  // Override exclude-newer so a project-level date constraint doesn't
  // block installation of a recently-published injected package, and
  // ignore the user's require-hashes setting for these unhashed pins.
  const uvOverrides = uvPath
    ? ['--exclude-newer-package', `${pkg.name}=false`, '--no-require-hashes']
    : [];

  const extras =
    pkg.envOverride || isLocalDev ? [] : (pkg.extraRequirements ?? []);
  const spawnArgs = [
    ...pip.prefix,
    '--target',
    targetDir,
    ...uvOverrides,
    ...extras,
    dep,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pip.cmd, spawnArgs, {
      cwd: workPath,
      // uv rejects `--no-require-hashes` while UV_REQUIRE_HASHES is set.
      env: { ...getProtectedUvEnv(env), UV_REQUIRE_HASHES: undefined },
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
            `Installing ${pkg.name} failed with code ${code}, signal ${signal}`
          )
        );
      }
    });
  });
}

// Persistent dev servers keyed by workPath + modulePath so background tasks
// can continue after HTTP response. Reused across requests in `vercel dev`.
// This is necessary for background tasks to continue after HTTP response.
interface PersistentServer {
  port: number;
  pid: number;
  child: ChildProcess;
  stdoutLogListener: ((buf: Buffer) => void) | null;
  stderrLogListener: ((buf: Buffer) => void) | null;
  /** Supervisor source a schedule function server was started with. */
  scheduleModule?: string;
  scheduleEnv?: NodeJS.ProcessEnv;
}

const PERSISTENT_SERVERS = new Map<string, PersistentServer>();

// Track pending start operations to avoid races spawning multiple servers
const PENDING_STARTS = new Map<
  string,
  Promise<{ port: number; pid: number }>
>();

// Servers are spawned detached, so each leads a process group. Signal the
// group so a uvicorn reloader's worker stops with it.
function signalServer(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch (err: any) {
      debug(`Error sending ${signal} to ${pid}: ${err}`);
    }
  }
}

function killPersistentServer(key: string) {
  const info = PERSISTENT_SERVERS.get(key);
  if (!info) return;
  PERSISTENT_SERVERS.delete(key);
  signalServer(info.pid, 'SIGTERM');
  signalServer(info.pid, 'SIGKILL');
}

let restoreWarnings: (() => void) | null = null;
let cleanupHandlersInstalled = false;

function installGlobalCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const killAll = () => {
    for (const key of PERSISTENT_SERVERS.keys()) {
      killPersistentServer(key);
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

/** Escape a value for interpolation inside a double-quoted Python string. */
export function escapePythonStringContents(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function createDevShim(
  workPath: string,
  entry: string,
  modulePath: string,
  shimSubdir: string | undefined,
  framework: string,
  variableName: string
): DevShimResult | null {
  try {
    // Services and schedule functions get their own shim subdirectory so
    // servers in the same workspace don't overwrite each other's shim.
    const vercelPythonDir = shimSubdir
      ? join(workPath, '.vercel', 'python', shimSubdir)
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

    const entryAbs = posix.join(workPath.replace(/\\/g, '/'), entry);

    const shimPath = join(vercelPythonDir, `${DEV_SHIM_MODULE}.py`);
    const templatePath = join(
      __dirname,
      '..',
      'templates',
      `${DEV_SHIM_MODULE}.py`
    );
    const template = readFileSync(templatePath, 'utf8');
    const shimSource = template
      .replace(
        /__VC_DEV_MODULE_NAME__/g,
        escapePythonStringContents(qualifiedModule)
      )
      .replace(/__VC_DEV_ENTRY_ABS__/g, escapePythonStringContents(entryAbs))
      .replace(/__VC_DEV_FRAMEWORK__/g, escapePythonStringContents(framework))
      .replace(
        /__VC_DEV_VARIABLE_NAME__/g,
        escapePythonStringContents(variableName)
      );
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
  const venvPath = join(workPath, '.venv');

  // A sibling service may already be creating this workspace's virtualenv.
  // Wait before probing it so we never observe a partially-created environment.
  const pendingCreation = PENDING_MANAGED_VENV_CREATIONS.get(venvPath);
  if (pendingCreation) {
    await pendingCreation;
  }

  // Use an existing .venv/venv if present and allowed (single Python service in a project).
  const { pythonCmd, venvRoot } = useVirtualEnv(workPath, env, systemPython);
  if (venvRoot) {
    debug(`Using existing virtualenv at ${venvRoot} for multi-service dev`);
    return { command: pythonCmd, args: [] };
  }

  // Create one managed .venv per workspace. Parallel services reuse the same
  // in-flight creation rather than invoking uv against the directory together.
  await dedupePendingOperation(PENDING_MANAGED_VENV_CREATIONS, venvPath, () =>
    ensureVenv({
      pythonVersion: { pythonPath: systemPython },
      venvPath,
      uvPath,
      quiet: true,
    })
  );
  debug(`Created virtualenv at ${venvPath} for multi-service dev`);

  const pythonBin = getVenvPythonBin(venvPath);
  const binDir = getVenvBinDir(venvPath);
  env.VIRTUAL_ENV = venvPath;
  env.PATH = `${binDir}${delimiter}${env.PATH || ''}`;

  return { command: pythonBin, args: [] };
}

interface PendingStart {
  resolve: (value: { port: number; pid: number }) => void;
  reject: (reason: unknown) => void;
}

/**
 * Return the running server for `serverKey`, waiting out any start already in
 * progress. A server for which `isStale` returns true is killed. Otherwise,
 * claim the start for `serverKey` and return a `PendingStart` the caller must
 * settle once its server is running or has failed.
 */
async function claimPersistentServer(
  serverKey: string,
  isStale?: (server: PersistentServer) => boolean
): Promise<StartDevServerSuccess | PendingStart> {
  while (true) {
    const existing = PERSISTENT_SERVERS.get(serverKey);
    if (existing) {
      if (isStale?.(existing)) {
        killPersistentServer(serverKey);
      } else {
        return {
          port: existing.port,
          pid: existing.pid,
          shutdown: async () => {
            // no-op so CLI does not kill persistent server per request
          },
        };
      }
    }

    const pending = PENDING_STARTS.get(serverKey);
    if (!pending) break;
    await pending;
  }

  // Claim synchronously after the check, so concurrent requests wait for this
  // start rather than spawning their own server.
  let start!: PendingStart;
  const ready = new Promise<{ port: number; pid: number }>(
    (resolve, reject) => {
      start = { resolve, reject };
    }
  );
  // Waiters see a failed start; don't let it go unhandled when there are none.
  ready.catch(() => {});
  PENDING_STARTS.set(serverKey, ready);
  return start;
}

interface SpawnPersistentServerOptions {
  serverKey: string;
  workPath: string;
  entry: string;
  modulePath: string;
  shimSubdir: string | undefined;
  framework: string;
  variableName: string;
  extraPythonPath?: string;
  spawnCommand: string;
  spawnArgsPrefix: string[];
  /** Port to bind; a free one is picked when omitted. */
  port?: number;
  env: NodeJS.ProcessEnv;
  onStdout?: (buf: Buffer) => void;
  onStderr?: (buf: Buffer) => void;
  scheduleModule?: string;
  scheduleEnv?: NodeJS.ProcessEnv;
}

/**
 * Serve `modulePath`'s `variableName` through the dev shim, wait for it to
 * accept connections, and register it in PERSISTENT_SERVERS.
 */
async function spawnPersistentServer({
  serverKey,
  workPath,
  entry,
  modulePath,
  shimSubdir,
  framework,
  variableName,
  extraPythonPath,
  spawnCommand,
  spawnArgsPrefix,
  port: requestedPort,
  env,
  onStdout,
  onStderr,
  scheduleModule,
  scheduleEnv,
}: SpawnPersistentServerOptions): Promise<{ port: number; pid: number }> {
  const port = requestedPort ?? (await getPort());
  env.PORT = `${port}`;

  if (entry) {
    env.__VC_HANDLER_ENTRYPOINT_ABS = join(workPath, entry);
  }

  // Spawn the actual server process
  const devShim = createDevShim(
    workPath,
    entry,
    modulePath,
    shimSubdir,
    framework,
    variableName
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

    if (extraPythonPath) {
      pathParts.push(extraPythonPath);
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

  const stdoutLogListener = createLogListener(onStdout, process.stdout);
  const stderrLogListener = createLogListener(onStderr, process.stderr);
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

  // Persist for reuse across requests
  PERSISTENT_SERVERS.set(serverKey, {
    port,
    pid,
    child,
    stdoutLogListener,
    stderrLogListener,
    scheduleModule,
    scheduleEnv,
  });

  return { port, pid };
}

// Dependency group installed into the proxy's own venv.
const PROXY_DEPENDENCY_GROUP = 'vercel.proxy';

/**
 * Serve a proxy (`vercel.json` `proxy`) on its own persistent server. The
 * proxy's file and attribute are resolved upstream from `module:attr`, so
 * they are served as given rather than detected like an app.
 */
const startProxyDevServer: StartDevServer = async ({
  entrypoint,
  workPath,
  meta = {},
  config,
  onStdout,
  onStderr,
}) => {
  const handlerFunction = config?.handlerFunction;
  if (typeof handlerFunction !== 'string' || !handlerFunction) {
    throw new Error(
      'Python proxy dev server requires "config.handlerFunction" to be set'
    );
  }

  const serverKey = `${workPath}::proxy::${entrypoint}`;
  const start = await claimPersistentServer(serverKey);
  if ('port' in start) {
    return start;
  }

  // Silence Node warnings and install cleanup handlers once
  if (!restoreWarnings) restoreWarnings = silenceNodeWarnings();
  installGlobalCleanupHandlers();

  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;

  try {
    const proxySource = readFileSync(join(workPath, entrypoint), 'utf8');
    if (!(await containsTopLevelCallable(proxySource, handlerFunction))) {
      throw new NowBuildError({
        code: 'PYTHON_HANDLER_NOT_FOUND',
        message:
          `Handler function "${handlerFunction}" not found in ${entrypoint}. ` +
          `Ensure it is defined at the module's top level.`,
      });
    }

    const { pythonPath: systemPython } = getDefaultPythonVersion(meta);
    const uvPath = await findUvBinary(systemPython);
    if (uvPath) {
      checkUvBinaryVersion(uvPath);
    }

    // The proxy has its own venv with only its dependency group.
    const venvPath = join(
      workPath,
      '.vercel',
      'python',
      PROXY_DEPENDENCY_GROUP,
      '.venv'
    );
    await ensureVenv({
      pythonVersion: { pythonPath: systemPython },
      venvPath,
      uvPath,
      quiet: true,
    });
    // Ensure install and server use proxy venv.
    const pythonCmd = getVenvPythonBin(venvPath);
    env.VIRTUAL_ENV = venvPath;
    env.PATH = `${getVenvBinDir(venvPath)}${delimiter}${env.PATH || ''}`;
    await syncDependencies({
      workPath,
      uvPath,
      pythonBin: pythonCmd,
      env,
      onStdout,
      onStderr,
      onlyGroup: PROXY_DEPENDENCY_GROUP,
      activeVenv: true,
    });

    await installInjectedDevPackage(
      {
        name: 'vercel-runtime',
        pinnedVersion: VERCEL_RUNTIME_VERSION,
        envOverride: env.VERCEL_RUNTIME_PYTHON,
      },
      { workPath, uvPath, pythonBin: pythonCmd, env, onStdout, onStderr }
    );

    const { port, pid } = await spawnPersistentServer({
      serverKey,
      workPath,
      entry: entrypoint,
      modulePath: entrypointToModule(entrypoint),
      shimSubdir: PROXY_DEPENDENCY_GROUP,
      framework: 'python',
      variableName: handlerFunction,
      spawnCommand: pythonCmd,
      spawnArgsPrefix: [],
      env,
      onStdout,
      onStderr,
    });

    start.resolve({ port, pid });

    // No-op shutdown so CLI won't kill the server after each request
    return { port, pid, shutdown: async () => {} };
  } catch (err) {
    start.reject(err);
    throw err;
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};

export const startDevServer: StartDevServer = async opts => {
  if (opts.config?.middleware === true) {
    return startProxyDevServer(opts);
  }

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
  // Schedule functions serve the runtime's schedule supervisor, which runs
  // the dispatched schedule's script, instead of a detected application.
  const scheduleFunction = config?.scheduleFunction;
  const scheduleHandlerPath =
    scheduleFunction &&
    `_vc_schedule_handlers/schedule_${createHash('sha256')
      .update(scheduleFunction.outputPath)
      .digest('hex')}.py`;
  const scheduleModule =
    scheduleFunction && createScheduleHandlerModule(scheduleFunction, workPath);
  const env = { ...process.env, ...(meta.env || {}) } as NodeJS.ProcessEnv;
  const scheduleEnv = scheduleFunction ? { ...env } : undefined;

  // Check for an existing persistent server.
  // Include serviceName so that services sharing a workspace get separate servers.
  const serviceName =
    service?.name ??
    (typeof meta.serviceName === 'string' ? meta.serviceName : undefined);
  const serverKey = scheduleFunction
    ? `${workPath}::schedule::${scheduleFunction.outputPath}`
    : serviceName
      ? `${workPath}::${framework}::${serviceName}`
      : `${workPath}::${framework}`;

  // No framework is defined, so most likely this is 'handler' class-based
  // serverless functions that should be served directly using vercel-runtime
  // instead of dev server.
  // Otherwise the framework would be a known one or just 'python'.
  if (!framework && !scheduleFunction) {
    return null;
  }

  const start = await claimPersistentServer(
    serverKey,
    info =>
      !!scheduleFunction &&
      (info.scheduleModule !== scheduleModule ||
        !isDeepStrictEqual(info.scheduleEnv, scheduleEnv))
  );
  if ('port' in start) {
    return start;
  }

  // Silence Node warnings and install cleanup handlers once
  if (!restoreWarnings) restoreWarnings = silenceNodeWarnings();
  installGlobalCleanupHandlers();

  try {
    const entrypoint = rawEntrypoint === '<detect>' ? undefined : rawEntrypoint;
    const isPyprojectEntrypoint = entrypoint === 'pyproject.toml';

    // For non-web background processes, use the raw entrypoint directly because
    // they don't export app/application, so standard detection would skip them.
    let resolved: PythonEntrypoint | undefined;
    const handlerFunction =
      typeof config?.handlerFunction === 'string'
        ? config.handlerFunction
        : undefined;
    // Pyproject queue sidecars may declare a bare module entrypoint (no
    // handlerFunction); like queue-backed services, they are served through a
    // dynamically created "app" rather than an object detected in the file.
    const isPyQueueSidecar =
      config?.pythonQueueSidecar === 'subscriber' ||
      config?.pythonQueueSidecar === 'workflow';

    let detected: DetectedPythonEntrypoint | null;
    if (scheduleHandlerPath && scheduleModule) {
      const entrypoint = posix.join('.vercel/python', scheduleHandlerPath);
      mkdirSync(dirname(join(workPath, entrypoint)), { recursive: true });
      writeFileSync(join(workPath, entrypoint), scheduleModule);
      detected = { entrypoint: { entrypoint, variableName: 'app' } };
    } else if (isPyprojectEntrypoint) {
      const declaredEntrypoint = await getVercelToolsEntrypoint(
        workPath,
        opts.repoRootPath
      );
      detected = declaredEntrypoint ? { entrypoint: declaredEntrypoint } : null;
    } else {
      detected = await detectPythonEntrypoint(
        framework as PythonFramework,
        workPath,
        entrypoint
          ? {
              filePath: entrypoint,
              // Schedule-triggered services create their own "app" wrapper dynamically.
              // Other services use handlerFunction as the entrypoint variable name.
              varName:
                service && isScheduleTriggeredService(service)
                  ? undefined
                  : (handlerFunction ?? (isPyQueueSidecar ? 'app' : undefined)),
            }
          : undefined,
        service,
        opts.repoRootPath
      );
    }
    let hookResult: Awaited<ReturnType<typeof runFrameworkHook>> | undefined;
    if (detected?.entrypoint) {
      resolved = detected.entrypoint;
    } else if (!isPyprojectEntrypoint) {
      hookResult = await runFrameworkHook(framework, {
        pythonEnv: env,
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
        code: isPyprojectEntrypoint
          ? 'PYTHON_PYPROJECT_NOTHING_TO_BUILD'
          : 'PYTHON_ENTRYPOINT_NOT_FOUND',
        message: isPyprojectEntrypoint
          ? 'Entrypoint "pyproject.toml" does not declare a web app. Set "tool.vercel.entrypoint" in pyproject.toml.'
          : 'No Python entrypoint could be detected. Please specify an entrypoint file.',
      });
    }
    const { entrypoint: entry, variableName } = resolved;

    const modulePath = scheduleHandlerPath
      ? generatedPythonPathToModule(scheduleHandlerPath)
      : entrypointToModule(entry);

    const { pythonPath: systemPython } = getDefaultPythonVersion(meta);
    const uvPath = await findUvBinary(systemPython);
    if (uvPath) {
      checkUvBinaryVersion(uvPath);
    }
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

    const devOpts: DevPythonOptions = {
      workPath,
      uvPath,
      pythonBin: spawnCommand,
      env,
      onStdout,
      onStderr,
    };

    if (meta.syncDependencies) {
      const gray = '\x1b[90m';
      const reset = '\x1b[0m';
      const syncMessage = `${gray}Synchronizing dependencies...${reset}\n`;
      if (onStdout) {
        onStdout(Buffer.from(syncMessage));
      } else {
        console.log(syncMessage);
      }

      await dedupePendingOperation(PENDING_DEPENDENCY_SYNCS, workPath, () =>
        syncDependencies(devOpts)
      );
    }

    // vercel-runtime is a separate dependency that we need to install into .vercel/python/
    // so the dev shim can import it without messing with project's manifest (and possibly uv)
    await installInjectedDevPackage(
      {
        name: 'vercel-runtime',
        pinnedVersion: VERCEL_RUNTIME_VERSION,
        envOverride: env.VERCEL_RUNTIME_PYTHON,
      },
      devOpts
    );

    // Mirror the build-time queue adapter bootstrap so modules importing
    // `vercel.integrations.*` resolve in dev too.
    const legacyProject = await isLegacyWorkersProject(workPath);
    let queueIntegrations: QueueIntegration[] = [];
    try {
      const pythonPackage = await discoverPackage({
        entrypointDir: workPath,
        rootDir: workPath,
      });
      const queueAdapterBootstrap = await getQueueAdapterBootstrap({
        pythonPackage,
        env,
        legacyWorkersProject: legacyProject,
        hasDeclaredSubscribers: await hasPyprojectSubscribers(workPath),
      });
      queueIntegrations = queueAdapterBootstrap.integrations;
      // Activate every detected adapter through the same runtime path. Queue
      // registration remains disabled outside queue-serving sidecars.
      if (queueIntegrations.length > 0) {
        env.VERCEL_QUEUE_INTEGRATIONS = queueIntegrations
          .map(
            ({ module, installer, servingActivator }) =>
              `${module}:${installer}` +
              (servingActivator ? `:${servingActivator}` : '')
          )
          .join(',');
      } else {
        delete env.VERCEL_QUEUE_INTEGRATIONS;
      }
      for (const injectedPackage of queueAdapterBootstrap.injectedPackages) {
        await installInjectedDevPackage(
          {
            name: injectedPackage.name,
            requirement: injectedPackage.requirement,
            extraRequirements: injectedPackage.extraRequirements,
            envOverride: injectedPackage.envOverride,
          },
          devOpts
        );
      }
    } catch (err) {
      debug(
        `Skipping conditional dev package injection: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const apschedulerSubscribers: {
      id: string;
      entrypoint: string;
    }[] = [];
    // Schedule scripts run once per firing and never serve subscribers.
    if (!legacyProject && !scheduleFunction) {
      const runtimeDir = join(workPath, '.vercel', 'python');
      const declaredSubscribers = await getPyprojectSubscribers(workPath);
      const introspectionEnv: NodeJS.ProcessEnv = {
        ...env,
        PYTHONPATH: [runtimeDir, env.PYTHONPATH]
          .filter(Boolean)
          .join(delimiter),
      };
      delete introspectionEnv.VERCEL_APSCHEDULER_SUBSCRIBERS;
      for (const declaration of declaredSubscribers) {
        const introspected = await introspectDevQueueSubscriptions({
          moduleName: declaration.moduleName,
          subscriberName: declaration.name,
          variableName: declaration.variableName || 'app',
          pythonBin: spawnCommand,
          cwd: workPath,
          env: introspectionEnv,
          integrations: queueIntegrations,
        });
        apschedulerSubscribers.push(
          ...apschedulerSubscriberIdentities([
            { ...declaration, owners: introspected?.owners ?? [] },
          ])
        );
      }
    }
    if (apschedulerSubscribers.length > 0) {
      env.VERCEL_APSCHEDULER_SUBSCRIBERS = JSON.stringify(
        apschedulerSubscribers
      );
      const previewConfig = await getApschedulerPreviewConfig(workPath);
      if (previewConfig) {
        env.VERCEL_APSCHEDULER_PREVIEW_IDLE_TIMEOUT_SECONDS = String(
          previewConfig.idleTimeoutSeconds
        );
      } else {
        delete env.VERCEL_APSCHEDULER_PREVIEW_IDLE_TIMEOUT_SECONDS;
      }
    } else {
      delete env.VERCEL_APSCHEDULER_SUBSCRIBERS;
      delete env.VERCEL_APSCHEDULER_PREVIEW_IDLE_TIMEOUT_SECONDS;
    }

    // Legacy vercel-workers projects run every dev process on the injected
    // pinned vercel-workers, mirroring the build-time injection: both the
    // worker bootstrap and publish-side send() need the pinned version
    if (legacyProject) {
      await installInjectedDevPackage(
        {
          name: 'vercel-workers',
          pinnedVersion: VERCEL_WORKERS_VERSION,
          envOverride: env.VERCEL_WORKERS_PYTHON,
        },
        devOpts
      );
    }

    // Queue sidecars (subscribers/workflows) are served through vercel-queue
    // when the project's SDK supports it, and through the legacy
    // vercel-workers bootstrap otherwise. Deliberately not keyed on
    // env.VERCEL_HAS_WORKER_SERVICES: the CLI sets that for every
    // queue-service project regardless of SDK generation. Besides pyproject
    // sidecars (marked by the CLI via config.pythonQueueSidecar), this
    // covers queue-backed experimentalServices (worker and queue/workflow
    // triggered job services) until we fully get rid of them.
    const queueSidecarKind =
      config?.pythonQueueSidecar === 'subscriber' ||
      config?.pythonQueueSidecar === 'workflow'
        ? config.pythonQueueSidecar
        : service && isQueueBackedService(service)
          ? isWorkflowTriggeredService(service)
            ? 'workflow'
            : 'subscriber'
          : undefined;
    let queueSubscriptions: DevQueueSubscription[] | undefined;
    if (queueSidecarKind) {
      let useQueueServing = !legacyProject;
      if (useQueueServing && queueSidecarKind === 'workflow') {
        useQueueServing = isQueueWorkflowSdk(
          await queryPythonWorkflowSdkVersion({
            pythonBin: spawnCommand,
            cwd: workPath,
            env,
          })
        );
      }

      if (useQueueServing) {
        env.VERCEL_DEV_QUEUE_SERVING = '1';
        const subscriberName = getModuleEntrypointName({
          moduleName: modulePath,
          variableName: variableName || 'app',
        });
        env.VERCEL_PYTHON_SUBSCRIBER_ID = subscriberName;
        // The vercel-queue SDK dispatches deliveries by the registered
        // (consumer group, topic) pair, so the dev queue broker must
        // deliver with the SDK-registered consumer groups. Introspect them
        // the same way the build does. Conditional adapters live in
        // .vercel/python, so put it on the interpreter's path.
        const runtimeDir = join(workPath, '.vercel', 'python');
        const introspectionEnv: NodeJS.ProcessEnv = {
          ...env,
          PYTHONPATH: [runtimeDir, env.PYTHONPATH]
            .filter(Boolean)
            .join(delimiter),
        };
        delete introspectionEnv.VERCEL_APSCHEDULER_SUBSCRIBERS;
        queueSubscriptions = (
          await introspectDevQueueSubscriptions({
            moduleName: modulePath,
            subscriberName,
            variableName: variableName || 'app',
            pythonBin: spawnCommand,
            cwd: workPath,
            env: introspectionEnv,
            integrations: queueIntegrations,
          })
        )?.subscriptions;
      } else {
        delete env.VERCEL_DEV_QUEUE_SERVING;
        delete env.VERCEL_PYTHON_SUBSCRIBER_ID;
        await installInjectedDevPackage(
          {
            name: 'vercel-workers',
            pinnedVersion: VERCEL_WORKERS_VERSION,
            envOverride: env.VERCEL_WORKERS_PYTHON,
          },
          devOpts
        );
      }
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

    const { port, pid } = await spawnPersistentServer({
      serverKey,
      workPath,
      entry,
      modulePath,
      shimSubdir: scheduleHandlerPath
        ? scheduleHandlerPath.replace(/\.py$/, '')
        : serviceName && posix.join('services', serviceName),
      framework: framework ?? 'python',
      variableName: variableName ?? '',
      extraPythonPath: hookResult?.extraPythonPath,
      spawnCommand,
      spawnArgsPrefix,
      port: typeof meta.port === 'number' ? meta.port : undefined,
      env,
      onStdout,
      onStderr,
      scheduleModule,
      scheduleEnv,
    });

    start.resolve({ port, pid });

    // No-op shutdown so CLI won't kill the server after each request
    const shutdown = async () => {};
    return { port, pid, shutdown, crons, queueSubscriptions };
  } catch (err) {
    start.reject(err);
    throw err;
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
};
