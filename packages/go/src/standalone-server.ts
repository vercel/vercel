import { spawn, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { dirname, join } from 'path';
import { pathExists } from 'fs-extra';
import {
  BuildOptions,
  Files,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  Lambda,
  getWriteableDirectory,
  debug,
  cloneEnv,
  getLambdaOptionsFromFunction,
  execCommand,
  getReportedServiceType,
} from '@vercel/build-utils';
import { createStandaloneLambda } from '@vercel-internals/ipc-proxy';

import { createGo, findGoBinary } from './go-helpers';
import { generateProjectManifest } from './diagnostics';

/**
 * Find the go.mod file starting from a directory and scanning up.
 */
async function findGoModPath(entrypointDir: string, workPath: string) {
  let goModPath: string | undefined = undefined;
  let isGoModInRootDir = false;
  let dir = entrypointDir;

  while (!isGoModInRootDir) {
    isGoModInRootDir = dir === workPath;
    const goMod = join(dir, 'go.mod');
    if (await pathExists(goMod)) {
      goModPath = goMod;
      debug(`Found ${goModPath}"`);
      break;
    }
    dir = dirname(dir);
  }

  return {
    goModPath,
    isGoModInRootDir,
  };
}

/**
 * Build a standalone Go HTTP server (runtime framework preset mode).
 * This builds a bootstrap wrapper that handles the Vercel IPC protocol
 * and proxies requests to the user's Go server.
 */
export async function buildStandaloneServer({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
  registerPreDeploy,
  service,
}: BuildOptions): Promise<{ output: Lambda }> {
  debug(`Building standalone Go server: ${entrypoint}`);

  await download(files, workPath, meta);

  // Get lambda options from config (memory, maxDuration, regions, architecture)
  const lambdaOptions = await getLambdaOptionsFromFunction({
    sourceFile: entrypoint,
    config,
  });

  const architecture = lambdaOptions?.architecture || 'x86_64';

  // Cross-compile for Linux with appropriate architecture
  const env = cloneEnv(process.env, meta.env, {
    GOARCH: architecture === 'arm64' ? 'arm64' : 'amd64',
    GOOS: 'linux',
    CGO_ENABLED: '0',
  });

  const { goModPath } = await findGoModPath(workPath, workPath);
  const modulePath = goModPath ? dirname(goModPath) : workPath;

  const go = await createGo({
    modulePath,
    opts: { cwd: workPath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');

  // Detect vendored dependencies by checking for vendor/modules.txt,
  // the canonical marker created by `go mod vendor`
  const vendorModulesPath = join(workPath, 'vendor', 'modules.txt');
  const isVendored = await pathExists(vendorModulesPath);
  if (isVendored) {
    debug('Detected vendor directory, using -mod=vendor for build');
  }

  const buildCommand: string | undefined =
    (config?.buildCommand as string) ??
    (config?.projectSettings as any)?.buildCommand ??
    undefined;

  if (typeof buildCommand === 'string') {
    debug(`Running custom build command: ${buildCommand}`);
    const buildStartTime = Date.now();
    await execCommand(buildCommand, {
      env: { ...go.getEnv(), VERCEL_OUTPUT_FILE: userServerPath },
      cwd: workPath,
    });
    await findGoBinary(workPath, userServerPath, goModPath, buildStartTime);
  } else {
    // Default: build the entrypoint with go build
    const buildTarget =
      entrypoint === 'main.go' ? '.' : './' + dirname(entrypoint);

    debug(
      `Building user Go server (${architecture}): go build ${buildTarget} -> ${userServerPath}`
    );

    try {
      await go.build(buildTarget, userServerPath, { vendorMode: isVendored });
    } catch (err) {
      console.error(`Failed to build standalone Go server: ${buildTarget}`);
      throw err;
    }
  }

  // Gather any additional files to include (user-specified via includeFiles)
  // Note: Static files in public/static/ should be handled by the static builder,
  // not bundled with the function. This follows the same pattern as Python.
  const includedFiles: Files = {};
  if (config && config.includeFiles) {
    const patterns = Array.isArray(config.includeFiles)
      ? config.includeFiles
      : [config.includeFiles];
    for (const pattern of patterns) {
      const fsFiles = await glob(pattern, workPath);
      for (const [assetName, asset] of Object.entries(fsFiles)) {
        includedFiles[assetName] = asset;
      }
    }
  }

  const lambda = await createStandaloneLambda({
    userServerPath,
    architecture,
    lambdaOptions,
    includedFiles,
    runtimeLanguage: 'go',
    supportsResponseStreaming: true,
  });

  const preDeployCommand = config?.preDeployCommand;
  if (registerPreDeploy && typeof preDeployCommand === 'string') {
    const capturedEnv = { ...env };
    const capturedCwd = workPath;
    registerPreDeploy(async () => {
      debug(`Running pre-deploy command: \`${preDeployCommand}\``);
      await execCommand(preDeployCommand, {
        env: capturedEnv,
        cwd: capturedCwd,
      });
    });
  }

  const goModJson = goModPath ? await go.modEditJson(goModPath) : null;
  await generateProjectManifest({
    workPath,
    goModJson,
    resolvedGoVersion: go.resolvedVersion,
    framework: config.framework ?? undefined,
    serviceType: service ? getReportedServiceType(service) : undefined,
  });

  return { output: lambda };
}

// First startup may compile the user's module and download dependencies.
const DEV_SERVER_STARTUP_TIMEOUT = 5 * 60_000; // 5 minutes

// Persistent dev servers keyed by workPath + entrypoint, reused across
// requests in `vercel dev` so each request doesn't pay a `go run` compile.
const PERSISTENT_SERVERS = new Map<
  string,
  { port: number; pid: number; child: ChildProcess }
>();

// Track pending start operations to avoid races spawning multiple servers
const PENDING_STARTS = new Map<
  string,
  Promise<{ port: number; pid: number }>
>();

let cleanupHandlersInstalled = false;

function killStandaloneDevServer(pid: number) {
  // The wrapper is spawned detached (its own process group) so that the
  // whole `go run` tree — wrapper, `go run`, and the user's compiled
  // server — can be killed with a single process-group signal.
  try {
    if (process.platform === 'win32') {
      process.kill(pid, 'SIGTERM');
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch (err: any) {
    debug(`Error killing standalone Go dev server ${pid}: ${err}`);
  }
}

function installGlobalCleanupHandlers() {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const killAll = () => {
    for (const [key, info] of PERSISTENT_SERVERS.entries()) {
      killStandaloneDevServer(info.pid);
      PERSISTENT_SERVERS.delete(key);
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

function isPortReachable(port: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPort(
  port: number,
  child: ChildProcess,
  timeout: number
): Promise<void> {
  let exited: { code: number | null; signal: string | null } | null = null;
  let spawnError: Error | null = null;
  const onExit = (code: number | null, signal: string | null) => {
    exited = { code, signal };
  };
  const onError = (err: Error) => {
    spawnError = err;
  };
  child.once('exit', onExit);
  child.once('error', onError);
  try {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (spawnError) {
        throw spawnError;
      }
      if (exited) {
        const { code, signal } = exited;
        throw new Error(
          `Standalone Go dev server exited before startup completed (code: ${code}, signal: ${signal})`
        );
      }
      if (await isPortReachable(port)) {
        return;
      }
      await sleep(100);
    }
    throw new Error(
      `Standalone Go dev server did not start within ${timeout}ms`
    );
  } finally {
    child.removeListener('exit', onExit);
    child.removeListener('error', onError);
  }
}

/**
 * Start a dev server for standalone Go server mode.
 * This runs a small Go dev wrapper (`vc-init-dev.go`) that:
 * - starts the user server on an internal port
 * - strips generated service route prefixes when configured
 * - proxies traffic on the externally assigned dev port
 *
 * The server is started once and reused across requests; the returned
 * `shutdown` is a no-op so the CLI doesn't kill it after each response.
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta = {} } = opts;

  const serverKey = `${workPath}::${resolvedEntrypoint}`;
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

  const pending = PENDING_STARTS.get(serverKey);
  if (pending) {
    const { port, pid } = await pending;
    return { port, pid, shutdown: async () => {} };
  }

  const startPromise = (async () => {
    // Use a random port in the ephemeral range
    const port = Math.floor(Math.random() * (65535 - 49152) + 49152);

    const env = cloneEnv(process.env, meta.env, {
      PORT: String(port),
    });

    const entrypointDir = dirname(join(workPath, resolvedEntrypoint));
    const { goModPath } = await findGoModPath(entrypointDir, workPath);
    const modulePath = goModPath ? dirname(goModPath) : workPath;
    const go = await createGo({
      modulePath,
      opts: { cwd: workPath, env },
      workPath,
    });

    // Determine run target based on entrypoint location
    // - main.go at root: go run .
    // - cmd/api/main.go: go run ./cmd/api
    const runTarget =
      resolvedEntrypoint === 'main.go'
        ? '.'
        : './' + dirname(resolvedEntrypoint);

    const devWrapper = join(__dirname, '../bootstrap/vc-init-dev.go');
    const devUtils = join(__dirname, '../bootstrap/utils.go');

    debug(
      `Starting standalone Go dev server wrapper: go run ${devWrapper} (target ${runTarget}, port ${port})`
    );

    const child = spawn('go', ['run', '-tags', 'vcdev', devWrapper, devUtils], {
      cwd: workPath,
      env: {
        ...go.getEnv(),
        __VC_GO_DEV_RUN_TARGET: runTarget,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
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

    const pid = child.pid;
    try {
      await waitForPort(port, child, DEV_SERVER_STARTUP_TIMEOUT);
    } catch (err) {
      if (pid) {
        killStandaloneDevServer(pid);
      }
      throw err;
    }
    if (!pid) {
      throw new Error('Standalone Go dev server started without a PID');
    }

    PERSISTENT_SERVERS.set(serverKey, { port, pid, child });
    child.once('exit', () => {
      PERSISTENT_SERVERS.delete(serverKey);
    });
    installGlobalCleanupHandlers();

    return { port, pid };
  })();

  PENDING_STARTS.set(serverKey, startPromise);
  try {
    const { port, pid } = await startPromise;
    return { port, pid, shutdown: async () => {} };
  } finally {
    PENDING_STARTS.delete(serverKey);
  }
}
