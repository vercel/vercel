import { spawn, type ChildProcess } from 'child_process';
import { dirname, join, relative } from 'path';
import { mkdirp, pathExists, remove } from 'fs-extra';
import {
  BuildOptions,
  type BuildResultV2Typical,
  type BuildResultVX,
  Files,
  type Lambda,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  getWriteableDirectory,
  debug,
  cloneEnv,
  getLambdaOptionsFromFunction,
  execCommand,
  getReportedServiceType,
} from '@vercel/build-utils';
import {
  createStandaloneLambda,
  startDevProxy,
  type DevProxyHandle,
} from '@vercel-internals/ipc-proxy';

import {
  createGo,
  findGoBinary,
  findGoModPath,
  findGoWorkPath,
  type GoWrapper,
} from './go-helpers';
import { generateProjectManifest } from './diagnostics';

/**
 * Output path for the standalone server Lambda.
 *
 * Deliberately not `index`: the filesystem handler resolves `/` to an `index`
 * output, so a rewrite landing on `/` would dispatch there before the catch-all
 * below can copy the resolved destination into the runtime request path.
 */
export const STANDALONE_LAMBDA_PATH = 'go';

/**
 * V1 services are routed by fs-detectors, which merges every service into one
 * shared top-level table where a catch-all would shadow its siblings. Every
 * other build owns its route table and needs the catch-all to reach the Lambda.
 */
function ownsRouteTable(service: BuildOptions['service']): boolean {
  return !(service?.name && service.type);
}

export function getStandaloneServerRoutes(
  service: BuildOptions['service']
): BuildResultV2Typical['routes'] {
  if (!ownsRouteTable(service)) {
    return undefined;
  }

  return [
    { handle: 'filesystem' as const },
    // This route matches the resolved destination after rewrites. Copy that
    // path into the runtime request before dispatching the Go server so its
    // application routing observes the rewrite.
    {
      src: '/(.*)',
      dest: `/${STANDALONE_LAMBDA_PATH}`,
      transforms: [
        {
          type: 'request.path' as const,
          op: 'set' as const,
          args: '/$1',
        },
      ],
    },
  ];
}

/**
 * Searches to the repo root so services can share a `go.mod` or `go.work`.
 */
async function locateGoModule({
  entrypoint,
  workPath,
  repoRootPath,
  goWork,
}: {
  entrypoint: string;
  workPath: string;
  repoRootPath?: string;
  goWork?: string;
}) {
  const entrypointDir = dirname(join(workPath, entrypoint));
  const repoRoot = repoRootPath ?? workPath;
  const [goModPath, goWorkPath] = await Promise.all([
    findGoModPath(entrypointDir, repoRoot),
    findGoWorkPath(workPath, repoRoot, goWork),
  ]);
  return {
    goModPath,
    modulePath: goModPath ? dirname(goModPath) : workPath,
    workspaceFile: goWorkPath,
    repoRoot,
  };
}

function describeGoVersion(go: GoWrapper, repoRoot: string): string {
  const { versionSource } = go;
  if (versionSource.kind === 'default') {
    return `Using Go ${go.resolvedVersion} (default)`;
  }
  const file = relative(repoRoot, versionSource.file) || versionSource.kind;
  const via =
    versionSource.directive === 'toolchain' ? ' via `toolchain` directive' : '';
  return `Using Go ${go.resolvedVersion} (from ${file}${via})`;
}

function logGoVersion(go: GoWrapper, repoRoot: string, entrypoint: string) {
  console.log(describeGoVersion(go, repoRoot));
  if (go.versionSource.kind === 'default') {
    console.log(
      `Warning: no go.mod or go.work found for ${entrypoint} (searched up to ${repoRoot}). ` +
        'Add a `go` directive to pin the toolchain version.'
    );
  }
}

/**
 * Build a standalone Go HTTP server (runtime framework preset mode).
 * This builds a bootstrap wrapper that handles the Vercel IPC protocol
 * and proxies requests to the user's Go server.
 */
export async function buildStandaloneServer(
  options: BuildOptions
): Promise<BuildResultVX> {
  const lambda = await createStandaloneServerLambda(options);
  const { service } = options;

  // V1 services keep the scalar V3 result so the CLI names the output with the
  // internal `_svc/<name>` namespace their shared route table expects.
  if (!ownsRouteTable(service)) {
    return { resultVersion: 3, result: { output: lambda } };
  }

  return {
    resultVersion: 2,
    result: {
      output: { [STANDALONE_LAMBDA_PATH]: lambda },
      routes: getStandaloneServerRoutes(service),
    },
  };
}

async function createStandaloneServerLambda({
  files,
  entrypoint,
  config,
  workPath,
  repoRootPath,
  meta = {},
  registerPreDeploy,
  service,
}: BuildOptions): Promise<Lambda> {
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

  const { goModPath, modulePath, workspaceFile, repoRoot } =
    await locateGoModule({
      entrypoint,
      workPath,
      repoRootPath,
      goWork: env.GOWORK,
    });

  const go = await createGo({
    modulePath,
    workspaceFile,
    opts: { cwd: workPath, env },
    workPath,
  });
  logGoVersion(go, repoRoot, entrypoint);

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

  return lambda;
}

// Keyed by workPath + entrypoint, reused so each request doesn't pay a build.
interface PersistentDevServer {
  handle: DevProxyHandle;
}

const PERSISTENT_SERVERS = new Map<string, PersistentDevServer>();

const PENDING_STARTS = new Map<string, Promise<PersistentDevServer>>();

let cleanupHandlersInstalled = false;

function killStandaloneDevServerProcessTree(child: ChildProcess): void {
  if (!child.pid) return;

  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
      debug(`Error killing standalone Go dev server ${child.pid}: ${err}`);
    }
  }
}

async function closeStandaloneDevServer(handle: DevProxyHandle): Promise<void> {
  try {
    await handle.close();
  } finally {
    killStandaloneDevServerProcessTree(handle.child);
  }
}

function installGlobalCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const killAll = () => {
    for (const [key, server] of PERSISTENT_SERVERS.entries()) {
      PERSISTENT_SERVERS.delete(key);
      killStandaloneDevServerProcessTree(server.handle.child);
    }
  };

  // Don't exit here, so `vercel dev`'s own interrupt handlers still run.
  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
  process.on('exit', killAll);
}

// Without `persistent` the CLI tree-kills the server once a response closes.
function toDevServerResult(
  serverKey: string,
  handle: DevProxyHandle
): StartDevServerResult {
  return {
    port: handle.port,
    pid: handle.pid,
    persistent: true,
    shutdown: async () => {
      if (PERSISTENT_SERVERS.get(serverKey)?.handle === handle) {
        PERSISTENT_SERVERS.delete(serverKey);
      }
      await closeStandaloneDevServer(handle);
    },
  };
}

/**
 * Compiles the user's server and fronts it with the shared dev proxy, which
 * reproduces the production proxy's request-facing behavior.
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, repoRootPath, meta = {} } = opts;
  const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;

  const serverKey = `${workPath}::${resolvedEntrypoint}`;
  const existing = PERSISTENT_SERVERS.get(serverKey);
  if (existing) {
    return toDevServerResult(serverKey, existing.handle);
  }

  const pending = PENDING_STARTS.get(serverKey);
  if (pending) {
    await pending;
    return startStandaloneDevServer(opts, resolvedEntrypoint);
  }

  const startPromise = (async () => {
    const env = cloneEnv(process.env, meta.env);

    const { modulePath, workspaceFile } = await locateGoModule({
      entrypoint: resolvedEntrypoint,
      workPath,
      repoRootPath,
      goWork: env.GOWORK,
    });
    const go = await createGo({
      modulePath,
      workspaceFile,
      opts: { cwd: workPath, env },
      workPath,
      // The binary has to run on this machine, so don't downgrade.
      preferNewestToolchain: true,
    });

    // `main.go` builds `.`, `cmd/api/main.go` builds `./cmd/api`.
    const buildTarget =
      resolvedEntrypoint === 'main.go'
        ? '.'
        : './' + dirname(resolvedEntrypoint);

    const isVendored = await pathExists(
      join(workPath, 'vendor', 'modules.txt')
    );
    if (isVendored) {
      debug('Detected vendor directory, using -mod=vendor for build');
    }

    const outDir = join(
      devCacheDir,
      'go-standalone',
      Math.random().toString(32).substring(2)
    );
    await mkdirp(outDir);
    const cleanupOutDir = async () => {
      try {
        await remove(outDir);
      } catch (err) {
        debug(`Could not delete dev server directory ${outDir}: ${err}`);
      }
    };
    const executablePath = join(
      outDir,
      `dev-server${process.platform === 'win32' ? '.exe' : ''}`
    );

    debug(
      `Building standalone Go dev server: go build ${buildTarget} -> ${executablePath}`
    );
    try {
      await go.build(buildTarget, executablePath, {
        vendorMode: isVendored,
        release: false,
      });
    } catch (err) {
      console.error(`Failed to build standalone Go server: ${buildTarget}`);
      await cleanupOutDir();
      throw err;
    }

    debug(`Starting standalone Go dev server: ${executablePath}`);

    let spawnedChild: ChildProcess | undefined;
    const handle = await startDevProxy({
      port: typeof meta.port === 'number' ? meta.port : undefined,
      env,
      label: 'Standalone Go dev server',
      // Spawning the binary avoids a `go run` wrapper. On Unix, detaching also
      // makes it a process-group leader so shutdown can include its helpers.
      spawnServer: internalPort => {
        const child = spawn(executablePath, [], {
          cwd: workPath,
          env: cloneEnv(go.getEnv(), { PORT: String(internalPort) }),
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });
        spawnedChild = child;

        const forward = (
          stream: ChildProcess['stdout'],
          onData: ((data: Buffer) => void) | undefined,
          fallback: NodeJS.WriteStream
        ) => {
          stream?.on('data', data => {
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            if (onData) {
              onData(chunk);
            } else {
              // `Buffer` is not assignable to `Uint8Array` under newer
              // `@types/node`, so pass a plain view of the bytes.
              fallback.write(
                new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
              );
            }
          });
        };

        forward(child.stdout, opts.onStdout, process.stdout);
        forward(child.stderr, opts.onStderr, process.stderr);

        return child;
      },
    }).catch(async err => {
      if (spawnedChild) {
        killStandaloneDevServerProcessTree(spawnedChild);
      }
      await cleanupOutDir();
      throw err;
    });

    const server: PersistentDevServer = { handle };
    PERSISTENT_SERVERS.set(serverKey, server);
    // Tear the proxy down with the server it fronts.
    handle.child.once('exit', () => {
      if (PERSISTENT_SERVERS.get(serverKey)?.handle === handle) {
        PERSISTENT_SERVERS.delete(serverKey);
      }
      closeStandaloneDevServer(handle).catch(err => {
        debug(`Error closing standalone Go dev proxy: ${err}`);
      });
      void cleanupOutDir();
    });
    installGlobalCleanupHandlers();

    return server;
  })();

  PENDING_STARTS.set(serverKey, startPromise);
  try {
    const server = await startPromise;
    return toDevServerResult(serverKey, server.handle);
  } finally {
    if (PENDING_STARTS.get(serverKey) === startPromise) {
      PENDING_STARTS.delete(serverKey);
    }
  }
}
