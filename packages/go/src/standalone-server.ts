import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { readFile, writeFile, pathExists, copy } from 'fs-extra';
import {
  BuildOptions,
  Files,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  Lambda,
  FileBlob,
  getWriteableDirectory,
  debug,
  cloneEnv,
  getLambdaOptionsFromFunction,
} from '@vercel/build-utils';

import { createGo, resolvePreferredGoVersion } from './go-helpers';

const bootstrapMinimumGoVersion = '1.20';
const bootstrapPkgSrc = join(__dirname, '../bootstrap');

function parseGoMajorMinor(version: string) {
  const match = version.match(/^(\d+)\.(\d+)/);

  if (!match) {
    return { major: 0, minor: 0 };
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

function getGoDirectiveVersion(version: string) {
  const { major, minor } = parseGoMajorMinor(version);
  return `${major}.${minor}`;
}

function resolveBootstrapGoVersion(preferredGoVersion: string) {
  const preferred = parseGoMajorMinor(preferredGoVersion);
  const minimum = parseGoMajorMinor(bootstrapMinimumGoVersion);

  if (
    preferred.major > minimum.major ||
    (preferred.major === minimum.major && preferred.minor >= minimum.minor)
  ) {
    return preferredGoVersion;
  }

  return bootstrapMinimumGoVersion;
}

function getBootstrapGoMod(bootstrapGoVersion: string) {
  const goDirectiveVersion = getGoDirectiveVersion(bootstrapGoVersion);
  const toolchainDirective =
    bootstrapGoVersion !== goDirectiveVersion
      ? `\ntoolchain go${bootstrapGoVersion}`
      : '';

  return `module main\n\ngo ${goDirectiveVersion}${toolchainDirective}\n`;
}

function getBootstrapWrapperSource(mainFunc: 'Main' | 'DevMain') {
  return `package main

import "main/bootstrap"

func main() {
\tbootstrap.${mainFunc}()
}
`;
}

async function prepareBootstrapDir(
  mainFunc: 'Main' | 'DevMain',
  bootstrapGoVersion: string
) {
  const bootstrapDir = await getWriteableDirectory();

  await Promise.all([
    copy(bootstrapPkgSrc, join(bootstrapDir, 'bootstrap')),
    writeFile(
      join(bootstrapDir, 'main.go'),
      getBootstrapWrapperSource(mainFunc)
    ),
    writeFile(
      join(bootstrapDir, 'go.mod'),
      getBootstrapGoMod(bootstrapGoVersion)
    ),
  ]);

  return bootstrapDir;
}

/**
 * Find the go.mod file starting from a directory and scanning up.
 */
async function findGoModPath(entrypointDir: string, workPath: string) {
  let goModPath: string | undefined = undefined;
  let dir = entrypointDir;

  while (true) {
    const goMod = join(dir, 'go.mod');
    if (await pathExists(goMod)) {
      goModPath = goMod;
      debug(`Found ${goModPath}`);
      break;
    }
    if (dir === workPath) {
      break;
    }
    dir = dirname(dir);
  }

  return { goModPath };
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
  const preferredGoVersion = await resolvePreferredGoVersion(modulePath);
  const bootstrapGoVersion = resolveBootstrapGoVersion(preferredGoVersion);

  const go = await createGo({
    modulePath,
    opts: { cwd: workPath, env },
    workPath,
  });

  const outDir = await getWriteableDirectory();
  const userServerPath = join(outDir, 'user-server');
  const bootstrapPath = join(outDir, 'executable');

  // Determine build target based on entrypoint location
  // - main.go at root: build '.'
  // - cmd/api/main.go: build './cmd/api'
  const buildTarget =
    entrypoint === 'main.go' ? '.' : './' + dirname(entrypoint);

  debug(
    `Building user Go server (${architecture}): go build ${buildTarget} -> ${userServerPath}`
  );

  try {
    await go.build(buildTarget, userServerPath);
  } catch (err) {
    console.error(`Failed to build standalone Go server: ${buildTarget}`);
    throw err;
  }

  // Build the bootstrap wrapper that handles IPC protocol and log forwarding.
  debug(`Building bootstrap wrapper -> ${bootstrapPath}`);

  try {
    const bootstrapBuildDir = await prepareBootstrapDir(
      'Main',
      bootstrapGoVersion
    );

    // Build the staged bootstrap module with the production runtime entrypoint.
    const bootstrapGo = await createGo({
      modulePath: bootstrapBuildDir,
      opts: { cwd: bootstrapBuildDir, env },
      workPath: bootstrapBuildDir,
    });

    await bootstrapGo.build('.', bootstrapPath);
  } catch (err) {
    console.error('Failed to build bootstrap wrapper');
    throw err;
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

  // Read both binaries as FileBlob (embedded data)
  // This ensures they persist regardless of temp file lifecycle
  const [userServerData, bootstrapData] = await Promise.all([
    readFile(userServerPath),
    readFile(bootstrapPath),
  ]);

  const lambda = new Lambda({
    ...lambdaOptions,
    files: {
      ...includedFiles,
      // Bootstrap is the main entrypoint (handles IPC protocol)
      executable: new FileBlob({ mode: 0o755, data: bootstrapData }),
      // User's server is spawned by bootstrap
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    supportsResponseStreaming: true,
    architecture,
    runtimeLanguage: 'go',
  });

  return { output: lambda };
}

/**
 * Start a dev server for standalone Go server mode.
 * This stages a tiny Go bootstrap module that:
 * - starts the user server on an internal port
 * - strips generated service route prefixes when configured
 * - proxies traffic on the externally assigned dev port
 */
export async function startStandaloneDevServer(
  opts: StartDevServerOptions,
  resolvedEntrypoint: string
): Promise<StartDevServerResult> {
  const { workPath, meta = {} } = opts;
  const { goModPath } = await findGoModPath(workPath, workPath);
  const modulePath = goModPath ? dirname(goModPath) : workPath;
  const preferredGoVersion = await resolvePreferredGoVersion(modulePath);
  const bootstrapGoVersion = resolveBootstrapGoVersion(preferredGoVersion);

  // Use a random port in the ephemeral range
  const port = Math.floor(Math.random() * (65535 - 49152) + 49152);

  const env = cloneEnv(process.env, meta.env, {
    PORT: String(port),
  });

  // Determine run target based on entrypoint location
  // - main.go at root: go run .
  // - cmd/api/main.go: go run ./cmd/api
  const runTarget =
    resolvedEntrypoint === 'main.go' ? '.' : './' + dirname(resolvedEntrypoint);

  const bootstrapDevDir = await prepareBootstrapDir(
    'DevMain',
    bootstrapGoVersion
  );

  debug(
    `Starting standalone Go dev server wrapper: go run . (target ${runTarget}, port ${port})`
  );

  const child = spawn('go', ['run', '-tags', 'vcdev', '.'], {
    cwd: bootstrapDevDir,
    env: {
      ...env,
      __VC_GO_DEV_RUN_TARGET: runTarget,
      __VC_GO_DEV_WORK_PATH: workPath,
    },
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

  // Give the wrapper a short startup window and fail fast if it exits early.
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, 2000);

    const onExit = (code: number | null, signal: string | null) => {
      cleanup();
      reject(
        new Error(
          `Standalone Go dev server exited before startup completed (code: ${code}, signal: ${signal})`
        )
      );
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.removeListener('exit', onExit);
    };

    child.once('exit', onExit);
  });

  return {
    port,
    pid: child.pid!,
  };
}
